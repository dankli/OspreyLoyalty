// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class Tiers
{
    public const int QualifyingWindowMonths = 12;

    /// <summary>
    /// Rolling-window recompute — called on every earn event, which is also where
    /// downgrades happen: old earns simply stop counting (spec rule 2). Burns are
    /// ignored: spending points never costs you your tier.
    /// </summary>
    public static int QualifyingPoints(IEnumerable<(DateTime OccurredAtUtc, int Points)> ledger, DateTime nowUtc)
    {
        DateTime windowStart = nowUtc.AddMonths(-QualifyingWindowMonths);
        int sum = 0;
        foreach ((DateTime occurredAt, int points) in ledger)
            if (points > 0 && occurredAt > windowStart && occurredAt <= nowUtc)
                sum += points;
        return sum;
    }
}
