using Osprey.Members.Storage;

// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class Expiry
{
    public const int LifetimeMonths = 24;

    public sealed record Lot(string EarnId, int PointsToExpire);

    /// <summary>
    /// FIFO consumption (spec rule 5): every negative entry (burn, expiry, negative
    /// adjustment) consumes the OLDEST positive entries first. Whatever remains of a
    /// positive entry older than 24 months is due to expire. Pure — the sweep applies it,
    /// and because prior expiry entries are themselves consumption, reapplying is a no-op.
    /// </summary>
    public static IReadOnlyList<Lot> DueLots(IEnumerable<PointsTransactionDocument> ledger, DateTime nowUtc)
    {
        List<PointsTransactionDocument> entries = ledger.OrderBy(t => t.OccurredAtUtc).ToList();
        int consumed = entries.Where(t => t.Points < 0).Sum(t => -t.Points);
        DateTime cutoff = nowUtc.AddMonths(-LifetimeMonths);

        var due = new List<Lot>();
        foreach (PointsTransactionDocument earn in entries.Where(t => t.Points > 0))
        {
            int consumedFromThis = Math.Min(earn.Points, consumed);
            consumed -= consumedFromThis;
            int remaining = earn.Points - consumedFromThis;
            if (remaining > 0 && earn.OccurredAtUtc <= cutoff)
                due.Add(new Lot(earn.Id, remaining));
        }
        return due;
    }
}
