using System.Text;
using MongoDB.Driver;
using Osprey.Members.Storage;

// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class ListTransactions
{
    private const int MaxExportRows = 10_000; // bound the statement; a demo ledger never gets near this

    /// <summary>CSV statement of the whole (bounded) ledger, newest first — the download
    /// behind the member portal's "Export CSV". Same read path as the list, no paging.</summary>
    public static void MapExportEndpoint(IEndpointRouteBuilder app) =>
        app.MapGet("/api/members/{id}/transactions/export",
            async (string id, IMongoCollection<PointsTransactionDocument> transactions, CancellationToken ct) =>
            {
                List<PointsTransactionDocument> rows = await transactions
                    .Find(t => t.MemberId == id)
                    .SortByDescending(t => t.OccurredAtUtc)
                    .Limit(MaxExportRows)
                    .ToListAsync(ct);

                var csv = new StringBuilder("id,type,points,source,occurredAtUtc\n");
                foreach (PointsTransactionDocument row in rows)
                {
                    csv.Append(row.Id).Append(',')
                        .Append(row.Type).Append(',')
                        .Append(row.Points).Append(',')
                        .Append(CsvField(row.Source)).Append(',')
                        .Append(row.OccurredAtUtc.ToString("O")).Append('\n');
                }

                return Results.File(
                    Encoding.UTF8.GetBytes(csv.ToString()),
                    contentType: "text/csv",
                    fileDownloadName: $"osprey-transactions-{id}.csv");
            })
        .AddEndpointFilter((ctx, next) =>
            Guard.Validate(ctx, next, c => Validation.Check(c.GetArgument<string>(0), 0)));

    /// <summary>Sources are partner ids and reason-ish strings — quote anything that would break a row.</summary>
    private static string CsvField(string value) =>
        value.Contains(',') || value.Contains('"') || value.Contains('\n')
            ? $"\"{value.Replace("\"", "\"\"")}\""
            : value;
}
