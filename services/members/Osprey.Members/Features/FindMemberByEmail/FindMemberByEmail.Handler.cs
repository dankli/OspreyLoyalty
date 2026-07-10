using MongoDB.Driver;
using Osprey.Members.Storage;

// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class FindMemberByEmail
{
    public sealed class Handler(IMongoCollection<MemberDocument> members)
    {
        private const int MongoTimeoutSeconds = 5;

        public async Task<Response?> Handle(string email, CancellationToken ct = default)
        {
            // Happy path: the endpoint pipeline (Validation.Check) has already rejected a malformed email.
            // Enrollment stores emails trimmed + lowercased — normalize the same way so
            // an admin typing any casing still finds the member.
            string normalized = email.Trim().ToLowerInvariant();

            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromSeconds(MongoTimeoutSeconds)); // a hung Mongo must not hang the request
            MemberDocument? document = await members
                .Find(m => m.Email == normalized)
                .FirstOrDefaultAsync(cts.Token);

            return document is null ? null : ToResponse(document);
        }
    }
}
