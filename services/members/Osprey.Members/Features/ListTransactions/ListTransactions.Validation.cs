// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class ListTransactions
{
    public static class Validation
    {
        private const int MaxPage = 100_000;

        public static ValidationError? Check(string memberId, int page)
        {
            if (string.IsNullOrWhiteSpace(memberId) || memberId.Length > 64)
                return ValidationError.Of("member_id_invalid");
            if (page is < 0 or > MaxPage)
                return ValidationError.Of("list_page", MaxPage);
            return null;
        }
    }
}
