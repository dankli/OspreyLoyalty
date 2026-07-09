// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class EraseMember
{
    /// <summary>
    /// GDPR erasure endpoint (ADR-0018). DELETE conveys the intent — remove the PII —
    /// while the response makes clear the numeric ledger is deliberately retained.
    /// Admin-only when the auth kill-switch is on (wired in Program.cs).
    /// </summary>
    public static RouteHandlerBuilder MapEndpoints(IEndpointRouteBuilder app) =>
        app.MapDelete("/api/members/{id}/pii", async (string id, Handler handler, HttpContext http, CancellationToken ct) =>
        {
            Response? response = await handler.Handle(id, Audit.Caller.From(http), ct);
            return response is null ? Results.NotFound() : Results.Ok(response);
        });
}
