using MongoDB.Driver;
using Osprey.Members.Features;
using Osprey.Members.Storage;
using Testcontainers.MongoDb;
using Xunit;

namespace Osprey.Members.Tests;

/// <summary>The audit trail finally gets a reader: newest first, bounded pages, admin-gated at the edge.</summary>
public sealed class ListAuditLogTests : IAsyncLifetime
{
    private readonly MongoDbContainer mongo = new MongoDbBuilder().WithImage("mongo:7").Build();
    private IMongoCollection<AuditLogDocument> audit = null!;

    public async Task InitializeAsync()
    {
        await mongo.StartAsync();
        audit = new MongoClient(mongo.GetConnectionString()).GetDatabase("osprey")
            .GetCollection<AuditLogDocument>("audit");
    }

    public Task DisposeAsync() => mongo.DisposeAsync().AsTask();

    [Fact]
    public async Task Pages_newest_first_with_a_has_more_flag()
    {
        DateTime nowUtc = DateTime.UtcNow;
        for (int i = 0; i < 25; i++)
        {
            await audit.InsertOneAsync(new AuditLogDocument(
                $"a-{i:D2}", "admin", AuditActions.AdjustPoints, "m-1",
                new Dictionary<string, string> { ["points"] = i.ToString() },
                $"corr-{i}", nowUtc.AddMinutes(-i)));
        }
        var handler = new ListAuditLog.Handler(audit);

        ListAuditLog.Response first = await handler.Handle(0);
        ListAuditLog.Response second = await handler.Handle(1);

        Assert.Equal(20, first.Items.Count);
        Assert.True(first.HasMore);
        Assert.Equal("corr-0", first.Items[0].CorrelationId); // newest first
        Assert.Equal(5, second.Items.Count);
        Assert.False(second.HasMore);
        Assert.Equal(AuditActions.AdjustPoints, first.Items[0].Action);
        Assert.Equal("0", first.Items[0].Details["points"]);
    }
}
