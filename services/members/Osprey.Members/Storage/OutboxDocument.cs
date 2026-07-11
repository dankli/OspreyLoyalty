using MongoDB.Bson.Serialization.Attributes;

namespace Osprey.Members.Storage;

/// <summary>
/// One pending (or published) domain event in the transactional outbox (ADR-0024).
/// The id IS the deterministic event id, so writing the same event twice — an earn
/// retry, an overlapping sweep — hits the primary key and becomes a no-op: dedup by
/// construction, the same mechanism ADR-0002 uses for the ledger.
/// </summary>
public sealed record OutboxDocument(
    [property: BsonId] string Id,
    string RoutingKey,
    string Payload,
    DateTime OccurredAtUtc,
    DateTime? PublishedAtUtc = null);
