using MongoDB.Bson.Serialization.Attributes;

namespace Osprey.Members.Storage;

/// <summary>
/// One append-only record of a privileged (admin/support) action against a member —
/// see ADR-0017. Written once, never updated or deleted: the collection is the tamper-
/// evident trail behind points adjustments, OSPREY toggles and GDPR erasures.
///
/// <para><see cref="Actor"/> is the caller's <c>sub</c> (subject) claim. When the auth
/// kill-switch is OFF there is no authenticated principal, so it records the honest
/// literal <see cref="AuditActions.Anonymous"/> rather than inventing a user.</para>
///
/// <para><see cref="Details"/> is a small structured bag (points+reason, invited=true/false,
/// …) kept deliberately free of PII — names and emails never belong in the audit trail.</para>
/// </summary>
public sealed record AuditLogDocument(
    [property: BsonId] string Id,
    string Actor,
    string Action,
    string TargetMemberId,
    IReadOnlyDictionary<string, string> Details,
    string CorrelationId,
    DateTime OccurredAtUtc);

/// <summary>The privileged actions worth an audit record — one constant per admin write path.</summary>
public static class AuditActions
{
    public const string AdjustPoints = "adjust_points";
    public const string SetOsprey = "set_osprey";
    public const string EraseMember = "erase_member";

    /// <summary>Actor recorded when no authenticated principal exists (auth kill-switch OFF).</summary>
    public const string Anonymous = "anonymous (auth disabled)";
}
