using System.Text.Json;
using MongoDB.Driver;
using Osprey.Members.Storage;

// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class Outbox
{
    /// <summary>
    /// The only writer of <see cref="OutboxDocument"/>. Insert-only; a duplicate event id
    /// (idempotent retry, overlapping sweep) is swallowed — the first write won and the
    /// relay will publish it exactly once from here.
    /// </summary>
    public sealed class Writer(IMongoCollection<OutboxDocument> outbox)
    {
        private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
        private const int MongoTimeoutSeconds = 5;

        public Task WriteAsync(TierChangedEvent evt, CancellationToken ct = default) =>
            InsertAsync(evt.EventId, RoutingKeys.TierChanged, JsonSerializer.Serialize(evt, Json), evt.OccurredAtUtc, ct);

        public Task WriteAsync(PointsExpiringSoonEvent evt, CancellationToken ct = default) =>
            InsertAsync(evt.EventId, RoutingKeys.PointsExpiring, JsonSerializer.Serialize(evt, Json), evt.OccurredAtUtc, ct);

        private async Task InsertAsync(string eventId, string routingKey, string payload, DateTime occurredAtUtc, CancellationToken ct)
        {
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromSeconds(MongoTimeoutSeconds)); // a hung Mongo must not hang the caller

            try
            {
                await outbox.InsertOneAsync(new OutboxDocument(eventId, routingKey, payload, occurredAtUtc), options: null, cts.Token);
            }
            catch (MongoWriteException ex) when (ex.WriteError.Category == ServerErrorCategory.DuplicateKey)
            {
                // The deterministic id already claimed this event — a retry, not an error.
            }
        }
    }
}
