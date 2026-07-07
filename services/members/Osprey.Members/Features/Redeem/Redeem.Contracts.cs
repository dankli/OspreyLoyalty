// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class Redeem
{
    public sealed record Request(string RewardId, string IdempotencyKey);

    /// <summary>AlreadyApplied mirrors ApplyEarn — a retried redemption is a success that spent nothing new.</summary>
    public sealed record Response(string RewardId, int PointsSpent, int SpendablePoints, bool AlreadyApplied);
}
