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

        public static void Require(Request request)
        {
            if (string.IsNullOrWhiteSpace(request.Name))
                throw Messages.Fail("name_required");
            if (request.Name.Length > MaxNameLength)
                throw Messages.Fail("name_too_long", MaxNameLength);
            if (string.IsNullOrWhiteSpace(request.Email) || !request.Email.Contains('@'))
                throw Messages.Fail("email_invalid");
            if (request.Email.Length > MaxEmailLength)
                throw Messages.Fail("email_too_long", MaxEmailLength);
        }
    }
}
