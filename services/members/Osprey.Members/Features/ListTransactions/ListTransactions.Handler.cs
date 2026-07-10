using MongoDB.Driver;
using Osprey.Members.Storage;

// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class ListTransactions
{
    public sealed class Handler(IMongoCollection<PointsTransactionDocument> transactions)
    {
        private const int MongoTimeoutSeconds = 5;
        internal const int PageSize = 20; // bounded page size per spec §4.1 — no caller-chosen sizes

        public async Task<Response> Handle(string memberId, int page, CancellationToken ct = default)
        {
            // Happy path: the endpoint pipeline (Validation.Check) has already rejected a bad id/page.
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromSeconds(MongoTimeoutSeconds)); // bound the read

            // Fetch one extra row: cheaper than a count for a HasMore flag.
            List<PointsTransactionDocument> rows = await transactions
                .Find(t => t.MemberId == memberId)
                .SortByDescending(t => t.OccurredAtUtc)
                .Skip(page * PageSize)
                .Limit(PageSize + 1)
                .ToListAsync(cts.Token);

            bool hasMore = rows.Count > PageSize;
            return new Response(rows.Take(PageSize).Select(ToItem).ToList(), page, hasMore);
        }
    }
}
