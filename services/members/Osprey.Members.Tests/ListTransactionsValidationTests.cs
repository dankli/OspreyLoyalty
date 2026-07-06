using Osprey.Members.Features;
using Xunit;

namespace Osprey.Members.Tests;

public sealed class ListTransactionsValidationTests
{
    [Fact]
    public void Page_zero_passes_and_negative_fails()
    {
        ListTransactions.Validation.Require("demo-ada", page: 0); // no throw
        Assert.Throws<ArgumentException>(() => ListTransactions.Validation.Require("demo-ada", page: -1));
    }

    [Fact]
    public void Absurd_page_fails()
    {
        Assert.Throws<ArgumentException>(() => ListTransactions.Validation.Require("demo-ada", page: 100_001));
    }
}
