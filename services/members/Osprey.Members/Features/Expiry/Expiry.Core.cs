using Osprey.Members.Storage;

// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class Expiry
{
    public const int LifetimeMonths = 24;
    public const int WarnHorizonDays = 30;

    public sealed record Lot(string EarnId, int PointsToExpire);

    public sealed record WarningLot(string EarnId, int Points, DateTime ExpiresAtUtc);

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

    /// <summary>
    /// Same FIFO consumption as <see cref="DueLots"/>, but for the WARNING horizon: lots
    /// still alive now whose 24-month lifetime ends within the next <see cref="WarnHorizonDays"/>
    /// days. Pure — the sweep turns each into a points.expiring event whose deterministic id
    /// ("expiring-{earnId}") makes daily re-emission a no-op.
    /// </summary>
    public static IReadOnlyList<WarningLot> DueSoonLots(IEnumerable<PointsTransactionDocument> ledger, DateTime nowUtc)
    {
        List<PointsTransactionDocument> entries = ledger.OrderBy(t => t.OccurredAtUtc).ToList();
        int consumed = entries.Where(t => t.Points < 0).Sum(t => -t.Points);
        DateTime horizon = nowUtc.AddDays(WarnHorizonDays);

        var dueSoon = new List<WarningLot>();
        foreach (PointsTransactionDocument earn in entries.Where(t => t.Points > 0))
        {
            int consumedFromThis = Math.Min(earn.Points, consumed);
            consumed -= consumedFromThis;
            int remaining = earn.Points - consumedFromThis;
            DateTime expiresAtUtc = earn.OccurredAtUtc.AddMonths(LifetimeMonths);
            if (remaining > 0 && expiresAtUtc > nowUtc && expiresAtUtc <= horizon)
                dueSoon.Add(new WarningLot(earn.Id, remaining, expiresAtUtc));
        }
        return dueSoon;
    }
}
