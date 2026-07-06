// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class EnrollMember
{
    public sealed record Request(string Name, string Email);

    public sealed record Response(
        string Id,
        string Name,
        string Email,
        string Tier,
        int QualifyingPoints,
        int SpendablePoints,
        DateTime JoinedAtUtc);
}
