// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class Requalification
{
    /// <summary>
    /// Turns a sweep's tier changes into tier.changed outbox events. The event id carries
    /// the day stamp — a sweep re-run the same day (crash, overlapping schedule) writes the
    /// same ids and dedups on the outbox primary key; a genuine later change gets a new id.
    /// </summary>
    public static async Task EmitAsync(
        IReadOnlyList<TierChange> changes, Outbox.Writer outbox, DateTime nowUtc, CancellationToken ct = default)
    {
        foreach (TierChange change in changes)
        {
            await outbox.WriteAsync(new Outbox.TierChangedEvent(
                $"tier-{change.MemberId}-{change.NewTier.ToString().ToUpperInvariant()}-{nowUtc:yyyyMMdd}",
                change.MemberId,
                change.PreviousTier.ToString().ToUpperInvariant(),
                change.NewTier.ToString().ToUpperInvariant(),
                nowUtc), ct);
        }
    }
}
