using System.Text.Json;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Sentinel.Agent.Core.Collectors;
using Sentinel.Agent.Core.Firebase;
using Sentinel.Agent.Core.Firewall;
using Sentinel.Agent.Core.Models;
using Sentinel.Agent.Core.Security;
using Sentinel.Agent.Core.Storage;
using Sentinel.Agent.Core.Sync;

namespace Sentinel.Agent.Service;

public sealed class AgentWorker : BackgroundService
{
    private readonly ILogger<AgentWorker> _logger;
    private readonly string _dataDir;
    private readonly string _configPath;
    private readonly HashSet<string> _processedPolicies = new();

    public AgentWorker(ILogger<AgentWorker> logger)
    {
        _logger = logger;
        _dataDir = DpapiIdentityStore.GetDefaultDataDirectory();
        _configPath = Path.Combine(_dataDir, "config.json");
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Sentinel Windows Endpoint Agent starting. DataDir={DataDir}", _dataDir);
        DpapiIdentityStore.SecureDirectoryPermissions(_dataDir);

        var config = LoadConfig();
        if (config == null || string.IsNullOrWhiteSpace(config.FirebaseProjectId) || string.IsNullOrWhiteSpace(config.FirebaseWebApiKey))
        {
            _logger.LogWarning("Agent configuration missing or incomplete at {ConfigPath}. Waiting for configuration.", _configPath);
            while (!stoppingToken.IsCancellationRequested)
            {
                await Task.Delay(TimeSpan.FromSeconds(15), stoppingToken);
                config = LoadConfig();
                if (config != null && !string.IsNullOrWhiteSpace(config.FirebaseProjectId) && !string.IsNullOrWhiteSpace(config.FirebaseWebApiKey))
                    break;
            }
            if (config == null) return;
        }

        var identityStore = new DpapiIdentityStore(_dataDir);
        using var queueStore = new DurableQueueStore(
            Path.Combine(_dataDir, "queue.db"),
            config.MaxQueueItems,
            config.MaxQueueSizeBytes,
            config.MinFreeDiskBytes);

        using var firebase = new FirebaseClient(config);
        var telemetryCollector = new SystemTelemetryCollector();
        var fimMonitor = new FileIntegrityMonitor(queueStore);
        var firewallManager = new SafeFirewallManager(config);
        var backoff = new BackoffPolicy(TimeSpan.FromSeconds(5), TimeSpan.FromMinutes(10));

        AgentIdentity? identity = await EnsureEnrolledAsync(config, identityStore, firebase, telemetryCollector, backoff, stoppingToken);
        if (identity == null) return;

        using var secMonitor = new SecurityEventMonitor(
            identity.EndpointId,
            alert =>
            {
                var json = JsonSerializer.Serialize(alert);
                queueStore.Enqueue(QueueItemType.Alert, alert.IdempotencyKey, json);
            },
            config.SuspiciousTempDirectories.Count > 0 ? config.SuspiciousTempDirectories : null);

        secMonitor.StartWatchers();

        var lastHistorical = DateTimeOffset.MinValue;
        var lastFimScan = DateTimeOffset.MinValue;
        var nextSyncAllowedAt = DateTimeOffset.MinValue;

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var now = DateTimeOffset.UtcNow;
                var snapshot = telemetryCollector.Collect(identity.EndpointId);

                // Check suspicious temp processes deterministically
                foreach (var alert in secMonitor.ScanSuspiciousTempProcesses())
                {
                    queueStore.Enqueue(QueueItemType.Alert, alert.IdempotencyKey, JsonSerializer.Serialize(alert));
                }

                // Periodic incremental FIM on configured directories only
                if (config.FimMonitoredDirectories.Count > 0 &&
                    (now - lastFimScan).TotalSeconds >= config.FimScanIntervalSeconds)
                {
                    lastFimScan = now;
                    foreach (var fimAlert in fimMonitor.ScanConfiguredDirectories(identity.EndpointId, config.FimMonitoredDirectories))
                    {
                        queueStore.Enqueue(QueueItemType.Alert, fimAlert.IdempotencyKey, JsonSerializer.Serialize(fimAlert));
                    }
                }

                // Periodic historical telemetry sample (e.g., every 5 minutes)
                if ((now - lastHistorical).TotalSeconds >= config.HistoricalSampleIntervalSeconds)
                {
                    lastHistorical = now;
                    queueStore.Enqueue(QueueItemType.TelemetrySample, snapshot.IdempotencyKey, JsonSerializer.Serialize(snapshot));
                }

                // Attempt cloud sync if backoff window has elapsed
                if (now >= nextSyncAllowedAt)
                {
                    try
                    {
                        var idToken = await firebase.EnsureValidIdTokenAsync(identity, updated => identityStore.Save(updated), stoppingToken);

                        // 1. Drain durable queue (Alerts, PolicyAcks, Historical Samples)
                        await DrainQueueAsync(firebase, identity, idToken, queueStore, stoppingToken);

                        // 2. Upload current heartbeat & latest metrics
                        var pending = queueStore.GetPendingCount();
                        var syncState = pending == 0 ? AgentSyncStates.Synced : AgentSyncStates.Syncing;
                        await firebase.UploadHeartbeatAsync(identity, idToken, snapshot, pending, syncState, stoppingToken);

                        // 3. Poll & evaluate desired firewall / control policies
                        var unenrollRequested = await PollAndApplyPoliciesAsync(
                            firebase, firewallManager, telemetryCollector, identityStore,
                            identity, idToken, queueStore, config, stoppingToken);
                        if (unenrollRequested)
                        {
                            _logger.LogInformation("Remote unenroll executed cleanly; stopping SentinelSOCAgent loop.");
                            break;
                        }

                        backoff.RecordSuccess();
                        nextSyncAllowedAt = DateTimeOffset.MinValue;
                    }
                    catch (FirebaseAuthException authEx)
                    {
                        _logger.LogError(authEx, "Firebase authentication/rules error. Backing off.");
                        var delay = backoff.RecordFailureAndGetDelay();
                        nextSyncAllowedAt = DateTimeOffset.UtcNow.Add(delay);
                    }
                    catch (Exception netEx) when (netEx is HttpRequestException or TaskCanceledException or OperationCanceledException)
                    {
                        if (stoppingToken.IsCancellationRequested) break;
                        var delay = backoff.RecordFailureAndGetDelay();
                        nextSyncAllowedAt = DateTimeOffset.UtcNow.Add(delay);
                        _logger.LogWarning("Offline or Firebase unreachable ({Message}). PendingQueue={Count}. Next retry in {DelaySeconds:F0}s",
                            netEx.Message, queueStore.GetPendingCount(), delay.TotalSeconds);
                    }
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Unexpected error in AgentWorker loop; continuing safely.");
            }

            await Task.Delay(TimeSpan.FromSeconds(Math.Max(15, config.HeartbeatIntervalSeconds)), stoppingToken);
        }

        _logger.LogInformation("Sentinel Windows Endpoint Agent stopped cleanly.");
    }

    private async Task<AgentIdentity?> EnsureEnrolledAsync(
        AgentConfig config,
        DpapiIdentityStore identityStore,
        FirebaseClient firebase,
        SystemTelemetryCollector collector,
        BackoffPolicy backoff,
        CancellationToken ct)
    {
        var existing = identityStore.Load();
        if (existing != null && !string.IsNullOrWhiteSpace(existing.RefreshToken))
        {
            _logger.LogInformation("Loaded enrolled endpoint identity. EndpointId={EndpointId}", existing.EndpointId);
            return existing;
        }

        if (string.IsNullOrWhiteSpace(config.EnrollmentToken) || string.IsNullOrWhiteSpace(config.OwnerUid))
        {
            _logger.LogError("Endpoint is not enrolled and EnrollmentToken/OwnerUid is missing from config.json.");
            return null;
        }

        var endpointId = Guid.NewGuid().ToString("N");
        var snap = collector.Collect(endpointId, includeConnections: false);

        while (!ct.IsCancellationRequested)
        {
            try
            {
                var enrolled = await firebase.EnrollEndpointAsync(endpointId, config.EnrollmentToken!, snap.OsVersion, snap.AgentVersion, ct);
                identityStore.Save(enrolled);

                // Scrub one-time enrollment token from config.json after successful claim
                config.EnrollmentToken = null;
                SaveConfig(config);

                _logger.LogInformation("Successfully enrolled endpoint {EndpointId} for owner {OwnerUid}.", enrolled.EndpointId, enrolled.OwnerUid);
                backoff.RecordSuccess();
                return enrolled;
            }
            catch (Exception ex) when (!ct.IsCancellationRequested)
            {
                var delay = backoff.RecordFailureAndGetDelay();
                _logger.LogWarning(ex, "Enrollment attempt failed; retrying in {DelaySeconds:F0}s", delay.TotalSeconds);
                await Task.Delay(delay, ct);
            }
        }
        return null;
    }

    private async Task DrainQueueAsync(
        FirebaseClient firebase,
        AgentIdentity identity,
        string idToken,
        DurableQueueStore queueStore,
        CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            var batch = queueStore.DequeueBatch(20);
            if (batch.Count == 0) break;

            var completedIds = new List<long>();
            foreach (var item in batch)
            {
                try
                {
                    switch (item.ItemType)
                    {
                        case QueueItemType.Alert:
                            var alert = JsonSerializer.Deserialize<SecurityAlert>(item.PayloadJson);
                            if (alert != null) await firebase.UploadAlertAsync(identity, idToken, alert, ct);
                            break;
                        case QueueItemType.PolicyAck:
                            var ack = JsonSerializer.Deserialize<PolicyAck>(item.PayloadJson);
                            if (ack != null) await firebase.UploadPolicyAckAsync(identity, idToken, ack, ct);
                            break;
                        case QueueItemType.TelemetrySample:
                            var sample = JsonSerializer.Deserialize<SystemTelemetrySnapshot>(item.PayloadJson);
                            if (sample != null) await firebase.UploadTelemetrySampleAsync(identity, idToken, sample, ct);
                            break;
                    }
                    completedIds.Add(item.Id);
                }
                catch
                {
                    queueStore.IncrementAttempt(item.Id);
                    if (completedIds.Count > 0) queueStore.MarkCompleted(completedIds);
                    throw; // Stop draining on first failure so backoff kicks in
                }
            }

            queueStore.MarkCompleted(completedIds);
            if (batch.Count < 20) break;
        }
    }

    private async Task<bool> PollAndApplyPoliciesAsync(
        FirebaseClient firebase,
        SafeFirewallManager firewallManager,
        SystemTelemetryCollector telemetryCollector,
        DpapiIdentityStore identityStore,
        AgentIdentity identity,
        string idToken,
        DurableQueueStore queueStore,
        AgentConfig config,
        CancellationToken ct)
    {
        var policies = await firebase.FetchPoliciesAsync(identity, idToken, ct);
        foreach (var policy in policies)
        {
            if (_processedPolicies.Contains(policy.PolicyId)) continue;

            if (policy.Action is "sync_now" or "unenroll_agent")
            {
                var (valid, reason) = firewallManager.ValidatePolicy(policy, identity.EndpointId);
                PolicyAck ack;
                var shouldUnenroll = false;

                if (!valid)
                {
                    var state = policy.ExpiresAt <= DateTimeOffset.UtcNow ? "expired" : "rejected";
                    ack = new PolicyAck
                    {
                        AckId = $"{policy.PolicyId}_{state}",
                        PolicyId = policy.PolicyId,
                        EndpointId = identity.EndpointId,
                        State = state,
                        Message = reason,
                        AcknowledgedAt = DateTimeOffset.UtcNow
                    };
                }
                else if (policy.Action == "sync_now")
                {
                    var fresh = telemetryCollector.Collect(identity.EndpointId, includeConnections: true);
                    await firebase.UploadHeartbeatAsync(identity, idToken, fresh, queueStore.GetPendingCount(), AgentSyncStates.Synced, ct);
                    await firebase.UploadTelemetrySampleAsync(identity, idToken, fresh, ct);
                    ack = new PolicyAck
                    {
                        AckId = $"{policy.PolicyId}_applied",
                        PolicyId = policy.PolicyId,
                        EndpointId = identity.EndpointId,
                        State = "applied",
                        Message = $"Telemetry synced: CPU {fresh.CpuPercent:F1}%, RAM {fresh.MemoryPercent:F1}%, {fresh.ActiveConnections.Count} TCP sockets.",
                        AcknowledgedAt = DateTimeOffset.UtcNow
                    };
                }
                else
                {
                    shouldUnenroll = true;
                    ack = new PolicyAck
                    {
                        AckId = $"{policy.PolicyId}_applied",
                        PolicyId = policy.PolicyId,
                        EndpointId = identity.EndpointId,
                        State = "applied",
                        Message = "Remote unenroll acknowledged. Local DPAPI identity wiped; agent stopped.",
                        AcknowledgedAt = DateTimeOffset.UtcNow
                    };
                }

                _processedPolicies.Add(policy.PolicyId);
                try
                {
                    await firebase.UploadPolicyAckAsync(identity, idToken, ack, ct);
                }
                catch
                {
                    queueStore.Enqueue(QueueItemType.PolicyAck, ack.AckId, JsonSerializer.Serialize(ack));
                }

                if (shouldUnenroll)
                {
                    var identityFile = Path.Combine(_dataDir, "identity.dpapi");
                    if (File.Exists(identityFile)) File.Delete(identityFile);
                    config.EnrollmentToken = null;
                    SaveConfig(config);
                    return true;
                }
                continue;
            }

            var fwAck = await firewallManager.ExecutePolicyAsync(policy, identity.EndpointId, ct);
            _processedPolicies.Add(policy.PolicyId);

            try
            {
                await firebase.UploadPolicyAckAsync(identity, idToken, fwAck, ct);
            }
            catch
            {
                queueStore.Enqueue(QueueItemType.PolicyAck, fwAck.AckId, JsonSerializer.Serialize(fwAck));
            }
        }
        return false;
    }

    private AgentConfig? LoadConfig()
    {
        try
        {
            if (!File.Exists(_configPath)) return null;
            var json = File.ReadAllText(_configPath);
            return JsonSerializer.Deserialize<AgentConfig>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to parse config.json at {Path}", _configPath);
            return null;
        }
    }

    private void SaveConfig(AgentConfig config)
    {
        try
        {
            var json = JsonSerializer.Serialize(config, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(_configPath, json);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to update config.json");
        }
    }
}
