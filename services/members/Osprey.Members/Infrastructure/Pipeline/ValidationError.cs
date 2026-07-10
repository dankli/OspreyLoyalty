// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

/// <summary>
/// A rejected precondition, carried as a message key + format args rather than thrown. A pipeline
/// guard turns it into a localized 400 at the edge, so expected sad paths never reach the handler
/// and the handler body stays on the happy path. This is the value that rides the failure rail.
/// </summary>
public sealed record ValidationError(string Key, object[] Args)
{
    public static ValidationError Of(string key, params object[] args) => new(key, args);

    /// <summary>Render the error in the caller's language (Accept-Language) as a 400 response.</summary>
    public IResult ToBadRequest(HttpContext http)
    {
        var culture = Messages.Culture(http.Request.Headers.AcceptLanguage.ToString());
        return Results.BadRequest(new { error = Messages.Localize(Key, culture, Args) });
    }
}
