using Prometheus;

// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

/// <summary>
/// Business counters beside the RED HTTP metrics: what the LOYALTY PROGRAM did, not
/// just how fast it answered. Scraped from the same /metrics endpoint; the Grafana
/// "Business" dashboard charts their rates. Counters are process-global (prometheus-net
/// statics), incremented at the moment the domain change actually applied.
/// </summary>
public static class BusinessMetrics
{
    public static readonly Counter PointsEarned = Prometheus.Metrics.CreateCounter(
        "osprey_points_earned_total", "Points credited by applied earn events.");

    public static readonly Counter PointsRedeemed = Prometheus.Metrics.CreateCounter(
        "osprey_points_redeemed_total", "Points burned by reward redemptions and trip bookings.");

    public static readonly Counter PointsExpired = Prometheus.Metrics.CreateCounter(
        "osprey_points_expired_total", "Points removed by the expiry sweep.");

    public static readonly Counter TierChanges = Prometheus.Metrics.CreateCounter(
        "osprey_tier_changes_total", "Tier movements, labelled by direction.",
        new CounterConfiguration { LabelNames = ["direction"] });
}
