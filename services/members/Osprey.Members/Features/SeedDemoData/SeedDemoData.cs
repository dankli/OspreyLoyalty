using MongoDB.Driver;
using Osprey.Members.Storage;

// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class SeedDemoData
{
    /// <summary>
    /// Demo members for `docker compose up`. Upserts by id — repeated container starts
    /// must not duplicate, so this is deliberately idempotent.
    ///
    /// <para>Qualifying points are LEDGER-BACKED: the rolling-window recompute (earn path,
    /// requalification sweep, migration 001) derives them from earn entries, so a member
    /// document claiming points with no ledger behind it would be honestly downgraded on
    /// the first pass. Every seeded qualifying total therefore comes with matching earn
    /// entries dated inside the 12-month window (and far from the 24-month expiry).
    /// demo-erik deliberately starts with an EMPTY window — the e2e earn flow asserts his
    /// first purchase alone puts him at exactly 20 000 qualifying points.</para>
    /// </summary>
    public static async Task SeedAsync(
        IMongoCollection<MemberDocument> members,
        IMongoCollection<PointsTransactionDocument> transactions,
        CancellationToken ct = default)
    {
        DateTime nowUtc = DateTime.UtcNow;
        MemberDocument[] demo =
        [
            new("demo-ada", "Ada Lindqvist", "ada@example.com",
                new DateTime(2024, 3, 12, 0, 0, 0, DateTimeKind.Utc), 32_000, 14_500),
            new("demo-erik", "Erik Boman", "erik@example.com",
                new DateTime(2025, 11, 2, 0, 0, 0, DateTimeKind.Utc), 0, 4_200),
            new("demo-yusra", "Yusra Ali", "yusra@example.com",
                new DateTime(2023, 6, 30, 0, 0, 0, DateTimeKind.Utc), 96_000, 51_000,
                IsOspreyInvited: true), // the one OSPREY demo member — invited, not earned
        ];

        PointsTransactionDocument[] ledger =
        [
            new("seed-ada-earn-1", "demo-ada", TransactionTypes.Earn, 20_000, "cardco",
                "seed-ada-0001", nowUtc.AddDays(-120)),
            // NOT stayinn: the e2e duplicate-delivery check counts ada's stayinn entries
            // and must find exactly the one its own duplicate-demo purchase produced.
            new("seed-ada-earn-2", "demo-ada", TransactionTypes.Earn, 12_000, "wheelsgo",
                "seed-ada-0002", nowUtc.AddDays(-60)),
            new("seed-yusra-earn-1", "demo-yusra", TransactionTypes.Earn, 60_000, "stayinn",
                "seed-yusra-0001", nowUtc.AddDays(-150)),
            new("seed-yusra-earn-2", "demo-yusra", TransactionTypes.Earn, 36_000, "wheelsgo",
                "seed-yusra-0002", nowUtc.AddDays(-45)),
        ];

        foreach (MemberDocument member in demo)
            await members.ReplaceOneAsync(m => m.Id == member.Id, member,
                new ReplaceOptions { IsUpsert = true }, ct);

        foreach (PointsTransactionDocument entry in ledger)
            await transactions.ReplaceOneAsync(t => t.Id == entry.Id, entry,
                new ReplaceOptions { IsUpsert = true }, ct);
    }
}
