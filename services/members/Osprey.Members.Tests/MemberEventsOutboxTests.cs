using MongoDB.Driver;
using Osprey.Members.Features;
using Osprey.Members.Storage;
using Testcontainers.MongoDb;
using Xunit;

namespace Osprey.Members.Tests;

/// <summary>
/// Domain events leave members through the transactional outbox (ADR-0024). The outbox
/// document id IS the deterministic event id, so every emission point — earn-path tier
/// changes, sweep downgrades, expiry warnings — dedups on the primary key and is safe
/// to re-run.
/// </summary>
public sealed class MemberEventsOutboxTests : IAsyncLifetime
{
    private readonly MongoDbContainer mongo = new MongoDbBuilder().WithImage("mongo:7").Build();
    private IMongoCollection<MemberDocument> members = null!;
    private IMongoCollection<PointsTransactionDocument> transactions = null!;
    private IMongoCollection<OutboxDocument> outboxCollection = null!;
    private Outbox.Writer outbox = null!;

    public async Task InitializeAsync()
    {
        await mongo.StartAsync();
        IMongoDatabase db = new MongoClient(mongo.GetConnectionString()).GetDatabase("osprey");
        members = db.GetCollection<MemberDocument>("members");
        transactions = db.GetCollection<PointsTransactionDocument>("transactions");
        outboxCollection = db.GetCollection<OutboxDocument>("outbox");
        outbox = new Outbox.Writer(outboxCollection);
        await MongoIndexes.EnsureAsync(transactions);
    }

    public Task DisposeAsync() => mongo.DisposeAsync().AsTask();

    [Fact]
    public async Task Writer_dedups_on_the_event_id()
    {
        var evt = new Outbox.TierChangedEvent("tier-m-1-SILVER-abc", "m-1", "MEMBER", "SILVER", DateTime.UtcNow);

        await outbox.WriteAsync(evt);
        await outbox.WriteAsync(evt);

        Assert.Equal(1, await outboxCollection.CountDocumentsAsync(o => o.Id == "tier-m-1-SILVER-abc"));
    }

    [Fact]
    public async Task Earn_that_crosses_a_threshold_writes_a_tier_changed_event()
    {
        await members.InsertOneAsync(new MemberDocument(
            "m-up", "Upward Member", "up@example.com", DateTime.UtcNow, 0, 0));
        var handler = new ApplyEarn.Handler(members, transactions, outbox);

        await handler.Handle(new ApplyEarn.EarnEvent(
            "m-up", "cardco", 40_000m, 0.5m, "up-key-0001", DateTime.UtcNow, CorrelationId: "corr-1"));

        OutboxDocument entry = await outboxCollection
            .Find(o => o.RoutingKey == "tier.changed").FirstAsync();
        Assert.Contains("\"memberId\":\"m-up\"", entry.Payload);
        Assert.Contains("\"previousTier\":\"MEMBER\"", entry.Payload);
        Assert.Contains("\"newTier\":\"SILVER\"", entry.Payload);
        Assert.Contains("\"correlationId\":\"corr-1\"", entry.Payload);
        Assert.Null(entry.PublishedAtUtc);
    }

    [Fact]
    public async Task Earn_that_stays_inside_the_tier_writes_no_event()
    {
        await members.InsertOneAsync(new MemberDocument(
            "m-flat", "Flat Member", "flat@example.com", DateTime.UtcNow, 0, 0));
        var handler = new ApplyEarn.Handler(members, transactions, outbox);

        await handler.Handle(new ApplyEarn.EarnEvent(
            "m-flat", "cardco", 100m, 0.5m, "flat-key-0001", DateTime.UtcNow));

        Assert.Equal(0, await outboxCollection.CountDocumentsAsync(FilterDefinition<OutboxDocument>.Empty));
    }

    [Fact]
    public async Task Requalification_changes_emit_with_day_stamped_ids()
    {
        DateTime nowUtc = new(2026, 7, 11, 2, 0, 0, DateTimeKind.Utc);
        var changes = new List<Requalification.TierChange>
        {
            new("m-down", Tiers.Tier.Silver, Tiers.Tier.Member),
        };

        await Requalification.EmitAsync(changes, outbox, nowUtc);
        await Requalification.EmitAsync(changes, outbox, nowUtc); // same-day re-run dedups

        OutboxDocument entry = await outboxCollection.Find(o => o.RoutingKey == "tier.changed").FirstAsync();
        Assert.Equal("tier-m-down-MEMBER-20260711", entry.Id);
        Assert.Equal(1, await outboxCollection.CountDocumentsAsync(o => o.RoutingKey == "tier.changed"));
    }

    [Fact]
    public async Task Expiry_warning_pass_warns_once_per_lot_ever()
    {
        DateTime nowUtc = DateTime.UtcNow;
        await members.InsertOneAsync(new MemberDocument(
            "m-warn", "Warned Member", "warn@example.com", nowUtc.AddMonths(-30), 0, 5_000));
        // Lot expires in ~15 days: earned 24 months minus 15 days ago.
        await transactions.InsertOneAsync(new PointsTransactionDocument(
            "warn-earn", "m-warn", TransactionTypes.Earn, 5_000, "cardco",
            "warn-earn-0001", nowUtc.AddMonths(-Expiry.LifetimeMonths).AddDays(15)));

        int first = await Expiry.WarnAsync(members, transactions, outbox, nowUtc);
        int second = await Expiry.WarnAsync(members, transactions, outbox, nowUtc);

        Assert.Equal(1, first);
        Assert.Equal(1, second); // pure recompute finds it again…
        Assert.Equal(1, await outboxCollection.CountDocumentsAsync(o => o.Id == "expiring-warn-earn")); // …but the outbox dedups
        OutboxDocument entry = await outboxCollection.Find(o => o.Id == "expiring-warn-earn").FirstAsync();
        Assert.Equal("points.expiring", entry.RoutingKey);
        Assert.Contains("\"points\":5000", entry.Payload);
    }

    [Fact]
    public void DueSoonLots_only_warns_inside_the_horizon()
    {
        DateTime nowUtc = new(2026, 7, 11, 0, 0, 0, DateTimeKind.Utc);
        var ledger = new List<PointsTransactionDocument>
        {
            // Expires in 15 days → warn.
            new("soon", "m", TransactionTypes.Earn, 1_000, "cardco", "k1",
                nowUtc.AddMonths(-Expiry.LifetimeMonths).AddDays(15)),
            // Expires in 60 days → outside the 30-day horizon.
            new("later", "m", TransactionTypes.Earn, 1_000, "cardco", "k2",
                nowUtc.AddMonths(-Expiry.LifetimeMonths).AddDays(60)),
            // Already expired → DueLots' problem, not a warning.
            new("past", "m", TransactionTypes.Earn, 1_000, "cardco", "k3",
                nowUtc.AddMonths(-Expiry.LifetimeMonths).AddDays(-5)),
        };

        IReadOnlyList<Expiry.WarningLot> lots = Expiry.DueSoonLots(ledger, nowUtc);

        Expiry.WarningLot lot = Assert.Single(lots);
        Assert.Equal("soon", lot.EarnId);
        Assert.Equal(1_000, lot.Points);
    }

    [Fact]
    public void DueSoonLots_respects_fifo_consumption()
    {
        DateTime nowUtc = new(2026, 7, 11, 0, 0, 0, DateTimeKind.Utc);
        var ledger = new List<PointsTransactionDocument>
        {
            new("lot-a", "m", TransactionTypes.Earn, 3_000, "cardco", "k1",
                nowUtc.AddMonths(-Expiry.LifetimeMonths).AddDays(10)),
            new("burn", "m", TransactionTypes.Burn, -2_500, "rewards", "k2", nowUtc.AddMonths(-1)),
        };

        IReadOnlyList<Expiry.WarningLot> lots = Expiry.DueSoonLots(ledger, nowUtc);

        Expiry.WarningLot lot = Assert.Single(lots);
        Assert.Equal(500, lot.Points); // 3 000 earned minus 2 500 consumed FIFO
    }
}
