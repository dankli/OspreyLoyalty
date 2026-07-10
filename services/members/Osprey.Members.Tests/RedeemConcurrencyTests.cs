using MongoDB.Driver;
using Osprey.Members.Features;
using Osprey.Members.Storage;
using Testcontainers.MongoDb;
using Xunit;

namespace Osprey.Members.Tests;

/// <summary>
/// Spec rule 4 showcase: concurrent redemptions must not double-spend. The conditional
/// decrement (ADR-0003) is the arbiter — ten simultaneous attempts against a balance
/// that covers exactly one must yield exactly one success and one burn entry. Expected
/// sad paths (insufficient, unknown member/reward) come back as a Redeem.Outcome value,
/// never as a thrown exception.
/// </summary>
public sealed class RedeemConcurrencyTests : IAsyncLifetime
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
        await members.InsertOneAsync(new MemberDocument(
            "m-1", "Test Member", "t@example.com", DateTime.UtcNow, 0, SpendablePoints: 20_000));
    }

    public Task DisposeAsync() => mongo.DisposeAsync().AsTask();

    [Fact]
    public async Task Concurrent_redemptions_never_overdraw()
    {
        var handler = new Redeem.Handler(members, transactions);

        Task<Redeem.Outcome>[] attempts = Enumerable.Range(0, 10)
            .Select(i => handler.Handle("m-1", new Redeem.Request("lounge-pass", $"concurrent-key-{i:D4}")))
            .ToArray();
        Redeem.Outcome[] outcomes = await Task.WhenAll(attempts);

        Assert.Equal(1, outcomes.Count(o => o.Status == Redeem.Status.Ok));
        Assert.Equal(9, outcomes.Count(o => o.Status == Redeem.Status.InsufficientPoints));

        MemberDocument member = await members.Find(m => m.Id == "m-1").FirstAsync();
        Assert.Equal(5_000, member.SpendablePoints); // 20 000 - one lounge pass, never less

        long burns = await transactions.CountDocumentsAsync(t => t.MemberId == "m-1");
        Assert.Equal(1, burns);
    }

    [Fact]
    public async Task Concurrent_same_key_redemptions_burn_once_and_compensate_losers()
    {
        var handler = new Redeem.Handler(members, transactions);
        // Ample balance: every attempt passes the conditional decrement; the unique
        // index picks one winner and every loser must give its decrement back.
        var request = new Redeem.Request("cardco-giftcard", "same-key-00000001"); // 5 000 cost vs 20 000 balance

        Redeem.Outcome[] outcomes = await Task.WhenAll(
            Enumerable.Range(0, 8).Select(_ => handler.Handle("m-1", request)));

        Assert.Equal(1, outcomes.Count(o => o.Status == Redeem.Status.Ok && o.Response is { AlreadyApplied: false }));
        Assert.Equal(1, await transactions.CountDocumentsAsync(t => t.IdempotencyKey == "same-key-00000001"));
        MemberDocument member = await members.Find(m => m.Id == "m-1").FirstAsync();
        Assert.Equal(15_000, member.SpendablePoints); // 20 000 - one gift card; losers compensated
    }

    [Fact]
    public async Task Exact_balance_redeems_to_zero()
    {
        var handler = new Redeem.Handler(members, transactions);

        // 20 000 - 15 000 leaves a balance that exactly equals the gift card cost.
        Redeem.Outcome lounge = await handler.Handle("m-1", new Redeem.Request("lounge-pass", "exact-key-0001"));
        Assert.Equal(Redeem.Status.Ok, lounge.Status);
        Assert.Equal(5_000, lounge.Response!.SpendablePoints);

        // Boundary: balance == cost must pass the >= filter, not be refused.
        Redeem.Outcome giftcard = await handler.Handle("m-1", new Redeem.Request("cardco-giftcard", "exact-key-0002"));
        Assert.Equal(Redeem.Status.Ok, giftcard.Status);
        Assert.False(giftcard.Response!.AlreadyApplied);
        Assert.Equal(0, giftcard.Response.SpendablePoints);

        // And at zero, any further redemption is refused without touching the balance.
        Redeem.Outcome refused = await handler.Handle("m-1", new Redeem.Request("cardco-giftcard", "exact-key-0003"));
        Assert.Equal(Redeem.Status.InsufficientPoints, refused.Status);
        MemberDocument member = await members.Find(m => m.Id == "m-1").FirstAsync();
        Assert.Equal(0, member.SpendablePoints);
    }

    [Fact]
    public async Task Retried_redemption_spends_once()
    {
        var handler = new Redeem.Handler(members, transactions);
        var request = new Redeem.Request("lounge-pass", "retry-key-0001");

        Redeem.Outcome first = await handler.Handle("m-1", request);
        Redeem.Outcome second = await handler.Handle("m-1", request);

        Assert.Equal(Redeem.Status.Ok, first.Status);
        Assert.False(first.Response!.AlreadyApplied);
        Assert.Equal(15_000, first.Response.PointsSpent);
        Assert.Equal(Redeem.Status.Ok, second.Status);
        Assert.True(second.Response!.AlreadyApplied);
        Assert.Equal(0, second.Response.PointsSpent);
        Assert.Equal(5_000, second.Response.SpendablePoints);
        Assert.Equal(1, await transactions.CountDocumentsAsync(t => t.IdempotencyKey == "retry-key-0001"));
    }

    [Fact]
    public async Task Unknown_member_is_reported_and_writes_nothing()
    {
        var handler = new Redeem.Handler(members, transactions);
        Redeem.Outcome outcome = await handler.Handle("ghost", new Redeem.Request("lounge-pass", "ghost-key-0001"));
        Assert.Equal(Redeem.Status.UnknownMember, outcome.Status);
        Assert.Null(outcome.Response);
        Assert.Equal(0, await transactions.CountDocumentsAsync(t => t.IdempotencyKey == "ghost-key-0001"));
    }

    [Fact]
    public async Task Unknown_reward_is_reported()
    {
        var handler = new Redeem.Handler(members, transactions);
        Redeem.Outcome outcome = await handler.Handle("m-1", new Redeem.Request("no-such-reward", "reward-key-0001"));
        Assert.Equal(Redeem.Status.UnknownReward, outcome.Status);
    }
}
