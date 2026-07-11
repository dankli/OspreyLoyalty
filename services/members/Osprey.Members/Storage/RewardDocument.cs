using MongoDB.Bson.Serialization.Attributes;

namespace Osprey.Members.Storage;

/// <summary>
/// One redeemable reward in the managed catalog. Formerly a hard-coded list of three;
/// admins now own the catalog, and the three classics seed an empty collection so a
/// fresh environment behaves exactly like before.
/// </summary>
public sealed record RewardDocument(
    [property: BsonId] string Id,
    string Name,
    int Cost);
