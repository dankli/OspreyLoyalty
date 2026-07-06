using Osprey.Members.Storage;

// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class GetMemberProfile
{
    internal static Dto ToDto(MemberDocument document)
    {
        Tiers.Tier tier = Tiers.Effective(document.QualifyingPoints, document.IsPandionInvited);
        return new Dto(
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
