using Osprey.Members.Features;
using Xunit;

namespace Osprey.Members.Tests;

public sealed class ApplyEarnCoreTests
{
    [Theory]
    [InlineData(40_000, 0.5, 20_000)]
    [InlineData(999, 0.5, 499)]     // floor, never round up
    [InlineData(100, 2.0, 200)]
    [InlineData(1, 0.5, 0)]
    public void Points_are_amount_times_rate_floored(double amount, double rate, int expected) =>
        Assert.Equal(expected, ApplyEarn.PointsFor((decimal)amount, (decimal)rate));
}
