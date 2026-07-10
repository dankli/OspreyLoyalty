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

        public static ValidationError? Check(EarnEvent earn)
        {
            if (string.IsNullOrWhiteSpace(earn.MemberId) || earn.MemberId.Length > 64)
                return ValidationError.Of("member_id_invalid");
            if (string.IsNullOrWhiteSpace(earn.PartnerId) || earn.PartnerId.Length > 64)
                return ValidationError.Of("partner_id_invalid");
            if (earn.Amount <= 0m || earn.Amount > MaxAmount)
                return ValidationError.Of("earn_amount", MaxAmount);
            if (earn.Rate <= 0m || earn.Rate > MaxRate)
                return ValidationError.Of("earn_rate", MaxRate);
            if (string.IsNullOrWhiteSpace(earn.IdempotencyKey)
                || earn.IdempotencyKey.Length is < MinKeyLength or > MaxKeyLength)
                return ValidationError.Of("idempotency_key", MinKeyLength, MaxKeyLength);
            return null;
        }
    }
}
