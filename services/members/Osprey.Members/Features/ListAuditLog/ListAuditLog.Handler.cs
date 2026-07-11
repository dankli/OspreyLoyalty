using MongoDB.Driver;
using Osprey.Members.Storage;

// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class ListAuditLog
{
    public sealed class Handler(IMongoCollection<AuditLogDocument> audit)
    {
        private const int MongoTimeoutSeconds = 5;
        internal const int PageSize = 20; // same bounded page as the transactions list

        public async Task<Response> Handle(int page, CancellationToken ct = default)
        {
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromSeconds(MongoTimeoutSeconds)); // bound the read

            // Fetch one extra row: cheaper than a count for a HasMore flag.
            List<AuditLogDocument> rows = await audit
                .Find(FilterDefinition<AuditLogDocument>.Empty)
                .SortByDescending(a => a.OccurredAtUtc)
                .Skip(page * PageSize)
                .Limit(PageSize + 1)
                .ToListAsync(cts.Token);

            bool hasMore = rows.Count > PageSize;
            return new Response(rows.Take(PageSize).Select(ToItem).ToList(), page, hasMore);
        }
    }
}
