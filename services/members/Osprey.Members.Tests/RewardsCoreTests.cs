using Osprey.Members.Features;
using Xunit;

namespace Osprey.Members.Tests;

public sealed class RewardsCoreTests
{
    [Fact]
    public void All_rewards_have_positive_cost_and_unique_ids()
    {
        Assert.Equal(3, Rewards.All.Count);
        Assert.All(Rewards.All, r => Assert.True(r.Cost > 0));
        Assert.Equal(Rewards.All.Count, Rewards.All.Select(r => r.Id).Distinct().Count());
    }

    [Fact]
    public void ById_finds_and_misses()
    {
        Assert.Equal(15_000, Rewards.ById("lounge-pass")!.Cost);
        Assert.Null(Rewards.ById("nope"));
    }
}
