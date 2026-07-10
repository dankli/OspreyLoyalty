// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class GetMemberProfile
{
    public static void MapEndpoints(IEndpointRouteBuilder app) =>
        app.MapGet("/api/members/{id}", async (string id, Handler handler, CancellationToken ct) =>
        {
            Response? response = await handler.Handle(id, ct);
            return response is null ? Results.NotFound() : Results.Ok(response);
        })
        .AddEndpointFilter((ctx, next) =>
            Guard.Validate(ctx, next, c => Validation.Check(c.GetArgument<string>(0))));
}
