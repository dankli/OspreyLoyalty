using MongoDB.Driver;
using Osprey.Members.Storage;

// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class ActivateBenefit
{
    public sealed class Handler(
        IMongoCollection<MemberDocument> members,
        IMongoCollection<BenefitActivationDocument> activations)
    {
        private const int MongoTimeoutSeconds = 5;
        internal const int MaxListed = 100; // bound the per-member activations read

        public async Task<Outcome> Handle(string memberId, Request request, CancellationToken ct = default)
        {
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromSeconds(MongoTimeoutSeconds)); // bound every hop below

            // Retry fast-path: this key already activated once — return the ORIGINAL code.
            BenefitActivationDocument? existing = await activations
                .Find(a => a.IdempotencyKey == request.IdempotencyKey).FirstOrDefaultAsync(cts.Token);
            if (existing is not null)
                return Outcome.Ok(ToResponse(existing, alreadyApplied: true));

            MemberDocument? member = await members.Find(m => m.Id == memberId).FirstOrDefaultAsync(cts.Token);
            if (member is null)
                return Outcome.UnknownMember;

            // Entitlement is the member's CURRENT tier — display and activation share one source
            // of truth (Tiers.BenefitsFor), so what the dashboard shows is what can be activated.
            Tiers.Tier tier = Tiers.Effective(member.QualifyingPoints, member.IsOspreyInvited);
            if (!Tiers.BenefitsFor(tier).Contains(request.Benefit))
                return Outcome.NotEntitled;

            var document = new BenefitActivationDocument(
                Guid.NewGuid().ToString("N"), memberId, request.Benefit,
                NewCode(), request.IdempotencyKey, DateTime.UtcNow);
            try
            {
                await activations.InsertOneAsync(document, options: null, cts.Token);
            }
            catch (MongoWriteException ex) when (ex.WriteError.Category == ServerErrorCategory.DuplicateKey)
            {
                // Same key raced us past the fast-path — exactly one code per key.
                BenefitActivationDocument winner = await activations
                    .Find(a => a.IdempotencyKey == request.IdempotencyKey).FirstAsync(cts.Token);
                return Outcome.Ok(ToResponse(winner, alreadyApplied: true));
            }

            return Outcome.Ok(ToResponse(document, alreadyApplied: false));
        }

        public async Task<IReadOnlyList<Response>> List(string memberId, CancellationToken ct = default)
        {
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromSeconds(MongoTimeoutSeconds));

            List<BenefitActivationDocument> documents = await activations
                .Find(a => a.MemberId == memberId)
                .SortByDescending(a => a.ActivatedAtUtc)
                .Limit(MaxListed)
                .ToListAsync(cts.Token);
            return documents.Select(d => ToResponse(d, alreadyApplied: false)).ToList();
        }

        /// <summary>8 chars from an unambiguous alphabet (no 0/O/1/I) — readable at a counter.</summary>
        private static string NewCode()
        {
            const string alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
            return string.Concat(Guid.NewGuid().ToByteArray().Take(8)
                .Select(b => alphabet[b % alphabet.Length]));
        }
    }
}
