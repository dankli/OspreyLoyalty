// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class RedeemTrip
{
    public static void MapEndpoints(IEndpointRouteBuilder app) =>
        app.MapPost("/api/members/{id}/trip-redemptions", async (string id, Request request, Handler handler, CancellationToken ct) =>
        {
            Outcome outcome = await handler.Handle(id, request, ct);
            return outcome.Status switch
            {
                Status.Ok => Results.Ok(outcome.Response),
                Status.UnknownMember => Results.NotFound(),
                Status.InsufficientPoints => Results.BadRequest(new { error = "Insufficient spendable points." }),
                _ => Results.StatusCode(StatusCodes.Status500InternalServerError),
            };
        })
        .AddEndpointFilter((ctx, next) =>
            Guard.Validate(ctx, next, c => Validation.Check(c.GetArgument<string>(0), c.GetArgument<Request>(1))));
}
