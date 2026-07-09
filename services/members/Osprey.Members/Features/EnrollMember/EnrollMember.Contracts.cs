using Osprey.Members.Storage;

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

    internal static Response ToResponse(MemberDocument document) => new(
        document.Id,
        document.Name,
        document.Email,
        Tiers.Effective(document.QualifyingPoints, document.IsOspreyInvited).ToString().ToUpperInvariant(),
        document.QualifyingPoints,
        document.SpendablePoints,
        document.JoinedAtUtc);
}
