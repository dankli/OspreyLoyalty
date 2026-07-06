// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class GetMemberProfile
{
    public sealed record Dto(
        string Id,
        string Name,
        string Email,
        string Tier,
        int QualifyingPoints,
        int SpendablePoints,
        int? PointsToNextTier,
        IReadOnlyList<string> Benefits,
        DateTime JoinedAtUtc);
}
