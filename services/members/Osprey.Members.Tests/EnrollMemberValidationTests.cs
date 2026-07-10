using Osprey.Members.Features;
using Xunit;

namespace Osprey.Members.Tests;

public sealed class EnrollMemberValidationTests
{
    [Fact]
    public void Valid_request_has_no_error()
    {
        Assert.Null(EnrollMember.Validation.Check(new EnrollMember.Request("Ada Lindqvist", "ada@example.com")));
    }

    [Fact]
    public void Blank_name_is_rejected()
    {
        var error = EnrollMember.Validation.Check(new EnrollMember.Request("  ", "ada@example.com"));
        Assert.Equal("name_required", error?.Key);
    }

    [Fact]
    public void Name_over_max_length_is_rejected()
    {
        string tooLong = new('a', 201);
        var error = EnrollMember.Validation.Check(new EnrollMember.Request(tooLong, "ada@example.com"));
        Assert.Equal("name_too_long", error?.Key);
    }

    [Fact]
    public void Email_without_at_sign_is_rejected()
    {
        var error = EnrollMember.Validation.Check(new EnrollMember.Request("Ada", "not-an-email"));
        Assert.Equal("email_invalid", error?.Key);
    }

    [Fact]
    public void Email_over_max_length_is_rejected()
    {
        string tooLong = new string('a', 250) + "@example.com";
        var error = EnrollMember.Validation.Check(new EnrollMember.Request("Ada", tooLong));
        Assert.Equal("email_too_long", error?.Key);
    }
}
