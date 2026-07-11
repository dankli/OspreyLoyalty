using MongoDB.Driver;
using Osprey.Members.Features;
using Osprey.Members.Storage;
using Testcontainers.MongoDb;
using Xunit;

namespace Osprey.Members.Tests;

/// <summary>
/// ApplyEarn recomputes the rolling window only when a new earn arrives, so a member who
/// stops earning keeps a stale tier forever. The requalification sweep closes that gap:
/// it recomputes every member's window from the ledger and applies the downgrade (or the
/// correction upward), reporting tier changes so they can be published as events.
/// </summary>
public sealed class RequalificationSweepTests : IAsyncLifetime
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
    public async Task Sweep_downgrades_a_member_whose_earns_aged_out_of_the_window()
    {
        DateTime nowUtc = DateTime.UtcNow;
        await members.InsertOneAsync(new MemberDocument(
            "m-idle", "Idle Member", "idle@example.com", nowUtc.AddMonths(-30), 25_000, 25_000));
        await transactions.InsertOneAsync(new PointsTransactionDocument(
            "idle-earn", "m-idle", TransactionTypes.Earn, 25_000, "cardco",
            "idle-earn-0001", nowUtc.AddMonths(-13)));

        IReadOnlyList<Requalification.TierChange> changes =
            await Requalification.SweepAsync(members, transactions, nowUtc);

        MemberDocument member = await members.Find(m => m.Id == "m-idle").FirstAsync();
        Assert.Equal(0, member.QualifyingPoints);
        Assert.Equal(25_000, member.SpendablePoints); // spendable balance belongs to expiry, never to requalification
        Requalification.TierChange change = Assert.Single(changes);
        Assert.Equal("m-idle", change.MemberId);
        Assert.Equal(Tiers.Tier.Silver, change.PreviousTier);
        Assert.Equal(Tiers.Tier.Member, change.NewTier);
    }

    [Fact]
    public async Task Sweep_leaves_a_current_member_untouched()
    {
        DateTime nowUtc = DateTime.UtcNow;
        await members.InsertOneAsync(new MemberDocument(
            "m-active", "Active Member", "active@example.com", nowUtc.AddMonths(-6), 25_000, 25_000));
        await transactions.InsertOneAsync(new PointsTransactionDocument(
            "active-earn", "m-active", TransactionTypes.Earn, 25_000, "cardco",
            "active-earn-0001", nowUtc.AddMonths(-2)));

        IReadOnlyList<Requalification.TierChange> changes =
            await Requalification.SweepAsync(members, transactions, nowUtc);

        Assert.Empty(changes);
        MemberDocument member = await members.Find(m => m.Id == "m-active").FirstAsync();
        Assert.Equal(25_000, member.QualifyingPoints);
    }

    [Fact]
    public async Task Sweep_recomputes_points_but_never_the_tier_of_an_osprey_invitee()
    {
        DateTime nowUtc = DateTime.UtcNow;
        await members.InsertOneAsync(new MemberDocument(
            "m-osprey", "Invited Member", "osprey@example.com", nowUtc.AddMonths(-30), 25_000, 25_000,
            IsOspreyInvited: true));
        await transactions.InsertOneAsync(new PointsTransactionDocument(
            "osprey-earn", "m-osprey", TransactionTypes.Earn, 25_000, "cardco",
            "osprey-earn-0001", nowUtc.AddMonths(-13)));

        IReadOnlyList<Requalification.TierChange> changes =
            await Requalification.SweepAsync(members, transactions, nowUtc);

        Assert.Empty(changes); // the invitation flag wins — OSPREY never moves on points
        MemberDocument member = await members.Find(m => m.Id == "m-osprey").FirstAsync();
        Assert.Equal(0, member.QualifyingPoints); // but the window projection stays honest
    }

    [Fact]
    public async Task Sweep_corrects_an_undercounted_member_upward()
    {
        DateTime nowUtc = DateTime.UtcNow;
        await members.InsertOneAsync(new MemberDocument(
            "m-drift", "Drifted Member", "drift@example.com", nowUtc.AddMonths(-6), 0, 25_000));
        await transactions.InsertOneAsync(new PointsTransactionDocument(
            "drift-earn", "m-drift", TransactionTypes.Earn, 25_000, "cardco",
            "drift-earn-0001", nowUtc.AddMonths(-1)));

        IReadOnlyList<Requalification.TierChange> changes =
            await Requalification.SweepAsync(members, transactions, nowUtc);

        MemberDocument member = await members.Find(m => m.Id == "m-drift").FirstAsync();
        Assert.Equal(25_000, member.QualifyingPoints);
        Requalification.TierChange change = Assert.Single(changes);
        Assert.Equal(Tiers.Tier.Member, change.PreviousTier);
        Assert.Equal(Tiers.Tier.Silver, change.NewTier);
    }
}
