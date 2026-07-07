using Osprey.Members.Features;
using Xunit;

namespace Osprey.Members.Tests;

public sealed class RedeemValidationTests
{
    [Fact]
    public void Valid_request_passes()
    {
        Redeem.Validation.Require("demo-ada", new Redeem.Request("lounge-pass", "key-1234567890")); // no throw
    }

    [Fact]
    public void Blank_member_or_reward_fails()
    {
        Assert.Throws<ArgumentException>(() =>
            Redeem.Validation.Require(" ", new Redeem.Request("lounge-pass", "key-1234567890")));
        Assert.Throws<ArgumentException>(() =>
            Redeem.Validation.Require("demo-ada", new Redeem.Request("", "key-1234567890")));
    }

    [Fact]
    public void Short_idempotency_key_fails()
    {
        Assert.Throws<ArgumentException>(() =>
            Redeem.Validation.Require("demo-ada", new Redeem.Request("lounge-pass", "short")));
    }
}
