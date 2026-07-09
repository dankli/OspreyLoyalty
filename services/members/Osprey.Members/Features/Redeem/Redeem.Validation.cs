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
                throw Messages.Fail("member_id_invalid");
            if (string.IsNullOrWhiteSpace(request.RewardId) || request.RewardId.Length > MaxIdLength)
                throw Messages.Fail("reward_id_invalid");
            if (string.IsNullOrWhiteSpace(request.IdempotencyKey)
                || request.IdempotencyKey.Length is < MinKeyLength or > MaxKeyLength)
                throw Messages.Fail("idempotency_key", MinKeyLength, MaxKeyLength);
        }
    }
}
