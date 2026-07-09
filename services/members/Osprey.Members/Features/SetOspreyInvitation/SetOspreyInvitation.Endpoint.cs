// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class SetOspreyInvitation
{
    public static RouteHandlerBuilder MapEndpoints(IEndpointRouteBuilder app) =>
        app.MapPut("/api/members/{id}/osprey", async (string id, Request request, Handler handler, CancellationToken ct) =>
        {
            Response? response = await handler.Handle(id, request, ct);
            return response is null ? Results.NotFound() : Results.Ok(response);
        });
}
