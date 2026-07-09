using MongoDB.Bson.Serialization.Attributes;

namespace Osprey.Members.Storage;

/// <summary>
/// The persisted member. Balances live here denormalized for phase 1; the immutable
/// PointsTransaction ledger (phase 2) becomes the source of truth and these become projections.
/// </summary>
public sealed record MemberDocument(
    [property: BsonId] string Id,
    string Name,
    string? Email, // nullable: GDPR erasure sets Email → null (ADR-0018); a live member always has one
    DateTime JoinedAtUtc,
    int QualifyingPoints,
    int SpendablePoints,
    bool IsOspreyInvited = false, // set only by an admin/support flow (phase 3) — never derived from points
    // GDPR right-to-erasure marker (ADR-0018). Null for a live member; set once at erasure, when
    // Name/Email are pseudonymized. Also the resurrection guard: a re-delivered earn only touches
    // points, never Name/Email, so an erased member's PII can never be re-populated. Optional +
    // nullable so existing member documents (written before erasure existed) deserialize unchanged.
    DateTime? ErasedAtUtc = null);
