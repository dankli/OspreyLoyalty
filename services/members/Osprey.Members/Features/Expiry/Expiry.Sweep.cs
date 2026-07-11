using MongoDB.Driver;
using Osprey.Members.Storage;

// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class Expiry
{
    private const int SweepTimeoutSeconds = 30;
    private const int MaxMembersPerSweep = 10_000; // demo bound, a real system pages
    private const int MaxLedgerEntries = 10_000; // bound the per-member ledger read (matches ApplyEarn.Handler)

    /// <summary>
    /// One full expiry pass over all members. Idempotent by construction: every expiry
    /// entry gets the DETERMINISTIC key "expiry-{earnId}", so the unique index on
    /// IdempotencyKey turns a re-run (crash mid-pass, overlapping schedule, double
    /// deploy) into a no-op — insert fails, we skip, the balance is never decremented
    /// twice. Convergent too: DueLots treats prior expiry entries as FIFO consumption,
    /// so once a lot has expired it never shows up as due again. Returns the points
    /// whose balance decrement actually applied this pass, for logging — lots whose
    /// decrement was skipped are excluded from the total.
    /// </summary>
    public static async Task<int> SweepAsync(
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

        int totalExpired = 0;
        foreach (MemberDocument member in all)
        {
            List<PointsTransactionDocument> ledger = await transactions
                .Find(t => t.MemberId == member.Id)
                .Limit(MaxLedgerEntries)
                .ToListAsync(cts.Token);

            foreach (Lot lot in DueLots(ledger, nowUtc))
            {
                var entry = new PointsTransactionDocument(
                    Guid.NewGuid().ToString("N"), member.Id, TransactionTypes.Expiry,
                    -lot.PointsToExpire, "system", $"expiry-{lot.EarnId}", nowUtc);
                try
                {
                    await transactions.InsertOneAsync(entry, options: null, cts.Token);
                }
                catch (MongoWriteException ex) when (ex.WriteError.Category == ServerErrorCategory.DuplicateKey)
                {
                    continue; // already expired by an earlier pass — never decrement again
                }

                // Conditional decrement: only after a successful ledger insert, and only if the
                // balance still covers the lot. ModifiedCount 0 means the balance moved
                // concurrently — the ledger entry stands, but the lot is excluded from the
                // returned total so it counts only decrements that applied (the next sweep
                // converges: the unique key keeps it a no-op, and domain.md's healing note
                // covers reconciling the projection).
                UpdateResult decrement = await members.UpdateOneAsync(
                    m => m.Id == member.Id && m.SpendablePoints >= lot.PointsToExpire,
                    Builders<MemberDocument>.Update.Inc(m => m.SpendablePoints, -lot.PointsToExpire),
                    options: null, cts.Token);

                if (decrement.ModifiedCount == 0) continue;
                totalExpired += lot.PointsToExpire;
                BusinessMetrics.PointsExpired.Inc(lot.PointsToExpire);
            }
        }
        return totalExpired;
    }
}
