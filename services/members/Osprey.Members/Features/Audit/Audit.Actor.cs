using System.Security.Claims;

// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class Audit
{
    /// <summary>
    /// Extracts the audit actor and correlation id from the request edge — pure over an
    /// <see cref="HttpContext"/>, so the minimal-API endpoints stay one-liners and the
    /// handlers never touch <see cref="HttpContext"/> (I/O at the edges, ADR-0017).
    /// </summary>
    public static class Caller
    {
        /// <summary>
        /// The identity the handler audits under — actor + correlation, resolved once at the
        /// edge so handlers never see <see cref="HttpContext"/>.
        /// </summary>
        public sealed record Context(string Actor, string CorrelationId);

        /// <summary>Build the audit context from the request edge.</summary>
        public static Context From(HttpContext http) => new(Actor(http.User), CorrelationId(http));

        /// <summary>
        /// The caller's <c>sub</c> (subject) claim. With the auth kill-switch OFF there is no
        /// authenticated principal, so we record the honest <see cref="Storage.AuditActions.Anonymous"/>
        /// literal rather than inventing a user.
        /// </summary>
        public static string Actor(ClaimsPrincipal? principal)
        {
            string? sub = principal?.FindFirstValue(ClaimTypes.NameIdentifier)
                ?? principal?.FindFirstValue("sub"); // JWT "sub" — mapped or raw, depending on claim-type handling
            return string.IsNullOrWhiteSpace(sub) ? Storage.AuditActions.Anonymous : sub;
        }

        /// <summary>The per-request correlation id the Correlation middleware set on the response.</summary>
        private static string CorrelationId(HttpContext http) =>
            http.Response.Headers[Correlation.Header].FirstOrDefault() ?? string.Empty;
    }
}
