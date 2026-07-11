// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class ActivateBenefit
{
    public static void MapEndpoints(IEndpointRouteBuilder app)
    {
        app.MapPost("/api/members/{id}/benefit-activations", async (string id, Request request, Handler handler, CancellationToken ct) =>
        {
            Outcome outcome = await handler.Handle(id, request, ct);
            return outcome.Status switch
            {
                Status.Ok => Results.Ok(outcome.Response),
                Status.UnknownMember => Results.NotFound(),
                Status.NotEntitled => Results.BadRequest(new { error = "The member's tier does not include that benefit." }),
                _ => Results.StatusCode(StatusCodes.Status500InternalServerError),
            };
        })
        .AddEndpointFilter((ctx, next) =>
            Guard.Validate(ctx, next, c => Validation.Check(c.GetArgument<string>(0), c.GetArgument<Request>(1))));

        app.MapGet("/api/members/{id}/benefit-activations", async (string id, Handler handler, CancellationToken ct) =>
            Results.Ok(await handler.List(id, ct)));
    }
}
