using MongoDB.Driver;
using Osprey.Members.Storage;

// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class Requalification
{
    private const int SweepTimeoutSeconds = 30;
    private const int MaxMembersPerSweep = 10_000; // demo bound, a real system pages (matches Expiry)
    private const int MaxLedgerEntries = 10_000; // bound the per-member window read (matches ApplyEarn.Handler)

    public sealed record TierChange(string MemberId, Tiers.Tier PreviousTier, Tiers.Tier NewTier);

    /// <summary>
    /// One rolling-window recompute over all members. ApplyEarn recomputes the window only
    /// when a NEW earn arrives, so a member who stops earning would keep a stale tier
    /// forever — downgrades happen here. Convergent and safe to re-run: each write is
    /// conditional on the value this pass read, so a concurrent earn's recompute simply
    /// wins and the next sweep agrees with it. Spendable points are never touched — the
    /// expiry sweep owns the balance. Returns the tier changes that applied this pass.
    /// </summary>
    public static async Task<IReadOnlyList<TierChange>> SweepAsync(
        IMongoCollection<MemberDocument> members,
        IMongoCollection<PointsTransactionDocument> transactions,
        DateTime nowUtc,
        CancellationToken ct = default)
    {
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(TimeSpan.FromSeconds(SweepTimeoutSeconds)); // a hung Mongo must not stall the sweep loop forever

        List<MemberDocument> all = await members
            .Find(FilterDefinition<MemberDocument>.Empty)
            .Limit(MaxMembersPerSweep)
            .ToListAsync(cts.Token);

        DateTime windowStart = nowUtc.AddMonths(-Tiers.QualifyingWindowMonths);
        var changes = new List<TierChange>();
        foreach (MemberDocument member in all)
        {
            List<PointsTransactionDocument> window = await transactions
                .Find(t => t.MemberId == member.Id && t.OccurredAtUtc > windowStart)
                .Limit(MaxLedgerEntries)
                .ToListAsync(cts.Token);

            int qualifying = Tiers.QualifyingPoints(window.Select(t => (t.OccurredAtUtc, t.Points)), nowUtc);
            if (qualifying == member.QualifyingPoints) continue;

            UpdateResult update = await members.UpdateOneAsync(
                m => m.Id == member.Id && m.QualifyingPoints == member.QualifyingPoints,
                Builders<MemberDocument>.Update.Set(m => m.QualifyingPoints, qualifying),
                options: null, cts.Token);
            if (update.ModifiedCount == 0) continue; // a concurrent earn recomputed meanwhile — it wins

            Tiers.Tier before = Tiers.Effective(member.QualifyingPoints, member.IsOspreyInvited);
            Tiers.Tier after = Tiers.Effective(qualifying, member.IsOspreyInvited);
            if (before == after) continue;
            BusinessMetrics.TierChanges.WithLabels(after > before ? "up" : "down").Inc();
            changes.Add(new TierChange(member.Id, before, after));
        }
        return changes;
    }
}
