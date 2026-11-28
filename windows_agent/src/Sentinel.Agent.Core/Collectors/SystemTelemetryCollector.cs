using System.Diagnostics;
using System.Net.NetworkInformation;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using Microsoft.Extensions.Logging;
using Microsoft.Win32;
using Sentinel.Agent.Core.Models;

namespace Sentinel.Agent.Core.Collectors;

public sealed class SystemTelemetryCollector
{
    private readonly ILogger<SystemTelemetryCollector>? _logger;
    private ulong _prevIdleTime;
    private ulong _prevKernelTime;
    private ulong _prevUserTime;
    private bool _hasPrevCpu;

    private long _prevNetBytesSent;
    private long _prevNetBytesReceived;
    private DateTimeOffset _prevNetTimestamp;
    private bool _hasPrevNet;

    private readonly string _agentVersion;
    private readonly string _agentIntegrityHash;

    public SystemTelemetryCollector(ILogger<SystemTelemetryCollector>? logger = null)
    {
        _logger = logger;
        _agentVersion = Assembly.GetEntryAssembly()?.GetName().Version?.ToString() ?? "1.0.0";
        _agentIntegrityHash = ComputeSelfSha256();
        TrySampleCpuTimes(out _prevIdleTime, out _prevKernelTime, out _prevUserTime, out _hasPrevCpu);
    }

    public SystemTelemetrySnapshot Collect(string endpointId, bool includeConnections = true)
    {
        var now = DateTimeOffset.UtcNow;
        var (memPct, memUsedMb, memAvailMb, memTotalMb) = CollectMemory();
        var (diskPct, diskFreeGb, diskTotalGb) = CollectSystemDisk();
        var (osVersion, osBuild) = CollectWindowsVersion();
        var (txPerSec, rxPerSec, interfaces) = CollectNetwork(now);

        return new SystemTelemetrySnapshot
        {
            IdempotencyKey = $"{endpointId}_{now:yyyyMMddHHmmss}_{Guid.NewGuid():N}"[..48],
            EndpointId = endpointId,
            CapturedAt = now,
            Hostname = Environment.MachineName,
            OsVersion = osVersion,
            OsBuild = osBuild,
            AgentVersion = _agentVersion,
            AgentIntegrityHash = _agentIntegrityHash,
            CpuPercent = Math.Round(CollectCpuPercent(), 2),
            MemoryPercent = Math.Round(memPct, 2),
            MemoryUsedMb = memUsedMb,
            MemoryAvailableMb = memAvailMb,
            MemoryTotalMb = memTotalMb,
            DiskPercent = Math.Round(diskPct, 2),
            DiskFreeGb = diskFreeGb,
            DiskTotalGb = diskTotalGb,
            UptimeSeconds = Environment.TickCount64 / 1000,
            ProcessCount = Process.GetProcesses().Length,
            FirewallEnabled = IsWindowsFirewallEnabled(),
            NetworkBytesSentPerSec = txPerSec,
            NetworkBytesReceivedPerSec = rxPerSec,
            NetworkInterfaces = interfaces,
            ActiveConnections = includeConnections ? CollectActiveConnections(maxEntries: 25) : new()
        };
    }

    private double CollectCpuPercent()
    {
        if (!TrySampleCpuTimes(out var idle, out var kernel, out var user, out var ok) || !ok)
            return 0.0;

        if (!_hasPrevCpu)
        {
            _prevIdleTime = idle;
            _prevKernelTime = kernel;
            _prevUserTime = user;
            _hasPrevCpu = true;
            return 0.0;
        }

        var idleDelta = idle - _prevIdleTime;
        var kernelDelta = kernel - _prevKernelTime;
        var userDelta = user - _prevUserTime;

        _prevIdleTime = idle;
        _prevKernelTime = kernel;
        _prevUserTime = user;

        var total = kernelDelta + userDelta;
        if (total == 0) return 0.0;

        var busy = total - idleDelta;
        return Math.Clamp((double)busy / total * 100.0, 0.0, 100.0);
    }

    private static (double Percent, long UsedMb, long AvailMb, long TotalMb) CollectMemory()
    {
        var memStatus = new MEMORYSTATUSEX { dwLength = (uint)Marshal.SizeOf<MEMORYSTATUSEX>() };
        if (!GlobalMemoryStatusEx(ref memStatus))
            return (0, 0, 0, 0);

        var totalMb = (long)(memStatus.ullTotalPhys / (1024 * 1024));
        var availMb = (long)(memStatus.ullAvailPhys / (1024 * 1024));
        var usedMb = Math.Max(0, totalMb - availMb);
        var pct = totalMb > 0 ? (double)usedMb / totalMb * 100.0 : 0.0;
        return (pct, usedMb, availMb, totalMb);
    }

    private static (double Percent, long FreeGb, long TotalGb) CollectSystemDisk()
    {
        try
        {
            var sysRoot = Path.GetPathRoot(Environment.SystemDirectory) ?? "C:\\";
            var drive = new DriveInfo(sysRoot);
            if (!drive.IsReady || drive.TotalSize <= 0)
                return (0, 0, 0);

            var totalGb = drive.TotalSize / (1024L * 1024 * 1024);
            var freeGb = drive.AvailableFreeSpace / (1024L * 1024 * 1024);
            var used = drive.TotalSize - drive.AvailableFreeSpace;
            var pct = (double)used / drive.TotalSize * 100.0;
            return (pct, freeGb, totalGb);
        }
        catch
        {
            return (0, 0, 0);
        }
    }

    private static (string OsVersion, string OsBuild) CollectWindowsVersion()
    {
        try
        {
            using var key = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\Windows NT\CurrentVersion");
            if (key is not null)
            {
                var productName = key.GetValue("ProductName")?.ToString() ?? "Windows";
                var displayVersion = key.GetValue("DisplayVersion")?.ToString() ?? "";
                var build = key.GetValue("CurrentBuildNumber")?.ToString() ?? Environment.OSVersion.Version.Build.ToString();
                var ubr = key.GetValue("UBR")?.ToString() ?? "0";

                if (int.TryParse(build, out var buildNum) && buildNum >= 22000 && productName.Contains("Windows 10"))
                    productName = productName.Replace("Windows 10", "Windows 11");

                var versionStr = string.IsNullOrWhiteSpace(displayVersion) ? productName : $"{productName} ({displayVersion})";
                return (versionStr, $"{build}.{ubr}");
            }
        }
        catch
        {
            // Fallback to Environment.OSVersion
        }
        return (Environment.OSVersion.VersionString, Environment.OSVersion.Version.Build.ToString());
    }

    private (long TxPerSec, long RxPerSec, List<NetworkInterfaceSummary> Interfaces) CollectNetwork(DateTimeOffset now)
    {
        var summaries = new List<NetworkInterfaceSummary>();
        long totalSent = 0;
        long totalRecv = 0;

        try
        {
            foreach (var nic in NetworkInterface.GetAllNetworkInterfaces())
            {
                if (nic.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;

                if (nic.OperationalStatus == OperationalStatus.Up)
                {
                    var stats = nic.GetIPStatistics();
                    totalSent += stats.BytesSent;
                    totalRecv += stats.BytesReceived;
                }

                summaries.Add(new NetworkInterfaceSummary
                {
                    Name = nic.Name,
                    Status = nic.OperationalStatus.ToString(),
                    Type = nic.NetworkInterfaceType.ToString(),
                    SpeedMbps = nic.Speed > 0 ? nic.Speed / 1_000_000 : 0
                });
            }
        }
        catch (Exception ex)
        {
            _logger?.LogDebug(ex, "Error enumerating network interfaces");
        }

        long txRate = 0;
        long rxRate = 0;
        if (_hasPrevNet)
        {
            var elapsed = (now - _prevNetTimestamp).TotalSeconds;
            if (elapsed > 0.5)
            {
                txRate = Math.Max(0, (long)((totalSent - _prevNetBytesSent) / elapsed));
                rxRate = Math.Max(0, (long)((totalRecv - _prevNetBytesReceived) / elapsed));
            }
        }

        _prevNetBytesSent = totalSent;
        _prevNetBytesReceived = totalRecv;
        _prevNetTimestamp = now;
        _hasPrevNet = true;

        return (txRate, rxRate, summaries.Take(10).ToList());
    }

    private static List<NetworkConnectionSummary> CollectActiveConnections(int maxEntries)
    {
        var results = new List<NetworkConnectionSummary>();
        try
        {
            var tcpConnections = IPGlobalProperties.GetIPGlobalProperties().GetActiveTcpConnections();
            foreach (var conn in tcpConnections.Take(maxEntries))
            {
                results.Add(new NetworkConnectionSummary
                {
                    Protocol = "TCP",
                    LocalAddress = conn.LocalEndPoint.Address.ToString(),
                    LocalPort = conn.LocalEndPoint.Port,
                    RemoteAddress = conn.RemoteEndPoint.Address.ToString(),
                    RemotePort = conn.RemoteEndPoint.Port,
                    State = conn.State.ToString()
                });
            }
        }
        catch
        {
            // Non-fatal if network stack query fails
        }
        return results;
    }

    public static bool IsWindowsFirewallEnabled()
    {
        try
        {
            var profiles = new[]
            {
                @"SYSTEM\CurrentControlSet\Services\SharedAccess\Parameters\FirewallPolicy\StandardProfile",
                @"SYSTEM\CurrentControlSet\Services\SharedAccess\Parameters\FirewallPolicy\PublicProfile",
                @"SYSTEM\CurrentControlSet\Services\SharedAccess\Parameters\FirewallPolicy\DomainProfile"
            };

            foreach (var path in profiles)
            {
                using var key = Registry.LocalMachine.OpenSubKey(path);
                if (key?.GetValue("EnableFirewall") is int val && val == 1)
                    return true;
            }
        }
        catch
        {
            // Ignore registry read failure
        }
        return false;
    }

    private static string ComputeSelfSha256()
    {
        try
        {
            var exePath = Environment.ProcessPath;
            if (string.IsNullOrEmpty(exePath) || !File.Exists(exePath))
                return "unknown";
            using var stream = File.OpenRead(exePath);
            var hash = SHA256.HashData(stream);
            return Convert.ToHexString(hash).ToLowerInvariant();
        }
        catch
        {
            return "unknown";
        }
    }

    private static bool TrySampleCpuTimes(out ulong idle, out ulong kernel, out ulong user, out bool ok)
    {
        ok = GetSystemTimes(out var idleFt, out var kernelFt, out var userFt);
        idle = ((ulong)idleFt.dwHighDateTime << 32) | idleFt.dwLowDateTime;
        kernel = ((ulong)kernelFt.dwHighDateTime << 32) | kernelFt.dwLowDateTime;
        user = ((ulong)userFt.dwHighDateTime << 32) | userFt.dwLowDateTime;
        return ok;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct FILETIME
    {
        public uint dwLowDateTime;
        public uint dwHighDateTime;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MEMORYSTATUSEX
    {
        public uint dwLength;
        public uint dwMemoryLoad;
        public ulong ullTotalPhys;
        public ulong ullAvailPhys;
        public ulong ullTotalPageFile;
        public ulong ullAvailPageFile;
        public ulong ullTotalVirtual;
        public ulong ullAvailVirtual;
        public ulong ullAvailExtendedVirtual;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetSystemTimes(out FILETIME lpIdleTime, out FILETIME lpKernelTime, out FILETIME lpUserTime);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GlobalMemoryStatusEx(ref MEMORYSTATUSEX lpBuffer);
}
