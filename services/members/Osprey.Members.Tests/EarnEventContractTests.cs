using System.Text.Json;
using Osprey.Members.Features;
using Xunit;

namespace Osprey.Members.Tests;

/// <summary>
/// CONSUMER-SIDE contract test for the EarnEvent wire message. Deserializes the shared
/// canonical fixtures (contracts/earn-event/*.json — the single source of truth the producer
/// in services/partners is validated against too) with the SAME JsonSerializerOptions the
/// live consumer uses, and asserts every field maps. If partners' produced shape and members'
/// consumed shape ever drift, this goes red. See docs/decisions/0014-contract-testing.md.
/// </summary>
public sealed class EarnEventContractTests
{
    // Mirrors ConsumeEarnEvents.Consumer: new(JsonSerializerDefaults.Web) — camelCase,
    // case-insensitive, trailing optional record parameters bind to their defaults when absent.
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private static string Fixture(string name)
    {
        // Fixtures are copied next to the test assembly via the csproj <Content> link.
        string path = Path.Combine(AppContext.BaseDirectory, "contracts", "earn-event", name);
        Assert.True(File.Exists(path), $"Contract fixture not found (check csproj copy): {path}");
        return File.ReadAllText(path);
    }

    [Fact]
    public void Full_fixture_deserializes_with_every_field_mapped()
    {
        ApplyEarn.EarnEvent? earn =
            JsonSerializer.Deserialize<ApplyEarn.EarnEvent>(Fixture("earn-event.full.json"), Json);

        Assert.NotNull(earn);
        Assert.Equal("demo-erik", earn!.MemberId);
        Assert.Equal("cardco", earn.PartnerId);
        Assert.Equal(40_000m, earn.Amount);
        Assert.Equal(0.5m, earn.Rate);
        Assert.Equal("contract-earn-0001", earn.IdempotencyKey);
        Assert.Equal(
            new DateTime(2026, 7, 9, 12, 0, 0, DateTimeKind.Utc),
            earn.OccurredAtUtc.ToUniversalTime());
        Assert.Equal("corr-abc-123", earn.CorrelationId);
        Assert.Equal("eyJhbGciOiJIUzI1NiJ9.service-token.sig", earn.AuthToken);
    }

    [Fact]
    public void Minimal_fixture_omits_optional_trailing_fields_and_still_binds()
    {
        // ADR-0002 additive convention: a payload without correlationId/authToken (an older
        // producer) must still deserialize, with those fields defaulting to null.
        ApplyEarn.EarnEvent? earn =
            JsonSerializer.Deserialize<ApplyEarn.EarnEvent>(Fixture("earn-event.minimal.json"), Json);

        Assert.NotNull(earn);
        Assert.Equal("demo-erik", earn!.MemberId);
        Assert.Equal("cardco", earn.PartnerId);
        Assert.Equal(40_000m, earn.Amount);
        Assert.Equal(0.5m, earn.Rate);
        Assert.Equal("contract-earn-minimal-0001", earn.IdempotencyKey);
        Assert.Null(earn.CorrelationId);
        Assert.Null(earn.AuthToken);
    }

    [Fact]
    public void OccurredAtUtc_is_an_iso_string_not_an_epoch_number()
    {
        // Partners disables WRITE_DATES_AS_TIMESTAMPS, so the date is always an ISO-8601 string.
        // If it ever became an epoch number, System.Text.Json would fail to bind DateTime here —
        // this test names that failure mode explicitly.
        var epochShaped = """
            {"memberId":"m","partnerId":"p","amount":1,"rate":0.5,
             "idempotencyKey":"k","occurredAtUtc":1720526400000}
            """;

        Assert.ThrowsAny<JsonException>(() =>
            JsonSerializer.Deserialize<ApplyEarn.EarnEvent>(epochShaped, Json));
    }
}
