using MongoDB.Driver;
using Osprey.Members.Storage;

// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class GetMemberProfile
{
    public sealed class Handler(IMongoCollection<MemberDocument> members)
    {
        private const int MongoTimeoutSeconds = 5;

        public async Task<Response?> Handle(string id, CancellationToken ct = default)
        {
            // Happy path: the endpoint pipeline (Validation.Check) has already rejected a malformed id.
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromSeconds(MongoTimeoutSeconds)); // bound the lookup — fail fast if Mongo is down
            MemberDocument? document = await members
                .Find(m => m.Id == id)
                .FirstOrDefaultAsync(cts.Token);

            return document is null ? null : ToResponse(document);
        }
    }
}
