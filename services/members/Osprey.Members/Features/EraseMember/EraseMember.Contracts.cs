// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class EraseMember
{
    /// <summary>
    /// The result of a GDPR erasure (ADR-0018). <see cref="AlreadyErased"/> mirrors the
    /// AlreadyApplied convention: re-erasing an already-erased member is a success that
    /// changed nothing new. <see cref="TransactionsRetained"/> is the count of ledger
    /// entries deliberately KEPT for accounting integrity.
    /// </summary>
    public sealed record Response(string Id, DateTime ErasedAtUtc, int TransactionsRetained, bool AlreadyErased);
}
