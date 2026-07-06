using MongoDB.Driver;
using Osprey.Members.Features;
using Osprey.Members.Storage;
using Testcontainers.MongoDb;
using Xunit;

namespace Osprey.Members.Tests;

/// <summary>
/// THE showcase test (spec rule 3): at-least-once delivery means the same EarnEvent
/// will arrive twice. Twice-processed must equal once-processed — one ledger entry,
/// one balance increment.
/// </summary>
public sealed class ApplyEarnIdempotencyTests : IAsyncLifetime
{
    private readonly MongoDbContainer mongo = new MongoDbBuilder().Build();
    private IMongoCollection<MemberDocument> members = null!;
    private IMongoCollection<PointsTransactionDocument> transactions = null!;

    public async Task InitializeAsync()
    {
        await mongo.StartAsync();
        IMongoDatabase db = new MongoClient(mongo.GetConnectionString()).GetDatabase("osprey");
        members = db.GetCollection<MemberDocument>("members");
        transactions = db.GetCollection<PointsTransactionDocument>("transactions");
        await MongoIndexes.EnsureAsync(transactions);
        await members.InsertOneAsync(new MemberDocument(
            "m-1", "Test Member", "t@example.com", DateTime.UtcNow, 0, 0));
    }

    public Task DisposeAsync() => mongo.DisposeAsync().AsTask();

    [Fact]
    public async Task Same_earn_event_delivered_twice_produces_exactly_one_transaction()
    {
        var handler = new ApplyEarn.Handler(members, transactions);
        var earn = new ApplyEarn.EarnEvent("m-1", "cardco", 40_000m, 0.5m, "dup-key-0001", DateTime.UtcNow);

        ApplyEarn.Result first = await handler.Handle(earn);
        ApplyEarn.Result second = await handler.Handle(earn);

        Assert.False(first.AlreadyApplied);
        Assert.Equal(20_000, first.Points);
        Assert.Equal("SILVER", first.Tier);
        Assert.True(second.AlreadyApplied);

        long entries = await transactions.CountDocumentsAsync(t => t.IdempotencyKey == "dup-key-0001");
        Assert.Equal(1, entries);

        MemberDocument member = await members.Find(m => m.Id == "m-1").FirstAsync();
        Assert.Equal(20_000, member.SpendablePoints); // incremented once, not twice
        Assert.Equal(20_000, member.QualifyingPoints);
    }

    [Fact]
    public async Task Earn_for_unknown_member_throws_and_writes_nothing()
    {
        var handler = new ApplyEarn.Handler(members, transactions);
        var earn = new ApplyEarn.EarnEvent("ghost", "cardco", 100m, 0.5m, "ghost-key-0001", DateTime.UtcNow);
        await Assert.ThrowsAsync<ArgumentException>(() => handler.Handle(earn));
        Assert.Equal(0, await transactions.CountDocumentsAsync(t => t.IdempotencyKey == "ghost-key-0001"));
    }
}
