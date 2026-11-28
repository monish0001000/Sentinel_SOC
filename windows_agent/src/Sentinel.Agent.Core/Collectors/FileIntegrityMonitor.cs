using System.Security.Cryptography;
using Microsoft.Extensions.Logging;
using Sentinel.Agent.Core.Models;
using Sentinel.Agent.Core.Storage;

namespace Sentinel.Agent.Core.Collectors;

public sealed class FileIntegrityMonitor
{
    private readonly DurableQueueStore _store;
    private readonly ILogger<FileIntegrityMonitor>? _logger;
    private const int MaxFilesPerDirectory = 2000;

    public FileIntegrityMonitor(DurableQueueStore store, ILogger<FileIntegrityMonitor>? logger = null)
    {
        _store = store;
        _logger = logger;
    }

    public List<SecurityAlert> ScanConfiguredDirectories(string endpointId, IEnumerable<string> directories)
    {
        var alerts = new List<SecurityAlert>();

        foreach (var rawDir in directories)
        {
            var dir = Environment.ExpandEnvironmentVariables(rawDir);
            if (string.IsNullOrWhiteSpace(dir) || !Directory.Exists(dir))
                continue;

            int scanned = 0;
            IEnumerable<string> files;
            try
            {
                files = Directory.EnumerateFiles(dir, "*", SearchOption.TopDirectoryOnly);
            }
            catch (Exception ex)
            {
                _logger?.LogWarning(ex, "Cannot enumerate FIM directory {Dir}", dir);
                continue;
            }

            foreach (var filePath in files)
            {
                if (++scanned > MaxFilesPerDirectory) break;

                try
                {
                    var info = new FileInfo(filePath);
                    if (!info.Exists || info.Length > 100 * 1024 * 1024) continue; // Skip >100MB files

                    var lwt = info.LastWriteTimeUtc.ToString("O");
                    var (prevHash, prevSize, prevLwt) = _store.GetFimBaseline(filePath);

                    // Incremental check: skip SHA-256 computation if size & mtime are unchanged
                    if (prevHash != null && prevSize == info.Length && string.Equals(prevLwt, lwt, StringComparison.Ordinal))
                        continue;

                    var currentHash = ComputeSha256(filePath);
                    _store.UpsertFimBaseline(filePath, currentHash, info.Length, lwt);

                    if (prevHash != null && !string.Equals(prevHash, currentHash, StringComparison.OrdinalIgnoreCase))
                    {
                        var key = $"{endpointId}_fim_{currentHash[..16]}_{info.LastWriteTimeUtc:yyyyMMddHHmmss}";
                        alerts.Add(new SecurityAlert
                        {
                            IdempotencyKey = key.Length > 64 ? key[..64] : key,
                            EndpointId = endpointId,
                            RuleId = "FIM-HASH-CHANGED",
                            RuleVersion = "1.0.0",
                            Severity = "high",
                            EventTime = DateTimeOffset.UtcNow,
                            Reason = $"File integrity change detected in monitored directory for '{Path.GetFileName(filePath)}'.",
                            ConfidenceNotes = "SHA-256 mismatch against baseline.",
                            Enforced = false,
                            Evidence = new Dictionary<string, string>
                            {
                                ["filePath"] = filePath,
                                ["previousSha256"] = prevHash,
                                ["currentSha256"] = currentHash,
                                ["fileSize"] = info.Length.ToString()
                            }
                        });
                    }
                }
                catch (Exception ex)
                {
                    _logger?.LogDebug(ex, "FIM skipped file {File}", filePath);
                }
            }
        }

        return alerts;
    }

    public static string ComputeSha256(string filePath)
    {
        using var stream = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
        var hash = SHA256.HashData(stream);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }
}
