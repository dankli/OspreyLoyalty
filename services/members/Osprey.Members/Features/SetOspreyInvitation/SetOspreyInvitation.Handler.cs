using MongoDB.Driver;
using Osprey.Members.Storage;

// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class SetOspreyInvitation
{
    /// <summary>
    /// This is the ONLY writer of IsOspreyInvited in the entire system — OSPREY is
    /// granted and revoked here, never computed.
    /// </summary>
    public sealed class Handler(IMongoCollection<MemberDocument> members, Audit.Writer audit)
    {
        private const int MongoTimeoutSeconds = 5;

        /// <param name="caller">Who is toggling OSPREY — actor + correlation from the edge (ADR-0017).</param>
        public async Task<Response?> Handle(string memberId, Request request, Audit.Caller.Context caller, CancellationToken ct = default)
        {
            Validation.RequireId(memberId);

            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromSeconds(MongoTimeoutSeconds)); // a hung Mongo must not hang the request
            MemberDocument? updated = await members.FindOneAndUpdateAsync<MemberDocument>(
                m => m.Id == memberId,
                Builders<MemberDocument>.Update.Set(m => m.IsOspreyInvited, request.Invited),
                options: new FindOneAndUpdateOptions<MemberDocument> { ReturnDocument = ReturnDocument.After },
                cts.Token);

            if (updated is null)
                return null; // 404 at the edge — nothing changed, nothing to audit

            // Edge concern: record WHO toggled OSPREY for WHOM, off the happy path.
            await audit.WriteAsync(new Audit.Entry(
                caller.Actor, AuditActions.SetOsprey, memberId,
                new Dictionary<string, string> { ["invited"] = request.Invited ? "true" : "false" },
                caller.CorrelationId), cts.Token);

            return ToResponse(updated);
        }
    }
}
