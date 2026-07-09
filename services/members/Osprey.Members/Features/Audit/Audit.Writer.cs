using MongoDB.Driver;
using Osprey.Members.Storage;

// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

/// <summary>
/// Append-only writer for the privileged-action audit trail (ADR-0017). The only writer
/// of <see cref="AuditLogDocument"/> — it inserts, and never updates or deletes.
///
/// <para>Audit is an EDGE concern: the admin handlers stay on their happy path and hand
/// the writer a fully-formed <see cref="Entry"/>. A failed audit write is not silently
/// swallowed — it bubbles like any other Mongo failure — but the privileged mutation it
/// records has already committed, matching the projection-gap trade-off accepted elsewhere
/// (ADR-0002/0003) for the demo.</para>
/// </summary>
public static partial class Audit
{
    /// <summary>What the caller wants recorded — actor + correlation are supplied by the edge.</summary>
    public sealed record Entry(
        string Actor,
        string Action,
        string TargetMemberId,
        IReadOnlyDictionary<string, string> Details,
        string CorrelationId);

    public sealed class Writer(IMongoCollection<AuditLogDocument> audit)
    {
        private const int MongoTimeoutSeconds = 5;

        public async Task WriteAsync(Entry entry, CancellationToken ct = default)
        {
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromSeconds(MongoTimeoutSeconds)); // a hung Mongo must not hang the caller

            var document = new AuditLogDocument(
                Guid.NewGuid().ToString("N"),
                entry.Actor,
                entry.Action,
                entry.TargetMemberId,
                entry.Details,
                entry.CorrelationId,
                DateTime.UtcNow);

            await audit.InsertOneAsync(document, options: null, cts.Token); // insert-only: never Update/Delete
        }
    }
}
