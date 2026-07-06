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

        public static void Require(Request request)
        {
            if (string.IsNullOrWhiteSpace(request.Name))
                throw new ArgumentException("Name is required.");
            if (request.Name.Length > MaxNameLength)
                throw new ArgumentException($"Name must be at most {MaxNameLength} characters.");
            if (string.IsNullOrWhiteSpace(request.Email) || !request.Email.Contains('@'))
                throw new ArgumentException("Email must be a valid address.");
        }
    }
}
