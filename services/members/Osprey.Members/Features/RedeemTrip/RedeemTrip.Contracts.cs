// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class RedeemTrip
{
    /// <summary>Points come from the GATEWAY's server-side estimate (routeSearch → points-engine),
    /// never from the browser — members only bounds-checks them (see Validation).</summary>
    public sealed record Request(string FromIata, string ToIata, int Points, string IdempotencyKey);

    /// <summary>AlreadyApplied mirrors Redeem — a retried booking is a success that spent nothing new.</summary>
    public sealed record Response(string FromIata, string ToIata, int PointsSpent, int SpendablePoints, bool AlreadyApplied);

    /// <summary>Expected sad paths are values on this rail — the handler never throws for them.</summary>
    public enum Status { Ok, UnknownMember, InsufficientPoints }

    public sealed record Outcome(Status Status, Response? Response = null)
    {
        public static Outcome Ok(Response response) => new(Status.Ok, response);
        public static readonly Outcome UnknownMember = new(Status.UnknownMember);
        public static readonly Outcome InsufficientPoints = new(Status.InsufficientPoints);
    }
}
