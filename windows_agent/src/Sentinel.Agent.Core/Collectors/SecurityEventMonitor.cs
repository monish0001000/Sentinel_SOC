using System.Diagnostics;
using System.Diagnostics.Eventing.Reader;
using Microsoft.Extensions.Logging;
using Sentinel.Agent.Core.Models;

namespace Sentinel.Agent.Core.Collectors;

public sealed class SecurityEventMonitor : IDisposable
{
    private readonly string _endpointId;
    private readonly ILogger<SecurityEventMonitor>? _logger;
    private readonly Action<SecurityAlert> _onAlert;
    private readonly List<EventLogWatcher> _watchers = new();
    private readonly List<string> _suspiciousTempDirs;

    public SecurityEventMonitor(
        string endpointId,
        Action<SecurityAlert> onAlert,
        IEnumerable<string>? suspiciousTempDirs = null,
        ILogger<SecurityEventMonitor>? logger = null)
    {
        _endpointId = endpointId;
        _onAlert = onAlert;
        _logger = logger;
        _suspiciousTempDirs = (suspiciousTempDirs ?? DefaultTempDirs())
            .Select(d => Environment.ExpandEnvironmentVariables(d).TrimEnd('\\'))
            .Where(d => !string.IsNullOrWhiteSpace(d))
            .ToList();
    }

    private static IEnumerable<string> DefaultTempDirs() => new[]
    {
        @"%TEMP%",
        @"C:\Windows\Temp",
        @"C:\Users\Public"
    };

    public void StartWatchers()
    {
        // 1. Windows Security Log (Failed logons 4625, Firewall changes 4946/4947/4948, Account changes 4720/4726)
        TryAttachWatcher("Security", "*[System[(EventID=4625 or EventID=4720 or EventID=4726 or EventID=4946 or EventID=4947 or EventID=4948)]]");

        // 2. Windows System Log (Service state/config changes 7036, 7040, unexpected shutdown 6008)
        TryAttachWatcher("System", "*[System[(EventID=7040 or EventID=6008)]]");

        // 3. Windows Defender Operational Log (1116 threat detected, 1117 action taken, 5001/5010/5012 protection disabled)
        TryAttachWatcher("Microsoft-Windows-Windows Defender/Operational", "*[System[(EventID=1116 or EventID=1117 or EventID=5001 or EventID=5010 or EventID=5012)]]");
    }

    private void TryAttachWatcher(string logName, string xpathQuery)
    {
        try
        {
            var query = new EventLogQuery(logName, PathType.LogName, xpathQuery);
            var watcher = new EventLogWatcher(query);
            watcher.EventRecordWritten += (_, args) => HandleEventRecord(logName, args);
            watcher.Enabled = true;
            _watchers.Add(watcher);
            _logger?.LogInformation("Attached event-driven Windows EventLogWatcher on {LogName}", logName);
        }
        catch (Exception ex) when (ex is UnauthorizedAccessException or EventLogNotFoundException or EventLogException)
        {
            _logger?.LogWarning("Could not attach EventLogWatcher on {LogName}: {Reason}", logName, ex.Message);
        }
    }

    private void HandleEventRecord(string logName, EventRecordWrittenEventArgs args)
    {
        if (args.EventException != null || args.EventRecord == null) return;

        try
        {
            using var rec = args.EventRecord;
            var eventId = rec.Id;
            var time = rec.TimeCreated.HasValue
                ? new DateTimeOffset(rec.TimeCreated.Value.ToUniversalTime(), TimeSpan.Zero)
                : DateTimeOffset.UtcNow;

            var (ruleId, severity, reason) = ClassifyEvent(logName, eventId);
            var key = $"{_endpointId}_evt_{logName.Replace(" ", "")}_{eventId}_{rec.RecordId ?? 0}";

            _onAlert(new SecurityAlert
            {
                IdempotencyKey = key.Length > 64 ? key[..64] : key,
                EndpointId = _endpointId,
                RuleId = ruleId,
                RuleVersion = "1.0.0",
                Severity = severity,
                EventTime = time,
                Reason = reason,
                ConfidenceNotes = "Direct Windows Event Log record; deterministic rule match.",
                Enforced = false,
                Evidence = new Dictionary<string, string>
                {
                    ["logName"] = logName,
                    ["eventId"] = eventId.ToString(),
                    ["recordId"] = (rec.RecordId ?? 0).ToString(),
                    ["provider"] = rec.ProviderName ?? "unknown"
                }
            });
        }
        catch (Exception ex)
        {
            _logger?.LogDebug(ex, "Error processing Windows EventRecord from {LogName}", logName);
        }
    }

    public static (string RuleId, string Severity, string Reason) ClassifyEvent(string logName, int eventId) =>
        (logName, eventId) switch
        {
            ("Security", 4625) => ("WIN-SEC-4625", "medium", "Failed Windows logon attempt detected (Event ID 4625)."),
            ("Security", 4720) => ("WIN-SEC-4720", "medium", "Local user account created (Event ID 4720)."),
            ("Security", 4726) => ("WIN-SEC-4726", "medium", "Local user account deleted (Event ID 4726)."),
            ("Security", 4946 or 4947 or 4948) => ("WIN-FW-CHANGE", "medium", $"Windows Firewall exception list modified (Event ID {eventId})."),
            ("System", 7040) => ("WIN-SVC-7040", "low", "Windows service start type changed (Event ID 7040)."),
            ("System", 6008) => ("WIN-SYS-6008", "medium", "Previous system shutdown was unexpected (Event ID 6008)."),
            (_, 1116 or 1117) => ("WIN-DEF-THREAT", "high", $"Windows Defender detected/acted on a threat (Event ID {eventId})."),
            (_, 5001 or 5010 or 5012) => ("WIN-DEF-DISABLED", "high", $"Windows Defender real-time or antispyware protection disabled (Event ID {eventId})."),
            _ => ($"WIN-EVT-{eventId}", "low", $"Windows event {eventId} recorded in {logName}.")
        };

    public List<SecurityAlert> ScanSuspiciousTempProcesses()
    {
        var alerts = new List<SecurityAlert>();
        foreach (var proc in Process.GetProcesses())
        {
            try
            {
                var path = proc.MainModule?.FileName;
                if (string.IsNullOrEmpty(path)) continue;

                foreach (var dir in _suspiciousTempDirs)
                {
                    if (path.StartsWith(dir, StringComparison.OrdinalIgnoreCase))
                    {
                        var key = $"{_endpointId}_proc_{proc.Id}_{proc.StartTime.ToUniversalTime():yyyyMMddHHmmss}";
                        alerts.Add(new SecurityAlert
                        {
                            IdempotencyKey = key.Length > 64 ? key[..64] : key,
                            EndpointId = _endpointId,
                            RuleId = "PROC-TEMP-EXEC",
                            RuleVersion = "1.0.0",
                            Severity = "medium",
                            EventTime = DateTimeOffset.UtcNow,
                            Reason = $"Process '{proc.ProcessName}' executing from user-writable/temp directory.",
                            ConfidenceNotes = "Metadata-only heuristic; legitimate installers also run from temp directories.",
                            Enforced = false,
                            Evidence = new Dictionary<string, string>
                            {
                                ["processName"] = proc.ProcessName,
                                ["pid"] = proc.Id.ToString(),
                                ["executablePath"] = path
                            }
                        });
                        break;
                    }
                }
            }
            catch
            {
                // Access denied on protected/system processes is normal under least privilege
            }
            finally
            {
                proc.Dispose();
            }
        }
        return alerts;
    }

    public void Dispose()
    {
        foreach (var watcher in _watchers)
        {
            try
            {
                watcher.Enabled = false;
                watcher.Dispose();
            }
            catch
            {
                // Ignore disposal errors
            }
        }
        _watchers.Clear();
    }
}
