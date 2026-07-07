// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

/// <summary>
/// Accept-or-generate X-Correlation-Id, echo it on the response, and put it in the
/// logging scope so every JSON log line for the request carries it. First in the
/// pipeline — even error responses get the header.
/// </summary>
public static partial class Correlation
{
    public const string Header = "X-Correlation-Id";

    public static void Use(WebApplication app) =>
        app.Use(async (context, next) =>
        {
            string correlationId = context.Request.Headers[Header].FirstOrDefault()
                ?? Guid.NewGuid().ToString("N");
            context.Response.Headers[Header] = correlationId;

            var logger = context.RequestServices.GetRequiredService<ILogger<WebApplication>>();
            using (logger.BeginScope(new Dictionary<string, object> { ["correlationId"] = correlationId }))
                await next();
        });
}
