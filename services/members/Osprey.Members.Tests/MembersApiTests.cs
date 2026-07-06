using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Osprey.Members.Features;
using Testcontainers.MongoDb;
using Xunit;

namespace Osprey.Members.Tests;

public sealed class MembersApiTests : IAsyncLifetime
{
    private readonly MongoDbContainer mongo = new MongoDbBuilder().Build();
    private WebApplicationFactory<Program> factory = null!;

    public async Task InitializeAsync()
    {
        await mongo.StartAsync();
        factory = new WebApplicationFactory<Program>().WithWebHostBuilder(b =>
            b.UseSetting("ConnectionStrings:Mongo", mongo.GetConnectionString()));
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
}
