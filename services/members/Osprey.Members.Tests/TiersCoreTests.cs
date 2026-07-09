using Osprey.Members.Features;
using Xunit;

namespace Osprey.Members.Tests;

public sealed class TiersCoreTests
{
    [Theory]
    [InlineData(0, Tiers.Tier.Member)]
    [InlineData(19_999, Tiers.Tier.Member)]
    [InlineData(20_000, Tiers.Tier.Silver)]
    [InlineData(44_999, Tiers.Tier.Silver)]
    [InlineData(45_000, Tiers.Tier.Gold)]
    [InlineData(89_999, Tiers.Tier.Gold)]
    [InlineData(90_000, Tiers.Tier.Diamond)]
    [InlineData(150_000, Tiers.Tier.Diamond)] // points alone never reach OSPREY
    public void Qualifying_points_map_to_tier(int points, Tiers.Tier expected) =>
        Assert.Equal(expected, Tiers.FromQualifyingPoints(points));

    [Fact]
    public void Osprey_comes_only_by_invitation()
    {
        Assert.Equal(Tiers.Tier.Osprey, Tiers.Effective(0, isOspreyInvited: true));
        Assert.Equal(Tiers.Tier.Diamond, Tiers.Effective(150_000, isOspreyInvited: false));
    }

    [Fact]
    public void Points_to_next_counts_down_and_stops_at_osprey()
    {
        Assert.Equal(20_000, Tiers.PointsToNext(0));
        Assert.Equal(13_000, Tiers.PointsToNext(32_000));
        Assert.Equal(1, Tiers.PointsToNext(44_999));
        Assert.Null(Tiers.PointsToNext(90_000)); // the earned ladder ends at DIAMOND
    }

    [Fact]
    public void Every_tier_has_at_least_one_benefit()
    {
        foreach (Tiers.Tier tier in Enum.GetValues<Tiers.Tier>())
            Assert.NotEmpty(Tiers.BenefitsFor(tier));
    }
}
