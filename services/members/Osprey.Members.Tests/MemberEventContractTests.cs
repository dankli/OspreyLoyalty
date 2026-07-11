using System.Text.Json;
using Osprey.Members.Features;
using Xunit;

namespace Osprey.Members.Tests;

/// <summary>
/// Producer side of the member-events contracts (ADR-0014 style, ADR-0024 events): the
/// shared fixtures under contracts/member-events must deserialize into the outbox event
/// records, and a serialized record must produce exactly the wire field names the schema
/// declares. The notifications service holds the consumer side (AJV validation).
/// </summary>
public sealed class MemberEventContractTests
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private static string Fixture(string name) =>
        File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "contracts", "member-events", name));

    [Fact]
    public void Tier_changed_full_fixture_maps_to_the_event_record()
    {
        var evt = JsonSerializer.Deserialize<Outbox.TierChangedEvent>(Fixture("tier-changed.full.json"), Json)!;

        Assert.Equal("tier-m-1001-GOLD-9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c", evt.EventId);
        Assert.Equal("m-1001", evt.MemberId);
        Assert.Equal("SILVER", evt.PreviousTier);
        Assert.Equal("GOLD", evt.NewTier);
        Assert.Equal(new DateTime(2026, 7, 11, 9, 30, 0, DateTimeKind.Utc), evt.OccurredAtUtc);
        Assert.Equal("b6c1f0aa-1111-4222-8333-944445555666", evt.CorrelationId);
    }

    [Fact]
    public void Tier_changed_minimal_fixture_binds_the_optional_field_to_null()
    {
        var evt = JsonSerializer.Deserialize<Outbox.TierChangedEvent>(Fixture("tier-changed.minimal.json"), Json)!;

        Assert.Equal("SILVER", evt.PreviousTier);
        Assert.Equal("MEMBER", evt.NewTier);
        Assert.Null(evt.CorrelationId);
    }

    [Fact]
    public void Points_expiring_fixtures_map_to_the_event_record()
    {
        var full = JsonSerializer.Deserialize<Outbox.PointsExpiringSoonEvent>(
            Fixture("points-expiring-soon.full.json"), Json)!;
        var minimal = JsonSerializer.Deserialize<Outbox.PointsExpiringSoonEvent>(
            Fixture("points-expiring-soon.minimal.json"), Json)!;

        Assert.Equal(6000, full.Points);
        Assert.Equal("m-1001", full.MemberId);
        Assert.NotNull(full.CorrelationId);
        Assert.Equal(1500, minimal.Points);
        Assert.Null(minimal.CorrelationId);
    }

    [Fact]
    public void Serialized_events_use_the_schema_wire_names()
    {
        string tier = JsonSerializer.Serialize(new Outbox.TierChangedEvent(
            "tier-x", "m-1", "MEMBER", "SILVER", DateTime.UtcNow, "corr"), Json);
        string expiring = JsonSerializer.Serialize(new Outbox.PointsExpiringSoonEvent(
            "expiring-x", "m-1", 500, DateTime.UtcNow, DateTime.UtcNow), Json);

        foreach (string field in (string[])["eventId", "memberId", "previousTier", "newTier", "occurredAtUtc", "correlationId"])
            Assert.Contains($"\"{field}\":", tier);
        foreach (string field in (string[])["eventId", "memberId", "points", "expiresAtUtc", "occurredAtUtc"])
            Assert.Contains($"\"{field}\":", expiring);
    }
}
