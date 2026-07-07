using MongoDB.Driver;
using Osprey.Members.Features;
using Osprey.Members.Storage;
using Testcontainers.MongoDb;
using Xunit;

namespace Osprey.Members.Tests;

/// <summary>
/// The sweep must be safe to run twice (spec rule 3 applied to background work):
/// deterministic idempotency keys ("expiry-{earnId}") plus the unique index make a
/// re-run a no-op — one expiry entry, one balance decrement, no matter how often it fires.
/// </summary>
public sealed class ExpirySweepTests : IAsyncLifetime
{
    private readonly MongoDbContainer mongo = new MongoDbBuilder().WithImage("mongo:7").Build();
    private IMongoCollection<MemberDocument> members = null!;
    private IMongoCollection<PointsTransactionDocument> transactions = null!;

    public async Task InitializeAsync()
    {
        await mongo.StartAsync();
        IMongoDatabase db = new MongoClient(mongo.GetConnectionString()).GetDatabase("osprey");
        members = db.GetCollection<MemberDocument>("members");
        transactions = db.GetCollection<PointsTransactionDocument>("transactions");
        await MongoIndexes.EnsureAsync(transactions);
    }

    public Task DisposeAsync() => mongo.DisposeAsync().AsTask();

    [Fact]
    public async Task Sweep_expires_unconsumed_old_points_once()
    {
        DateTime nowUtc = DateTime.UtcNow;
        await members.InsertOneAsync(new MemberDocument(
            "m-1", "Test Member", "t@example.com", nowUtc.AddMonths(-26), 0, 6_000));
        await transactions.InsertOneAsync(new PointsTransactionDocument(
            "old-earn", "m-1", TransactionTypes.Earn, 10_000, "cardco",
            "seed-earn-0001", nowUtc.AddMonths(-25)));
        await transactions.InsertOneAsync(new PointsTransactionDocument(
            Guid.NewGuid().ToString("N"), "m-1", TransactionTypes.Burn, -4_000, "rewards",
            "seed-burn-0001", nowUtc.AddMonths(-2)));

        int expired = await Expiry.SweepAsync(members, transactions, DateTime.UtcNow);

        Assert.Equal(6_000, expired); // 10_000 earned minus 4_000 consumed FIFO
        PointsTransactionDocument entry = await transactions
            .Find(t => t.IdempotencyKey == "expiry-old-earn").FirstAsync();
        Assert.Equal(TransactionTypes.Expiry, entry.Type);
        Assert.Equal(-6_000, entry.Points);
        MemberDocument member = await members.Find(m => m.Id == "m-1").FirstAsync();
        Assert.Equal(0, member.SpendablePoints);

        // Second pass: the deterministic key hits the unique index — a total no-op.
        int secondRun = await Expiry.SweepAsync(members, transactions, DateTime.UtcNow);

        Assert.Equal(0, secondRun);
        Assert.Equal(1, await transactions.CountDocumentsAsync(t => t.Type == TransactionTypes.Expiry));
        member = await members.Find(m => m.Id == "m-1").FirstAsync();
        Assert.Equal(0, member.SpendablePoints); // decremented once, not twice
    }

    [Fact]
    public async Task Sweep_ignores_members_with_nothing_due()
    {
        DateTime nowUtc = DateTime.UtcNow;
        await members.InsertOneAsync(new MemberDocument(
            "m-fresh", "Fresh Member", "f@example.com", nowUtc, 0, 5_000));
        await transactions.InsertOneAsync(new PointsTransactionDocument(
            "fresh-earn", "m-fresh", TransactionTypes.Earn, 5_000, "cardco",
            "fresh-earn-0001", nowUtc.AddMonths(-1)));

        int expired = await Expiry.SweepAsync(members, transactions, DateTime.UtcNow);

        Assert.Equal(0, expired);
        Assert.Equal(0, await transactions.CountDocumentsAsync(t => t.Type == TransactionTypes.Expiry));
        MemberDocument member = await members.Find(m => m.Id == "m-fresh").FirstAsync();
        Assert.Equal(5_000, member.SpendablePoints);
    }
}
