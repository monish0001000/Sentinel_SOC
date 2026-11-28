using System.Diagnostics;
using System.Reflection;
using System.ServiceProcess;
using System.Text.Json;
using Microsoft.Win32;
using Sentinel.Agent.Core.Models;
using Sentinel.Agent.Core.Security;

namespace Sentinel.Agent.Installer;

public sealed class InstallOptions
{
    public string InstallDir { get; set; } = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
        "SentinelSOC", "Agent");
    public string DataDir { get; set; } = DpapiIdentityStore.GetDefaultDataDirectory();
    public AgentConfig? Config { get; set; }
    public bool PurgeDataOnUninstall { get; set; }
}

public static class InstallEngine
{
    public const string ServiceName = "SentinelSOCAgent";
    public const string ServiceDisplayName = "Sentinel SOC Endpoint Agent";
    public const string UninstallRegKey = @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\SentinelSOCAgent";

    public static bool IsServiceInstalled()
    {
        try
        {
            return ServiceController.GetServices().Any(s => string.Equals(s.ServiceName, ServiceName, StringComparison.OrdinalIgnoreCase));
        }
        catch
        {
            return false;
        }
    }

    public static string InstallOrUpgrade(InstallOptions options, Action<string> log, bool isRepair = false)
    {
        log($"Preparing installation directory: {options.InstallDir}");
        Directory.CreateDirectory(options.InstallDir);

        if (IsServiceInstalled())
        {
            log("Stopping existing SentinelSOCAgent service...");
            StopServiceIfRunning(log);
        }

        var targetServiceExe = Path.Combine(options.InstallDir, "Sentinel.Agent.Service.exe");
        var uninstallerExe = Path.Combine(options.InstallDir, "Uninstall.exe");

        log("Extracting Sentinel.Agent.Service.exe...");
        ExtractEmbeddedServiceExe(targetServiceExe);

        var currentExe = Environment.ProcessPath;
        if (!string.IsNullOrEmpty(currentExe) &&
            File.Exists(currentExe) &&
            !string.Equals(Path.GetFullPath(currentExe), Path.GetFullPath(uninstallerExe), StringComparison.OrdinalIgnoreCase))
        {
            File.Copy(currentExe, uninstallerExe, overwrite: true);
        }

        log($"Securing data directory: {options.DataDir}");
        DpapiIdentityStore.SecureDirectoryPermissions(options.DataDir);
        Directory.CreateDirectory(Path.Combine(options.DataDir, "logs"));

        var configPath = Path.Combine(options.DataDir, "config.json");
        if (options.Config != null && (!File.Exists(configPath) || !isRepair))
        {
            log("Writing agent configuration...");
            var json = JsonSerializer.Serialize(options.Config, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(configPath, json);
        }

        if (!IsServiceInstalled())
        {
            log("Registering Windows service SentinelSOCAgent...");
            RunSc(new[]
            {
                "create", ServiceName,
                $"binPath= \"{targetServiceExe}\"",
                "start=", "auto",
                "DisplayName=", ServiceDisplayName
            });
            RunSc(new[]
            {
                "description", ServiceName,
                "Lightweight Sentinel SOC Windows endpoint telemetry, security event, and allowlisted firewall agent."
            });
        }
        else
        {
            log("Updating existing service binary path...");
            RunSc(new[] { "config", ServiceName, $"binPath= \"{targetServiceExe}\"", "start=", "auto" });
        }

        log("Configuring automatic crash recovery (restart on failure)...");
        RunSc(new[]
        {
            "failure", ServiceName,
            "reset=", "86400",
            "actions=", "restart/5000/restart/15000/restart/60000"
        });

        RegisterAddRemovePrograms(options.InstallDir, uninstallerExe);

        log("Starting SentinelSOCAgent service...");
        StartService(log);

        var identityPath = Path.Combine(options.DataDir, "identity.dpapi");
        if (!File.Exists(identityPath))
        {
            log("Waiting briefly for initial Firebase enrollment & DPAPI identity...");
            for (var i = 0; i < 6; i++)
            {
                if (File.Exists(identityPath)) break;
                Thread.Sleep(1000);
            }
        }

        var enrolled = File.Exists(identityPath);
        if (enrolled)
        {
            log("Enrollment verified: DPAPI endpoint identity created.");
            return "Installation successful. SentinelSOCAgent is running and enrolled with Firebase.";
        }

        log("Service started, awaiting Firebase connectivity or enrollment completion (check logs).");
        return "Service installed and running, but enrollment is pending connectivity. Check C:\\ProgramData\\SentinelSOC\\logs.";
    }

    public static void Uninstall(InstallOptions options, Action<string> log)
    {
        if (IsServiceInstalled())
        {
            log("Stopping SentinelSOCAgent service...");
            StopServiceIfRunning(log);

            log("Removing SentinelSOCAgent Windows service...");
            RunSc(new[] { "delete", ServiceName });
        }

        log("Removing Add/Remove Programs registry entry...");
        try
        {
            Registry.LocalMachine.DeleteSubKeyTree(UninstallRegKey, throwOnMissingSubKey: false);
        }
        catch (Exception ex)
        {
            log($"Registry cleanup warning: {ex.Message}");
        }

        if (Directory.Exists(options.InstallDir))
        {
            log($"Removing installation binaries in {options.InstallDir}...");
            var currentExe = Environment.ProcessPath ?? "";
            foreach (var file in Directory.GetFiles(options.InstallDir))
            {
                if (string.Equals(Path.GetFullPath(file), Path.GetFullPath(currentExe), StringComparison.OrdinalIgnoreCase))
                    continue; // Cannot delete running Uninstall.exe directly
                try { File.Delete(file); } catch { }
            }
        }

        if (options.PurgeDataOnUninstall && Directory.Exists(options.DataDir))
        {
            log($"Purging agent state, DPAPI identity, queue, and logs in {options.DataDir}...");
            try { Directory.Delete(options.DataDir, recursive: true); } catch (Exception ex) { log($"Data purge warning: {ex.Message}"); }
        }

        log("Uninstallation completed.");
    }

    private static void ExtractEmbeddedServiceExe(string targetPath)
    {
        var asm = Assembly.GetExecutingAssembly();
        using var stream = asm.GetManifestResourceStream("Sentinel.Agent.Service.exe")
            ?? throw new FileNotFoundException("Embedded Sentinel.Agent.Service.exe payload was not found in the installer.");
        using var fs = new FileStream(targetPath, FileMode.Create, FileAccess.Write, FileShare.None);
        stream.CopyTo(fs);
    }

    private static void StopServiceIfRunning(Action<string> log)
    {
        try
        {
            using var sc = new ServiceController(ServiceName);
            if (sc.Status != ServiceControllerStatus.Stopped && sc.Status != ServiceControllerStatus.StopPending)
            {
                sc.Stop();
            }
            sc.WaitForStatus(ServiceControllerStatus.Stopped, TimeSpan.FromSeconds(20));
        }
        catch (Exception ex)
        {
            log($"Service stop warning: {ex.Message}");
        }
    }

    private static void StartService(Action<string> log)
    {
        try
        {
            using var sc = new ServiceController(ServiceName);
            if (sc.Status != ServiceControllerStatus.Running)
            {
                sc.Start();
                sc.WaitForStatus(ServiceControllerStatus.Running, TimeSpan.FromSeconds(20));
            }
        }
        catch (Exception ex)
        {
            log($"Service start warning: {ex.Message}");
        }
    }

    private static void RegisterAddRemovePrograms(string installDir, string uninstallerExe)
    {
        using var key = Registry.LocalMachine.CreateSubKey(UninstallRegKey);
        key.SetValue("DisplayName", "Sentinel SOC Windows Endpoint Agent");
        key.SetValue("DisplayVersion", "1.0.0");
        key.SetValue("Publisher", "Sentinel SOC");
        key.SetValue("InstallLocation", installDir);
        key.SetValue("UninstallString", $"\"{uninstallerExe}\" --uninstall");
        key.SetValue("NoModify", 1, RegistryValueKind.DWord);
        key.SetValue("NoRepair", 0, RegistryValueKind.DWord);
    }

    private static void RunSc(string[] args)
    {
        var psi = new ProcessStartInfo
        {
            FileName = Path.Combine(Environment.SystemDirectory, "sc.exe"),
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true
        };
        foreach (var a in args) psi.ArgumentList.Add(a);
        using var proc = Process.Start(psi) ?? throw new InvalidOperationException("Failed to launch sc.exe");
        var stdout = proc.StandardOutput.ReadToEnd();
        var stderr = proc.StandardError.ReadToEnd();
        proc.WaitForExit();
        if (proc.ExitCode != 0)
            throw new InvalidOperationException($"sc.exe {string.Join(" ", args)} failed ({proc.ExitCode}): {stdout} {stderr}".Trim());
    }
}
