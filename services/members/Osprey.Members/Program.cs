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
    // Subscribe the diagnostics activity emitter so every MongoDB command becomes a span. Command
    // TEXT can carry member name/email (a filter or an insert), so capture is OFF by default and
    // must be turned on deliberately per-environment via Mongo:CaptureCommandText — the log-PII
    // mitigation of ADR-0018. Never enable it where traces reach a shared/retained backend.
    settings.ClusterConfigurator = cb => cb.Subscribe(
        new DiagnosticsActivityEventSubscriber(new InstrumentationOptions
        {
            CaptureCommandText = builder.Configuration.GetValue("Mongo:CaptureCommandText", false),
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
builder.Services.AddSingleton(sp =>
    sp.GetRequiredService<IMongoClient>().GetDatabase("osprey").GetCollection<AuditLogDocument>("audit"));
builder.Services.AddSingleton(sp =>
    sp.GetRequiredService<IMongoClient>().GetDatabase("osprey").GetCollection<OutboxDocument>("outbox"));
builder.Services.AddScoped<EnrollMember.Handler>();
builder.Services.AddScoped<GetMemberProfile.Handler>();
builder.Services.AddScoped<ApplyEarn.Handler>();
builder.Services.AddScoped<ListTransactions.Handler>();
builder.Services.AddScoped<Redeem.Handler>();
builder.Services.AddScoped<RedeemTrip.Handler>();
builder.Services.AddScoped<FindMemberByEmail.Handler>();
builder.Services.AddScoped<AdjustPoints.Handler>();
builder.Services.AddScoped<SetOspreyInvitation.Handler>();
builder.Services.AddScoped<EraseMember.Handler>();
builder.Services.AddScoped<Audit.Writer>();
builder.Services.AddScoped<Outbox.Writer>();
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

if (builder.Configuration.GetValue<bool>("RequalificationSweep", true))
    builder.Services.AddHostedService<Requalification.HostedService>();

// Kill switch mirrors the consumer's: tests and incident response can stop publishing
// without touching code; events queue up in the outbox and drain when re-enabled.
if (builder.Configuration.GetValue<bool>("OutboxRelay", true))
    builder.Services.AddHostedService<Outbox.Relay>();

var app = builder.Build();

Correlation.Use(app); // first — even error responses carry X-Correlation-Id

// Metrics observe the FINAL status code — a request short-circuited to a 400 by an endpoint
// validation filter is recorded as code="400", not the in-flight "200".
app.UseHttpMetrics(); // http_request_duration_seconds et al., labelled by endpoint/method/code

app.UseCors(p => p.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader()); // demo stack — the admin portal calls this API directly from the browser

if (authEnabled)
{
    app.UseAuthentication();
    app.UseAuthorization();
}

// No global exception→400 seam: expected sad paths never throw. Validation is a pipeline guard
// that returns a localized 400 before the handler (Infrastructure/Pipeline/Guard.cs), and the
// intrinsic outcomes (insufficient balance, unknown member/reward) are values the endpoints map
// to their status codes. A thrown exception on an HTTP path is therefore a genuine fault → the
// framework's default 500. Only the queue consumer keeps its own throw→dead-letter seam.

app.MapGet("/health", () => Results.Ok(new { status = "ok" })).AllowAnonymous();
EnrollMember.MapEndpoints(app);
GetMemberProfile.MapEndpoints(app);
ListTransactions.MapEndpoints(app);
Rewards.MapEndpoints(app);
Redeem.MapEndpoints(app);
RedeemTrip.MapEndpoints(app);
var findByEmail = FindMemberByEmail.MapEndpoints(app);
var adjust = AdjustPoints.MapEndpoints(app);
var osprey = SetOspreyInvitation.MapEndpoints(app);
var erasure = EraseMember.MapEndpoints(app);
if (authEnabled)
{
    // Admin surfaces require the admin role; the member endpoints above just need a
    // valid token (fallback policy). health/metrics stay anonymous for probes/scrapes.
    findByEmail.RequireAuthorization("admin");
    adjust.RequireAuthorization("admin");
    osprey.RequireAuthorization("admin");
    erasure.RequireAuthorization("admin");
}
app.MapMetrics().AllowAnonymous(); // Prometheus scrape endpoint at /metrics

await MongoIndexes.EnsureAsync(app.Services.GetRequiredService<IMongoCollection<PointsTransactionDocument>>());
await MongoIndexes.EnsureAsync(app.Services.GetRequiredService<IMongoCollection<MemberDocument>>());
await MongoIndexes.EnsureAsync(app.Services.GetRequiredService<IMongoCollection<AuditLogDocument>>());

// Versioned run-once migrations (idempotent bodies; markers in the `migrations` collection).
await Migrations.RunAsync(app.Services.GetRequiredService<IMongoClient>().GetDatabase("osprey"), app.Logger);

if (app.Configuration.GetValue<bool>("SeedDemoData", false))
    await SeedDemoData.SeedAsync(app.Services.GetRequiredService<IMongoCollection<MemberDocument>>());

app.Run();

public partial class Program; // WebApplicationFactory hook for integration tests
