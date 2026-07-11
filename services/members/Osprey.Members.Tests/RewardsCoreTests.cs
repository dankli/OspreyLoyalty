using MongoDB.Driver;
using Osprey.Members.Features;
using Osprey.Members.Storage;
using Testcontainers.MongoDb;
using Xunit;

namespace Osprey.Members.Tests;

/// <summary>
/// The catalog is Mongo-backed and admin-managed; the three classics seed an EMPTY
/// collection only, so a fresh environment behaves like the hard-coded era while an
/// admin's deletions are never resurrected by a redeploy.
/// </summary>
public sealed class RewardsCoreTests : IAsyncLifetime
{
    private readonly MongoDbContainer mongo = new MongoDbBuilder().WithImage("mongo:7").Build();
    private IMongoCollection<RewardDocument> rewards = null!;

    public async Task InitializeAsync()
    {
        await mongo.StartAsync();
        rewards = new MongoClient(mongo.GetConnectionString()).GetDatabase("osprey")
            .GetCollection<RewardDocument>("rewards");
    }

    public Task DisposeAsync() => mongo.DisposeAsync().AsTask();

    [Fact]
    public void Defaults_have_positive_cost_and_unique_ids()
    {
        Assert.Equal(3, Rewards.Defaults.Count);
        Assert.All(Rewards.Defaults, r => Assert.True(r.Cost > 0));
        Assert.Equal(Rewards.Defaults.Count, Rewards.Defaults.Select(r => r.Id).Distinct().Count());
    }

    [Fact]
    public async Task An_empty_collection_gets_the_defaults_once()
    {
        await Rewards.EnsureDefaultsAsync(rewards);
        await Rewards.EnsureDefaultsAsync(rewards);

        Assert.Equal(3, await rewards.CountDocumentsAsync(FilterDefinition<RewardDocument>.Empty));
        RewardDocument lounge = await rewards.Find(r => r.Id == "lounge-pass").FirstAsync();
        Assert.Equal(15_000, lounge.Cost);
    }

    [Fact]
    public async Task A_curated_catalog_is_never_reseeded()
    {
        await Rewards.EnsureDefaultsAsync(rewards);
        await rewards.DeleteOneAsync(r => r.Id == "cardco-giftcard");

        await Rewards.EnsureDefaultsAsync(rewards); // deploy restart

        Assert.Equal(0, await rewards.CountDocumentsAsync(r => r.Id == "cardco-giftcard"));
    }
}
