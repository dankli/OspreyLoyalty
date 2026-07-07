using Osprey.Members.Features;
using Xunit;

namespace Osprey.Members.Tests;

public sealed class AdjustPointsValidationTests
{
    [Fact]
    public void Valid_request_passes()
    {
        AdjustPoints.Validation.Require("demo-ada",
            new AdjustPoints.Request(2_500, "goodwill", "key-1234567890")); // no throw
        AdjustPoints.Validation.Require("demo-ada",
            new AdjustPoints.Request(-500, "correction", "key-1234567890")); // negative is fine too
    }

    [Fact]
    public void Zero_points_fails()
    {
        Assert.Throws<ArgumentException>(() => AdjustPoints.Validation.Require("demo-ada",
            new AdjustPoints.Request(0, "goodwill", "key-1234567890")));
    }

    [Fact]
    public void Over_max_magnitude_fails_in_both_directions()
    {
        Assert.Throws<ArgumentException>(() => AdjustPoints.Validation.Require("demo-ada",
            new AdjustPoints.Request(100_001, "goodwill", "key-1234567890")));
        Assert.Throws<ArgumentException>(() => AdjustPoints.Validation.Require("demo-ada",
            new AdjustPoints.Request(-100_001, "goodwill", "key-1234567890")));
    }

    [Fact]
    public void Blank_or_overlong_reason_fails()
    {
        Assert.Throws<ArgumentException>(() => AdjustPoints.Validation.Require("demo-ada",
            new AdjustPoints.Request(100, "   ", "key-1234567890")));
        Assert.Throws<ArgumentException>(() => AdjustPoints.Validation.Require("demo-ada",
            new AdjustPoints.Request(100, new string('r', 201), "key-1234567890")));
    }
}
