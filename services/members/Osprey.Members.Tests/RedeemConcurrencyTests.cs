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
