// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class FindMemberByEmail
{
    public static class Validation
    {
        private const int MaxEmailLength = 254;

        public static ValidationError? Check(string? email)
        {
            if (string.IsNullOrWhiteSpace(email) || !email.Contains('@'))
                return ValidationError.Of("email_invalid");
            if (email.Length > MaxEmailLength)
                return ValidationError.Of("email_too_long", MaxEmailLength);
            return null;
        }
    }
}
