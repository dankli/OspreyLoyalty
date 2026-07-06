using MongoDB.Driver;
using Osprey.Members.Storage;

// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class EnrollMember
{
    public sealed class Handler(IMongoCollection<MemberDocument> members)
    {
        private const int MongoTimeoutSeconds = 5;

        public async Task<Dto> Handle(Request request, CancellationToken ct = default)
        {
            Validation.Require(request);

            var document = new MemberDocument(
                Guid.NewGuid().ToString("N"),
                request.Name.Trim(),
                request.Email.Trim().ToLowerInvariant(),
                DateTime.UtcNow,
                QualifyingPoints: 0,
                SpendablePoints: 0);

            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromSeconds(MongoTimeoutSeconds)); // a hung Mongo must not hang the request
            await members.InsertOneAsync(document, options: null, cts.Token);

            return ToDto(document);
        }
    }
}
