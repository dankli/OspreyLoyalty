using MongoDB.Driver;
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

builder.Services.AddSingleton<IMongoClient>(_ =>
    new MongoClient(builder.Configuration.GetConnectionString("Mongo") ?? "mongodb://localhost:27017"));
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

// Kill switch: integration tests (and incident response) can turn the consumer off
// without touching code — WebApplicationFactory tests must never require a broker.
if (builder.Configuration.GetValue<bool>("ConsumeEarnEvents", true))
    builder.Services.AddHostedService<ConsumeEarnEvents.Consumer>();

if (builder.Configuration.GetValue<bool>("ExpirySweep", true))
    builder.Services.AddHostedService<Expiry.HostedService>();

var app = builder.Build();

Correlation.Use(app); // first — even error responses carry X-Correlation-Id

app.UseCors(p => p.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader()); // demo stack — the admin portal calls this API directly from the browser

// Expected failures (validation) become clean 400s here; anything unexpected
// bubbles to the default 500 — exceptions live on the edges, not in the flow.
app.Use(async (context, next) =>
{
    try { await next(); }
    catch (ArgumentException ex)
    {
        context.Response.StatusCode = StatusCodes.Status400BadRequest;
        await context.Response.WriteAsJsonAsync(new { error = ex.Message });
    }
});

app.UseHttpMetrics(); // http_request_duration_seconds et al., labelled by endpoint/method/code

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));
EnrollMember.MapEndpoints(app);
GetMemberProfile.MapEndpoints(app);
ListTransactions.MapEndpoints(app);
Rewards.MapEndpoints(app);
Redeem.MapEndpoints(app);
FindMemberByEmail.MapEndpoints(app);
AdjustPoints.MapEndpoints(app);
SetPandionInvitation.MapEndpoints(app);
app.MapMetrics(); // Prometheus scrape endpoint at /metrics

await MongoIndexes.EnsureAsync(app.Services.GetRequiredService<IMongoCollection<PointsTransactionDocument>>());
await MongoIndexes.EnsureAsync(app.Services.GetRequiredService<IMongoCollection<MemberDocument>>());

if (app.Configuration.GetValue<bool>("SeedDemoData", false))
    await SeedDemoData.SeedAsync(app.Services.GetRequiredService<IMongoCollection<MemberDocument>>());

app.Run();

public partial class Program; // WebApplicationFactory hook for integration tests
