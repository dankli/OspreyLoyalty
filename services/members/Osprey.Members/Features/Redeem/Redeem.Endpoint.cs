// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class Redeem
{
    public static void MapEndpoints(IEndpointRouteBuilder app) =>
        app.MapPost("/api/members/{id}/redemptions", async (string id, Request request, Handler handler, CancellationToken ct) =>
        {
            Response? response = await handler.Handle(id, request, ct);
            return response is null ? Results.NotFound() : Results.Ok(response);
        });
}
