// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class Redeem
{
    public sealed record Request(string RewardId, string IdempotencyKey);

    /// <summary>AlreadyApplied mirrors ApplyEarn — a retried redemption is a success that spent nothing new.</summary>
    public sealed record Response(string RewardId, int PointsSpent, int SpendablePoints, bool AlreadyApplied);

    /// <summary>Where a redemption attempt ended up. Expected sad paths are values on this rail — the
    /// handler returns one of these, never throws, and the endpoint maps it to the HTTP result.</summary>
    public enum Status { Ok, UnknownMember, UnknownReward, InsufficientPoints }

    public sealed record Outcome(Status Status, Response? Response = null)
    {
        public static Outcome Ok(Response response) => new(Status.Ok, response);
        public static readonly Outcome UnknownMember = new(Status.UnknownMember);
        public static readonly Outcome UnknownReward = new(Status.UnknownReward);
        public static readonly Outcome InsufficientPoints = new(Status.InsufficientPoints);
    }
}
