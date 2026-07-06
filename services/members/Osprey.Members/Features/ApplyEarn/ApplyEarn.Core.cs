// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class ApplyEarn
{
    /// <summary>Spec rule 1: floor(amount × rate). Floor, never round — the airline keeps the fraction.</summary>
    internal static int PointsFor(decimal amountSpent, decimal partnerRate) =>
        (int)Math.Floor(amountSpent * partnerRate);
}
