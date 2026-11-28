using System.Text.Json;
using Sentinel.Agent.Core.Models;

namespace Sentinel.Agent.Installer;

internal static class Program
{
    [STAThread]
    static int Main(string[] args)
    {
        if (args.Any(a => a.Equals("--silent", StringComparison.OrdinalIgnoreCase)))
        {
            return RunSilent(args);
        }

        bool isUninstall = args.Any(a => a.Equals("--uninstall", StringComparison.OrdinalIgnoreCase));
        ApplicationConfiguration.Initialize();
        Application.Run(new InstallerForm(isUninstall));
        return 0;
    }

    private static int RunSilent(string[] args)
    {
        var options = new InstallOptions();
        var configPath = GetArgValue(args, "--config");
        var installDir = GetArgValue(args, "--install-dir");
        var dataDir = GetArgValue(args, "--data-dir");

        if (!string.IsNullOrWhiteSpace(installDir)) options.InstallDir = installDir;
        if (!string.IsNullOrWhiteSpace(dataDir)) options.DataDir = dataDir;
        options.PurgeDataOnUninstall = args.Any(a => a.Equals("--purge-data", StringComparison.OrdinalIgnoreCase));

        if (!string.IsNullOrWhiteSpace(configPath) && File.Exists(configPath))
        {
            options.Config = JsonSerializer.Deserialize<AgentConfig>(
                File.ReadAllText(configPath),
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        }

        try
        {
            if (args.Any(a => a.Equals("--uninstall", StringComparison.OrdinalIgnoreCase)))
            {
                InstallEngine.Uninstall(options, Console.WriteLine);
            }
            else if (args.Any(a => a.Equals("--repair", StringComparison.OrdinalIgnoreCase)))
            {
                InstallEngine.InstallOrUpgrade(options, Console.WriteLine, isRepair: true);
            }
            else
            {
                InstallEngine.InstallOrUpgrade(options, Console.WriteLine, isRepair: false);
            }
            return 0;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Installer error: {ex.Message}");
            return 1;
        }
    }

    private static string? GetArgValue(string[] args, string flag)
    {
        for (int i = 0; i < args.Length - 1; i++)
        {
            if (args[i].Equals(flag, StringComparison.OrdinalIgnoreCase))
                return args[i + 1];
        }
        return null;
    }
}
