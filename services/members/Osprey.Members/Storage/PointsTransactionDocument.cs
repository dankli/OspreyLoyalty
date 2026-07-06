using MongoDB.Bson.Serialization.Attributes;

namespace Osprey.Members.Storage;

/// <summary>
/// One immutable ledger entry. The unique index on IdempotencyKey (MongoIndexes) is the
/// idempotency mechanism itself — see ADR-0002. Points are signed: earn positive,
/// burn/expiry negative.
/// </summary>
public sealed record PointsTransactionDocument(
    [property: BsonId] string Id,
    string MemberId,
    string Type,
    int Points,
    string Source,
    string IdempotencyKey,
    DateTime OccurredAtUtc);

public static class TransactionTypes
{
    public const string Earn = "earn";
    public const string Burn = "burn";
    public const string Expiry = "expiry";
    public const string Adjustment = "adjustment";
}
