// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class FindMemberByEmail
{
    public static class Validation
    {
        private const int MaxEmailLength = 254;

        public static void RequireEmail(string? email)
        {
            if (string.IsNullOrWhiteSpace(email) || !email.Contains('@'))
                throw Messages.Fail("email_invalid");
            if (email.Length > MaxEmailLength)
                throw Messages.Fail("email_too_long", MaxEmailLength);
        }
    }
}
