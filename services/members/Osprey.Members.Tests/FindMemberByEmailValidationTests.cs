using Osprey.Members.Features;
using Xunit;

namespace Osprey.Members.Tests;

public sealed class FindMemberByEmailValidationTests
{
    [Fact]
    public void Valid_email_has_no_error() =>
        Assert.Null(FindMemberByEmail.Validation.Check("ada@example.com"));

    [Fact]
    public void Email_without_at_sign_is_rejected() =>
        Assert.Equal("email_invalid", FindMemberByEmail.Validation.Check("not-an-email")?.Key);

    [Fact]
    public void Blank_email_is_rejected() =>
        Assert.Equal("email_invalid", FindMemberByEmail.Validation.Check("  ")?.Key);

    [Fact]
    public void Email_over_max_length_is_rejected() =>
        Assert.Equal("email_too_long",
            FindMemberByEmail.Validation.Check(new string('a', 250) + "@example.com")?.Key);
}
