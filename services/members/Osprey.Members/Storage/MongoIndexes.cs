using MongoDB.Driver;

namespace Osprey.Members.Storage;

/// <summary>Declared idempotently at startup — CreateMany on existing identical indexes is a no-op.</summary>
public static class MongoIndexes
{
    public static async Task EnsureAsync(IMongoCollection<PointsTransactionDocument> transactions, CancellationToken ct = default)
    {
        await transactions.Indexes.CreateManyAsync(
        [
            new CreateIndexModel<PointsTransactionDocument>(
                Builders<PointsTransactionDocument>.IndexKeys.Ascending(t => t.IdempotencyKey),
                new CreateIndexOptions { Unique = true, Name = "ux_idempotency_key" }),
            new CreateIndexModel<PointsTransactionDocument>(
                Builders<PointsTransactionDocument>.IndexKeys.Ascending(t => t.MemberId).Descending(t => t.OccurredAtUtc),
                new CreateIndexOptions { Name = "ix_member_occurred" }),
        ], cancellationToken: ct);
    }
}
