// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class RedeemTrip
{
    public static class Validation
    {
        private const int MaxIdLength = 64;
        private const int MinKeyLength = 8;
        private const int MaxKeyLength = 100;
        private const int MaxPoints = 1_000_000;

        public static ValidationError? Check(string memberId, Request request)
        {
            if (string.IsNullOrWhiteSpace(memberId) || memberId.Length > MaxIdLength)
                return ValidationError.Of("member_id_invalid");
            if (!IsIata(request.FromIata) || !IsIata(request.ToIata))
                return ValidationError.Of("trip_airport_invalid");
            if (request.Points is < 1 or > MaxPoints)
                return ValidationError.Of("trip_points_invalid", MaxPoints);
            if (string.IsNullOrWhiteSpace(request.IdempotencyKey)
                || request.IdempotencyKey.Length is < MinKeyLength or > MaxKeyLength)
                return ValidationError.Of("idempotency_key", MinKeyLength, MaxKeyLength);
            return null;
        }

        private static bool IsIata(string? code) =>
            code is { Length: 3 } && code.All(c => c is >= 'A' and <= 'Z');
    }
}
