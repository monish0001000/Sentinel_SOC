using System.Text.Json;
using Sentinel.Agent.Core.Models;

namespace Sentinel.Agent.Installer;

public sealed class InstallerForm : Form
{
    private readonly TextBox _configJsonBox;
    private readonly CheckBox _consentCheckBox;
    private readonly CheckBox _enableFirewallCheckBox;
    private readonly CheckBox _purgeDataCheckBox;
    private readonly TextBox _logBox;
    private readonly Button _installBtn;
    private readonly Button _repairBtn;
    private readonly Button _uninstallBtn;

    public InstallerForm(bool startOnUninstall = false)
    {
        Text = "Sentinel SOC Windows Endpoint Agent — Setup (v1.0.0 Unsigned Dev Build)";
        Width = 720;
        Height = 620;
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;

        var header = new Label
        {
            Text = "Sentinel SOC Windows Endpoint Agent",
            Font = new Font("Segoe UI", 14, FontStyle.Bold),
            Location = new Point(20, 15),
            AutoSize = true
        };

        var disclosure = new TextBox
        {
            Multiline = true,
            ReadOnly = true,
            ScrollBars = ScrollBars.Vertical,
            Location = new Point(20, 50),
            Size = new Size(660, 130),
            Text =
                "TRANSPARENCY & PERMISSIONS DISCLOSURE:\r\n" +
                "• Collects: CPU, RAM, Disk, Uptime, Windows Version/Build, Network Interface & Connection Metadata, " +
                "Windows Security/System/Defender Event Logs, and incremental SHA-256 hashes of configured directories.\r\n" +
                "• NEVER Collects: Passwords, browser cookies, keystrokes, screenshots, private files, or full packet payloads.\r\n" +
                "• Permissions: Installs a Windows background service (SentinelSOCAgent) with automatic startup & crash recovery. " +
                "Normal monitoring runs with least privilege; remote firewall control is DISABLED by default unless enabled below.\r\n" +
                "• Security: Enrollment uses a single-use token and Windows DPAPI. No admin keys are embedded in this installer."
        };

        _consentCheckBox = new CheckBox
        {
            Text = "I understand what telemetry is collected and authorize installing the SentinelSOCAgent service.",
            Location = new Point(20, 190),
            AutoSize = true
        };

        var configLabel = new Label
        {
            Text = "Enrollment Bundle JSON (paste from Sentinel SOC Dashboard → Nodes → Enroll):",
            Location = new Point(20, 220),
            AutoSize = true
        };

        _configJsonBox = new TextBox
        {
            Multiline = true,
            ScrollBars = ScrollBars.Vertical,
            Location = new Point(20, 242),
            Size = new Size(660, 120),
            Font = new Font("Consolas", 9),
            PlaceholderText = "{\n  \"FirebaseProjectId\": \"...\",\n  \"FirebaseWebApiKey\": \"...\",\n  \"OwnerUid\": \"...\",\n  \"EnrollmentToken\": \"...\"\n}"
        };

        _enableFirewallCheckBox = new CheckBox
        {
            Text = "Allow allowlisted remote Windows Firewall IP block policies (disabled by default)",
            Location = new Point(20, 370),
            AutoSize = true
        };

        _purgeDataCheckBox = new CheckBox
        {
            Text = "On Uninstall: also delete local DPAPI identity, offline queue, and logs",
            Location = new Point(20, 395),
            AutoSize = true
        };

        _installBtn = new Button
        {
            Text = InstallEngine.IsServiceInstalled() ? "Upgrade Agent" : "Install Agent",
            Location = new Point(20, 430),
            Size = new Size(140, 34)
        };
        _installBtn.Click += async (_, _) => await RunActionAsync("install");

        _repairBtn = new Button
        {
            Text = "Repair",
            Location = new Point(170, 430),
            Size = new Size(110, 34),
            Enabled = InstallEngine.IsServiceInstalled()
        };
        _repairBtn.Click += async (_, _) => await RunActionAsync("repair");

        _uninstallBtn = new Button
        {
            Text = "Uninstall",
            Location = new Point(290, 430),
            Size = new Size(110, 34),
            Enabled = InstallEngine.IsServiceInstalled() || startOnUninstall
        };
        _uninstallBtn.Click += async (_, _) => await RunActionAsync("uninstall");

        _logBox = new TextBox
        {
            Multiline = true,
            ReadOnly = true,
            ScrollBars = ScrollBars.Vertical,
            Location = new Point(20, 478),
            Size = new Size(660, 90),
            Font = new Font("Consolas", 8.5f)
        };

        Controls.AddRange(new Control[]
        {
            header, disclosure, _consentCheckBox, configLabel, _configJsonBox,
            _enableFirewallCheckBox, _purgeDataCheckBox, _installBtn, _repairBtn, _uninstallBtn, _logBox
        });
    }

    private void AppendLog(string msg)
    {
        if (InvokeRequired)
        {
            Invoke(() => AppendLog(msg));
            return;
        }
        _logBox.AppendText($"[{DateTime.Now:HH:mm:ss}] {msg}{Environment.NewLine}");
    }

    private async Task RunActionAsync(string action)
    {
        if (action == "install" && !_consentCheckBox.Checked)
        {
            MessageBox.Show("Please acknowledge the telemetry & permissions disclosure first.", "Consent Required", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        AgentConfig? cfg = null;
        if (action == "install" && !string.IsNullOrWhiteSpace(_configJsonBox.Text))
        {
            try
            {
                cfg = JsonSerializer.Deserialize<AgentConfig>(_configJsonBox.Text, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                if (cfg != null) cfg.EnableRemoteFirewallControl = _enableFirewallCheckBox.Checked;
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Invalid Enrollment JSON: {ex.Message}", "Configuration Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }
        }

        _installBtn.Enabled = _repairBtn.Enabled = _uninstallBtn.Enabled = false;
        var options = new InstallOptions
        {
            Config = cfg,
            PurgeDataOnUninstall = _purgeDataCheckBox.Checked
        };

        try
        {
            await Task.Run(() =>
            {
                if (action == "uninstall") InstallEngine.Uninstall(options, AppendLog);
                else InstallEngine.InstallOrUpgrade(options, AppendLog, isRepair: action == "repair");
            });
            MessageBox.Show("Operation completed successfully.", "Sentinel SOC Setup", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            AppendLog($"ERROR: {ex.Message}");
            MessageBox.Show($"Operation failed: {ex.Message}", "Sentinel SOC Setup", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally
        {
            _installBtn.Enabled = true;
            _installBtn.Text = InstallEngine.IsServiceInstalled() ? "Upgrade Agent" : "Install Agent";
            _repairBtn.Enabled = _uninstallBtn.Enabled = InstallEngine.IsServiceInstalled();
        }
    }
}
