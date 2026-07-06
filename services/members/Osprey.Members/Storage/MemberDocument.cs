using MongoDB.Bson.Serialization.Attributes;

namespace Osprey.Members.Storage;

/// <summary>
/// The persisted member. Balances live here denormalized for phase 1; the immutable
/// PointsTransaction ledger (phase 2) becomes the source of truth and these become projections.
/// </summary>
public sealed record MemberDocument(
    [property: BsonId] string Id,
    string Name,
    string Email,
    DateTime JoinedAtUtc,
    int QualifyingPoints,
    int SpendablePoints,
    bool IsPandionInvited = false); // set only by an admin/support flow (phase 3) — never derived from points
