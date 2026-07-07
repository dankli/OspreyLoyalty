using MongoDB.Driver;
using Osprey.Members.Storage;

// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class AdjustPoints
{
    public sealed class Handler(
        IMongoCollection<MemberDocument> members,
        IMongoCollection<PointsTransactionDocument> transactions)
    {
        private const int MongoTimeoutSeconds = 5;

        public async Task<Response?> Handle(string memberId, Request request, CancellationToken ct = default)
        {
            Validation.Require(memberId, request);
            string reason = request.Reason.Trim();

            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromSeconds(MongoTimeoutSeconds)); // bound every hop below

            if (!await members.Find(m => m.Id == memberId).AnyAsync(cts.Token))
                return null; // 404 at the edge

            // Retry fast-path: this key already adjusted once — succeed without changing anything again.
            if (await transactions.Find(t => t.IdempotencyKey == request.IdempotencyKey).AnyAsync(cts.Token))
                return await AlreadyAppliedResponse(memberId, cts.Token);

            var entry = new PointsTransactionDocument(
                Guid.NewGuid().ToString("N"), memberId, TransactionTypes.Adjustment,
                request.Points, $"admin: {reason}", request.IdempotencyKey, DateTime.UtcNow);

            // The two branches deliberately order balance-write vs ledger-write differently:
            // - NEGATIVE points must run the conditional decrement guard FIRST (like Redeem,
            //   ADR-0003) so a concurrent adjustment can never overdraw — only after the
            //   guard passes may the ledger entry exist.
            // - POSITIVE points cannot overdraw, so they insert the ledger entry FIRST (like
            //   ApplyEarn, ADR-0002) and let the unique idempotency index dedup before any
            //   balance change — no compensation needed on the happy dedup path.
            if (request.Points < 0)
            {
                UpdateResult update = await members.UpdateOneAsync(
                    m => m.Id == memberId && m.SpendablePoints >= -request.Points,
                    Builders<MemberDocument>.Update.Inc(m => m.SpendablePoints, request.Points),
                    options: null, cts.Token);

                if (update.ModifiedCount == 0)
                    throw new ArgumentException("Adjustment would overdraw the balance.");

                try
                {
                    await transactions.InsertOneAsync(entry, options: null, cts.Token);
                }
                catch (MongoWriteException ex) when (ex.WriteError.Category == ServerErrorCategory.DuplicateKey)
                {
                    // Same key raced us past the fast-path: exactly one adjustment per key — give the points back.
                    await members.UpdateOneAsync(m => m.Id == memberId,
                        Builders<MemberDocument>.Update.Inc(m => m.SpendablePoints, -request.Points),
                        options: null, cts.Token);
                    return await AlreadyAppliedResponse(memberId, cts.Token);
                }
            }
            else
            {
                try
                {
                    await transactions.InsertOneAsync(entry, options: null, cts.Token);
                }
                catch (MongoWriteException ex) when (ex.WriteError.Category == ServerErrorCategory.DuplicateKey)
                {
                    return await AlreadyAppliedResponse(memberId, cts.Token);
                }

                await members.UpdateOneAsync(m => m.Id == memberId,
                    Builders<MemberDocument>.Update.Inc(m => m.SpendablePoints, request.Points),
                    options: null, cts.Token);
            }

            MemberDocument member = await members.Find(m => m.Id == memberId).FirstAsync(cts.Token);
            return new Response(request.Points, member.SpendablePoints, AlreadyApplied: false);
        }

        private async Task<Response> AlreadyAppliedResponse(string memberId, CancellationToken ct)
        {
            MemberDocument member = await members.Find(m => m.Id == memberId).FirstAsync(ct);
            return new Response(0, member.SpendablePoints, AlreadyApplied: true);
        }
    }
}
