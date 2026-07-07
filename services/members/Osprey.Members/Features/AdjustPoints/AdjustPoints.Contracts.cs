// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class AdjustPoints
{
    public sealed record Request(int Points, string Reason, string IdempotencyKey);

    /// <summary>AlreadyApplied mirrors Redeem — a retried adjustment is a success that changed nothing new.</summary>
    public sealed record Response(int Points, int SpendablePoints, bool AlreadyApplied);
}
