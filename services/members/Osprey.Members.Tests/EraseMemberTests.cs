using System.Net;
using System.Net.Http.Json;
using MongoDB.Driver;
using Microsoft.AspNetCore.Mvc.Testing;
using Osprey.Members.Features;
using Osprey.Members.Storage;
using Testcontainers.MongoDb;
using Xunit;

namespace Osprey.Members.Tests;

/// <summary>
/// GDPR right-to-erasure (ADR-0018): pseudonymize PII, retain the numeric ledger.
/// Auth is OFF here (the default) so the endpoint is reachable without a token.
/// </summary>
public sealed class EraseMemberTests : IAsyncLifetime
{
    private readonly MongoDbContainer mongo = new MongoDbBuilder().WithImage("mongo:7").Build();
    private WebApplicationFactory<Program> factory = null!;
    private IMongoClient client = null!;

    public async Task InitializeAsync()
    {
        await mongo.StartAsync();
        factory = new WebApplicationFactory<Program>().WithWebHostBuilder(b =>
        {
            b.UseSetting("ConnectionStrings:Mongo", mongo.GetConnectionString());
            b.UseSetting("ConsumeEarnEvents", "false");
            b.UseSetting("ExpirySweep", "false");
        });
        client = new MongoClient(mongo.GetConnectionString());
    }

    public async Task DisposeAsync()
    {
        await factory.DisposeAsync();
        await mongo.DisposeAsync();
    }

    private IMongoCollection<MemberDocument> Members =>
        client.GetDatabase("osprey").GetCollection<MemberDocument>("members");
    private IMongoCollection<PointsTransactionDocument> Transactions =>
        client.GetDatabase("osprey").GetCollection<PointsTransactionDocument>("transactions");
    private IMongoCollection<AuditLogDocument> Audit =>
        client.GetDatabase("osprey").GetCollection<AuditLogDocument>("audit");

    private async Task<string> EnrollAsync(HttpClient http, string name, string email)
    {
        HttpResponseMessage created = await http.PostAsJsonAsync("/api/members", new { name, email });
        return (await created.Content.ReadFromJsonAsync<EnrollMember.Response>())!.Id;
    }

    [Fact]
    public async Task Erasure_pseudonymizes_name_and_email_and_stamps_marker()
    {
        HttpClient http = factory.CreateClient();
        string memberId = await EnrollAsync(http, "Erasure Target", "erasure.target@example.com");
        // give the member a balance so we can prove points survive
        await http.PostAsJsonAsync($"/api/members/{memberId}/adjustments",
            new { points = 3_000, reason = "goodwill for erasure.target@example.com", idempotencyKey = "erase-adj-0001" });

        HttpResponseMessage erased = await http.DeleteAsync($"/api/members/{memberId}/pii");
        Assert.Equal(HttpStatusCode.OK, erased.StatusCode);
        EraseMember.Response body = (await erased.Content.ReadFromJsonAsync<EraseMember.Response>())!;
        Assert.False(body.AlreadyErased);
        Assert.Equal(1, body.TransactionsRetained);

        MemberDocument doc = await Members.Find(m => m.Id == memberId).FirstAsync();
        Assert.Equal("[erased]", doc.Name);
        Assert.Null(doc.Email);
        Assert.NotNull(doc.ErasedAtUtc);
        // Kept: id, points, joined
        Assert.Equal(memberId, doc.Id);
        Assert.Equal(3_000, doc.SpendablePoints);
        Assert.NotEqual(default, doc.JoinedAtUtc);
    }

    [Fact]
    public async Task Erasure_retains_the_numeric_ledger_and_redacts_adjustment_source()
    {
        HttpClient http = factory.CreateClient();
        string memberId = await EnrollAsync(http, "Ledger Keeper", "ledger.keeper@example.com");
        await http.PostAsJsonAsync($"/api/members/{memberId}/adjustments",
            new { points = 1_200, reason = "refund for ledger.keeper@example.com", idempotencyKey = "erase-led-0001" });

        await http.DeleteAsync($"/api/members/{memberId}/pii");

        List<PointsTransactionDocument> ledger = await Transactions.Find(t => t.MemberId == memberId).ToListAsync();
        PointsTransactionDocument entry = Assert.Single(ledger); // retained
        Assert.Equal(1_200, entry.Points); // numeric ledger intact
        Assert.Equal("adjustment", entry.Type);
        Assert.DoesNotContain("ledger.keeper@example.com", entry.Source); // PII redacted defensively
        Assert.Equal("admin: [erased]", entry.Source);
    }

    [Fact]
    public async Task Erasure_writes_an_audit_entry()
    {
        HttpClient http = factory.CreateClient();
        string memberId = await EnrollAsync(http, "Audited Erase", "audited.erase@example.com");

        await http.DeleteAsync($"/api/members/{memberId}/pii");

        AuditLogDocument entry = Assert.Single(
            await Audit.Find(a => a.TargetMemberId == memberId && a.Action == AuditActions.EraseMember).ToListAsync());
        Assert.Equal(AuditActions.EraseMember, entry.Action);
        Assert.Equal(AuditActions.Anonymous, entry.Actor);
    }

    [Fact]
    public async Task Re_erasing_is_an_idempotent_success_no_op()
    {
        HttpClient http = factory.CreateClient();
        string memberId = await EnrollAsync(http, "Twice Erased", "twice.erased@example.com");

        HttpResponseMessage first = await http.DeleteAsync($"/api/members/{memberId}/pii");
        EraseMember.Response firstBody = (await first.Content.ReadFromJsonAsync<EraseMember.Response>())!;
        Assert.False(firstBody.AlreadyErased);

        HttpResponseMessage second = await http.DeleteAsync($"/api/members/{memberId}/pii");
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        EraseMember.Response secondBody = (await second.Content.ReadFromJsonAsync<EraseMember.Response>())!;
        Assert.True(secondBody.AlreadyErased);
        // Marker not moved by the re-erase. The re-erase reads the PERSISTED marker (Mongo stores
        // dates at millisecond precision), so compare against the durable value at that granularity —
        // the first response echoed the pre-persist in-memory tick value.
        DateTime persisted = (await Members.Find(m => m.Id == memberId).FirstAsync()).ErasedAtUtc!.Value;
        Assert.Equal(persisted, secondBody.ErasedAtUtc);
        Assert.True((firstBody.ErasedAtUtc - secondBody.ErasedAtUtc).Duration() < TimeSpan.FromMilliseconds(1));

        // No second erase audit record — the trail stays idempotent too.
        long eraseAudits = await Audit.CountDocumentsAsync(
            a => a.TargetMemberId == memberId && a.Action == AuditActions.EraseMember);
        Assert.Equal(1, eraseAudits);
    }

    [Fact]
    public async Task Erasing_an_unknown_member_is_a_404()
    {
        HttpResponseMessage response = await factory.CreateClient().DeleteAsync("/api/members/nope/pii");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task A_redelivered_earn_never_repopulates_erased_pii()
    {
        // Resurrection guard: EarnEvent carries no PII, so applying an earn to an erased member
        // updates points only — Name/Email stay pseudonymized.
        HttpClient http = factory.CreateClient();
        string memberId = await EnrollAsync(http, "Resurrect Test", "resurrect@example.com");
        await http.DeleteAsync($"/api/members/{memberId}/pii");

        // Simulate an earn landing after erasure by inserting a ledger entry + bumping points the way
        // ApplyEarn does (it only ever Sets QualifyingPoints and Incs SpendablePoints — never PII).
        await Transactions.InsertOneAsync(new PointsTransactionDocument(
            Guid.NewGuid().ToString("N"), memberId, TransactionTypes.Earn, 200, "cardco",
            "resurrect-earn-0001", DateTime.UtcNow));
        await Members.UpdateOneAsync(m => m.Id == memberId,
            Builders<MemberDocument>.Update.Inc(m => m.SpendablePoints, 200));

        MemberDocument doc = await Members.Find(m => m.Id == memberId).FirstAsync();
        Assert.Equal("[erased]", doc.Name);
        Assert.Null(doc.Email);
        Assert.NotNull(doc.ErasedAtUtc);
    }
}
