// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

/// <summary>
/// Tier ladder and thresholds. Pure and I/O-free. The rolling 12-month window
/// arrives with the earn flow in phase 2 — phase 1 only needs the mapping from a
/// qualifying-points total to a tier for profile display, so that is all this does.
/// OSPREY sits outside the ladder entirely: it is granted by invitation, its rules
/// are secret, so no threshold for it may exist anywhere in code.
/// </summary>
public static partial class Tiers
{
    public enum Tier { Member = 0, Silver = 1, Gold = 2, Diamond = 3, Osprey = 4 }

    private const int SilverThreshold = 20_000;
    private const int GoldThreshold = 45_000;
    private const int DiamondThreshold = 90_000;

    public static Tier FromQualifyingPoints(int qualifyingPoints) => qualifyingPoints switch
    {
        >= DiamondThreshold => Tier.Diamond,
        >= GoldThreshold => Tier.Gold,
        >= SilverThreshold => Tier.Silver,
        _ => Tier.Member,
    };

    /// <summary>The invitation flag wins over any points total — OSPREY is not earnable.</summary>
    public static Tier Effective(int qualifyingPoints, bool isOspreyInvited) =>
        isOspreyInvited ? Tier.Osprey : FromQualifyingPoints(qualifyingPoints);

    /// <summary>Points remaining to the next earnable tier, or null at DIAMOND — the earned ladder ends there.</summary>
    public static int? PointsToNext(int qualifyingPoints) => FromQualifyingPoints(qualifyingPoints) switch
    {
        Tier.Diamond => null,
        Tier.Gold => DiamondThreshold - qualifyingPoints,
        Tier.Silver => GoldThreshold - qualifyingPoints,
        _ => SilverThreshold - qualifyingPoints,
    };

    /// <summary>Display-only perks per spec — no logic beyond the tier mapping.</summary>
    public static IReadOnlyList<string> BenefitsFor(Tier tier) => tier switch
    {
        Tier.Osprey => ["Dedicated service line", "Lounge access", "Extra baggage", "Priority boarding"],
        Tier.Diamond => ["Lounge access", "Extra baggage", "Priority boarding"],
        Tier.Gold => ["Lounge access", "Priority boarding"],
        Tier.Silver => ["Priority boarding"],
        _ => ["Member offers"],
    };
}
