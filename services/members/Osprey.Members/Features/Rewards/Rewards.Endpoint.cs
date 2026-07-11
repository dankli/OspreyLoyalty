using MongoDB.Driver;
using Osprey.Members.Storage;

// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class Rewards
{
    public static void MapEndpoints(IEndpointRouteBuilder app) =>
        app.MapGet("/api/rewards", async (IMongoCollection<RewardDocument> rewards, CancellationToken ct) =>
            Results.Ok((await rewards
                    .Find(FilterDefinition<RewardDocument>.Empty)
                    .SortBy(r => r.Cost)
                    .Limit(MaxRewards)
                    .ToListAsync(ct))
                .Select(ToReward)));
}
