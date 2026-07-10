using Osprey.Members.Features;
using Xunit;

namespace Osprey.Members.Tests;

public sealed class EraseMemberValidationTests
{
    [Fact]
    public void Valid_id_has_no_error() =>
        Assert.Null(EraseMember.Validation.Check("abc123"));

    [Fact]
    public void Blank_id_is_rejected() =>
        Assert.Equal("member_id_invalid", EraseMember.Validation.Check("  ")?.Key);

    [Fact]
    public void Id_over_max_length_is_rejected() =>
        Assert.Equal("member_id_invalid", EraseMember.Validation.Check(new string('a', 65))?.Key);
}
