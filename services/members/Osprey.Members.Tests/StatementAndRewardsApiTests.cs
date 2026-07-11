using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using MongoDB.Driver;
using Osprey.Members.Features;
using Osprey.Members.Storage;
using Testcontainers.MongoDb;
using Xunit;

namespace Osprey.Members.Tests;

/// <summary>
/// API-level coverage for the batch of admin/statement surfaces: the server-side
/// transaction type filter, the CSV export, the managed rewards CRUD, and the audit
/// log reader (fed by a real privileged action).
/// </summary>
public sealed class StatementAndRewardsApiTests : IAsyncLifetime
{
    private readonly MongoDbContainer mongo = new MongoDbBuilder().WithImage("mongo:7").Build();
    private WebApplicationFactory<Program> factory = null!;
    private IMongoDatabase db = null!;

    public async Task InitializeAsync()
    {
        await mongo.StartAsync();
        db = new MongoClient(mongo.GetConnectionString()).GetDatabase("osprey");
        factory = new WebApplicationFactory<Program>().WithWebHostBuilder(b =>
        {
            b.UseSetting("ConnectionStrings:Mongo", mongo.GetConnectionString());
            b.UseSetting("ConsumeEarnEvents", "false");
            b.UseSetting("ExpirySweep", "false");
            b.UseSetting("RequalificationSweep", "false");
            b.UseSetting("OutboxRelay", "false");
        });
    }

    public async Task DisposeAsync()
    {
        await factory.DisposeAsync();
        await mongo.DisposeAsync();
    }

    private async Task<string> SeedMemberWithLedgerAsync()
    {
        DateTime nowUtc = DateTime.UtcNow;
        var members = db.GetCollection<MemberDocument>("members");
        var transactions = db.GetCollection<PointsTransactionDocument>("transactions");
        string id = Guid.NewGuid().ToString("N");
        await members.InsertOneAsync(new MemberDocument(id, "Ledger Member", "l@example.com", nowUtc, 500, 300));
        await transactions.InsertOneAsync(new PointsTransactionDocument(
            $"{id}-earn", id, TransactionTypes.Earn, 500, "cardco", $"{id}-k1", nowUtc.AddDays(-2)));
        await transactions.InsertOneAsync(new PointsTransactionDocument(
            $"{id}-burn", id, TransactionTypes.Burn, -200, "trip:ARN,\"JFK\"", $"{id}-k2", nowUtc.AddDays(-1)));
        return id;
    }

    [Fact]
    public async Task Type_filter_runs_server_side()
    {
        string id = await SeedMemberWithLedgerAsync();
        HttpClient client = factory.CreateClient();

        ListTransactions.Response earns =
            (await client.GetFromJsonAsync<ListTransactions.Response>($"/api/members/{id}/transactions?type=earn"))!;
        ListTransactions.Response all =
            (await client.GetFromJsonAsync<ListTransactions.Response>($"/api/members/{id}/transactions"))!;

        Assert.Single(earns.Items);
        Assert.Equal("earn", earns.Items[0].Type);
        Assert.Equal(2, all.Items.Count);

        HttpResponseMessage bogus = await client.GetAsync($"/api/members/{id}/transactions?type=bogus");
        Assert.Equal(HttpStatusCode.BadRequest, bogus.StatusCode);
    }

    [Fact]
    public async Task Csv_export_streams_the_ledger_with_escaped_sources()
    {
        string id = await SeedMemberWithLedgerAsync();
        HttpClient client = factory.CreateClient();

        HttpResponseMessage response = await client.GetAsync($"/api/members/{id}/transactions/export");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("text/csv", response.Content.Headers.ContentType!.MediaType);
        Assert.Contains($"osprey-transactions-{id}.csv", response.Content.Headers.ContentDisposition!.FileName);
        string csv = await response.Content.ReadAsStringAsync();
        string[] lines = csv.TrimEnd('\n').Split('\n');
        Assert.Equal("id,type,points,source,occurredAtUtc", lines[0]);
        Assert.Equal(3, lines.Length); // header + two rows
        Assert.Contains("\"trip:ARN,\"\"JFK\"\"\"", csv); // comma + quotes in a source stay one field
    }

    [Fact]
    public async Task Rewards_crud_round_trips_and_feeds_the_catalog()
    {
        HttpClient client = factory.CreateClient();

        HttpResponseMessage created = await client.PostAsJsonAsync("/api/rewards",
            new { id = "spa-day", name = "Spa day", cost = 12_000 });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);

        HttpResponseMessage duplicate = await client.PostAsJsonAsync("/api/rewards",
            new { id = "spa-day", name = "Spa day", cost = 12_000 });
        Assert.Equal(HttpStatusCode.Conflict, duplicate.StatusCode);

        HttpResponseMessage badSlug = await client.PostAsJsonAsync("/api/rewards",
            new { id = "Spa Day!", name = "Spa day", cost = 12_000 });
        Assert.Equal(HttpStatusCode.BadRequest, badSlug.StatusCode);

        HttpResponseMessage updated = await client.PutAsJsonAsync("/api/rewards/spa-day",
            new { name = "Spa day deluxe", cost = 14_000 });
        Assert.Equal(HttpStatusCode.OK, updated.StatusCode);

        List<Rewards.Reward> catalog = (await client.GetFromJsonAsync<List<Rewards.Reward>>("/api/rewards"))!;
        Rewards.Reward spa = catalog.First(r => r.Id == "spa-day");
        Assert.Equal("Spa day deluxe", spa.Name);
        Assert.Equal(14_000, spa.Cost);

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync("/api/rewards/spa-day")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.DeleteAsync("/api/rewards/spa-day")).StatusCode);
    }

    [Fact]
    public async Task An_admin_adjustment_shows_up_in_the_audit_reader()
    {
        string id = await SeedMemberWithLedgerAsync();
        HttpClient client = factory.CreateClient();

        HttpResponseMessage adjusted = await client.PostAsJsonAsync($"/api/members/{id}/adjustments",
            new { points = 100, reason = "smoke", idempotencyKey = Guid.NewGuid().ToString() });
        Assert.Equal(HttpStatusCode.OK, adjusted.StatusCode);

        ListAuditLog.Response audit =
            (await client.GetFromJsonAsync<ListAuditLog.Response>("/api/audit"))!;
        ListAuditLog.Item entry = audit.Items.First(i => i.TargetMemberId == id);
        Assert.Equal(AuditActions.AdjustPoints, entry.Action);
        Assert.Equal(AuditActions.Anonymous, entry.Actor); // auth off in tests
    }
}
