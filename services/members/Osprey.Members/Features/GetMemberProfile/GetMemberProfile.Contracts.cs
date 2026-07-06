using Osprey.Members.Storage;

// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class GetMemberProfile
{
    public sealed record Response(
        string Id,
        string Name,
        string Email,
        string Tier,
        int QualifyingPoints,
        int SpendablePoints,
        int? PointsToNextTier,
        IReadOnlyList<string> Benefits,
        DateTime JoinedAtUtc);

    internal static Response ToResponse(MemberDocument document)
    {
        Tiers.Tier tier = Tiers.Effective(document.QualifyingPoints, document.IsPandionInvited);
        return new Response(
            document.Id,
            document.Name,
            document.Email,
            tier.ToString().ToUpperInvariant(),
            document.QualifyingPoints,
            document.SpendablePoints,
            tier == Tiers.Tier.Pandion ? null : Tiers.PointsToNext(document.QualifyingPoints),
            Tiers.BenefitsFor(tier),
            document.JoinedAtUtc);
    }
}
