// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class AdjustPoints
{
    public static class Validation
    {
        /// <summary>Sanity cap on a single manual adjustment — anything bigger is a typo, not goodwill.</summary>
        public const int MaxAdjustment = 100_000;

        private const int MaxIdLength = 64;
        private const int MaxReasonLength = 200;
        private const int MinKeyLength = 8;
        private const int MaxKeyLength = 100;

        public static void Require(string memberId, Request request)
        {
            if (string.IsNullOrWhiteSpace(memberId) || memberId.Length > MaxIdLength)
                throw new ArgumentException("Member id is required and at most 64 characters.");
            if (request.Points == 0)
                throw new ArgumentException("Adjustment points must not be zero.");
            if (request.Points is > MaxAdjustment or < -MaxAdjustment)
                throw new ArgumentException($"Adjustment magnitude must be at most {MaxAdjustment} points.");
            if (string.IsNullOrWhiteSpace(request.Reason) || request.Reason.Trim().Length > MaxReasonLength)
                throw new ArgumentException($"Reason is required and at most {MaxReasonLength} characters.");
            if (string.IsNullOrWhiteSpace(request.IdempotencyKey)
                || request.IdempotencyKey.Length is < MinKeyLength or > MaxKeyLength)
                throw new ArgumentException($"Idempotency key must be {MinKeyLength}-{MaxKeyLength} characters.");
        }
    }
}
