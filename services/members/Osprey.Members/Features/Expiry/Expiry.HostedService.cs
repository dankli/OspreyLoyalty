using MongoDB.Driver;
using Osprey.Members.Storage;

// ReSharper disable once CheckNamespace

namespace Osprey.Members.Features;

public static partial class Expiry
{
    /// <summary>
    /// Runs one sweep at startup, then one every 24 hours. Each run resolves fresh
    /// collections from a scope and swallows-and-logs its own failures — a failed
    /// sweep must not kill the host; the next tick simply retries, and the sweep's
    /// deterministic idempotency keys make that retry safe.
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

                int expired = await SweepAsync(members, transactions, DateTime.UtcNow, stoppingToken);
                int warned = await WarnAsync(members, transactions, outbox, DateTime.UtcNow, stoppingToken);
                logger.LogInformation(
                    "Expiry sweep completed: {PointsExpired} points expired, {Warnings} expiry warnings written.",
                    expired, warned);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                throw; // shutdown — let ExecuteAsync unwind
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Expiry sweep failed — will retry on the next tick.");
            }
        }
    }
}
