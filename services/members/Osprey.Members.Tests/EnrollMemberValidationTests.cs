using Osprey.Members.Features;
using Xunit;

namespace Osprey.Members.Tests;

public sealed class EnrollMemberValidationTests
{
    [Fact]
    public void Valid_request_passes()
    {
        EnrollMember.Validation.Require(new EnrollMember.Request("Ada Lindqvist", "ada@example.com")); // no throw
    }

    [Fact]
    public void Blank_name_fails()
    {
        Assert.Throws<ArgumentException>(() =>
            EnrollMember.Validation.Require(new EnrollMember.Request("  ", "ada@example.com")));
    }

    [Fact]
    public void Name_over_max_length_fails()
    {
        string tooLong = new('a', 201);
        Assert.Throws<ArgumentException>(() =>
            EnrollMember.Validation.Require(new EnrollMember.Request(tooLong, "ada@example.com")));
    }

    [Fact]
    public void Email_without_at_sign_fails()
    {
        Assert.Throws<ArgumentException>(() =>
            EnrollMember.Validation.Require(new EnrollMember.Request("Ada", "not-an-email")));
    }

    [Fact]
    public void Email_over_max_length_fails()
    {
        string tooLong = new string('a', 250) + "@example.com";
        Assert.Throws<ArgumentException>(() =>
            EnrollMember.Validation.Require(new EnrollMember.Request("Ada", tooLong)));
    }
}
