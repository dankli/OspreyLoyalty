using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Osprey.Members.Features;
using Testcontainers.MongoDb;
using Xunit;

namespace Osprey.Members.Tests;

public sealed class MembersApiTests : IAsyncLifetime
{
    private readonly MongoDbContainer mongo = new MongoDbBuilder().WithImage("mongo:7").Build();
    private WebApplicationFactory<Program> factory = null!;

    public async Task InitializeAsync()
    {
        await mongo.StartAsync();
        factory = new WebApplicationFactory<Program>().WithWebHostBuilder(b =>
        {
            b.UseSetting("ConnectionStrings:Mongo", mongo.GetConnectionString());
            b.UseSetting("ConsumeEarnEvents", "false"); // these tests never touch a broker
            b.UseSetting("ExpirySweep", "false"); // a background sweep would make assertions racy
        });
    }

    public async Task DisposeAsync()
    {
        await factory.DisposeAsync();
        await mongo.DisposeAsync();
    }

    [Fact]
    public async Task Enroll_then_fetch_profile_roundtrips()
    {
        HttpClient client = factory.CreateClient();

        HttpResponseMessage created = await client.PostAsJsonAsync("/api/members",
            new { name = "Test Member", email = "test@example.com" });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        EnrollMember.Response enrolled = (await created.Content.ReadFromJsonAsync<EnrollMember.Response>())!;

        GetMemberProfile.Response profile =
            (await client.GetFromJsonAsync<GetMemberProfile.Response>($"/api/members/{enrolled.Id}"))!;
        Assert.Equal("MEMBER", profile.Tier);
        Assert.Equal(0, profile.SpendablePoints);
        Assert.Equal(20_000, profile.PointsToNextTier);
    }

    [Fact]
    public async Task Blank_name_is_a_400_not_a_crash()
    {
        HttpClient client = factory.CreateClient();
        HttpResponseMessage response = await client.PostAsJsonAsync("/api/members",
            new { name = "", email = "x@example.com" });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Unknown_member_is_a_404()
    {
        HttpClient client = factory.CreateClient();
        HttpResponseMessage response = await client.GetAsync("/api/members/nope");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Enrollment_normalizes_email_to_lowercase()
    {
        HttpClient client = factory.CreateClient();
        HttpResponseMessage created = await client.PostAsJsonAsync("/api/members",
            new { name = "Case Test", email = "  Case.Test@EXAMPLE.com " });
        EnrollMember.Response enrolled = (await created.Content.ReadFromJsonAsync<EnrollMember.Response>())!;
        Assert.Equal("case.test@example.com", enrolled.Email);
    }

    [Fact]
    public async Task Transactions_are_paginated_newest_first()
    {
        HttpClient client = factory.CreateClient();
        HttpResponseMessage created = await client.PostAsJsonAsync("/api/members",
            new { name = "Pager", email = "pager@example.com" });
        string memberId = (await created.Content.ReadFromJsonAsync<EnrollMember.Response>())!.Id;

        var mongoClient = new MongoDB.Driver.MongoClient(mongo.GetConnectionString());
        var transactions = mongoClient.GetDatabase("osprey")
            .GetCollection<Osprey.Members.Storage.PointsTransactionDocument>("transactions");
        for (int i = 0; i < 25; i++)
            await transactions.InsertOneAsync(new(
                Guid.NewGuid().ToString("N"), memberId, "earn", 100 + i, "cardco",
                $"page-key-{i:D4}", DateTime.UtcNow.AddMinutes(-i)));

        ListTransactions.Response page0 =
            (await client.GetFromJsonAsync<ListTransactions.Response>($"/api/members/{memberId}/transactions"))!;
        Assert.Equal(20, page0.Items.Count);
        Assert.True(page0.HasMore);
        Assert.Equal(100, page0.Items[0].Points); // i=0 is the newest (offset -0 minutes) and carries 100 points

        ListTransactions.Response page1 =
            (await client.GetFromJsonAsync<ListTransactions.Response>($"/api/members/{memberId}/transactions?page=1"))!;
        Assert.Equal(5, page1.Items.Count);
        Assert.False(page1.HasMore);
    }

    [Fact]
    public async Task Lookup_by_email_finds_the_enrolled_member()
    {
        HttpClient client = factory.CreateClient();
        HttpResponseMessage created = await client.PostAsJsonAsync("/api/members",
            new { name = "Lookup Target", email = "Lookup.Target@Example.com" });
        string memberId = (await created.Content.ReadFromJsonAsync<EnrollMember.Response>())!.Id;

        // Any casing must resolve — enrollment normalized to lowercase, lookup does the same.
        HttpResponseMessage found = await client.GetAsync("/api/members?email=LOOKUP.TARGET@EXAMPLE.COM");
        Assert.Equal(HttpStatusCode.OK, found.StatusCode);
        FindMemberByEmail.Response member = (await found.Content.ReadFromJsonAsync<FindMemberByEmail.Response>())!;
        Assert.Equal(memberId, member.Id);
        Assert.Equal("lookup.target@example.com", member.Email);

        HttpResponseMessage missing = await client.GetAsync("/api/members?email=nobody@example.com");
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
    }

    [Fact]
    public async Task Adjustment_moves_balance_and_lands_in_ledger()
    {
        HttpClient client = factory.CreateClient();
        HttpResponseMessage created = await client.PostAsJsonAsync("/api/members",
            new { name = "Goodwill Case", email = "goodwill@example.com" });
        string memberId = (await created.Content.ReadFromJsonAsync<EnrollMember.Response>())!.Id;

        HttpResponseMessage adjusted = await client.PostAsJsonAsync($"/api/members/{memberId}/adjustments",
            new { points = 2_500, reason = "goodwill", idempotencyKey = "adjust-goodwill-0001" });
        Assert.Equal(HttpStatusCode.OK, adjusted.StatusCode);
        AdjustPoints.Response response = (await adjusted.Content.ReadFromJsonAsync<AdjustPoints.Response>())!;
        Assert.Equal(2_500, response.Points);
        Assert.Equal(2_500, response.SpendablePoints);
        Assert.False(response.AlreadyApplied);

        ListTransactions.Response transactions =
            (await client.GetFromJsonAsync<ListTransactions.Response>($"/api/members/{memberId}/transactions"))!;
        ListTransactions.Item entry = Assert.Single(transactions.Items);
        Assert.Equal("adjustment", entry.Type);
        Assert.Equal(2_500, entry.Points);
        Assert.Equal("admin: goodwill", entry.Source);
    }

    [Fact]
    public async Task Negative_adjustment_cannot_overdraw()
    {
        HttpClient client = factory.CreateClient();
        HttpResponseMessage created = await client.PostAsJsonAsync("/api/members",
            new { name = "Zero Balance", email = "zero.balance@example.com" });
        string memberId = (await created.Content.ReadFromJsonAsync<EnrollMember.Response>())!.Id;

        HttpResponseMessage overdraw = await client.PostAsJsonAsync($"/api/members/{memberId}/adjustments",
            new { points = -100, reason = "mistake", idempotencyKey = "adjust-overdraw-0001" });
        Assert.Equal(HttpStatusCode.BadRequest, overdraw.StatusCode);
    }

    [Fact]
    public async Task Pandion_toggle_flips_tier_and_back()
    {
        HttpClient client = factory.CreateClient();
        HttpResponseMessage created = await client.PostAsJsonAsync("/api/members",
            new { name = "Pandion Candidate", email = "pandion@example.com" });
        string memberId = (await created.Content.ReadFromJsonAsync<EnrollMember.Response>())!.Id;

        HttpResponseMessage granted = await client.PutAsJsonAsync($"/api/members/{memberId}/pandion",
            new { invited = true });
        Assert.Equal(HttpStatusCode.OK, granted.StatusCode);
        SetPandionInvitation.Response invited = (await granted.Content.ReadFromJsonAsync<SetPandionInvitation.Response>())!;
        Assert.Equal("PANDION", invited.Tier);
        Assert.Null(invited.PointsToNextTier);

        HttpResponseMessage revoked = await client.PutAsJsonAsync($"/api/members/{memberId}/pandion",
            new { invited = false });
        SetPandionInvitation.Response member = (await revoked.Content.ReadFromJsonAsync<SetPandionInvitation.Response>())!;
        Assert.Equal("MEMBER", member.Tier);
    }

    [Fact]
    public async Task Correlation_id_is_echoed_and_generated()
    {
        HttpClient client = factory.CreateClient();

        var request = new HttpRequestMessage(HttpMethod.Get, "/health");
        request.Headers.Add("X-Correlation-Id", "test-corr-0001");
        HttpResponseMessage withHeader = await client.SendAsync(request);
        Assert.Equal("test-corr-0001", withHeader.Headers.GetValues("X-Correlation-Id").Single());

        HttpResponseMessage without = await client.GetAsync("/health");
        string generated = without.Headers.GetValues("X-Correlation-Id").Single();
        Assert.False(string.IsNullOrWhiteSpace(generated));
    }

    [Fact]
    public async Task Validation_failures_are_recorded_as_400_in_metrics()
    {
        HttpClient client = factory.CreateClient();
        await client.PostAsJsonAsync("/api/members", new { name = "", email = "x@example.com" }); // 400
        string body = await client.GetStringAsync("/metrics");
        Assert.Contains("code=\"400\"", body);
    }

    [Fact]
    public async Task Metrics_endpoint_exposes_prometheus_text()
    {
        HttpClient client = factory.CreateClient();
        await client.GetAsync("/health"); // generate at least one observation
        HttpResponseMessage response = await client.GetAsync("/metrics");
        Assert.Equal(System.Net.HttpStatusCode.OK, response.StatusCode);
        string body = await response.Content.ReadAsStringAsync();
        Assert.Contains("http_request_duration_seconds", body);
    }
}
