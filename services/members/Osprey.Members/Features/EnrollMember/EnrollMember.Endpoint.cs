// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class EnrollMember
{
    public static void MapEndpoints(IEndpointRouteBuilder app) =>
        app.MapPost("/api/members", async (Request request, Handler handler, CancellationToken ct) =>
        {
            Response response = await handler.Handle(request, ct);
            return Results.Created($"/api/members/{response.Id}", response);
        })
        .AddEndpointFilter((ctx, next) =>
            Guard.Validate(ctx, next, c => Validation.Check(c.GetArgument<Request>(0))));
}
