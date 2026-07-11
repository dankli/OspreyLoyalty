// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class AdminRewards
{
    public sealed record CreateRequest(string Id, string Name, int Cost);

    public sealed record UpdateRequest(string Name, int Cost);
}
