// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class AdjustPoints
{
    public sealed record Request(int Points, string Reason, string IdempotencyKey);

    /// <summary>AlreadyApplied mirrors Redeem — a retried adjustment is a success that changed nothing new.</summary>
    public sealed record Response(int Points, int SpendablePoints, bool AlreadyApplied);

    /// <summary>Where an adjustment attempt ended up. Expected sad paths are values on this rail — the
    /// handler returns one of these, never throws, and the endpoint maps it to the HTTP result.</summary>
    public enum Status { Ok, UnknownMember, Overdraw }

    public sealed record Outcome(Status Status, Response? Response = null)
    {
        public static Outcome Ok(Response response) => new(Status.Ok, response);
        public static readonly Outcome UnknownMember = new(Status.UnknownMember);
        public static readonly Outcome Overdraw = new(Status.Overdraw);
    }
}
