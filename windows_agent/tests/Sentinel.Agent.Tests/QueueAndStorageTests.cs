using Sentinel.Agent.Core.Models;
using Sentinel.Agent.Core.Security;
using Sentinel.Agent.Core.Storage;
using Xunit;

namespace Sentinel.Agent.Tests;

public sealed class QueueAndStorageTests : IDisposable
{
    private readonly string _tempDir;

    public QueueAndStorageTests()
    {
        _tempDir = Path.Combine(Path.GetTempPath(), "SentinelAgentTests_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_tempDir);
    }

    [Fact]
    public void Queue_Persists_Across_Restart_And_Deduplicates_IdempotencyKeys()
    {
        var dbPath = Path.Combine(_tempDir, "queue.db");

        using (var store = new DurableQueueStore(dbPath))
        {
            Assert.True(store.Enqueue(QueueItemType.TelemetrySample, "sample-1", "{\"cpu\":12.5}"));
            Assert.False(store.Enqueue(QueueItemType.TelemetrySample, "sample-1", "{\"cpu\":12.5}")); // duplicate
            Assert.True(store.Enqueue(QueueItemType.Alert, "alert-1", "{\"rule\":\"TEST\"}"));
            Assert.Equal(2, store.GetPendingCount());
        }

        // Simulate service restart by opening a new store instance on the same file
        using (var restarted = new DurableQueueStore(dbPath))
        {
            Assert.Equal(2, restarted.GetPendingCount());
            var batch = restarted.DequeueBatch(10);
            Assert.Equal(2, batch.Count);
            // Alert (priority 2) must come before TelemetrySample (priority 4)
            Assert.Equal(QueueItemType.Alert, batch[0].ItemType);
            Assert.Equal(QueueItemType.TelemetrySample, batch[1].ItemType);

            restarted.MarkCompleted(batch.Select(b => b.Id));
            Assert.Equal(0, restarted.GetPendingCount());
        }
    }

    [Fact]
    public void Queue_Recovers_Automatically_From_Corrupted_Database()
    {
        var dbPath = Path.Combine(_tempDir, "corrupt_queue.db");
        File.WriteAllText(dbPath, "THIS IS NOT A VALID SQLITE DATABASE HEADER");

        using var store = new DurableQueueStore(dbPath);
        Assert.Equal(0, store.GetPendingCount());
        Assert.True(store.Enqueue(QueueItemType.Alert, "recovered-alert-1", "{\"ok\":true}"));
        Assert.Equal(1, store.GetPendingCount());
    }

    [Fact]
    public void Queue_Enforces_MaxItems_Bound_And_Preserves_Alerts()
    {
        var dbPath = Path.Combine(_tempDir, "bounded_queue.db");
        using var store = new DurableQueueStore(dbPath, maxItems: 15);

        for (int i = 0; i < 15; i++)
        {
            store.Enqueue(QueueItemType.TelemetrySample, $"s-{i}", "{}");
        }
        Assert.Equal(15, store.GetPendingCount());

        // Enqueueing a high-priority Alert should evict low-priority samples and keep the alert
        Assert.True(store.Enqueue(QueueItemType.Alert, "critical-alert", "{\"sev\":\"high\"}"));
        var items = store.DequeueBatch(20);
        Assert.Contains(items, x => x.IdempotencyKey == "critical-alert");
    }

    [Fact]
    public void DpapiIdentityStore_Roundtrips_And_Deletes_Safely()
    {
        var dpapiDir = Path.Combine(_tempDir, "dpapi");
        var store = new DpapiIdentityStore(dpapiDir);

        Assert.Null(store.Load());

        var identity = new AgentIdentity
        {
            EndpointId = "ep-1234567890",
            OwnerUid = "owner-uid-1",
            AgentUid = "agent-uid-1",
            RefreshToken = "refresh-secret-token",
            EnrollmentTokenHash = "hash123",
            EnrolledAt = DateTimeOffset.UtcNow
        };

        store.Save(identity);
        var loaded = store.Load();

        Assert.NotNull(loaded);
        Assert.Equal(identity.EndpointId, loaded!.EndpointId);
        Assert.Equal(identity.RefreshToken, loaded.RefreshToken);

        store.Delete();
        Assert.Null(store.Load());
    }

    public void Dispose()
    {
        try { Directory.Delete(_tempDir, recursive: true); } catch { }
    }
}
