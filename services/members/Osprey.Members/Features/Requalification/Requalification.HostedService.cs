using MongoDB.Driver;
using Osprey.Members.Storage;

// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class Requalification
{
    /// <summary>
    /// Runs one sweep at startup, then one every 24 hours — the same cadence and failure
    /// contract as the expiry sweep: a failed pass is logged and retried on the next tick,
    /// never killing the host, and re-running is safe by construction (conditional writes).
    /// </summary>
    public sealed class HostedService(IServiceProvider services, ILogger<HostedService> logger)
        : BackgroundService
    {
        private static readonly TimeSpan Interval = TimeSpan.FromHours(24);

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            using var timer = new PeriodicTimer(Interval);
            try
            {
                do
                {
                    await RunOnceAsync(stoppingToken);
                }
                while (await timer.WaitForNextTickAsync(stoppingToken));
            }
            catch (OperationCanceledException) { /* graceful shutdown */ }
        }

        private async Task RunOnceAsync(CancellationToken stoppingToken)
        {
            try
            {
                using IServiceScope scope = services.CreateScope();
                var members = scope.ServiceProvider.GetRequiredService<IMongoCollection<MemberDocument>>();
                var transactions = scope.ServiceProvider.GetRequiredService<IMongoCollection<PointsTransactionDocument>>();
                var outbox = scope.ServiceProvider.GetRequiredService<Outbox.Writer>();

                DateTime nowUtc = DateTime.UtcNow;
                IReadOnlyList<TierChange> changes = await SweepAsync(members, transactions, nowUtc, stoppingToken);
                await EmitAsync(changes, outbox, nowUtc, stoppingToken);
                logger.LogInformation("Requalification sweep completed: {TierChanges} tier changes.", changes.Count);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                throw; // shutdown — let ExecuteAsync unwind
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Requalification sweep failed — will retry on the next tick.");
            }
        }
    }
}
