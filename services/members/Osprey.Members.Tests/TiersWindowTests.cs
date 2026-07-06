using Osprey.Members.Features;
using Xunit;

namespace Osprey.Members.Tests;

public sealed class TiersWindowTests
{
    private static readonly DateTime Now = new(2026, 7, 6, 12, 0, 0, DateTimeKind.Utc);

    [Fact]
    public void Earns_inside_the_window_count()
    {
        int qualifying = Tiers.QualifyingPoints(
            [(Now.AddMonths(-1), 15_000), (Now.AddMonths(-11), 6_000)], Now);
        Assert.Equal(21_000, qualifying);
    }

    [Fact]
    public void Earns_older_than_twelve_months_roll_off_and_downgrade()
    {
        // 25k earned 13 months ago made this member SILVER once; only the fresh 1k counts now.
        int qualifying = Tiers.QualifyingPoints(
            [(Now.AddMonths(-13), 25_000), (Now.AddDays(-1), 1_000)], Now);
        Assert.Equal(1_000, qualifying);
        Assert.Equal(Tiers.Tier.Member, Tiers.FromQualifyingPoints(qualifying));
    }

    [Fact]
    public void Exactly_twelve_months_old_is_outside_the_window()
    {
        Assert.Equal(0, Tiers.QualifyingPoints([(Now.AddMonths(-12), 5_000)], Now));
    }

    [Fact]
    public void Negative_ledger_entries_do_not_reduce_qualifying_points()
    {
        // Burns spend spendable points; qualifying measures earning activity only.
        Assert.Equal(3_000, Tiers.QualifyingPoints(
            [(Now.AddMonths(-2), 3_000), (Now.AddMonths(-1), -2_000)], Now));
    }
}
