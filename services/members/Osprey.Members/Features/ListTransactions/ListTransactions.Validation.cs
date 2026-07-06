// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class ListTransactions
{
    public static class Validation
    {
        private const int MaxPage = 100_000;

        public static void Require(string memberId, int page)
        {
            if (string.IsNullOrWhiteSpace(memberId) || memberId.Length > 64)
                throw new ArgumentException("Member id is required and at most 64 characters.");
            if (page is < 0 or > MaxPage)
                throw new ArgumentException($"Page must be between 0 and {MaxPage}.");
        }
    }
}
