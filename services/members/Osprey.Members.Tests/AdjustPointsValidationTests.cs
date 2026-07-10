using Osprey.Members.Features;
using Xunit;

namespace Osprey.Members.Tests;

public sealed class AdjustPointsValidationTests
{
    [Fact]
    public void Valid_positive_and_negative_have_no_error()
    {
        Assert.Null(AdjustPoints.Validation.Check("demo-ada", new AdjustPoints.Request(2_500, "goodwill", "key-1234567890")));
        Assert.Null(AdjustPoints.Validation.Check("demo-ada", new AdjustPoints.Request(-500, "correction", "key-1234567890")));
    }

    [Fact]
    public void Zero_points_is_rejected() =>
        Assert.Equal("adjust_points_zero",
            AdjustPoints.Validation.Check("demo-ada", new AdjustPoints.Request(0, "goodwill", "key-1234567890"))?.Key);

    [Fact]
    public void Over_max_magnitude_is_rejected_in_both_directions()
    {
        Assert.Equal("adjust_magnitude",
            AdjustPoints.Validation.Check("demo-ada", new AdjustPoints.Request(100_001, "goodwill", "key-1234567890"))?.Key);
        Assert.Equal("adjust_magnitude",
            AdjustPoints.Validation.Check("demo-ada", new AdjustPoints.Request(-100_001, "goodwill", "key-1234567890"))?.Key);
    }

    [Fact]
    public void Blank_or_overlong_reason_is_rejected()
    {
        Assert.Equal("adjust_reason",
            AdjustPoints.Validation.Check("demo-ada", new AdjustPoints.Request(100, "   ", "key-1234567890"))?.Key);
        Assert.Equal("adjust_reason",
            AdjustPoints.Validation.Check("demo-ada", new AdjustPoints.Request(100, new string('r', 201), "key-1234567890"))?.Key);
    }
}
