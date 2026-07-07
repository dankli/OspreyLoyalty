using MongoDB.Driver;
using Osprey.Members.Storage;

// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class SetPandionInvitation
{
    /// <summary>
    /// This is the ONLY writer of IsPandionInvited in the entire system — PANDION is
    /// granted and revoked here, never computed.
    /// </summary>
    public sealed class Handler(IMongoCollection<MemberDocument> members)
    {
        private const int MongoTimeoutSeconds = 5;

        public async Task<Response?> Handle(string memberId, Request request, CancellationToken ct = default)
        {
            Validation.RequireId(memberId);

            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromSeconds(MongoTimeoutSeconds)); // a hung Mongo must not hang the request
            MemberDocument? updated = await members.FindOneAndUpdateAsync<MemberDocument>(
                m => m.Id == memberId,
                Builders<MemberDocument>.Update.Set(m => m.IsPandionInvited, request.Invited),
                options: new FindOneAndUpdateOptions<MemberDocument> { ReturnDocument = ReturnDocument.After },
                cts.Token);

            return updated is null ? null : ToResponse(updated);
        }
    }
}
