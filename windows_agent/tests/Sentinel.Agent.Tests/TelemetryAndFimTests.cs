using Sentinel.Agent.Core.Collectors;
using Sentinel.Agent.Core.Storage;
using Xunit;

namespace Sentinel.Agent.Tests;

public sealed class TelemetryAndFimTests : IDisposable
{
    private readonly string _tempDir;

    public TelemetryAndFimTests()
    {
        _tempDir = Path.Combine(Path.GetTempPath(), "SentinelFimTests_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_tempDir);
    }

    [Fact]
    public void SystemTelemetryCollector_Collects_Genuine_Windows_Metrics()
    {
        var collector = new SystemTelemetryCollector();
        Thread.Sleep(50); // Brief delta for CPU sampling
        var snap = collector.Collect("test-endpoint-1");

        Assert.Equal(Environment.MachineName, snap.Hostname);
        Assert.InRange(snap.CpuPercent, 0.0, 100.0);
        Assert.True(snap.MemoryTotalMb > 0);
        Assert.InRange(snap.MemoryPercent, 0.0, 100.0);
        Assert.True(snap.DiskTotalGb > 0);
        Assert.True(snap.UptimeSeconds > 0);
        Assert.True(snap.ProcessCount > 5);
        Assert.False(string.IsNullOrWhiteSpace(snap.OsVersion));
        Assert.False(string.IsNullOrWhiteSpace(snap.OsBuild));
        Assert.NotEmpty(snap.NetworkInterfaces);
    }

    [Fact]
    public void FileIntegrityMonitor_Detects_Modifications_Incrementally()
    {
        var dbPath = Path.Combine(_tempDir, "fim.db");
        var watchDir = Path.Combine(_tempDir, "watched");
        Directory.CreateDirectory(watchDir);

        var testFile = Path.Combine(watchDir, "policy.txt");
        File.WriteAllText(testFile, "initial-content-v1");

        using var store = new DurableQueueStore(dbPath);
        var fim = new FileIntegrityMonitor(store);

        // First scan: establishes baseline, no change alert
        var firstAlerts = fim.ScanConfiguredDirectories("ep-1", new[] { watchDir });
        Assert.Empty(firstAlerts);

        // Second scan without changes: skips re-hashing, no alerts
        var secondAlerts = fim.ScanConfiguredDirectories("ep-1", new[] { watchDir });
        Assert.Empty(secondAlerts);

        // Modify file: must detect SHA-256 change
        File.WriteAllText(testFile, "tampered-content-v2");
        File.SetLastWriteTimeUtc(testFile, DateTime.UtcNow.AddSeconds(2));

        var thirdAlerts = fim.ScanConfiguredDirectories("ep-1", new[] { watchDir });
        Assert.Single(thirdAlerts);
        Assert.Equal("FIM-HASH-CHANGED", thirdAlerts[0].RuleId);
        Assert.NotEqual(thirdAlerts[0].Evidence["previousSha256"], thirdAlerts[0].Evidence["currentSha256"]);
    }

    [Fact]
    public void SecurityEventMonitor_Classifies_Known_Events()
    {
        var (ruleId, sev, _) = SecurityEventMonitor.ClassifyEvent("Security", 4625);
        Assert.Equal("WIN-SEC-4625", ruleId);
        Assert.Equal("medium", sev);

        var (defRule, defSev, _) = SecurityEventMonitor.ClassifyEvent("Microsoft-Windows-Windows Defender/Operational", 5001);
        Assert.Equal("WIN-DEF-DISABLED", defRule);
        Assert.Equal("high", defSev);
    }

    public void Dispose()
    {
        try { Directory.Delete(_tempDir, recursive: true); } catch { }
    }
}
