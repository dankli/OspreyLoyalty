using MongoDB.Driver;
using Osprey.Members.Features;
using Osprey.Members.Storage;
using Testcontainers.MongoDb;
using Xunit;

namespace Osprey.Members.Tests;

/// <summary>
/// Booking a trip with points is a burn like any redemption: the gateway computes the
/// price server-side (routeSearch → points estimate) and this slice applies the same
/// atomic conditional decrement + idempotent-retry arbiter as Redeem (ADR-0003), with
/// the route in the ledger source ("trip:ARN-JFK").
/// </summary>
public sealed class RedeemTripTests : IAsyncLifetime
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
            "m-1", "Test Member", "t@example.com", DateTime.UtcNow, 20_000, 20_000));
    }

    public Task DisposeAsync() => mongo.DisposeAsync().AsTask();

    [Fact]
    public async Task Books_a_trip_and_burns_the_points_with_the_route_as_source()
    {
        var handler = new RedeemTrip.Handler(members, transactions);

        RedeemTrip.Outcome outcome = await handler.Handle("m-1",
            new RedeemTrip.Request("ARN", "JFK", 12_000, "trip-key-0001"));

        Assert.Equal(RedeemTrip.Status.Ok, outcome.Status);
        Assert.Equal(12_000, outcome.Response!.PointsSpent);
        Assert.Equal(8_000, outcome.Response.SpendablePoints);
        Assert.False(outcome.Response.AlreadyApplied);
        PointsTransactionDocument entry = await transactions
            .Find(t => t.IdempotencyKey == "trip-key-0001").FirstAsync();
        Assert.Equal(TransactionTypes.Burn, entry.Type);
        Assert.Equal(-12_000, entry.Points);
        Assert.Equal("trip:ARN-JFK", entry.Source);
    }

    [Fact]
    public async Task Retry_with_the_same_key_spends_nothing_new()
    {
        var handler = new RedeemTrip.Handler(members, transactions);
        var request = new RedeemTrip.Request("ARN", "JFK", 12_000, "trip-key-0002");

        RedeemTrip.Outcome first = await handler.Handle("m-1", request);
        RedeemTrip.Outcome second = await handler.Handle("m-1", request);

        Assert.Equal(RedeemTrip.Status.Ok, second.Status);
        Assert.True(second.Response!.AlreadyApplied);
        Assert.Equal(0, second.Response.PointsSpent);
        Assert.Equal(first.Response!.SpendablePoints, second.Response.SpendablePoints);
        Assert.Equal(1, await transactions.CountDocumentsAsync(t => t.IdempotencyKey == "trip-key-0002"));
    }

    [Fact]
    public async Task Insufficient_balance_is_a_value_not_a_throw()
    {
        var handler = new RedeemTrip.Handler(members, transactions);

        RedeemTrip.Outcome outcome = await handler.Handle("m-1",
            new RedeemTrip.Request("ARN", "SYD", 999_999, "trip-key-0003"));

        Assert.Equal(RedeemTrip.Status.InsufficientPoints, outcome.Status);
        MemberDocument member = await members.Find(m => m.Id == "m-1").FirstAsync();
        Assert.Equal(20_000, member.SpendablePoints); // untouched
    }

    [Fact]
    public async Task Unknown_member_is_told_apart_from_insufficient()
    {
        var handler = new RedeemTrip.Handler(members, transactions);

        RedeemTrip.Outcome outcome = await handler.Handle("ghost",
            new RedeemTrip.Request("ARN", "JFK", 100, "trip-key-0004"));

        Assert.Equal(RedeemTrip.Status.UnknownMember, outcome.Status);
    }

    [Theory]
    [InlineData("AR", "JFK")]
    [InlineData("ARNX", "JFK")]
    [InlineData("ARN", "jfk")]
    public void Validation_rejects_non_iata_airport_codes(string from, string to)
    {
        ValidationError? error = RedeemTrip.Validation.Check(
            "m-1", new RedeemTrip.Request(from, to, 100, "trip-key-0005"));

        Assert.NotNull(error);
        Assert.Equal("trip_airport_invalid", error.Key);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-5)]
    [InlineData(1_000_001)]
    public void Validation_rejects_out_of_bounds_points(int points)
    {
        ValidationError? error = RedeemTrip.Validation.Check(
            "m-1", new RedeemTrip.Request("ARN", "JFK", points, "trip-key-0006"));

        Assert.NotNull(error);
        Assert.Equal("trip_points_invalid", error.Key);
    }
}
