using MongoDB.Driver;
using Osprey.Members.Storage;

// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class Expiry
{
    /// <summary>
    /// One warning pass over all members: every lot entering the 30-day expiry horizon
    /// becomes a points.expiring outbox event. The deterministic event id
    /// ("expiring-{earnId}") means each lot warns exactly once, ever — daily re-runs and
    /// overlapping passes hit the outbox primary key and no-op. Returns the number of
    /// warnings written this pass (for logging).
    /// </summary>
    public static async Task<int> WarnAsync(
        IMongoCollection<MemberDocument> members,
        IMongoCollection<PointsTransactionDocument> transactions,
        Outbox.Writer outbox,
        DateTime nowUtc,
        CancellationToken ct = default)
    {
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(TimeSpan.FromSeconds(SweepTimeoutSeconds));

        List<MemberDocument> all = await members
            .Find(FilterDefinition<MemberDocument>.Empty)
            .Limit(MaxMembersPerSweep)
            .ToListAsync(cts.Token);

        int warned = 0;
        foreach (MemberDocument member in all)
        {
            List<PointsTransactionDocument> ledger = await transactions
                .Find(t => t.MemberId == member.Id)
                .Limit(MaxLedgerEntries)
                .ToListAsync(cts.Token);

            foreach (WarningLot lot in DueSoonLots(ledger, nowUtc))
            {
                await outbox.WriteAsync(new Outbox.PointsExpiringSoonEvent(
                    $"expiring-{lot.EarnId}", member.Id, lot.Points, lot.ExpiresAtUtc, nowUtc), cts.Token);
                warned++;
            }
        }
        return warned;
    }
}
