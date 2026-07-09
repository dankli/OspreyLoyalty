using System.Diagnostics;
using System.Text;
using System.Text.Json;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;

// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class ConsumeEarnEvents
{
    /// <summary>
    /// At-least-once consumer. Success or duplicate → ack. Malformed or invalid → nack without
    /// requeue (straight to the dead queue — retrying a poison message never helps). Transient
    /// failure (Mongo down or the handler's 5s timeout firing) → nack WITH requeue; the quorum
    /// delivery limit dead-letters it after 5 attempts, so nothing loops forever. Only a
    /// shutdown-triggered cancellation leaves the delivery unacked — the broker redelivers it
    /// after the channel closes.
    /// </summary>
    public sealed class Consumer(IServiceProvider services, IConfiguration config, ILogger<Consumer> logger)
        : BackgroundService
    {
        private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
        // Consume spans emitted under this source; registered with OpenTelemetry in Program.cs.
        private static readonly ActivitySource Trace = new("Osprey.Members.Consumer");
        private const int InitialConnectDelaySeconds = 3;

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            // Zero-trust for the async leg: when Auth:Enabled is on, every earn event must carry a
            // valid service token. Off (the default) → the validator waves everything through.
            var tokenValidator = new EarnTokenValidator(config);

            var factory = new ConnectionFactory
            {
                HostName = config["RabbitMq:Host"] ?? "localhost",
                Port = config.GetValue("RabbitMq:Port", 5672),
                UserName = config["RabbitMq:User"] ?? "guest",
                Password = config["RabbitMq:Password"] ?? "guest",
            };

            IConnection? connection = null;
            while (connection is null && !stoppingToken.IsCancellationRequested)
            {
                try { connection = await factory.CreateConnectionAsync(stoppingToken); }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    logger.LogWarning("RabbitMQ not reachable yet: {Message}. Retrying.", ex.Message);
                    try { await Task.Delay(TimeSpan.FromSeconds(InitialConnectDelaySeconds), stoppingToken); }
                    catch (OperationCanceledException) { return; }
                }
            }
            if (connection is null) return;

            await using IConnection rabbit = connection;
            await using IChannel channel = await connection.CreateChannelAsync(cancellationToken: stoppingToken);
            await DeclareAsync(channel, stoppingToken);
            await channel.BasicQosAsync(0, prefetchCount: 8, global: false, stoppingToken); // bounded in-flight work

            var consumer = new AsyncEventingBasicConsumer(channel);
            consumer.ReceivedAsync += async (_, delivery) =>
            {
                // Join the publisher's distributed trace: partners injects a W3C traceparent into the
                // message headers (the OTel Spring starter doesn't instrument AMQP, so it does it by
                // hand). Starting the consume span as that context's child also makes it the ambient
                // parent of the Mongo work in ApplyEarn, so a purchase is one end-to-end trace.
                ActivityContext parent = default;
                if (delivery.BasicProperties.Headers is { } headers
                    && headers.TryGetValue("traceparent", out object? tp))
                {
                    string? traceparent = tp switch
                    {
                        byte[] bytes => Encoding.UTF8.GetString(bytes),
                        string s => s,
                        _ => null,
                    };
                    if (traceparent is not null)
                        ActivityContext.TryParse(traceparent, null, out parent);
                }
                using Activity? activity = Trace.StartActivity($"{Queue} process", ActivityKind.Consumer, parent);
                activity?.SetTag("messaging.system", "rabbitmq");
                activity?.SetTag("messaging.destination.name", Queue);
                activity?.SetTag("messaging.operation", "process");

                using IServiceScope scope = services.CreateScope();
                var handler = scope.ServiceProvider.GetRequiredService<ApplyEarn.Handler>();
                try
                {
                    ApplyEarn.EarnEvent? earn =
                        JsonSerializer.Deserialize<ApplyEarn.EarnEvent>(delivery.Body.Span, Json);
                    if (earn is null) throw new ArgumentException("Empty earn event.");

                    // An unauthenticated earn is not poison JSON but must not be applied — treat it
                    // like a poison message (dead-letter, no requeue) so it never loops or leaks in.
                    // Name the reason: a partners minter in HS256 mode against a members validator in
                    // JWKS/RS256 mode fails here, and the log should point at that, not look mysterious.
                    if (!await tokenValidator.IsValidAsync(earn.AuthToken, stoppingToken))
                    {
                        var reason = string.IsNullOrWhiteSpace(earn.AuthToken)
                            ? "missing service token"
                            : "invalid service token (signature/audience/expiry — or an HS256/JWKS mode mismatch)";
                        logger.LogWarning("Rejecting earn event {Key}: {Reason} — dead-lettering.",
                            earn.IdempotencyKey, reason);
                        await channel.BasicNackAsync(delivery.DeliveryTag, multiple: false, requeue: false, stoppingToken);
                        return;
                    }

                    ApplyEarn.Result result = await handler.Handle(earn, stoppingToken);
                    logger.LogInformation(
                        "Earn {Key} for {MemberId}: applied={Applied} points={Points} tier={Tier} correlationId={CorrelationId}",
                        earn.IdempotencyKey, earn.MemberId, !result.AlreadyApplied, result.Points, result.Tier,
                        earn.CorrelationId ?? "-");
                    await channel.BasicAckAsync(delivery.DeliveryTag, multiple: false, stoppingToken);
                }
                catch (Exception ex) when (ex is JsonException or ArgumentException)
                {
                    logger.LogWarning(ex, "Poison earn event — dead-lettering.");
                    await channel.BasicNackAsync(delivery.DeliveryTag, multiple: false, requeue: false, stoppingToken);
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    // Shutting down — leave the delivery unacked; the broker redelivers after the channel closes.
                }
                catch (Exception ex)
                {
                    logger.LogError(ex, "Transient failure applying earn event — requeueing.");
                    await channel.BasicNackAsync(delivery.DeliveryTag, multiple: false, requeue: true, stoppingToken);
                }
            };

            await channel.BasicConsumeAsync(Queue, autoAck: false, consumer, stoppingToken);
            try { await Task.Delay(Timeout.InfiniteTimeSpan, stoppingToken); }
            catch (OperationCanceledException) { /* graceful shutdown */ }
        }
    }
}
