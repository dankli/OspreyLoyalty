using MongoDB.Driver;
using Osprey.Members.Storage;

// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

/// <summary>
/// Admin CRUD for the reward catalog. Like partner-rate edits, catalog configuration is
/// not audit-trailed (ADR-0017 covers actions against MEMBERS); the endpoints are
/// admin-gated when auth is on, exactly like the other admin surfaces.
/// </summary>
public static partial class AdminRewards
{
    public static IEndpointConventionBuilder[] MapEndpoints(IEndpointRouteBuilder app)
    {
        var create = app.MapPost("/api/rewards",
            async (CreateRequest request, IMongoCollection<RewardDocument> rewards, CancellationToken ct) =>
            {
                try
                {
                    await rewards.InsertOneAsync(new RewardDocument(request.Id, request.Name.Trim(), request.Cost), options: null, ct);
                }
                catch (MongoWriteException ex) when (ex.WriteError.Category == ServerErrorCategory.DuplicateKey)
                {
                    return Results.Conflict(new { error = $"Reward '{request.Id}' already exists." });
                }
                return Results.Created($"/api/rewards/{request.Id}", new Rewards.Reward(request.Id, request.Name.Trim(), request.Cost));
            })
            .AddEndpointFilter((ctx, next) =>
                Guard.Validate(ctx, next, c => Validation.CheckCreate(c.GetArgument<CreateRequest>(0))));

        var update = app.MapPut("/api/rewards/{id}",
            async (string id, UpdateRequest request, IMongoCollection<RewardDocument> rewards, CancellationToken ct) =>
            {
                var replaced = await rewards.ReplaceOneAsync(r => r.Id == id,
                    new RewardDocument(id, request.Name.Trim(), request.Cost), cancellationToken: ct);
                return replaced.MatchedCount == 0
                    ? Results.NotFound()
                    : Results.Ok(new Rewards.Reward(id, request.Name.Trim(), request.Cost));
            })
            .AddEndpointFilter((ctx, next) =>
                Guard.Validate(ctx, next, c => Validation.CheckUpdate(c.GetArgument<string>(0), c.GetArgument<UpdateRequest>(1))));

        var delete = app.MapDelete("/api/rewards/{id}",
            async (string id, IMongoCollection<RewardDocument> rewards, CancellationToken ct) =>
            {
                DeleteResult deleted = await rewards.DeleteOneAsync(r => r.Id == id, ct);
                return deleted.DeletedCount == 0 ? Results.NotFound() : Results.NoContent();
            });

        return [create, update, delete];
    }
}
