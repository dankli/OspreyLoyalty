// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

/// <summary>In-memory reward catalog — three rewards is the whole universe of this demo (docs/domain.md).</summary>
public static partial class Rewards
{
    public sealed record Reward(string Id, string Name, int Cost);

    public static readonly IReadOnlyList<Reward> All =
    [
        new("lounge-pass", "Lounge day pass", 15_000),
        new("upgrade-voucher", "Cabin upgrade voucher", 30_000),
        new("cardco-giftcard", "CardCo gift card", 5_000),
    ];

    public static Reward? ById(string id) => All.FirstOrDefault(r => r.Id == id);
}
