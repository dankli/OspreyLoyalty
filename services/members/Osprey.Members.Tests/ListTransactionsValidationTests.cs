using Osprey.Members.Features;
using Xunit;

namespace Osprey.Members.Tests;

public sealed class ListTransactionsValidationTests
{
    [Fact]
    public void Valid_request_has_no_error() =>
        Assert.Null(ListTransactions.Validation.Check("member-1", 0));

    [Fact]
    public void Blank_member_id_is_rejected() =>
        Assert.Equal("member_id_invalid", ListTransactions.Validation.Check("  ", 0)?.Key);

    [Fact]
    public void Negative_page_is_rejected() =>
        Assert.Equal("list_page", ListTransactions.Validation.Check("member-1", -1)?.Key);

    [Fact]
    public void Page_over_max_is_rejected() =>
        Assert.Equal("list_page", ListTransactions.Validation.Check("member-1", 100_001)?.Key);
}
