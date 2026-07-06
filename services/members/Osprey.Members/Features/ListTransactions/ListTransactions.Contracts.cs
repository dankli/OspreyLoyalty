using Osprey.Members.Storage;

// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class ListTransactions
{
    public sealed record Item(string Id, string Type, int Points, string Source, DateTime OccurredAtUtc);

    public sealed record Response(IReadOnlyList<Item> Items, int Page, bool HasMore);

    internal static Item ToItem(PointsTransactionDocument document) => new(
        document.Id, document.Type, document.Points, document.Source, document.OccurredAtUtc);
}
