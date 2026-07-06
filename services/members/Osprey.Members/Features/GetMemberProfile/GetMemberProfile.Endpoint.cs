// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class GetMemberProfile
{
    public static void MapEndpoints(IEndpointRouteBuilder app) =>
        app.MapGet("/api/members/{id}", async (string id, Handler handler, CancellationToken ct) =>
        {
            Dto? dto = await handler.Handle(id, ct);
            return dto is null ? Results.NotFound() : Results.Ok(dto);
        });
}
