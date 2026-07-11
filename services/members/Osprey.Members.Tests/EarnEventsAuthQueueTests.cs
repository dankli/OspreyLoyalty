using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.IdentityModel.Tokens;
using MongoDB.Driver;
using Osprey.Members.Features;
using Osprey.Members.Storage;
using RabbitMQ.Client;
using Testcontainers.MongoDb;
using Testcontainers.RabbitMq;
using Xunit;

namespace Osprey.Members.Tests;

/// <summary>
/// The RabbitMQ leg of zero-trust, end to end (Auth:Enabled on): an earn event carrying a valid
/// service token is applied; one without a token is dead-lettered, never reaching the ledger.
/// The ledger is read straight from Mongo because the HTTP endpoints require a token when auth is on.
/// </summary>
public sealed class EarnEventsAuthQueueTests : IAsyncLifetime
{
    private const string TestKey = "osprey-test-signing-key-long-enough-for-hs256-xx";
    private readonly MongoDbContainer mongo = new MongoDbBuilder().WithImage("mongo:7").Build();
    private readonly RabbitMqContainer rabbit = new RabbitMqBuilder().WithImage("rabbitmq:3-management").Build();
    private WebApplicationFactory<Program> factory = null!;

    public async Task InitializeAsync()
    {
        await Task.WhenAll(mongo.StartAsync(), rabbit.StartAsync());
        factory = new WebApplicationFactory<Program>().WithWebHostBuilder(b =>
        {
            b.UseSetting("ConnectionStrings:Mongo", mongo.GetConnectionString());
            b.UseSetting("RabbitMq:Host", rabbit.Hostname);
            b.UseSetting("RabbitMq:Port", rabbit.GetMappedPublicPort(5672).ToString());
            b.UseSetting("RabbitMq:User", "rabbitmq");
            b.UseSetting("RabbitMq:Password", "rabbitmq");
            b.UseSetting("SeedDemoData", "true");
            b.UseSetting("ExpirySweep", "false");
            b.UseSetting("Auth:Enabled", "true");
            b.UseSetting("Auth:TestSigningKey", TestKey);
            b.UseSetting("Auth:Issuer", "http://localhost:9000");
            b.UseSetting("Auth:Audience", "osprey-members");
        });
        _ = factory.CreateClient(); // boot the host so the consumer starts
    }

    public async Task DisposeAsync()
    {
        await factory.DisposeAsync();
        await Task.WhenAll(mongo.DisposeAsync().AsTask(), rabbit.DisposeAsync().AsTask());
    }

    private static string ServiceToken(string audience = "osprey-members")
    {
        var credentials = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(TestKey)), SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken(
            issuer: "http://localhost:9000",
            audience: audience,
            claims: new[] { new Claim("sub", "partners-service"), new Claim("roles", "service") },
            expires: DateTime.UtcNow.AddMinutes(10),
            signingCredentials: credentials);
        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private async Task<IChannel> DeclaredChannelAsync()
    {
        var connectionFactory = new ConnectionFactory
        {
            HostName = rabbit.Hostname,
            Port = rabbit.GetMappedPublicPort(5672),
            UserName = "rabbitmq",
            Password = "rabbitmq",
        };
        IConnection connection = await connectionFactory.CreateConnectionAsync();
        IChannel channel = await connection.CreateChannelAsync();
        await ConsumeEarnEvents.DeclareAsync(channel);
        return channel;
    }

    private IMongoCollection<PointsTransactionDocument> Transactions() =>
        new MongoClient(mongo.GetConnectionString())
            .GetDatabase("osprey").GetCollection<PointsTransactionDocument>("transactions");

    [Fact]
    public async Task Authenticated_earn_event_is_applied_to_the_ledger()
    {
        await using IChannel channel = await DeclaredChannelAsync();
        byte[] body = JsonSerializer.SerializeToUtf8Bytes(new
        {
            memberId = "demo-erik",
            partnerId = "cardco",
            amount = 40_000m,
            rate = 0.5m,
            idempotencyKey = "auth-earn-0001",
            occurredAtUtc = DateTime.UtcNow,
            authToken = ServiceToken(),
        });
        await channel.BasicPublishAsync("", ConsumeEarnEvents.Queue, body);

        long count = 0;
        for (int attempt = 0; attempt < 60; attempt++) // bounded poll
        {
            count = await Transactions().CountDocumentsAsync(t => t.MemberId == "demo-erik");
            if (count > 0) break;
            await Task.Delay(1000);
        }
        Assert.Equal(1, count);
    }

    [Fact]
    public async Task Unauthenticated_earn_event_is_dead_lettered_not_applied()
    {
        await using IChannel channel = await DeclaredChannelAsync();
        byte[] body = JsonSerializer.SerializeToUtf8Bytes(new
        {
            memberId = "demo-erik",
            partnerId = "cardco",
            amount = 40_000m,
            rate = 0.5m,
            idempotencyKey = "noauth-earn-0001",
            occurredAtUtc = DateTime.UtcNow, // no authToken
        });
        await channel.BasicPublishAsync("", ConsumeEarnEvents.Queue, body);

        uint deadCount = 0;
        for (int attempt = 0; attempt < 60; attempt++) // bounded poll
        {
            deadCount = await channel.MessageCountAsync(ConsumeEarnEvents.DeadQueue);
            if (deadCount > 0) break;
            await Task.Delay(1000);
        }
        Assert.Equal(1u, deadCount);
        Assert.Equal(0, await Transactions().CountDocumentsAsync(t => t.MemberId == "demo-erik"));
    }
}
