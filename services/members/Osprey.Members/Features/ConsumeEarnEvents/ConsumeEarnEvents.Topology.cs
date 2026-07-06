using RabbitMQ.Client;

// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class ConsumeEarnEvents
{
    public const string Queue = "earn-events";
    public const string DeadQueue = "earn-events.dead";
    private const int DeliveryLimit = 5;

    /// <summary>
    /// Declared identically by producer (services/partners RabbitConfig) and consumer (here) —
    /// idempotent, so startup order does not matter. Quorum queue: after DeliveryLimit
    /// redeliveries a poison message dead-letters instead of looping forever (ADR-0001).
    /// </summary>
    public static async Task DeclareAsync(IChannel channel, CancellationToken ct = default)
    {
        await channel.QueueDeclareAsync(DeadQueue, durable: true, exclusive: false, autoDelete: false,
            arguments: null, cancellationToken: ct);
        await channel.QueueDeclareAsync(Queue, durable: true, exclusive: false, autoDelete: false,
            arguments: new Dictionary<string, object?>
            {
                ["x-queue-type"] = "quorum",
                ["x-delivery-limit"] = DeliveryLimit,
                ["x-dead-letter-exchange"] = "",
                ["x-dead-letter-routing-key"] = DeadQueue,
            }, cancellationToken: ct);
    }
}
