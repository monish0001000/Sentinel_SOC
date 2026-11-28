# Sentinel SOC — Windows Agent Installation, Upgrade, Repair & Uninstall Guide

## 1. Prerequisites

- **OS:** Windows 10 x64 (19041+) or Windows 11 x64.
- **Privileges:** Administrator privileges are required **only** during installation, upgrade, repair, uninstallation, or when optional remote firewall enforcement is enabled.
- **Dependencies:** None. `SentinelAgentSetup.exe` is self-contained and bundles the .NET 8 runtime and `Sentinel.Agent.Service.exe`.
- **Signing Notice:** Unless explicitly signed with an organizational Authenticode certificate, the development build of `SentinelAgentSetup.exe` is **unsigned**. Windows SmartScreen may prompt for confirmation on first run.

## 2. Step-by-Step Installation

1. Sign in to the **Sentinel SOC Web Dashboard** and navigate to **Nodes (EDR)**.
2. Click **Enroll Windows Endpoint**, enter an optional label, and click **Generate Token**.
3. Copy the generated **Enrollment Bundle JSON** (valid for 15 minutes, single-use).
4. Run `SentinelAgentSetup.exe` as Administrator.
5. Review the **Transparency & Permissions Disclosure** and check the consent box.
6. Paste the Enrollment Bundle JSON into the configuration box.
7. *(Optional)* Leave **Allow allowlisted remote Windows Firewall IP block policies** unchecked unless you explicitly want remote IP blocking enabled.
8. Click **Install Agent**.

### What the Installer Creates
- Service Binary: `C:\Program Files\SentinelSOC\Agent\Sentinel.Agent.Service.exe`
- Uninstaller: `C:\Program Files\SentinelSOC\Agent\Uninstall.exe`
- Protected Data & Logs: `C:\ProgramData\SentinelSOC\` (`config.json`, `identity.dpapi`, `queue.db`, `logs\sentinel-agent-YYYYMMDD.jsonl`)
- Windows Service: `SentinelSOCAgent` (Startup: `Automatic`, Recovery: `Restart after 5s / 15s / 60s`)
- Registry Entry: `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\SentinelSOCAgent`

## 3. Silent CLI Deployment

```powershell
# Fresh Install
SentinelAgentSetup.exe --install --config C:\path\to\enrollment.json --silent

# Upgrade (preserves existing DPAPI identity and offline queue)
SentinelAgentSetup.exe --install --silent

# Repair (re-extracts binary, restores service & recovery config, preserves config.json)
SentinelAgentSetup.exe --repair --silent

# Clean Uninstall (keeps logs/queue)
"C:\Program Files\SentinelSOC\Agent\Uninstall.exe" --uninstall --silent

# Full Purge Uninstall (also deletes C:\ProgramData\SentinelSOC)
"C:\Program Files\SentinelSOC\Agent\Uninstall.exe" --uninstall --purge-data --silent
```

## 4. Troubleshooting

- **Service fails to start:** Check `C:\ProgramData\SentinelSOC\logs\sentinel-agent-*.jsonl` and Windows Event Viewer (`Application` log, source `SentinelSOCAgent`).
- **Endpoint shows `Never Connected` or `Offline`:** Verify outbound HTTPS (TCP 443) to `identitytoolkit.googleapis.com`, `securetoken.googleapis.com`, and `firestore.googleapis.com`.
- **Enrollment rejected:** Ensure the 15-minute single-use pairing token has not expired or already been claimed. Generate a fresh token from the dashboard.
- **Security Event 4625 not appearing:** Reading the Windows `Security` event log requires `SeSecurityPrivilege` (LocalSystem).
