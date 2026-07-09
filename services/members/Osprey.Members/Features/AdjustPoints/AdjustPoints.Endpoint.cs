// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class AdjustPoints
{
    public static RouteHandlerBuilder MapEndpoints(IEndpointRouteBuilder app) =>
        app.MapPost("/api/members/{id}/adjustments", async (string id, Request request, Handler handler, HttpContext http, CancellationToken ct) =>
        {
            Response? response = await handler.Handle(id, request, Audit.Caller.From(http), ct);
            return response is null ? Results.NotFound() : Results.Ok(response);
        });
}
