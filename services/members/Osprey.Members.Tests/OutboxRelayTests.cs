using System.Text;
using MongoDB.Driver;
using Osprey.Members.Features;
using Osprey.Members.Storage;
using RabbitMQ.Client;
using Testcontainers.MongoDb;
using Testcontainers.RabbitMq;
using Xunit;

namespace Osprey.Members.Tests;

/// <summary>
/// The relay publishes pending outbox entries to the member-events topic exchange and
/// stamps PublishedAtUtc — at-least-once, with consumer-side dedup on the event id.
/// </summary>
public sealed class OutboxRelayTests : IAsyncLifetime
{
    private readonly MongoDbContainer mongo = new MongoDbBuilder().WithImage("mongo:7").Build();
    private readonly RabbitMqContainer rabbit = new RabbitMqBuilder().WithImage("rabbitmq:3").Build();
    private IMongoCollection<OutboxDocument> outbox = null!;

    public async Task InitializeAsync()
    {
        await Task.WhenAll(mongo.StartAsync(), rabbit.StartAsync());
        outbox = new MongoClient(mongo.GetConnectionString()).GetDatabase("osprey")
            .GetCollection<OutboxDocument>("outbox");
    }

    public async Task DisposeAsync()
    {
        await mongo.DisposeAsync();
        await rabbit.DisposeAsync();
    }

    [Fact]
    public async Task Publishes_pending_entries_once_and_stamps_them()
    {
        var factory = new ConnectionFactory { Uri = new Uri(rabbit.GetConnectionString()) };
        await using IConnection connection = await factory.CreateConnectionAsync();
        await using IChannel channel = await connection.CreateChannelAsync();
        await Outbox.DeclareAsync(channel);
        QueueDeclareOk probe = await channel.QueueDeclareAsync("", durable: false, exclusive: true, autoDelete: true);
        await channel.QueueBindAsync(probe.QueueName, Outbox.Exchange, routingKey: "#");

        await outbox.InsertOneAsync(new OutboxDocument(
            "tier-m-1-GOLD-abc", "tier.changed", """{"eventId":"tier-m-1-GOLD-abc"}""", DateTime.UtcNow));
        await outbox.InsertOneAsync(new OutboxDocument(
            "expiring-xyz", "points.expiring", """{"eventId":"expiring-xyz"}""", DateTime.UtcNow,
            PublishedAtUtc: DateTime.UtcNow)); // already published — must be skipped

        int published = await Outbox.PublishPendingAsync(outbox, channel);

        Assert.Equal(1, published);
        BasicGetResult? delivery = await channel.BasicGetAsync(probe.QueueName, autoAck: true);
        Assert.NotNull(delivery);
        Assert.Equal("tier.changed", delivery.RoutingKey);
        Assert.Contains("tier-m-1-GOLD-abc", Encoding.UTF8.GetString(delivery.Body.ToArray()));
        OutboxDocument stamped = await outbox.Find(o => o.Id == "tier-m-1-GOLD-abc").FirstAsync();
        Assert.NotNull(stamped.PublishedAtUtc);

        // Everything stamped: the next pass has nothing to do.
        Assert.Equal(0, await Outbox.PublishPendingAsync(outbox, channel));
        Assert.Null(await channel.BasicGetAsync(probe.QueueName, autoAck: true));
    }
}
