using MongoDB.Bson.Serialization.Attributes;
using MongoDB.Driver;
using Osprey.Members.Features;

namespace Osprey.Members.Storage;

/// <summary>
/// Versioned, run-once Mongo migrations, recorded in a `migrations` collection keyed by
/// migration id. Every migration body must itself be idempotent — two pods racing at
/// startup may both apply before one records the marker (apply first, then mark, so a
/// crash mid-apply reruns rather than silently skips). Run-once is an optimization and an
/// audit trail; the idempotent bodies are the safety mechanism.
/// </summary>
public static class Migrations
{
    public sealed record MigrationDocument([property: BsonId] string Id, DateTime AppliedAtUtc);

    private static readonly (string Id, Func<IMongoDatabase, CancellationToken, Task> Apply)[] All =
    [
        // Phase-1 members carry all-time qualifying points; recompute everyone against the
        // rolling window once at deploy so stale tiers correct immediately instead of on
        // the requalification sweep's first tick.
        ("001-recompute-qualifying-points", async (db, ct) =>
            await Requalification.SweepAsync(
                db.GetCollection<MemberDocument>("members"),
                db.GetCollection<PointsTransactionDocument>("transactions"),
                DateTime.UtcNow, ct)),
    ];

    public static async Task RunAsync(IMongoDatabase db, ILogger logger, CancellationToken ct = default)
    {
        IMongoCollection<MigrationDocument> applied = db.GetCollection<MigrationDocument>("migrations");
        foreach ((string id, Func<IMongoDatabase, CancellationToken, Task> apply) in All)
        {
            if (await applied.Find(m => m.Id == id).AnyAsync(ct)) continue;

            await apply(db, ct);
            try
            {
                await applied.InsertOneAsync(new MigrationDocument(id, DateTime.UtcNow), options: null, ct);
                logger.LogInformation("Migration {MigrationId} applied.", id);
            }
            catch (MongoWriteException ex) when (ex.WriteError.Category == ServerErrorCategory.DuplicateKey)
            {
                // Another pod finished first — both applies were idempotent, nothing to do.
            }
        }
    }
}
