using Osprey.Members.Features;
using Xunit;

namespace Osprey.Members.Tests;

public sealed class RedeemValidationTests
{
    [Fact]
    public void Valid_request_has_no_error() =>
        Assert.Null(Redeem.Validation.Check("demo-ada", new Redeem.Request("lounge-pass", "key-1234567890")));

    [Fact]
    public void Blank_member_is_rejected() =>
        Assert.Equal("member_id_invalid",
            Redeem.Validation.Check(" ", new Redeem.Request("lounge-pass", "key-1234567890"))?.Key);

    [Fact]
    public void Blank_reward_is_rejected() =>
        Assert.Equal("reward_id_invalid",
            Redeem.Validation.Check("demo-ada", new Redeem.Request("", "key-1234567890"))?.Key);

    [Fact]
    public void Short_idempotency_key_is_rejected() =>
        Assert.Equal("idempotency_key",
            Redeem.Validation.Check("demo-ada", new Redeem.Request("lounge-pass", "short"))?.Key);
}
