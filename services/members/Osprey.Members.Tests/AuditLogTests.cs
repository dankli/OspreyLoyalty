using System.Net.Http.Json;
using MongoDB.Driver;
using Microsoft.AspNetCore.Mvc.Testing;
using Osprey.Members.Features;
using Osprey.Members.Storage;
using Testcontainers.MongoDb;
using Xunit;

namespace Osprey.Members.Tests;

/// <summary>
/// Audit trail (ADR-0017): privileged admin actions land in an append-only audit
/// collection with the right actor/action/target/details. Auth is OFF here (the default),
/// so the actor falls back to the honest "anonymous (auth disabled)" literal.
/// </summary>
public sealed class AuditLogTests : IAsyncLifetime
{
    private readonly MongoDbContainer mongo = new MongoDbBuilder().WithImage("mongo:7").Build();
    private WebApplicationFactory<Program> factory = null!;
    private IMongoCollection<AuditLogDocument> audit = null!;

    public async Task InitializeAsync()
    {
        await mongo.StartAsync();
        factory = new WebApplicationFactory<Program>().WithWebHostBuilder(b =>
        {
            b.UseSetting("ConnectionStrings:Mongo", mongo.GetConnectionString());
            b.UseSetting("ConsumeEarnEvents", "false");
            b.UseSetting("ExpirySweep", "false");
        });
        audit = new MongoClient(mongo.GetConnectionString())
            .GetDatabase("osprey").GetCollection<AuditLogDocument>("audit");
    }

    public async Task DisposeAsync()
    {
        await factory.DisposeAsync();
        await mongo.DisposeAsync();
    }

    private async Task<string> EnrollAsync(HttpClient client, string name, string email)
    {
        HttpResponseMessage created = await client.PostAsJsonAsync("/api/members", new { name, email });
        return (await created.Content.ReadFromJsonAsync<EnrollMember.Response>())!.Id;
    }

    private async Task<List<AuditLogDocument>> AuditFor(string memberId) =>
        await audit.Find(a => a.TargetMemberId == memberId).ToListAsync();

    [Fact]
    public async Task Adjustment_writes_an_audit_entry_with_actor_action_target_details()
    {
        HttpClient client = factory.CreateClient();
        string memberId = await EnrollAsync(client, "Audit Adjust", "audit.adjust@example.com");

        await client.PostAsJsonAsync($"/api/members/{memberId}/adjustments",
            new { points = 2_500, reason = "goodwill", idempotencyKey = "audit-adjust-0001" });

        AuditLogDocument entry = Assert.Single(await AuditFor(memberId));
        Assert.Equal(AuditActions.AdjustPoints, entry.Action);
        Assert.Equal(memberId, entry.TargetMemberId);
        Assert.Equal(AuditActions.Anonymous, entry.Actor); // auth OFF → honest fallback
        Assert.Equal("2500", entry.Details["points"]);
        Assert.Equal("goodwill", entry.Details["reason"]);
        Assert.False(string.IsNullOrWhiteSpace(entry.CorrelationId));
        Assert.NotEqual(default, entry.OccurredAtUtc);
    }

    [Fact]
    public async Task Osprey_toggle_writes_an_audit_entry_with_invited_detail()
    {
        HttpClient client = factory.CreateClient();
        string memberId = await EnrollAsync(client, "Audit Osprey", "audit.osprey@example.com");

        await client.PutAsJsonAsync($"/api/members/{memberId}/osprey", new { invited = true });

        AuditLogDocument entry = Assert.Single(await AuditFor(memberId));
        Assert.Equal(AuditActions.SetOsprey, entry.Action);
        Assert.Equal(memberId, entry.TargetMemberId);
        Assert.Equal(AuditActions.Anonymous, entry.Actor);
        Assert.Equal("true", entry.Details["invited"]);
    }

    [Fact]
    public async Task Retried_adjustment_does_not_write_a_second_audit_entry()
    {
        // The audit trail is idempotent too: a retried key changed nothing new, so it records nothing new.
        HttpClient client = factory.CreateClient();
        string memberId = await EnrollAsync(client, "Audit Retry", "audit.retry@example.com");

        var body = new { points = 1_000, reason = "goodwill", idempotencyKey = "audit-retry-0001" };
        await client.PostAsJsonAsync($"/api/members/{memberId}/adjustments", body);
        await client.PostAsJsonAsync($"/api/members/{memberId}/adjustments", body); // same key → no-op

        Assert.Single(await AuditFor(memberId));
    }

    [Fact]
    public async Task Audit_collection_is_append_only_across_multiple_actions()
    {
        // Two distinct privileged actions on the same member accumulate; nothing is overwritten.
        HttpClient client = factory.CreateClient();
        string memberId = await EnrollAsync(client, "Audit Append", "audit.append@example.com");

        await client.PostAsJsonAsync($"/api/members/{memberId}/adjustments",
            new { points = 500, reason = "a", idempotencyKey = "audit-append-0001" });
        await client.PutAsJsonAsync($"/api/members/{memberId}/osprey", new { invited = true });

        List<AuditLogDocument> entries = await AuditFor(memberId);
        Assert.Equal(2, entries.Count);
        Assert.Contains(entries, e => e.Action == AuditActions.AdjustPoints);
        Assert.Contains(entries, e => e.Action == AuditActions.SetOsprey);
    }
}
