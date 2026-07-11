using MongoDB.Driver;
using Osprey.Members.Storage;

// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class RedeemTrip
{
    public sealed class Handler(
        IMongoCollection<MemberDocument> members,
        IMongoCollection<PointsTransactionDocument> transactions)
    {
        private const int MongoTimeoutSeconds = 5;

        public async Task<Outcome> Handle(string memberId, Request request, CancellationToken ct = default)
        {
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromSeconds(MongoTimeoutSeconds)); // bound every hop below

            string source = $"trip:{request.FromIata}-{request.ToIata}";

            // Retry fast-path: this key already burned once — succeed without spending again.
            if (await transactions.Find(t => t.IdempotencyKey == request.IdempotencyKey).AnyAsync(cts.Token))
                return Outcome.Ok(await AlreadyAppliedResponse(request, memberId, cts.Token));

            // The concurrency arbiter (ADR-0003), same as Redeem: the balance check lives
            // INSIDE the filter, so two concurrent bookings can never both pass it.
            UpdateResult update = await members.UpdateOneAsync(
                m => m.Id == memberId && m.SpendablePoints >= request.Points,
                Builders<MemberDocument>.Update.Inc(m => m.SpendablePoints, -request.Points),
                options: null, cts.Token);

            if (update.ModifiedCount == 0)
            {
                bool exists = await members.Find(m => m.Id == memberId).AnyAsync(cts.Token);
                return exists ? Outcome.InsufficientPoints : Outcome.UnknownMember;
            }

            var entry = new PointsTransactionDocument(
                Guid.NewGuid().ToString("N"), memberId, TransactionTypes.Burn,
                -request.Points, source, request.IdempotencyKey, DateTime.UtcNow);
            try
            {
                await transactions.InsertOneAsync(entry, options: null, cts.Token);
            }
            catch (MongoWriteException ex) when (ex.WriteError.Category == ServerErrorCategory.DuplicateKey)
            {
                // Same key raced us past the fast-path: exactly one burn per key — give the points back.
                await members.UpdateOneAsync(m => m.Id == memberId,
                    Builders<MemberDocument>.Update.Inc(m => m.SpendablePoints, request.Points),
                    options: null, cts.Token);
                return Outcome.Ok(await AlreadyAppliedResponse(request, memberId, cts.Token));
            }

            MemberDocument member = await members.Find(m => m.Id == memberId).FirstAsync(cts.Token);
            return Outcome.Ok(new Response(
                request.FromIata, request.ToIata, request.Points, member.SpendablePoints, AlreadyApplied: false));
        }

        private async Task<Response> AlreadyAppliedResponse(Request request, string memberId, CancellationToken ct)
        {
            MemberDocument member = await members.Find(m => m.Id == memberId).FirstAsync(ct);
            return new Response(request.FromIata, request.ToIata, 0, member.SpendablePoints, AlreadyApplied: true);
        }
    }
}
