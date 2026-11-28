using System.Text.Json;
using Sentinel.Agent.Core.Models;
using Sentinel.Agent.Core.Security;

namespace Sentinel.Agent.Installer;

public sealed class InstallerForm : Form
{
    private sealed class EnrollmentBundlePayload
    {
        public string? FirebaseProjectId { get; set; }
        public string? FirebaseWebApiKey { get; set; }
        public string? OwnerUid { get; set; }
        public string? EnrollmentToken { get; set; }
        public DateTimeOffset? ExpiresAt { get; set; }
    }

    private readonly TextBox _configJsonBox;
    private readonly Button _importBtn;
    private readonly Button _validateBtn;
    private readonly Label _validationStatusLabel;
    private readonly CheckBox _consentCheckBox;
    private readonly CheckBox _enableFirewallCheckBox;
    private readonly CheckBox _purgeDataCheckBox;
    private readonly TextBox _logBox;
    private readonly Button _installBtn;
    private readonly Button _repairBtn;
    private readonly Button _uninstallBtn;

    public InstallerForm(bool startOnUninstall = false)
    {
        Text = "Sentinel SOC Windows Endpoint Agent — Setup (v1.0.1)";
        Width = 740;
        Height = 670;
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;

        var header = new Label
        {
            Text = "Sentinel SOC Windows Endpoint Agent (v1.0.1)",
            Font = new Font("Segoe UI", 14, FontStyle.Bold),
            Location = new Point(20, 15),
            AutoSize = true
        };

        var subtitle = new Label
        {
            Text = "Publisher: Sentinel SOC  •  Self-Contained Windows x64 Service (SentinelSOCAgent)",
            Font = new Font("Segoe UI", 9, FontStyle.Regular),
            ForeColor = Color.DimGray,
            Location = new Point(22, 42),
            AutoSize = true
        };

        var disclosure = new TextBox
        {
            Multiline = true,
            ReadOnly = true,
            ScrollBars = ScrollBars.Vertical,
            Location = new Point(20, 66),
            Size = new Size(680, 125),
            Text =
                "TRANSPARENCY & PERMISSIONS DISCLOSURE:\r\n" +
                "• Collects: Hostname, Windows Version/Build, CPU, RAM, Disk, Uptime, Network Interfaces & Connection Metadata, " +
                "Windows Security/System/Defender Event Logs, and incremental SHA-256 hashes of configured directories.\r\n" +
                "• NEVER Collects: Passwords, browser cookies, keystrokes, screenshots, private files, or full packet payloads.\r\n" +
                "• Permissions: Administrator (UAC) is required to register the SentinelSOCAgent service and secure C:\\ProgramData\\SentinelSOC.\r\n" +
                "• Security: Enrollment uses a single-use 15-minute token + Windows DPAPI. Remote firewall control is DISABLED by default."
        };

        _consentCheckBox = new CheckBox
        {
            Text = "I understand what telemetry is collected and authorize installing the SentinelSOCAgent service.",
            Location = new Point(20, 200),
            AutoSize = true
        };

        var configLabel = new Label
        {
            Text = "Enrollment Bundle JSON (Dashboard → Connect Endpoint):",
            Location = new Point(20, 230),
            AutoSize = true
        };

        _importBtn = new Button
        {
            Text = "Import JSON File...",
            Location = new Point(450, 224),
            Size = new Size(130, 26)
        };
        _importBtn.Click += OnImportJsonFile;

        _validateBtn = new Button
        {
            Text = "Validate Bundle",
            Location = new Point(588, 224),
            Size = new Size(112, 26)
        };
        _validateBtn.Click += (_, _) => ValidateBundleInput(showDialog: true);

        _configJsonBox = new TextBox
        {
            Multiline = true,
            ScrollBars = ScrollBars.Vertical,
            Location = new Point(20, 256),
            Size = new Size(680, 118),
            Font = new Font("Consolas", 9),
            PlaceholderText = "{\n  \"FirebaseProjectId\": \"...\",\n  \"FirebaseWebApiKey\": \"...\",\n  \"OwnerUid\": \"...\",\n  \"EnrollmentToken\": \"...\",\n  \"ExpiresAt\": \"...\"\n}"
        };

        _validationStatusLabel = new Label
        {
            Text = "Paste or import your one-time enrollment bundle JSON.",
            ForeColor = Color.DimGray,
            Location = new Point(20, 379),
            Size = new Size(680, 18)
        };

        _enableFirewallCheckBox = new CheckBox
        {
            Text = "Allow allowlisted remote Windows Firewall IP block policies (disabled by default)",
            Location = new Point(20, 404),
            AutoSize = true
        };

        _purgeDataCheckBox = new CheckBox
        {
            Text = "On Uninstall: also delete local DPAPI identity, SQLite offline queue, and logs",
            Location = new Point(20, 428),
            AutoSize = true
        };

        _installBtn = new Button
        {
            Text = InstallEngine.IsServiceInstalled() ? "Upgrade Agent" : "Install Agent",
            Location = new Point(20, 462),
            Size = new Size(145, 34)
        };
        _installBtn.Click += async (_, _) => await RunActionAsync("install");

        _repairBtn = new Button
        {
            Text = "Repair",
            Location = new Point(175, 462),
            Size = new Size(110, 34),
            Enabled = InstallEngine.IsServiceInstalled()
        };
        _repairBtn.Click += async (_, _) => await RunActionAsync("repair");

        _uninstallBtn = new Button
        {
            Text = "Uninstall",
            Location = new Point(295, 462),
            Size = new Size(110, 34),
            Enabled = InstallEngine.IsServiceInstalled() || startOnUninstall
        };
        _uninstallBtn.Click += async (_, _) => await RunActionAsync("uninstall");

        _logBox = new TextBox
        {
            Multiline = true,
            ReadOnly = true,
            ScrollBars = ScrollBars.Vertical,
            Location = new Point(20, 508),
            Size = new Size(680, 110),
            Font = new Font("Consolas", 8.5f)
        };

        Controls.AddRange(new Control[]
        {
            header, subtitle, disclosure, _consentCheckBox, configLabel, _importBtn, _validateBtn,
            _configJsonBox, _validationStatusLabel, _enableFirewallCheckBox, _purgeDataCheckBox,
            _installBtn, _repairBtn, _uninstallBtn, _logBox
        });
    }

    private void OnImportJsonFile(object? sender, EventArgs e)
    {
        using var dlg = new OpenFileDialog
        {
            Title = "Select Sentinel Enrollment Bundle JSON",
            Filter = "JSON files (*.json)|*.json|All files (*.*)|*.*"
        };
        if (dlg.ShowDialog() == DialogResult.OK)
        {
            _configJsonBox.Text = File.ReadAllText(dlg.FileName);
            ValidateBundleInput(showDialog: false);
        }
    }

    private AgentConfig? ValidateBundleInput(bool showDialog)
    {
        var raw = _configJsonBox.Text.Trim();
        if (string.IsNullOrWhiteSpace(raw))
        {
            SetValidationStatus("Enrollment bundle JSON is required for new installations.", isError: true);
            if (showDialog)
                MessageBox.Show("Paste or import an enrollment bundle JSON first.", "Validation Error", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return null;
        }

        try
        {
            var payload = JsonSerializer.Deserialize<EnrollmentBundlePayload>(raw, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            if (payload == null)
                throw new InvalidOperationException("Empty JSON payload.");

            if (string.IsNullOrWhiteSpace(payload.FirebaseProjectId) ||
                string.IsNullOrWhiteSpace(payload.FirebaseWebApiKey) ||
                string.IsNullOrWhiteSpace(payload.OwnerUid) ||
                string.IsNullOrWhiteSpace(payload.EnrollmentToken))
            {
                throw new InvalidOperationException("Missing required field(s): FirebaseProjectId, FirebaseWebApiKey, OwnerUid, or EnrollmentToken.");
            }

            if (payload.ExpiresAt.HasValue && payload.ExpiresAt.Value <= DateTimeOffset.UtcNow)
            {
                throw new InvalidOperationException($"Enrollment token expired at {payload.ExpiresAt.Value.LocalDateTime:g}. Generate a new token in the dashboard.");
            }

            var expiryNote = payload.ExpiresAt.HasValue
                ? $"Expires {payload.ExpiresAt.Value.LocalDateTime:t}"
                : "Expiry not specified";
            SetValidationStatus($"Valid enrollment bundle for project '{payload.FirebaseProjectId}' ({expiryNote}).", isError: false);

            if (showDialog)
                MessageBox.Show($"Enrollment bundle is valid for project '{payload.FirebaseProjectId}'.", "Bundle Valid", MessageBoxButtons.OK, MessageBoxIcon.Information);

            return new AgentConfig
            {
                FirebaseProjectId = payload.FirebaseProjectId.Trim(),
                FirebaseWebApiKey = payload.FirebaseWebApiKey.Trim(),
                OwnerUid = payload.OwnerUid.Trim(),
                EnrollmentToken = payload.EnrollmentToken.Trim(),
                EnableRemoteFirewallControl = _enableFirewallCheckBox.Checked
            };
        }
        catch (Exception ex)
        {
            SetValidationStatus(ex.Message, isError: true);
            if (showDialog)
                MessageBox.Show(ex.Message, "Invalid Enrollment Bundle", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return null;
        }
    }

    private void SetValidationStatus(string message, bool isError)
    {
        _validationStatusLabel.Text = message;
        _validationStatusLabel.ForeColor = isError ? Color.Firebrick : Color.ForestGreen;
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
        if (action == "install")
        {
            var isUpgrade = InstallEngine.IsServiceInstalled();
            var hasExistingIdentity = File.Exists(Path.Combine(DpapiIdentityStore.GetDefaultDataDirectory(), "identity.dpapi"));

            if (!isUpgrade || !hasExistingIdentity || !string.IsNullOrWhiteSpace(_configJsonBox.Text))
            {
                cfg = ValidateBundleInput(showDialog: true);
                if (cfg == null) return;
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
            string summary = await Task.Run(() =>
            {
                if (action == "uninstall")
                {
                    InstallEngine.Uninstall(options, AppendLog);
                    return "Uninstallation completed.";
                }

                return InstallEngine.InstallOrUpgrade(options, AppendLog, isRepair: action == "repair");
            });

            MessageBox.Show(summary, "Sentinel SOC Setup", MessageBoxButtons.OK, MessageBoxIcon.Information);
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
