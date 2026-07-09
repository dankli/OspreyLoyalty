using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.IdentityModel.Tokens;
using MongoDB.Driver;
using MongoDB.Driver.Core.Extensions.DiagnosticSources;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;
using Osprey.Members.Features;
using Osprey.Members.Storage;
using Prometheus;

var builder = WebApplication.CreateBuilder(args);

// Structured JSON logs to stdout — one line per event, scopes carry the correlation id.
builder.Logging.ClearProviders();
builder.Logging.AddJsonConsole(o =>
{
    o.IncludeScopes = true;
    o.JsonWriterOptions = new System.Text.Json.JsonWriterOptions { Indented = false };
});

// Emit trace/span ids into every log scope so Loki lines line up with Jaeger spans.
builder.Logging.Configure(o =>
    o.ActivityTrackingOptions = ActivityTrackingOptions.TraceId | ActivityTrackingOptions.SpanId);

// OpenTelemetry: auto-instrument ASP.NET Core + outbound HTTP and export OTLP traces
// to the collector (endpoint from OTEL_EXPORTER_OTLP_ENDPOINT; harmless no-op when
// unset locally). prometheus-net still owns the scraped /metrics endpoint.
builder.Services.AddOpenTelemetry()
    .ConfigureResource(r => r.AddService(builder.Configuration["OTEL_SERVICE_NAME"] ?? "members"))
    .WithTracing(t => t
        .AddAspNetCoreInstrumentation()
        .AddHttpClientInstrumentation()
        // MongoDB command spans (from the driver's DiagnosticsActivityEventSubscriber below) and
        // RabbitMQ.Client 7's native publish/deliver/process spans — both nest under the current
        // request/consume trace, so a request or a consumed earn event shows its DB and queue work.
        .AddSource("MongoDB.Driver.Core.Extensions.DiagnosticSources")
        .AddSource("RabbitMQ.Client")
        .AddSource("Osprey.Members.Consumer")
        .AddOtlpExporter());

builder.Services.AddSingleton<IMongoClient>(_ =>
{
    MongoClientSettings settings = MongoClientSettings.FromConnectionString(
        builder.Configuration.GetConnectionString("Mongo") ?? "mongodb://localhost:27017");
    // Subscribe the diagnostics activity emitter so every MongoDB command becomes a span. Capturing
    // the command text is handy for a demo; drop it if command payloads could ever carry PII.
    settings.ClusterConfigurator = cb => cb.Subscribe(
        new DiagnosticsActivityEventSubscriber(new InstrumentationOptions
        {
            CaptureCommandText = true,
            // Skip the driver's periodic admin/heartbeat commands — they run outside any request and
            // would otherwise surface as orphaned single-span traces (the DB equivalent of /health noise).
            ShouldStartActivity = evt => evt.CommandName is not (
                "isMaster" or "hello" or "ping" or "buildInfo"
                or "saslStart" or "saslContinue" or "getnonce" or "endSessions" or "logout"),
        }));
    return new MongoClient(settings);
});
builder.Services.AddSingleton(sp =>
    sp.GetRequiredService<IMongoClient>().GetDatabase("osprey").GetCollection<MemberDocument>("members"));
builder.Services.AddSingleton(sp =>
    sp.GetRequiredService<IMongoClient>().GetDatabase("osprey").GetCollection<PointsTransactionDocument>("transactions"));
builder.Services.AddScoped<EnrollMember.Handler>();
builder.Services.AddScoped<GetMemberProfile.Handler>();
builder.Services.AddScoped<ApplyEarn.Handler>();
builder.Services.AddScoped<ListTransactions.Handler>();
builder.Services.AddScoped<Redeem.Handler>();
builder.Services.AddScoped<FindMemberByEmail.Handler>();
builder.Services.AddScoped<AdjustPoints.Handler>();
builder.Services.AddScoped<SetPandionInvitation.Handler>();
builder.Services.AddCors();

// Zero-trust JWT validation — opt-in via Auth:Enabled so tests and local dev stay
// open while compose/prod turn it on. Test mode validates HS256 tokens with a shared
// key (no live IdP); prod fetches RS256 keys from the identity service's JWKS.
var authEnabled = builder.Configuration.GetValue("Auth:Enabled", false);
if (authEnabled)
{
    builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
        .AddJwtBearer(options =>
        {
            options.RequireHttpsMetadata = false;
            options.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidIssuer = builder.Configuration["Auth:Issuer"] ?? "http://localhost:9000",
                ValidateAudience = true,
                ValidAudience = builder.Configuration["Auth:Audience"] ?? "osprey-members",
                ValidateLifetime = true,
                RoleClaimType = "roles",
            };
            var testKey = builder.Configuration["Auth:TestSigningKey"];
            if (!string.IsNullOrEmpty(testKey))
            {
                options.TokenValidationParameters.IssuerSigningKey =
                    new SymmetricSecurityKey(Encoding.UTF8.GetBytes(testKey));
            }
            else
            {
                // RS256: resolve signing keys from the identity service's JWKS DIRECTLY (not via
                // metadata discovery, whose jwks_uri would point at the browser-facing issuer and be
                // unreachable in-cluster — see JwksSigningKeys). Issuer is still validated separately.
                var jwks = new JwksSigningKeys(
                    builder.Configuration["Auth:JwksUri"] ?? "http://security:8080/oauth2/jwks");
                options.TokenValidationParameters.IssuerSigningKeyResolver =
                    (_, _, _, _) => jwks.GetAsync(CancellationToken.None).GetAwaiter().GetResult();
            }
        });
    builder.Services.AddAuthorization(options =>
    {
        options.FallbackPolicy = new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build();
        // The identity token carries roles in a "roles" claim (a JSON array). Match any
        // role-typed claim (whatever the handler names it) whose value is/contains admin —
        // covers both per-value claims and a whole-array string.
        options.AddPolicy("admin", policy => policy.RequireAssertion(context =>
            context.User.Claims.Any(c =>
                c.Type.Contains("role", StringComparison.OrdinalIgnoreCase)
                && (c.Value == "admin" || c.Value.Contains("\"admin\"")))));
    });
}

// Kill switch: integration tests (and incident response) can turn the consumer off
// without touching code — WebApplicationFactory tests must never require a broker.
if (builder.Configuration.GetValue<bool>("ConsumeEarnEvents", true))
    builder.Services.AddHostedService<ConsumeEarnEvents.Consumer>();

if (builder.Configuration.GetValue<bool>("ExpirySweep", true))
    builder.Services.AddHostedService<Expiry.HostedService>();

var app = builder.Build();

Correlation.Use(app); // first — even error responses carry X-Correlation-Id

// Metrics wrap the error translation below so they observe the FINAL status code —
// a validation failure is recorded as code="400", not the in-flight "200".
app.UseHttpMetrics(); // http_request_duration_seconds et al., labelled by endpoint/method/code

app.UseCors(p => p.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader()); // demo stack — the admin portal calls this API directly from the browser

if (authEnabled)
{
    app.UseAuthentication();
    app.UseAuthorization();
}

// Expected failures (validation) become clean 400s here; anything unexpected
// bubbles to the default 500 — exceptions live on the edges, not in the flow.
app.Use(async (context, next) =>
{
    try { await next(); }
    catch (ArgumentException ex)
    {
        context.Response.StatusCode = StatusCodes.Status400BadRequest;
        // Localize keyed validation failures to the caller's Accept-Language; anything else
        // (an ArgumentException without a message key) falls back to its English message verbatim.
        var message = ex.Data[Messages.KeyData] is string key
            ? Messages.Localize(key, Messages.Culture(context.Request.Headers.AcceptLanguage.ToString()),
                ex.Data[Messages.ArgsData] as object[] ?? [])
            : ex.Message;
        await context.Response.WriteAsJsonAsync(new { error = message });
    }
});

app.MapGet("/health", () => Results.Ok(new { status = "ok" })).AllowAnonymous();
EnrollMember.MapEndpoints(app);
GetMemberProfile.MapEndpoints(app);
ListTransactions.MapEndpoints(app);
Rewards.MapEndpoints(app);
Redeem.MapEndpoints(app);
var findByEmail = FindMemberByEmail.MapEndpoints(app);
var adjust = AdjustPoints.MapEndpoints(app);
var pandion = SetPandionInvitation.MapEndpoints(app);
if (authEnabled)
{
    // Admin surfaces require the admin role; the member endpoints above just need a
    // valid token (fallback policy). health/metrics stay anonymous for probes/scrapes.
    findByEmail.RequireAuthorization("admin");
    adjust.RequireAuthorization("admin");
    pandion.RequireAuthorization("admin");
}
app.MapMetrics().AllowAnonymous(); // Prometheus scrape endpoint at /metrics

await MongoIndexes.EnsureAsync(app.Services.GetRequiredService<IMongoCollection<PointsTransactionDocument>>());
await MongoIndexes.EnsureAsync(app.Services.GetRequiredService<IMongoCollection<MemberDocument>>());

if (app.Configuration.GetValue<bool>("SeedDemoData", false))
    await SeedDemoData.SeedAsync(app.Services.GetRequiredService<IMongoCollection<MemberDocument>>());

app.Run();

public partial class Program; // WebApplicationFactory hook for integration tests
