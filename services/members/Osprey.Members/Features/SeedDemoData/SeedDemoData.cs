using MongoDB.Driver;
using Osprey.Members.Storage;

// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class SeedDemoData
{
    /// <summary>
    /// Demo members for `docker compose up`. Upserts by id — repeated container starts
    /// must not duplicate, so this is deliberately idempotent.
    /// </summary>
    public static async Task SeedAsync(IMongoCollection<MemberDocument> members, CancellationToken ct = default)
    {
        MemberDocument[] demo =
        [
            new("demo-ada", "Ada Lindqvist", "ada@example.com",
                new DateTime(2024, 3, 12, 0, 0, 0, DateTimeKind.Utc), 32_000, 14_500),
            new("demo-erik", "Erik Boman", "erik@example.com",
                new DateTime(2025, 11, 2, 0, 0, 0, DateTimeKind.Utc), 4_200, 4_200),
            new("demo-yusra", "Yusra Ali", "yusra@example.com",
                new DateTime(2023, 6, 30, 0, 0, 0, DateTimeKind.Utc), 96_000, 51_000,
                IsPandionInvited: true), // the one PANDION demo member — invited, not earned
        ];

        foreach (MemberDocument member in demo)
            await members.ReplaceOneAsync(m => m.Id == member.Id, member,
                new ReplaceOptions { IsUpsert = true }, ct);
    }
}
