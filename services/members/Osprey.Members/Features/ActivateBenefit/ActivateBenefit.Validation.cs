// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class ActivateBenefit
{
    public static class Validation
    {
        private const int MaxIdLength = 64;
        private const int MaxBenefitLength = 100;
        private const int MinKeyLength = 8;
        private const int MaxKeyLength = 100;

        public static ValidationError? Check(string memberId, Request request)
        {
            if (string.IsNullOrWhiteSpace(memberId) || memberId.Length > MaxIdLength)
                return ValidationError.Of("member_id_invalid");
            if (string.IsNullOrWhiteSpace(request.Benefit) || request.Benefit.Length > MaxBenefitLength)
                return ValidationError.Of("benefit_invalid", MaxBenefitLength);
            if (string.IsNullOrWhiteSpace(request.IdempotencyKey)
                || request.IdempotencyKey.Length is < MinKeyLength or > MaxKeyLength)
                return ValidationError.Of("idempotency_key", MinKeyLength, MaxKeyLength);
            return null;
        }
    }
}
