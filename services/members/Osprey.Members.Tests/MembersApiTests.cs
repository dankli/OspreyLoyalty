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
}
