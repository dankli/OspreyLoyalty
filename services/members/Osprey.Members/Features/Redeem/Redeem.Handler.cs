using MongoDB.Driver;
using Osprey.Members.Storage;

// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class Redeem
{
    public sealed class Handler(
        IMongoCollection<MemberDocument> members,
        IMongoCollection<PointsTransactionDocument> transactions)
    {
        private const int MongoTimeoutSeconds = 5;

        public async Task<Outcome> Handle(string memberId, Request request, CancellationToken ct = default)
        {
            // Happy path: format already validated by the endpoint pipeline. Reward existence is a
            // precondition — resolve it and step onto the UnknownReward rail if it isn't in the catalogue.
            Rewards.Reward? reward = Rewards.ById(request.RewardId);
            if (reward is null)
                return Outcome.UnknownReward;

            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromSeconds(MongoTimeoutSeconds)); // bound every hop below

            // Retry fast-path: this key already burned once — succeed without spending again.
            if (await transactions.Find(t => t.IdempotencyKey == request.IdempotencyKey).AnyAsync(cts.Token))
                return Outcome.Ok(await AlreadyAppliedResponse(reward, memberId, cts.Token));

            // The concurrency arbiter (ADR-0003): one atomic conditional decrement.
            // The balance check lives INSIDE the filter, so two concurrent redemptions
            // can never both pass it — no overdraw, no double-spend, no lock.
            UpdateResult update = await members.UpdateOneAsync(
                m => m.Id == memberId && m.SpendablePoints >= reward.Cost,
                Builders<MemberDocument>.Update.Inc(m => m.SpendablePoints, -reward.Cost),
                options: null, cts.Token);

            if (update.ModifiedCount == 0)
            {
                // Two expected sad paths, told apart by existence — both are values, not throws.
                bool exists = await members.Find(m => m.Id == memberId).AnyAsync(cts.Token);
                return exists ? Outcome.InsufficientPoints : Outcome.UnknownMember;
            }

            var entry = new PointsTransactionDocument(
                Guid.NewGuid().ToString("N"), memberId, TransactionTypes.Burn,
                -reward.Cost, reward.Id, request.IdempotencyKey, DateTime.UtcNow);
            try
            {
                await transactions.InsertOneAsync(entry, options: null, cts.Token);
            }
            catch (MongoWriteException ex) when (ex.WriteError.Category == ServerErrorCategory.DuplicateKey)
            {
                // Same key raced us past the fast-path: exactly one burn per key — give the points back.
                await members.UpdateOneAsync(m => m.Id == memberId,
                    Builders<MemberDocument>.Update.Inc(m => m.SpendablePoints, reward.Cost),
                    options: null, cts.Token);
                return Outcome.Ok(await AlreadyAppliedResponse(reward, memberId, cts.Token));
            }

            MemberDocument member = await members.Find(m => m.Id == memberId).FirstAsync(cts.Token);
            return Outcome.Ok(new Response(reward.Id, reward.Cost, member.SpendablePoints, AlreadyApplied: false));
        }

        private async Task<Response> AlreadyAppliedResponse(Rewards.Reward reward, string memberId, CancellationToken ct)
        {
            MemberDocument member = await members.Find(m => m.Id == memberId).FirstAsync(ct);
            return new Response(reward.Id, 0, member.SpendablePoints, AlreadyApplied: true);
        }
    }
}
