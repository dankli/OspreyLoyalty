// ReSharper disable once CheckNamespace

using System.Diagnostics;

namespace Osprey.Members.Features;

/// <summary>
/// Accept-or-generate X-Correlation-Id, echo it on the response, and put it in the
/// logging scope so every JSON log line for the request carries it. First in the
/// pipeline — even error responses get the header. Also emits one summary log line
/// per request (method, path, final status, duration).
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

            // A dedicated "Osprey.*" category — NOT under Microsoft.AspNetCore, which appsettings
            // filters to Warning — so this per-request Information summary actually reaches the logs.
            var logger = context.RequestServices.GetRequiredService<ILoggerFactory>()
                .CreateLogger("Osprey.Members.Http");
            using (logger.BeginScope(new Dictionary<string, object> { ["correlationId"] = correlationId }))
            {
                long started = Stopwatch.GetTimestamp();
                try
                {
                    await next(); // error middleware runs inside — status is final when this returns
                }
                finally
                {
                    // finally, not after: the summary line must appear even on the 500 path
                    // where an unexpected exception escapes past the error middleware.
                    logger.LogInformation("{Method} {Path} => {StatusCode} in {ElapsedMs}ms",
                        context.Request.Method, context.Request.Path, context.Response.StatusCode,
                        (long)Stopwatch.GetElapsedTime(started).TotalMilliseconds);
                }
            }
        });
}
