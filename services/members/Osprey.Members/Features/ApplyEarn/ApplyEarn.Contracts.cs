// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class ApplyEarn
{
    /// <summary>Wire contract from partners (see docs/domain.md). Mirrors
    /// services/partners/src/main/java/com/ospreyloyalty/partners/purchases/EarnEvent.java —
    /// keep in sync by hand. The rate travels with the event so members never needs partner
    /// reference data.</summary>
    public sealed record EarnEvent(
        string MemberId,
        string PartnerId,
        decimal Amount,
        decimal Rate,
        string IdempotencyKey,
        DateTime OccurredAtUtc,
        string? CorrelationId = null, // trailing defaults: JSON missing the field still deserializes
        string? AuthToken = null); // zero-trust service token partners stamps (ADR-0007); null when auth is off

    /// <summary>AlreadyApplied=true is a success, not an error — duplicate delivery is
    /// expected under at-least-once messaging. That distinction is the whole feature.</summary>
    public sealed record Result(bool AlreadyApplied, int Points, int QualifyingPoints, string Tier);
}
