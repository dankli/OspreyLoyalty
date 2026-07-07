// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class Redeem
{
    public static class Validation
    {
        private const int MaxIdLength = 64;
        private const int MinKeyLength = 8;
        private const int MaxKeyLength = 100;

        public static void Require(string memberId, Request request)
        {
            if (string.IsNullOrWhiteSpace(memberId) || memberId.Length > MaxIdLength)
                throw new ArgumentException("Member id is required and at most 64 characters.");
            if (string.IsNullOrWhiteSpace(request.RewardId) || request.RewardId.Length > MaxIdLength)
                throw new ArgumentException("Reward id is required and at most 64 characters.");
            if (string.IsNullOrWhiteSpace(request.IdempotencyKey)
                || request.IdempotencyKey.Length is < MinKeyLength or > MaxKeyLength)
                throw new ArgumentException($"Idempotency key must be {MinKeyLength}-{MaxKeyLength} characters.");
        }
    }
}
