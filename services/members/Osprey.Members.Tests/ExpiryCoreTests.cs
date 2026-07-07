using Osprey.Members.Features;
using Osprey.Members.Storage;
using Xunit;

namespace Osprey.Members.Tests;

public sealed class ExpiryCoreTests
{
    private static readonly DateTime Now = new(2026, 7, 7, 12, 0, 0, DateTimeKind.Utc);

    private static PointsTransactionDocument Entry(string id, int points, int monthsAgo, string type = "earn") =>
        new(id, "m-1", type, points, "test", $"key-{id}-0000", Now.AddMonths(-monthsAgo));

    [Fact]
    public void Fresh_earns_do_not_expire()
    {
        Assert.Empty(Expiry.DueLots([Entry("e1", 10_000, 3)], Now));
    }

    [Fact]
    public void Old_earn_fully_consumed_by_a_burn_yields_nothing()
    {
        Assert.Empty(Expiry.DueLots(
            [Entry("e1", 10_000, 25), Entry("b1", -10_000, 2, "burn")], Now));
    }

    [Fact]
    public void Partially_consumed_old_earn_expires_the_remainder()
    {
        var lots = Expiry.DueLots(
            [Entry("e1", 10_000, 25), Entry("b1", -4_000, 2, "burn")], Now);
        var lot = Assert.Single(lots);
        Assert.Equal("e1", lot.EarnId);
        Assert.Equal(6_000, lot.PointsToExpire);
    }

    [Fact]
    public void Burns_consume_the_oldest_earn_first()
    {
        // Old earn 5k is fully drained by the 6k burn (FIFO); the burn's remaining 1k
        // eats into the fresh earn, which is too young to expire anyway.
        Assert.Empty(Expiry.DueLots(
            [Entry("e1", 5_000, 26), Entry("e2", 8_000, 2), Entry("b1", -6_000, 1, "burn")], Now));
    }

    [Fact]
    public void Exactly_twentyfour_months_old_is_due()
    {
        var lot = Assert.Single(Expiry.DueLots([Entry("e1", 1_000, 24)], Now));
        Assert.Equal(1_000, lot.PointsToExpire);
    }

    [Fact]
    public void Prior_expiry_entries_count_as_consumption()
    {
        // A previous sweep already expired e1 — running the computation again yields nothing.
        Assert.Empty(Expiry.DueLots(
            [Entry("e1", 6_000, 25), Entry("x1", -6_000, 1, "expiry")], Now));
    }

    [Fact]
    public void Positive_adjustments_age_like_earns()
    {
        var lot = Assert.Single(Expiry.DueLots([Entry("a1", 2_000, 25, "adjustment")], Now));
        Assert.Equal("a1", lot.EarnId);
        Assert.Equal(2_000, lot.PointsToExpire);
    }
}
