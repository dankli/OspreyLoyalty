using MongoDB.Driver;
using Osprey.Members.Storage;

// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class EraseMember
{
    /// <summary>
    /// GDPR right-to-erasure: pseudonymize the member's PII, RETAIN the numeric ledger
    /// (ADR-0018). Name → "[erased]", Email → null, and an ErasedAtUtc marker is stamped.
    /// Id, points, IsOspreyInvited and JoinedAtUtc are kept — the account/ledger stays
    /// intact for accounting integrity and the resurrection guard.
    ///
    /// <para>Idempotent: erasing an already-erased member is a success no-op. Validates the
    /// member exists (returns null → 404 at the edge otherwise).</para>
    /// </summary>
    public sealed class Handler(
        IMongoCollection<MemberDocument> members,
        IMongoCollection<PointsTransactionDocument> transactions,
        Audit.Writer audit)
    {
        private const int MongoTimeoutSeconds = 5;
        internal const string ErasedName = "[erased]";

        /// <param name="caller">Who requested the erasure — actor + correlation from the edge (ADR-0017).</param>
        public async Task<Response?> Handle(string memberId, Audit.Caller.Context caller, CancellationToken ct = default)
        {
            Validation.RequireId(memberId);

            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromSeconds(MongoTimeoutSeconds)); // a hung Mongo must not hang the request

            MemberDocument? member = await members.Find(m => m.Id == memberId).FirstOrDefaultAsync(cts.Token);
            if (member is null)
                return null; // 404 at the edge — validate existence

            long retained = await transactions.CountDocumentsAsync(t => t.MemberId == memberId, options: null, cts.Token);

            // Idempotent: already erased → success no-op, no re-pseudonymize and no second audit
            // record (the trail stays idempotent too, matching the AdjustPoints retry convention).
            if (member.ErasedAtUtc is { } already)
                return new Response(memberId, already, (int)retained, AlreadyErased: true);

            DateTime erasedAt = DateTime.UtcNow;

            // Pseudonymize PII; keep Id/points/IsOspreyInvited/JoinedAtUtc. The ErasedAtUtc marker
            // is the resurrection guard: because EarnEvent carries no PII, a re-delivered earn only
            // updates points and never re-populates Name/Email — the marker makes the erasure durable.
            await members.UpdateOneAsync(
                m => m.Id == memberId,
                Builders<MemberDocument>.Update
                    .Set(m => m.Name, ErasedName)
                    .Set(m => m.Email, null)
                    .Set(m => m.ErasedAtUtc, erasedAt),
                options: null, cts.Token);

            // Defensive: adjustment "source" free-text (admin reasons) could hold PII. The ledger is
            // otherwise immutable, but erasure is the one legitimate reason to redact that one field
            // in place — points and every other field are untouched, preserving the numeric ledger.
            await transactions.UpdateManyAsync(
                t => t.MemberId == memberId && t.Type == TransactionTypes.Adjustment,
                Builders<PointsTransactionDocument>.Update.Set(t => t.Source, $"admin: {ErasedName}"),
                options: null, cts.Token);

            await audit.WriteAsync(new Audit.Entry(
                caller.Actor, AuditActions.EraseMember, memberId,
                new Dictionary<string, string> { ["transactionsRetained"] = retained.ToString() },
                caller.CorrelationId), cts.Token);

            return new Response(memberId, erasedAt, (int)retained, AlreadyErased: false);
        }
    }
}
