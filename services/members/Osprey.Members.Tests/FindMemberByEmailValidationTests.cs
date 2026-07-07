using Osprey.Members.Features;
using Xunit;

namespace Osprey.Members.Tests;

public sealed class FindMemberByEmailValidationTests
{
    [Fact]
    public void Valid_email_passes()
    {
        FindMemberByEmail.Validation.RequireEmail("ada@example.com"); // no throw
    }

    [Fact]
    public void Blank_email_fails()
    {
        Assert.Throws<ArgumentException>(() => FindMemberByEmail.Validation.RequireEmail("   "));
    }

    [Fact]
    public void Email_without_at_sign_fails()
    {
        Assert.Throws<ArgumentException>(() => FindMemberByEmail.Validation.RequireEmail("not-an-email"));
    }
}
