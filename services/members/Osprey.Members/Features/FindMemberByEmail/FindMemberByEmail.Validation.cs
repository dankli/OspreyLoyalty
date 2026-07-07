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
                throw new ArgumentException("Email must be a valid address.");
            if (email.Length > MaxEmailLength)
                throw new ArgumentException($"Email must be at most {MaxEmailLength} characters.");
        }
    }
}
