using MongoDB.Driver;
using Osprey.Members.Features;
using Osprey.Members.Storage;
using Testcontainers.MongoDb;
using Xunit;

namespace Osprey.Members.Tests;

/// <summary>
/// Benefits stop being display-only: an entitled member activates one and gets a code.
/// Entitlement and display share Tiers.BenefitsFor, and a retried activation returns the
/// ORIGINAL code via the unique idempotency index.
/// </summary>
public sealed class ActivateBenefitTests : IAsyncLifetime
{
    private readonly MongoDbContainer mongo = new MongoDbBuilder().WithImage("mongo:7").Build();
    private IMongoCollection<MemberDocument> members = null!;
    private IMongoCollection<BenefitActivationDocument> activations = null!;
    private ActivateBenefit.Handler handler = null!;

    public async Task InitializeAsync()
    {
        await mongo.StartAsync();
        IMongoDatabase db = new MongoClient(mongo.GetConnectionString()).GetDatabase("osprey");
        members = db.GetCollection<MemberDocument>("members");
        activations = db.GetCollection<BenefitActivationDocument>("benefitActivations");
        await MongoIndexes.EnsureAsync(activations);
        handler = new ActivateBenefit.Handler(members, activations);
        // 45k qualifying = GOLD → "Lounge access", "Priority boarding".
        await members.InsertOneAsync(new MemberDocument(
            "m-gold", "Gold Member", "gold@example.com", DateTime.UtcNow, 45_000, 45_000));
    }

    public Task DisposeAsync() => mongo.DisposeAsync().AsTask();

    [Fact]
    public async Task An_entitled_benefit_activates_with_a_readable_code()
    {
        ActivateBenefit.Outcome outcome = await handler.Handle("m-gold",
            new ActivateBenefit.Request("Lounge access", "benefit-key-0001"));

        Assert.Equal(ActivateBenefit.Status.Ok, outcome.Status);
        Assert.Equal("Lounge access", outcome.Response!.Benefit);
        Assert.Matches("^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$", outcome.Response.Code);
        Assert.False(outcome.Response.AlreadyApplied);
    }

    [Fact]
    public async Task A_retry_returns_the_original_code()
    {
        var request = new ActivateBenefit.Request("Lounge access", "benefit-key-0002");

        ActivateBenefit.Outcome first = await handler.Handle("m-gold", request);
        ActivateBenefit.Outcome second = await handler.Handle("m-gold", request);

        Assert.True(second.Response!.AlreadyApplied);
        Assert.Equal(first.Response!.Code, second.Response.Code);
        Assert.Equal(1, await activations.CountDocumentsAsync(a => a.IdempotencyKey == "benefit-key-0002"));
    }

    [Fact]
    public async Task A_benefit_above_the_members_tier_is_refused()
    {
        // "Upgrade voucher" arrives at DIAMOND — a GOLD member is not entitled.
        ActivateBenefit.Outcome outcome = await handler.Handle("m-gold",
            new ActivateBenefit.Request("Upgrade voucher", "benefit-key-0003"));

        Assert.Equal(ActivateBenefit.Status.NotEntitled, outcome.Status);
        Assert.Equal(0, await activations.CountDocumentsAsync(a => a.MemberId == "m-gold"));
    }

    [Fact]
    public async Task Unknown_member_is_a_value_not_a_throw()
    {
        ActivateBenefit.Outcome outcome = await handler.Handle("ghost",
            new ActivateBenefit.Request("Lounge access", "benefit-key-0004"));

        Assert.Equal(ActivateBenefit.Status.UnknownMember, outcome.Status);
    }

    [Fact]
    public async Task The_list_returns_activations_newest_first()
    {
        await handler.Handle("m-gold", new ActivateBenefit.Request("Lounge access", "benefit-key-0005"));
        await handler.Handle("m-gold", new ActivateBenefit.Request("Priority boarding", "benefit-key-0006"));

        IReadOnlyList<ActivateBenefit.Response> list = await handler.List("m-gold");

        Assert.Equal(2, list.Count);
        Assert.Equal("Priority boarding", list[0].Benefit);
    }
}
