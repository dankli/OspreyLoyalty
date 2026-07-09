using Osprey.Members.Features;
using Osprey.Members.Storage;
using Xunit;

namespace Osprey.Members.Tests;

public sealed class GetMemberProfileCoreTests
{
    [Fact]
    public void Profile_carries_tier_progress_and_benefits()
    {
        var document = new MemberDocument(
            "demo-ada", "Ada Lindqvist", "ada@example.com",
            new DateTime(2024, 3, 12, 0, 0, 0, DateTimeKind.Utc),
            QualifyingPoints: 32_000, SpendablePoints: 14_500);

        GetMemberProfile.Response response = GetMemberProfile.ToResponse(document);

        Assert.Equal("SILVER", response.Tier);
        Assert.Equal(13_000, response.PointsToNextTier);
        Assert.Contains("Priority boarding", response.Benefits);
        Assert.Equal(14_500, response.SpendablePoints);
    }

    [Fact]
    public void Invited_member_is_osprey_with_no_next_tier()
    {
        var document = new MemberDocument(
            "x", "Top Flyer", "top@example.com", DateTime.UtcNow,
            QualifyingPoints: 96_000, SpendablePoints: 0, IsOspreyInvited: true);

        GetMemberProfile.Response response = GetMemberProfile.ToResponse(document);
        Assert.Equal("OSPREY", response.Tier);
        Assert.Null(response.PointsToNextTier);
    }

    [Fact]
    public void High_points_without_invitation_stay_diamond()
    {
        var document = new MemberDocument(
            "x", "Frequent Flyer", "ff@example.com", DateTime.UtcNow,
            QualifyingPoints: 200_000, SpendablePoints: 0);

        Assert.Equal("DIAMOND", GetMemberProfile.ToResponse(document).Tier);
    }
}
