// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class GetMemberProfile
{
    public static class Validation
    {
        private const int MaxIdLength = 64;

        public static ValidationError? Check(string id) =>
            string.IsNullOrWhiteSpace(id) || id.Length > MaxIdLength
                ? ValidationError.Of("member_id_invalid")
                : null;
    }
}
