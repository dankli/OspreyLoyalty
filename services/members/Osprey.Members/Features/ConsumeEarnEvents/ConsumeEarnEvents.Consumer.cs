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
        private const int InitialConnectDelaySeconds = 3;

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
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
                using IServiceScope scope = services.CreateScope();
                var handler = scope.ServiceProvider.GetRequiredService<ApplyEarn.Handler>();
                try
                {
                    ApplyEarn.EarnEvent? earn =
                        JsonSerializer.Deserialize<ApplyEarn.EarnEvent>(delivery.Body.Span, Json);
                    if (earn is null) throw new ArgumentException("Empty earn event.");

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
