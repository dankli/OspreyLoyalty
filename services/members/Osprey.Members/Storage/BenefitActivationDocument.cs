using MongoDB.Bson.Serialization.Attributes;

namespace Osprey.Members.Storage;

/// <summary>
/// One activated tier benefit — the moment a displayed perk became a usable code. The
/// unique index on IdempotencyKey (MongoIndexes) makes a retried activation return the
/// original code instead of minting a second one (ADR-0002's mechanism, again).
/// </summary>
public sealed record BenefitActivationDocument(
    [property: BsonId] string Id,
    string MemberId,
    string Benefit,
    string Code,
    string IdempotencyKey,
    DateTime ActivatedAtUtc);
