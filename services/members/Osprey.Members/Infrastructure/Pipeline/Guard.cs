// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

/// <summary>
/// Endpoint-filter helpers that move validation, loading, and preconditions OFF the handler and
/// onto the request pipeline. Each guard either short-circuits with the right HTTP response
/// (expected sad path) or hands control to the next step. The handler that finally runs assumes
/// every precondition already holds — it is pure happy path. Genuine technical faults still throw.
/// </summary>
public static class Guard
{
    /// <summary>
    /// Run a validation <paramref name="check"/> against the invocation. If it returns a
    /// <see cref="ValidationError"/>, stop here with a localized 400; otherwise continue.
    /// </summary>
    public static async ValueTask<object?> Validate(
        EndpointFilterInvocationContext ctx,
        EndpointFilterDelegate next,
        Func<EndpointFilterInvocationContext, ValidationError?> check)
    {
        ValidationError? error = check(ctx);
        return error is null ? await next(ctx) : error.ToBadRequest(ctx.HttpContext);
    }
}
