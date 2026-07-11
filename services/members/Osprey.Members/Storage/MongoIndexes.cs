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

    /// <summary>NON-unique: enrollment does not enforce distinct emails, so the lookup index must not either.</summary>
    public static async Task EnsureAsync(IMongoCollection<MemberDocument> members, CancellationToken ct = default)
    {
        await members.Indexes.CreateOneAsync(
            new CreateIndexModel<MemberDocument>(
                Builders<MemberDocument>.IndexKeys.Ascending(m => m.Email),
                new CreateIndexOptions { Name = "ix_email" }),
            cancellationToken: ct);
    }

    /// <summary>The unique idempotency index is the retry arbiter, exactly like the ledger's (ADR-0002).</summary>
    public static async Task EnsureAsync(IMongoCollection<BenefitActivationDocument> activations, CancellationToken ct = default)
    {
        await activations.Indexes.CreateManyAsync(
        [
            new CreateIndexModel<BenefitActivationDocument>(
                Builders<BenefitActivationDocument>.IndexKeys.Ascending(a => a.IdempotencyKey),
                new CreateIndexOptions { Unique = true, Name = "ux_idempotency_key" }),
            new CreateIndexModel<BenefitActivationDocument>(
                Builders<BenefitActivationDocument>.IndexKeys.Ascending(a => a.MemberId).Descending(a => a.ActivatedAtUtc),
                new CreateIndexOptions { Name = "ix_member_activated" }),
        ], cancellationToken: ct);
    }

    /// <summary>Audit trail lookups are always "what happened to member X, newest first" (ADR-0017).</summary>
    public static async Task EnsureAsync(IMongoCollection<AuditLogDocument> audit, CancellationToken ct = default)
    {
        await audit.Indexes.CreateOneAsync(
            new CreateIndexModel<AuditLogDocument>(
                Builders<AuditLogDocument>.IndexKeys.Ascending(a => a.TargetMemberId).Descending(a => a.OccurredAtUtc),
                new CreateIndexOptions { Name = "ix_target_occurred" }),
            cancellationToken: ct);
    }
}
