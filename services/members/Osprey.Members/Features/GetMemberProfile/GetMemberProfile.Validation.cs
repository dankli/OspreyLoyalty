// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class GetMemberProfile
{
    public static class Validation
    {
        private const int MaxIdLength = 64;

        public static void RequireId(string id)
        {
            if (string.IsNullOrWhiteSpace(id) || id.Length > MaxIdLength)
                throw new ArgumentException("Member id is required and at most 64 characters.");
        }
    }
}
