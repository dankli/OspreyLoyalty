// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class SetOspreyInvitation
{
    public static class Validation
    {
        private const int MaxIdLength = 64;

        public static void RequireId(string id)
        {
            if (string.IsNullOrWhiteSpace(id) || id.Length > MaxIdLength)
                throw Messages.Fail("member_id_invalid");
        }
    }
}
