// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class ListTransactions
{
    public static class Validation
    {
        private const int MaxPage = 100_000;

        private static readonly string[] KnownTypes =
            [Storage.TransactionTypes.Earn, Storage.TransactionTypes.Burn, Storage.TransactionTypes.Expiry, Storage.TransactionTypes.Adjustment];

        public static ValidationError? Check(string memberId, int page, string? type = null)
        {
            if (string.IsNullOrWhiteSpace(memberId) || memberId.Length > 64)
                return ValidationError.Of("member_id_invalid");
            if (page is < 0 or > MaxPage)
                return ValidationError.Of("list_page", MaxPage);
            if (type is not null && Array.IndexOf(KnownTypes, type) < 0)
                return ValidationError.Of("tx_type_invalid");
            return null;
        }
    }
}
