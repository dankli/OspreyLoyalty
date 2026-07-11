// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class Outbox
{
    /// <summary>Routing keys on the member-events topic exchange (contracts/member-events).</summary>
    public static class RoutingKeys
    {
        public const string TierChanged = "tier.changed";
        public const string PointsExpiring = "points.expiring";
    }

    /// <summary>Wire shape of contracts/member-events/tier-changed.schema.json (camelCase on the wire).</summary>
    public sealed record TierChangedEvent(
        string EventId,
        string MemberId,
        string PreviousTier,
        string NewTier,
        DateTime OccurredAtUtc,
        string? CorrelationId = null);

    /// <summary>Wire shape of contracts/member-events/points-expiring-soon.schema.json.</summary>
    public sealed record PointsExpiringSoonEvent(
        string EventId,
        string MemberId,
        int Points,
        DateTime ExpiresAtUtc,
        DateTime OccurredAtUtc,
        string? CorrelationId = null);
}
