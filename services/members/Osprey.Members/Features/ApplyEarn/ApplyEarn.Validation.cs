// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class ApplyEarn
{
    public static class Validation
    {
        private const decimal MaxAmount = 1_000_000m;
        private const decimal MaxRate = 10m;
        private const int MinKeyLength = 8;
        private const int MaxKeyLength = 100;

        public static void Require(EarnEvent earn)
        {
            if (string.IsNullOrWhiteSpace(earn.MemberId) || earn.MemberId.Length > 64)
                throw Messages.Fail("member_id_invalid");
            if (string.IsNullOrWhiteSpace(earn.PartnerId) || earn.PartnerId.Length > 64)
                throw Messages.Fail("partner_id_invalid");
            if (earn.Amount <= 0m || earn.Amount > MaxAmount)
                throw Messages.Fail("earn_amount", MaxAmount);
            if (earn.Rate <= 0m || earn.Rate > MaxRate)
                throw Messages.Fail("earn_rate", MaxRate);
            if (string.IsNullOrWhiteSpace(earn.IdempotencyKey)
                || earn.IdempotencyKey.Length is < MinKeyLength or > MaxKeyLength)
                throw Messages.Fail("idempotency_key", MinKeyLength, MaxKeyLength);
        }
    }
}
