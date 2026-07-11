using Microsoft.Extensions.Logging.Abstractions;
using MongoDB.Driver;
using Osprey.Members.Storage;
using Testcontainers.MongoDb;
using Xunit;

namespace Osprey.Members.Tests;

/// <summary>
/// Migrations run once per database, recorded in a `migrations` collection keyed by the
/// migration id. Every migration body must itself be idempotent — two pods racing at
/// startup may both apply before one records the marker — so run-once is an optimization
/// and an audit trail, not the safety mechanism.
/// </summary>
public sealed class MigrationsTests : IAsyncLifetime
{
    private readonly MongoDbContainer mongo = new MongoDbBuilder().WithImage("mongo:7").Build();
    private IMongoDatabase db = null!;

    public async Task InitializeAsync()
    {
        await mongo.StartAsync();
        db = new MongoClient(mongo.GetConnectionString()).GetDatabase("osprey");
    }

    public Task DisposeAsync() => mongo.DisposeAsync().AsTask();

    [Fact]
    public async Task Applies_each_migration_once_and_records_the_marker()
    {
        var members = db.GetCollection<MemberDocument>("members");
        var transactions = db.GetCollection<PointsTransactionDocument>("transactions");
        DateTime nowUtc = DateTime.UtcNow;
        // A stale phase-1 member: all-time qualifying points, but the only earn aged out.
        await members.InsertOneAsync(new MemberDocument(
            "m-stale", "Stale Member", "stale@example.com", nowUtc.AddMonths(-30), 25_000, 25_000));
        await transactions.InsertOneAsync(new PointsTransactionDocument(
            "stale-earn", "m-stale", TransactionTypes.Earn, 25_000, "cardco",
            "stale-earn-0001", nowUtc.AddMonths(-13)));

        await Migrations.RunAsync(db, NullLogger.Instance);

        MemberDocument member = await members.Find(m => m.Id == "m-stale").FirstAsync();
        Assert.Equal(0, member.QualifyingPoints);
        Assert.Equal(1, await db.GetCollection<Migrations.MigrationDocument>("migrations")
            .CountDocumentsAsync(m => m.Id == "001-recompute-qualifying-points"));

        // Tamper with the projection, run again: the marker stops a re-apply.
        await members.UpdateOneAsync(m => m.Id == "m-stale",
            Builders<MemberDocument>.Update.Set(m => m.QualifyingPoints, 25_000));

        await Migrations.RunAsync(db, NullLogger.Instance);

        member = await members.Find(m => m.Id == "m-stale").FirstAsync();
        Assert.Equal(25_000, member.QualifyingPoints);
    }
}
