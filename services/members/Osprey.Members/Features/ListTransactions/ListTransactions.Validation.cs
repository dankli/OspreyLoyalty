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
                throw Messages.Fail("member_id_invalid");
            if (page is < 0 or > MaxPage)
                throw Messages.Fail("list_page", MaxPage);
        }
    }
}
