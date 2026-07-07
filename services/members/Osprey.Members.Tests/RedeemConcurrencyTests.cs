using MongoDB.Driver;
using Osprey.Members.Features;
using Osprey.Members.Storage;
using Testcontainers.MongoDb;
using Xunit;

namespace Osprey.Members.Tests;

/// <summary>
/// Spec rule 4 showcase: concurrent redemptions must not double-spend. The conditional
/// decrement (ADR-0003) is the arbiter — ten simultaneous attempts against a balance
/// that covers exactly one must yield exactly one success and one burn entry.
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

        Task<Outcome>[] attempts = Enumerable.Range(0, 10).Select(i => AttemptAsync(handler, i)).ToArray();
        Outcome[] outcomes = await Task.WhenAll(attempts);

        Assert.Equal(1, outcomes.Count(o => o == Outcome.Redeemed));
        Assert.Equal(9, outcomes.Count(o => o == Outcome.Insufficient));

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

        Redeem.Response?[] responses = await Task.WhenAll(
            Enumerable.Range(0, 8).Select(_ => AttemptSameKeyAsync(handler, request)));

        Assert.Equal(1, responses.Count(r => r is { AlreadyApplied: false }));
        Assert.Equal(1, await transactions.CountDocumentsAsync(t => t.IdempotencyKey == "same-key-00000001"));
        MemberDocument member = await members.Find(m => m.Id == "m-1").FirstAsync();
        Assert.Equal(15_000, member.SpendablePoints); // 20 000 - one gift card; losers compensated
    }

    [Fact]
    public async Task Exact_balance_redeems_to_zero()
    {
        var handler = new Redeem.Handler(members, transactions);

        // 20 000 - 15 000 leaves a balance that exactly equals the gift card cost.
        Redeem.Response lounge = (await handler.Handle("m-1", new Redeem.Request("lounge-pass", "exact-key-0001")))!;
        Assert.Equal(5_000, lounge.SpendablePoints);

        // Boundary: balance == cost must pass the >= filter, not be refused.
        Redeem.Response giftcard = (await handler.Handle("m-1", new Redeem.Request("cardco-giftcard", "exact-key-0002")))!;
        Assert.False(giftcard.AlreadyApplied);
        Assert.Equal(0, giftcard.SpendablePoints);

        // And at zero, any further redemption is refused without touching the balance.
        await Assert.ThrowsAsync<ArgumentException>(
            () => handler.Handle("m-1", new Redeem.Request("cardco-giftcard", "exact-key-0003")));
        MemberDocument member = await members.Find(m => m.Id == "m-1").FirstAsync();
        Assert.Equal(0, member.SpendablePoints);
    }

    [Fact]
    public async Task Retried_redemption_spends_once()
    {
        var handler = new Redeem.Handler(members, transactions);
        var request = new Redeem.Request("lounge-pass", "retry-key-0001");

        Redeem.Response first = (await handler.Handle("m-1", request))!;
        Redeem.Response second = (await handler.Handle("m-1", request))!;

        Assert.False(first.AlreadyApplied);
        Assert.Equal(15_000, first.PointsSpent);
        Assert.True(second.AlreadyApplied);
        Assert.Equal(0, second.PointsSpent);
        Assert.Equal(5_000, second.SpendablePoints);
        Assert.Equal(1, await transactions.CountDocumentsAsync(t => t.IdempotencyKey == "retry-key-0001"));
    }

    [Fact]
    public async Task Unknown_member_is_null_and_writes_nothing()
    {
        var handler = new Redeem.Handler(members, transactions);
        Redeem.Response? response = await handler.Handle("ghost", new Redeem.Request("lounge-pass", "ghost-key-0001"));
        Assert.Null(response);
        Assert.Equal(0, await transactions.CountDocumentsAsync(t => t.IdempotencyKey == "ghost-key-0001"));
    }

    private enum Outcome { Redeemed, Insufficient }

    private static async Task<Redeem.Response?> AttemptSameKeyAsync(Redeem.Handler handler, Redeem.Request request)
    {
        try
        {
            return await handler.Handle("m-1", request);
        }
        catch (ArgumentException)
        {
            // Transient edge: enough simultaneous decrements can momentarily drain the
            // balance before the losers compensate, refusing a late attempt. It never
            // decremented, so it cannot skew the winner count or the final balance.
            return null;
        }
    }

    private static async Task<Outcome> AttemptAsync(Redeem.Handler handler, int attempt)
    {
        try
        {
            Redeem.Response? response = await handler.Handle("m-1",
                new Redeem.Request("lounge-pass", $"concurrent-key-{attempt:D4}"));
            return response!.AlreadyApplied ? Outcome.Insufficient : Outcome.Redeemed;
        }
        catch (ArgumentException)
        {
            return Outcome.Insufficient;
        }
    }
}
