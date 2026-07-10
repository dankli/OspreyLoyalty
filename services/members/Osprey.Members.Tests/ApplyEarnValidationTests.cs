using Osprey.Members.Features;
using Xunit;

namespace Osprey.Members.Tests;

public sealed class ApplyEarnValidationTests
{
    private static ApplyEarn.EarnEvent Valid() => new(
        "demo-erik", "cardco", 40_000m, 0.5m, "key-1234567890", DateTime.UtcNow);

    [Fact]
    public void Valid_event_has_no_error() =>
        Assert.Null(ApplyEarn.Validation.Check(Valid()));

    [Fact]
    public void Non_positive_or_absurd_amount_is_rejected()
    {
        Assert.Equal("earn_amount", ApplyEarn.Validation.Check(Valid() with { Amount = 0m })?.Key);
        Assert.Equal("earn_amount", ApplyEarn.Validation.Check(Valid() with { Amount = 2_000_000m })?.Key);
    }

    [Fact]
    public void Rate_outside_sane_bounds_is_rejected()
    {
        Assert.Equal("earn_rate", ApplyEarn.Validation.Check(Valid() with { Rate = 0m })?.Key);
        Assert.Equal("earn_rate", ApplyEarn.Validation.Check(Valid() with { Rate = 11m })?.Key);
    }

    [Fact]
    public void Short_or_blank_idempotency_key_is_rejected()
    {
        Assert.Equal("idempotency_key", ApplyEarn.Validation.Check(Valid() with { IdempotencyKey = "short" })?.Key);
        Assert.Equal("idempotency_key", ApplyEarn.Validation.Check(Valid() with { IdempotencyKey = " " })?.Key);
    }
}
