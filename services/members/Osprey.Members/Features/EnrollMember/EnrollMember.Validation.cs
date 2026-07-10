// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class EnrollMember
{
    /// <summary>
    /// Pure input rules. Throws ArgumentException with a human message — the edge maps it
    /// to a 400, so the happy path in the handler never branches on validation state.
    /// </summary>
    public static class Validation
    {
        private const int MaxNameLength = 200;
        private const int MaxEmailLength = 254;

        // Pure input rules on the failure rail: return the first broken rule as a ValidationError
        // (a value), or null when the request is well-formed. The endpoint pipeline turns a non-null
        // result into a localized 400 before the handler runs, so the handler never sees bad input.
        public static ValidationError? Check(Request request)
        {
            if (string.IsNullOrWhiteSpace(request.Name))
                return ValidationError.Of("name_required");
            if (request.Name.Length > MaxNameLength)
                return ValidationError.Of("name_too_long", MaxNameLength);
            if (string.IsNullOrWhiteSpace(request.Email) || !request.Email.Contains('@'))
                return ValidationError.Of("email_invalid");
            if (request.Email.Length > MaxEmailLength)
                return ValidationError.Of("email_too_long", MaxEmailLength);
            return null;
        }
    }
}
