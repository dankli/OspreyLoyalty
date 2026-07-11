using Osprey.Members.Storage;

// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class ListAuditLog
{
    public sealed record Item(
        string Actor,
        string Action,
        string TargetMemberId,
        IReadOnlyDictionary<string, string> Details,
        string CorrelationId,
        DateTime OccurredAtUtc);

    public sealed record Response(IReadOnlyList<Item> Items, int Page, bool HasMore);

    internal static Item ToItem(AuditLogDocument document) => new(
        document.Actor, document.Action, document.TargetMemberId,
        document.Details, document.CorrelationId, document.OccurredAtUtc);
}
