// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class EnrollMember
{
    public static void MapEndpoints(IEndpointRouteBuilder app) =>
        app.MapPost("/api/members", async (Request request, Handler handler, CancellationToken ct) =>
        {
            Dto dto = await handler.Handle(request, ct);
            return Results.Created($"/api/members/{dto.Id}", dto);
        });
}
