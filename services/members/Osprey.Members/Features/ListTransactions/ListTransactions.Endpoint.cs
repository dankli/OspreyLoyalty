// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class ListTransactions
{
    public static void MapEndpoints(IEndpointRouteBuilder app) =>
        app.MapGet("/api/members/{id}/transactions", async (string id, int? page, Handler handler, CancellationToken ct) =>
            Results.Ok(await handler.Handle(id, page ?? 0, ct)))
        .AddEndpointFilter((ctx, next) =>
            Guard.Validate(ctx, next, c => Validation.Check(c.GetArgument<string>(0), c.GetArgument<int?>(1) ?? 0)));
}
