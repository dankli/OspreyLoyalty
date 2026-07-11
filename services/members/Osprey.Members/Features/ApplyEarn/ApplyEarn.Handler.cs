using MongoDB.Driver;
using Osprey.Members.Storage;

// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class ApplyEarn
{
    public sealed class Handler(
        IMongoCollection<MemberDocument> members,
        IMongoCollection<PointsTransactionDocument> transactions,
        Outbox.Writer outbox)
    {
        private const int MongoTimeoutSeconds = 5;
        private const int MaxWindowTransactions = 10_000; // bound the recompute read; a demo member never gets near this

        public async Task<Result> Handle(EarnEvent earn, CancellationToken ct = default)
        {
            // Happy path: the consumer pipeline (Validation.Check) has already dead-lettered a
            // malformed earn before we get here. A genuinely unknown member is still an integrity
            // fault below — thrown, caught by the consumer, and dead-lettered as poison.
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromSeconds(MongoTimeoutSeconds)); // a hung Mongo must not stall the consumer loop

            MemberDocument member = await members.Find(m => m.Id == earn.MemberId).FirstOrDefaultAsync(cts.Token)
                ?? throw new ArgumentException($"Member '{earn.MemberId}' does not exist.");

            int points = PointsFor(earn.Amount, earn.Rate);
            var entry = new PointsTransactionDocument(
                Guid.NewGuid().ToString("N"), earn.MemberId, TransactionTypes.Earn,
                points, earn.PartnerId, earn.IdempotencyKey, earn.OccurredAtUtc);

            try
            {
                // Ledger first: the unique index on IdempotencyKey is the idempotency arbiter (ADR-0002).
                await transactions.InsertOneAsync(entry, options: null, cts.Token);
            }
            catch (MongoWriteException ex) when (ex.WriteError.Category == ServerErrorCategory.DuplicateKey)
            {
                Tiers.Tier current = Tiers.Effective(member.QualifyingPoints, member.IsOspreyInvited);
                return new Result(AlreadyApplied: true, Points: 0, member.QualifyingPoints, current.ToString().ToUpperInvariant());
            }

            DateTime nowUtc = DateTime.UtcNow;
            DateTime windowStart = nowUtc.AddMonths(-Tiers.QualifyingWindowMonths);
            List<PointsTransactionDocument> window = await transactions
                .Find(t => t.MemberId == earn.MemberId && t.OccurredAtUtc > windowStart)
                .Limit(MaxWindowTransactions)
                .ToListAsync(cts.Token);

            int qualifying = Tiers.QualifyingPoints(window.Select(t => (t.OccurredAtUtc, t.Points)), nowUtc);

            await members.UpdateOneAsync(m => m.Id == earn.MemberId,
                Builders<MemberDocument>.Update
                    .Set(m => m.QualifyingPoints, qualifying)
                    .Inc(m => m.SpendablePoints, points),
                options: null, cts.Token);

            Tiers.Tier tier = Tiers.Effective(qualifying, member.IsOspreyInvited);
            BusinessMetrics.PointsEarned.Inc(points);

            // Tier movement becomes a domain event via the outbox (ADR-0024). The event id is
            // derived from the ledger entry that caused the change, so a redelivered earn (which
            // never gets this far — the duplicate rail returned above) or a crashed retry that
            // DID insert the entry writes the same event id and dedups on the outbox primary key.
            Tiers.Tier before = Tiers.Effective(member.QualifyingPoints, member.IsOspreyInvited);
            if (before != tier)
            {
                BusinessMetrics.TierChanges.WithLabels(tier > before ? "up" : "down").Inc();
                await outbox.WriteAsync(new Outbox.TierChangedEvent(
                    $"tier-{earn.MemberId}-{tier.ToString().ToUpperInvariant()}-{entry.Id}",
                    earn.MemberId,
                    before.ToString().ToUpperInvariant(),
                    tier.ToString().ToUpperInvariant(),
                    nowUtc,
                    earn.CorrelationId), cts.Token);
            }

            return new Result(AlreadyApplied: false, points, qualifying, tier.ToString().ToUpperInvariant());
        }
    }
}
