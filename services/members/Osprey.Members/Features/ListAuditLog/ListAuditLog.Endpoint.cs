// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class ListAuditLog
{
    private const int MaxPage = 100_000;

    public static IEndpointConventionBuilder MapEndpoints(IEndpointRouteBuilder app) =>
        app.MapGet("/api/audit", async (int? page, Handler handler, CancellationToken ct) =>
            Results.Ok(await handler.Handle(page ?? 0, ct)))
        .AddEndpointFilter((ctx, next) =>
            Guard.Validate(ctx, next, c => (c.GetArgument<int?>(0) ?? 0) is < 0 or > MaxPage
                ? ValidationError.Of("list_page", MaxPage)
                : null));
}
