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

        public static ValidationError? Check(string memberId, Request request)
        {
            if (string.IsNullOrWhiteSpace(memberId) || memberId.Length > MaxIdLength)
                return ValidationError.Of("member_id_invalid");
            if (request.Points == 0)
                return ValidationError.Of("adjust_points_zero");
            if (request.Points is > MaxAdjustment or < -MaxAdjustment)
                return ValidationError.Of("adjust_magnitude", MaxAdjustment);
            if (string.IsNullOrWhiteSpace(request.Reason) || request.Reason.Trim().Length > MaxReasonLength)
                return ValidationError.Of("adjust_reason", MaxReasonLength);
            if (string.IsNullOrWhiteSpace(request.IdempotencyKey)
                || request.IdempotencyKey.Length is < MinKeyLength or > MaxKeyLength)
                return ValidationError.Of("idempotency_key", MinKeyLength, MaxKeyLength);
            return null;
        }
    }
}
