using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Osprey.Members.Features;
using RabbitMQ.Client;
using Testcontainers.MongoDb;
using Testcontainers.RabbitMq;
using Xunit;

namespace Osprey.Members.Tests;

public sealed class EarnEventsQueueTests : IAsyncLifetime
{
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
        });
        _ = factory.CreateClient(); // boot the host so the consumer starts
    }

    public async Task DisposeAsync()
    {
        await factory.DisposeAsync();
        await Task.WhenAll(mongo.DisposeAsync().AsTask(), rabbit.DisposeAsync().AsTask());
    }

    [Fact]
    public async Task Published_purchase_lands_as_one_transaction_even_when_delivered_twice()
    {
        var factoryR = new ConnectionFactory
        {
            HostName = rabbit.Hostname,
            Port = rabbit.GetMappedPublicPort(5672),
            UserName = "rabbitmq",
            Password = "rabbitmq",
        };
        await using IConnection connection = await factoryR.CreateConnectionAsync();
        await using IChannel channel = await connection.CreateChannelAsync();
        await ConsumeEarnEvents.DeclareAsync(channel);

        byte[] body = JsonSerializer.SerializeToUtf8Bytes(new
        {
            memberId = "demo-erik", partnerId = "cardco", amount = 40_000m, rate = 0.5m,
            idempotencyKey = "queue-dup-0001", occurredAtUtc = DateTime.UtcNow,
        });
        await channel.BasicPublishAsync("", ConsumeEarnEvents.Queue, body);
        await channel.BasicPublishAsync("", ConsumeEarnEvents.Queue, body);

        HttpClient client = factory.CreateClient();
        ListTransactions.Response? page = null;
        for (int attempt = 0; attempt < 30; attempt++) // bounded poll — never wait forever
        {
            page = await client.GetFromJsonAsync<ListTransactions.Response>("/api/members/demo-erik/transactions");
            if (page!.Items.Count > 0) break;
            await Task.Delay(500);
        }

        Assert.NotNull(page);
        Assert.Single(page!.Items);
        Assert.Equal(20_000, page.Items[0].Points);

        GetMemberProfile.Response profile =
            (await client.GetFromJsonAsync<GetMemberProfile.Response>("/api/members/demo-erik"))!;
        Assert.Equal("SILVER", profile.Tier);
        Assert.Equal(20_000, profile.QualifyingPoints); // ledger recompute replaces the seeded display value
    }

    [Fact]
    public async Task Malformed_event_lands_in_the_dead_queue_not_the_ledger()
    {
        var factoryR = new ConnectionFactory
        {
            HostName = rabbit.Hostname,
            Port = rabbit.GetMappedPublicPort(5672),
            UserName = "rabbitmq",
            Password = "rabbitmq",
        };
        await using IConnection connection = await factoryR.CreateConnectionAsync();
        await using IChannel channel = await connection.CreateChannelAsync();
        await ConsumeEarnEvents.DeclareAsync(channel);

        await channel.BasicPublishAsync("", ConsumeEarnEvents.Queue, "not json at all"u8.ToArray());

        uint deadCount = 0;
        for (int attempt = 0; attempt < 30; attempt++) // bounded poll
        {
            deadCount = await channel.MessageCountAsync(ConsumeEarnEvents.DeadQueue);
            if (deadCount > 0) break;
            await Task.Delay(500);
        }
        Assert.Equal(1u, deadCount);
    }
}
