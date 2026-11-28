using System.Text.Json.Serialization;

namespace Sentinel.Agent.Core.Models;

public sealed class AgentConfig
{
    public string FirebaseProjectId { get; set; } = string.Empty;
    public string FirebaseWebApiKey { get; set; } = string.Empty;
    public string OwnerUid { get; set; } = string.Empty;
    public string? EnrollmentToken { get; set; }
    public string? FirestoreEmulatorHost { get; set; }
    public string? AuthEmulatorHost { get; set; }

    public int HeartbeatIntervalSeconds { get; set; } = 15;
    public int HistoricalSampleIntervalSeconds { get; set; } = 300;
    public int FimScanIntervalSeconds { get; set; } = 900;
    public int PolicyPollIntervalSeconds { get; set; } = 60;

    public int MaxQueueItems { get; set; } = 5000;
    public long MaxQueueSizeBytes { get; set; } = 50 * 1024 * 1024; // 50 MB
    public long MinFreeDiskBytes { get; set; } = 256 * 1024 * 1024; // 256 MB

    public bool EnableRemoteFirewallControl { get; set; } = false;
    public bool AllowLabPrivateIpExceptions { get; set; } = false;
    public List<string> FimMonitoredDirectories { get; set; } = new();
    public List<string> SuspiciousTempDirectories { get; set; } = new();
}

public sealed class AgentIdentity
{
    public string EndpointId { get; set; } = string.Empty;
    public string OwnerUid { get; set; } = string.Empty;
    public string AgentUid { get; set; } = string.Empty;
    public string RefreshToken { get; set; } = string.Empty;
    public string EnrollmentTokenHash { get; set; } = string.Empty;
    public DateTimeOffset EnrolledAt { get; set; }
}

public sealed class SystemTelemetrySnapshot
{
    public string IdempotencyKey { get; set; } = string.Empty;
    public string EndpointId { get; set; } = string.Empty;
    public DateTimeOffset CapturedAt { get; set; }
    public string Hostname { get; set; } = string.Empty;
    public string OsVersion { get; set; } = string.Empty;
    public string OsBuild { get; set; } = string.Empty;
    public string AgentVersion { get; set; } = string.Empty;
    public string AgentIntegrityHash { get; set; } = string.Empty;

    public double CpuPercent { get; set; }
    public double MemoryPercent { get; set; }
    public long MemoryUsedMb { get; set; }
    public long MemoryAvailableMb { get; set; }
    public long MemoryTotalMb { get; set; }

    public double DiskPercent { get; set; }
    public long DiskFreeGb { get; set; }
    public long DiskTotalGb { get; set; }

    public long UptimeSeconds { get; set; }
    public int ProcessCount { get; set; }
    public bool FirewallEnabled { get; set; }

    public long NetworkBytesSentPerSec { get; set; }
    public long NetworkBytesReceivedPerSec { get; set; }
    public List<NetworkInterfaceSummary> NetworkInterfaces { get; set; } = new();
    public List<NetworkConnectionSummary> ActiveConnections { get; set; } = new();
}

public sealed class NetworkInterfaceSummary
{
    public string Name { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public long SpeedMbps { get; set; }
}

public sealed class NetworkConnectionSummary
{
    public string Protocol { get; set; } = "TCP";
    public string LocalAddress { get; set; } = string.Empty;
    public int LocalPort { get; set; }
    public string RemoteAddress { get; set; } = string.Empty;
    public int RemotePort { get; set; }
    public string State { get; set; } = string.Empty;
    public int? ProcessId { get; set; }
    public string? ProcessName { get; set; }
    public string? RemoteHost { get; set; }
}

public sealed class SecurityAlert
{
    public string IdempotencyKey { get; set; } = string.Empty;
    public string EndpointId { get; set; } = string.Empty;
    public string RuleId { get; set; } = string.Empty;
    public string RuleVersion { get; set; } = "1.0.0";
    public string Severity { get; set; } = "medium"; // low, medium, high, critical
    public DateTimeOffset EventTime { get; set; }
    public string Reason { get; set; } = string.Empty;
    public string ConfidenceNotes { get; set; } = string.Empty;
    public bool Enforced { get; set; }
    public string Status { get; set; } = "open";
    public Dictionary<string, string> Evidence { get; set; } = new();
}

public sealed class FirewallPolicy
{
    public string PolicyId { get; set; } = string.Empty;
    public string TargetEndpointId { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty; // block_ip, unblock_ip, enable_rule, disable_rule, query_status
    public string? TargetIp { get; set; }
    public string? Direction { get; set; } = "Outbound";
    public string? RuleName { get; set; }
    public string Reason { get; set; } = string.Empty;
    public string CreatedBy { get; set; } = string.Empty;
    public int Version { get; set; } = 1;
    public bool Approved { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
}

public sealed class PolicyAck
{
    public string AckId { get; set; } = string.Empty;
    public string PolicyId { get; set; } = string.Empty;
    public string EndpointId { get; set; } = string.Empty;
    public string State { get; set; } = "received"; // received, applied, rejected, expired, failed
    public string Message { get; set; } = string.Empty;
    public DateTimeOffset AcknowledgedAt { get; set; }
}

public enum QueueItemType
{
    Heartbeat = 1,
    Alert = 2,
    PolicyAck = 3,
    TelemetrySample = 4
}

public sealed class QueuedTelemetryItem
{
    public long Id { get; set; }
    public string IdempotencyKey { get; set; } = string.Empty;
    public QueueItemType ItemType { get; set; }
    public int Priority { get; set; }
    public string PayloadJson { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }
    public int AttemptCount { get; set; }
}

public static class AgentHealthStates
{
    public const string Online = "online";
    public const string Reconnecting = "reconnecting";
    public const string Offline = "offline";
    public const string NeverConnected = "never_connected";
    public const string AuthFailure = "auth_failure";
    public const string Unhealthy = "unhealthy";
}

public static class AgentSyncStates
{
    public const string Synced = "synced";
    public const string QueuedOffline = "queued_offline";
    public const string Syncing = "syncing";
    public const string Error = "error";
}
