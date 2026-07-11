using Osprey.Members.Storage;

// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class ActivateBenefit
{
    public sealed record Request(string Benefit, string IdempotencyKey);

    public sealed record Response(string Benefit, string Code, DateTime ActivatedAtUtc, bool AlreadyApplied);

    /// <summary>Expected sad paths are values on this rail — the handler never throws for them.</summary>
    public enum Status { Ok, UnknownMember, NotEntitled }

    public sealed record Outcome(Status Status, Response? Response = null)
    {
        public static Outcome Ok(Response response) => new(Status.Ok, response);
        public static readonly Outcome UnknownMember = new(Status.UnknownMember);
        public static readonly Outcome NotEntitled = new(Status.NotEntitled);
    }

    internal static Response ToResponse(BenefitActivationDocument document, bool alreadyApplied) =>
        new(document.Benefit, document.Code, document.ActivatedAtUtc, alreadyApplied);
}
