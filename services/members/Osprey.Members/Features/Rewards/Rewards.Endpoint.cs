// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class Rewards
{
    public static void MapEndpoints(IEndpointRouteBuilder app) =>
        app.MapGet("/api/rewards", () => Results.Ok(All));
}
