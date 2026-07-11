using System.Text;
using MongoDB.Driver;
using Osprey.Members.Storage;
using RabbitMQ.Client;

// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class Outbox
{
    public const string Exchange = "member-events";
    private const int RelayBatchSize = 100; // bound each pass; the next tick drains the rest

    public static Task DeclareAsync(IChannel channel, CancellationToken ct = default) =>
        channel.ExchangeDeclareAsync(Exchange, ExchangeType.Topic, durable: true, autoDelete: false, cancellationToken: ct);

    /// <summary>
    /// One relay pass: publish pending entries oldest-first, stamp PublishedAtUtc after each.
    /// At-least-once by design — a crash between publish and stamp republishes on the next
    /// pass, and consumers dedup on the deterministic event id (ADR-0024).
    /// </summary>
    public static async Task<int> PublishPendingAsync(
        IMongoCollection<OutboxDocument> outbox, IChannel channel, CancellationToken ct = default)
    {
        List<OutboxDocument> pending = await outbox
            .Find(o => o.PublishedAtUtc == null)
            .SortBy(o => o.OccurredAtUtc)
            .Limit(RelayBatchSize)
            .ToListAsync(ct);

        foreach (OutboxDocument entry in pending)
        {
            var props = new BasicProperties { Persistent = true, ContentType = "application/json" };
            await channel.BasicPublishAsync(Exchange, entry.RoutingKey, mandatory: false, props,
                Encoding.UTF8.GetBytes(entry.Payload), ct);
            await outbox.UpdateOneAsync(o => o.Id == entry.Id,
                Builders<OutboxDocument>.Update.Set(o => o.PublishedAtUtc, DateTime.UtcNow),
                options: null, ct);
        }
        return pending.Count;
    }

    /// <summary>
    /// Polls the outbox every 2 seconds and publishes to the member-events exchange.
    /// Connection bootstrap mirrors the earn consumer: wait for the broker, then hold one
    /// channel; a failed pass is logged and retried on the next tick, never killing the host.
    /// </summary>
    public sealed class Relay(IServiceProvider services, IConfiguration config, ILogger<Relay> logger)
        : BackgroundService
    {
        private static readonly TimeSpan Interval = TimeSpan.FromSeconds(2);
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

            using var timer = new PeriodicTimer(Interval);
            try
            {
                do
                {
                    try
                    {
                        using IServiceScope scope = services.CreateScope();
                        var outbox = scope.ServiceProvider.GetRequiredService<IMongoCollection<OutboxDocument>>();
                        int published = await PublishPendingAsync(outbox, channel, stoppingToken);
                        if (published > 0) logger.LogInformation("Outbox relay published {Count} events.", published);
                    }
                    catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                    {
                        throw; // shutdown — let ExecuteAsync unwind
                    }
                    catch (Exception ex)
                    {
                        logger.LogError(ex, "Outbox relay pass failed — will retry on the next tick.");
                    }
                }
                while (await timer.WaitForNextTickAsync(stoppingToken));
            }
            catch (OperationCanceledException) { /* graceful shutdown */ }
        }
    }
}
