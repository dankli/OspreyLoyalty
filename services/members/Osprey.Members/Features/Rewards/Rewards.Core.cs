using MongoDB.Driver;
using Osprey.Members.Storage;

// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

/// <summary>Managed reward catalog: Mongo-backed with the three classic rewards as seed.</summary>
public static partial class Rewards
{
    public sealed record Reward(string Id, string Name, int Cost);

    /// <summary>The pre-admin-CRUD catalog (docs/domain.md); seeds an EMPTY collection only.</summary>
    public static readonly IReadOnlyList<Reward> Defaults =
    [
        new("lounge-pass", "Lounge day pass", 15_000),
        new("upgrade-voucher", "Cabin upgrade voucher", 30_000),
        new("cardco-giftcard", "CardCo gift card", 5_000),
    ];

    internal const int MaxRewards = 1_000; // bound every catalog read; an admin never needs more

    /// <summary>Idempotent startup seed: only a catalog with no rewards at all gets the defaults —
    /// an admin who deleted a classic must not find it resurrected by the next deploy.</summary>
    public static async Task EnsureDefaultsAsync(IMongoCollection<RewardDocument> rewards, CancellationToken ct = default)
    {
        if (await rewards.Find(FilterDefinition<RewardDocument>.Empty).AnyAsync(ct)) return;
        try
        {
            await rewards.InsertManyAsync(
                Defaults.Select(r => new RewardDocument(r.Id, r.Name, r.Cost)), options: null, ct);
        }
        catch (MongoBulkWriteException ex) when (ex.WriteErrors.All(e => e.Category == ServerErrorCategory.DuplicateKey))
        {
            // Two pods raced the empty check — the catalog is seeded either way.
        }
    }

    internal static Reward ToReward(RewardDocument document) => new(document.Id, document.Name, document.Cost);
}
