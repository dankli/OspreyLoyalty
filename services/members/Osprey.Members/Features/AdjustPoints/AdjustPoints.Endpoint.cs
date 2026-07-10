// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class AdjustPoints
{
    public static RouteHandlerBuilder MapEndpoints(IEndpointRouteBuilder app) =>
        app.MapPost("/api/members/{id}/adjustments", async (string id, Request request, Handler handler, HttpContext http, CancellationToken ct) =>
        {
            Outcome outcome = await handler.Handle(id, request, Audit.Caller.From(http), ct);
            return outcome.Status switch
            {
                Status.Ok => Results.Ok(outcome.Response),
                Status.UnknownMember => Results.NotFound(),
                Status.Overdraw => Results.BadRequest(new { error = "Adjustment would overdraw the balance." }),
                _ => Results.StatusCode(StatusCodes.Status500InternalServerError),
            };
        })
        .AddEndpointFilter((ctx, next) =>
            Guard.Validate(ctx, next, c => Validation.Check(c.GetArgument<string>(0), c.GetArgument<Request>(1))));
}
