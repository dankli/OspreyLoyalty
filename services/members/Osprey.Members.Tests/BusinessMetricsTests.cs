using MongoDB.Driver;
using Osprey.Members.Features;
using Osprey.Members.Storage;
using Testcontainers.MongoDb;
using Xunit;

namespace Osprey.Members.Tests;

/// <summary>
/// Business counters increment at the moment a domain change APPLIES — an idempotent
/// replay must not move them. Counters are process-global, so every assertion is a delta.
/// </summary>
public sealed class BusinessMetricsTests : IAsyncLifetime
{
    private readonly MongoDbContainer mongo = new MongoDbBuilder().WithImage("mongo:7").Build();
    private IMongoCollection<MemberDocument> members = null!;
    private IMongoCollection<PointsTransactionDocument> transactions = null!;
    private Outbox.Writer outbox = null!;

    public async Task InitializeAsync()
    {
        await mongo.StartAsync();
        IMongoDatabase db = new MongoClient(mongo.GetConnectionString()).GetDatabase("osprey");
        members = db.GetCollection<MemberDocument>("members");
        transactions = db.GetCollection<PointsTransactionDocument>("transactions");
        outbox = new Outbox.Writer(db.GetCollection<OutboxDocument>("outbox"));
        await MongoIndexes.EnsureAsync(transactions);
        await members.InsertOneAsync(new MemberDocument(
            "m-metrics", "Metrics Member", "m@example.com", DateTime.UtcNow, 0, 0));
    }

    public Task DisposeAsync() => mongo.DisposeAsync().AsTask();

    [Fact]
    public async Task Earn_moves_the_earned_counter_and_a_promotion_moves_tier_changes_up()
    {
        double earnedBefore = BusinessMetrics.PointsEarned.Value;
        double upBefore = BusinessMetrics.TierChanges.WithLabels("up").Value;
        var handler = new ApplyEarn.Handler(members, transactions, outbox);
        var earn = new ApplyEarn.EarnEvent("m-metrics", "cardco", 40_000m, 0.5m, "metrics-earn-1", DateTime.UtcNow);

        await handler.Handle(earn);
        await handler.Handle(earn); // replay: already-applied, must not count again

        Assert.Equal(20_000, BusinessMetrics.PointsEarned.Value - earnedBefore);
        Assert.Equal(1, BusinessMetrics.TierChanges.WithLabels("up").Value - upBefore);
    }

    [Fact]
    public async Task Trip_booking_moves_the_redeemed_counter_once()
    {
        await members.UpdateOneAsync(m => m.Id == "m-metrics",
            Builders<MemberDocument>.Update.Set(m => m.SpendablePoints, 10_000));
        double redeemedBefore = BusinessMetrics.PointsRedeemed.Value;
        var handler = new RedeemTrip.Handler(members, transactions);
        var request = new RedeemTrip.Request("ARN", "JFK", 4_000, "metrics-trip-1");

        await handler.Handle("m-metrics", request);
        await handler.Handle("m-metrics", request); // replay

        Assert.Equal(4_000, BusinessMetrics.PointsRedeemed.Value - redeemedBefore);
    }
}
