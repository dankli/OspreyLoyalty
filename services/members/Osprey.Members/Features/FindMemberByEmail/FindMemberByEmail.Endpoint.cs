// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class FindMemberByEmail
{
    // GET /api/members?email=x — does not clash with EnrollMember's POST /api/members (different verb).
    public static void MapEndpoints(IEndpointRouteBuilder app) =>
        app.MapGet("/api/members", async (string email, Handler handler, CancellationToken ct) =>
        {
            Response? response = await handler.Handle(email, ct);
            return response is null ? Results.NotFound() : Results.Ok(response);
        });
}
