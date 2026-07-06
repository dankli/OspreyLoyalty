// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class ApplyEarn
{
    /// <summary>Wire contract from partners (see docs/domain.md). The rate travels with the
    /// event so members never needs partner reference data.</summary>
    public sealed record EarnEvent(
        string MemberId,
        string PartnerId,
        decimal Amount,
        decimal Rate,
        string IdempotencyKey,
        DateTime OccurredAtUtc);

    /// <summary>AlreadyApplied=true is a success, not an error — duplicate delivery is
    /// expected under at-least-once messaging. That distinction is the whole feature.</summary>
    public sealed record Result(bool AlreadyApplied, int Points, int QualifyingPoints, string Tier);
}
