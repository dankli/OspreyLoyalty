using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.IdentityModel.Tokens;
using Testcontainers.MongoDb;
using Xunit;

namespace Osprey.Members.Tests;

/// <summary>
/// Zero-trust JWT validation with Auth:Enabled turned on. Uses a shared HS256 test key
/// so tokens validate without a live identity service. The rest of the suite runs with
/// auth off (the default), which is why those tests need no tokens.
/// </summary>
public sealed class AuthTests : IAsyncLifetime
{
    private const string TestKey = "osprey-test-signing-key-long-enough-for-hs256-xx";
    private readonly MongoDbContainer mongo = new MongoDbBuilder().WithImage("mongo:7").Build();
    private WebApplicationFactory<Program> factory = null!;

    public async Task InitializeAsync()
    {
        await mongo.StartAsync();
        factory = new WebApplicationFactory<Program>().WithWebHostBuilder(b =>
        {
            b.UseSetting("ConnectionStrings:Mongo", mongo.GetConnectionString());
            b.UseSetting("ConsumeEarnEvents", "false");
            b.UseSetting("ExpirySweep", "false");
            b.UseSetting("Auth:Enabled", "true");
            b.UseSetting("Auth:TestSigningKey", TestKey);
            b.UseSetting("Auth:Issuer", "http://localhost:9000");
            b.UseSetting("Auth:Audience", "osprey-members");
        });
    }

    public async Task DisposeAsync()
    {
        await factory.DisposeAsync();
        await mongo.DisposeAsync();
    }

    private static string Token(string sub, params string[] roles)
    {
        var credentials = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(TestKey)), SecurityAlgorithms.HmacSha256);
        var claims = new List<Claim> { new("sub", sub) };
        claims.AddRange(roles.Select(role => new Claim("roles", role)));
        var token = new JwtSecurityToken(
            issuer: "http://localhost:9000",
            audience: "osprey-members",
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(10),
            signingCredentials: credentials);
        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    [Fact]
    public async Task Health_stays_anonymous_when_auth_is_on()
    {
        HttpResponseMessage response = await factory.CreateClient().GetAsync("/health");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task A_protected_endpoint_without_a_token_is_401()
    {
        HttpResponseMessage response = await factory.CreateClient().GetAsync("/api/members/demo-ada");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task A_garbage_token_is_401()
    {
        HttpClient client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", "not-a-jwt");
        HttpResponseMessage response = await client.GetAsync("/api/members/demo-ada");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task A_member_token_cannot_reach_an_admin_endpoint()
    {
        HttpClient client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", Token("demo-erik", "member"));
        HttpResponseMessage response = await client.PostAsJsonAsync(
            "/api/members/demo-erik/adjustments",
            new { points = 100, reason = "test", idempotencyKey = "auth-k1" });
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task An_admin_token_clears_authorization_on_an_admin_endpoint()
    {
        HttpClient client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", Token("admin", "admin", "member"));
        // A missing member yields 404 — proving the request passed authN and authZ
        // (a 401/403 would mean auth blocked it before the handler ran).
        HttpResponseMessage response = await client.GetAsync("/api/members?email=nobody@example.com");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
