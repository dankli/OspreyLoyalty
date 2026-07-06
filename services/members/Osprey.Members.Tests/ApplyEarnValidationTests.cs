using Osprey.Members.Features;
using Xunit;

namespace Osprey.Members.Tests;

public sealed class ApplyEarnValidationTests
{
    private static ApplyEarn.EarnEvent Valid() => new(
        "demo-erik", "cardco", 40_000m, 0.5m, "key-1234567890", DateTime.UtcNow);

    [Fact]
    public void Valid_event_passes()
    {
        ApplyEarn.Validation.Require(Valid()); // no throw
    }

    [Fact]
    public void Non_positive_or_absurd_amount_fails()
    {
        Assert.Throws<ArgumentException>(() => ApplyEarn.Validation.Require(Valid() with { Amount = 0m }));
        Assert.Throws<ArgumentException>(() => ApplyEarn.Validation.Require(Valid() with { Amount = 2_000_000m }));
    }

    [Fact]
    public void Rate_outside_sane_bounds_fails()
    {
        Assert.Throws<ArgumentException>(() => ApplyEarn.Validation.Require(Valid() with { Rate = 0m }));
        Assert.Throws<ArgumentException>(() => ApplyEarn.Validation.Require(Valid() with { Rate = 11m }));
    }

    [Fact]
    public void Short_or_blank_idempotency_key_fails()
    {
        Assert.Throws<ArgumentException>(() => ApplyEarn.Validation.Require(Valid() with { IdempotencyKey = "short" }));
        Assert.Throws<ArgumentException>(() => ApplyEarn.Validation.Require(Valid() with { IdempotencyKey = " " }));
    }
}
