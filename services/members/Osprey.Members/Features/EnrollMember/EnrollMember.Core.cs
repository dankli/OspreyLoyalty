using Osprey.Members.Storage;

// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class EnrollMember
{
    internal static Response ToResponse(MemberDocument document) => new(
        document.Id,
        document.Name,
        document.Email,
        Tiers.Effective(document.QualifyingPoints, document.IsPandionInvited).ToString().ToUpperInvariant(),
        document.QualifyingPoints,
        document.SpendablePoints,
        document.JoinedAtUtc);
}
