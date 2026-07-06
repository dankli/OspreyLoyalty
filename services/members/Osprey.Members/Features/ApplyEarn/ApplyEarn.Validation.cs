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
                throw new ArgumentException("Member id is required and at most 64 characters.");
            if (string.IsNullOrWhiteSpace(earn.PartnerId) || earn.PartnerId.Length > 64)
                throw new ArgumentException("Partner id is required and at most 64 characters.");
            if (earn.Amount <= 0m || earn.Amount > MaxAmount)
                throw new ArgumentException($"Amount must be positive and at most {MaxAmount}.");
            if (earn.Rate <= 0m || earn.Rate > MaxRate)
                throw new ArgumentException($"Rate must be positive and at most {MaxRate}.");
            if (string.IsNullOrWhiteSpace(earn.IdempotencyKey)
                || earn.IdempotencyKey.Length is < MinKeyLength or > MaxKeyLength)
                throw new ArgumentException($"Idempotency key must be {MinKeyLength}-{MaxKeyLength} characters.");
        }
    }
}
