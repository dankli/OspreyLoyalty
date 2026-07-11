using MongoDB.Driver;
using Osprey.Members.Features;
using Osprey.Members.Storage;
using Testcontainers.MongoDb;
using Xunit;

namespace Osprey.Members.Tests;

/// <summary>
/// The seed must be HONEST: every seeded qualifying total is derivable from its seeded
/// ledger via the rolling-window recompute, or the requalification sweep would downgrade
/// the demo members on the first pass (which is exactly what the e2e caught once).
/// </summary>
public sealed class SeedDemoDataTests : IAsyncLifetime
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
    public async Task Seeded_qualifying_points_survive_a_requalification_sweep()
    {
        await SeedDemoData.SeedAsync(members, transactions);
        await SeedDemoData.SeedAsync(members, transactions); // idempotent re-boot

        IReadOnlyList<Requalification.TierChange> changes =
            await Requalification.SweepAsync(members, transactions, DateTime.UtcNow);

        Assert.Empty(changes); // the honest seed gives the sweep nothing to correct
        MemberDocument ada = await members.Find(m => m.Id == "demo-ada").FirstAsync();
        Assert.Equal(32_000, ada.QualifyingPoints); // SILVER, ledger-backed
        MemberDocument erik = await members.Find(m => m.Id == "demo-erik").FirstAsync();
        Assert.Equal(0, erik.QualifyingPoints); // empty window: his first earn alone sets the total
        Assert.Equal(4_200, erik.SpendablePoints);
        MemberDocument yusra = await members.Find(m => m.Id == "demo-yusra").FirstAsync();
        Assert.Equal(96_000, yusra.QualifyingPoints);
        Assert.True(yusra.IsOspreyInvited);
    }
}
