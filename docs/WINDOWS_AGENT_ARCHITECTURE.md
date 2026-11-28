# Sentinel SOC — Windows Endpoint Agent Architecture

## 1. Overview

The Sentinel SOC Windows Endpoint Agent (`SentinelSOCAgent`) is a lightweight, native **.NET 8 (`net8.0-windows`) Windows Worker Service** designed for Windows 10 x64 and Windows 11 x64. It operates without Docker, Python, or local Redis/PostgreSQL dependencies and communicates exclusively over outbound HTTPS/TLS with **Firebase Authentication** and **Cloud Firestore** on the **Firebase Spark (Free)** plan.

## 2. Solution Structure

```text
windows_agent/
├── SentinelAgent.sln
├── src/
│   ├── Sentinel.Agent.Core/
│   │   ├── Collectors/
│   │   │   ├── SystemTelemetryCollector.cs   # Win32 GetSystemTimes, GlobalMemoryStatusEx, DriveInfo, NetworkInterface, TCP table
│   │   │   ├── SecurityEventMonitor.cs       # Event-driven EventLogWatcher (Security, System, Defender) + temp-exec heuristic
│   │   │   └── FileIntegrityMonitor.cs       # Incremental SHA-256 scanning of configured directories only
│   │   ├── Firebase/
│   │   │   └── FirebaseClient.cs             # TLS 1.2/1.3 REST client, Anonymous Auth + Refresh Token, idempotent Firestore writes
│   │   ├── Firewall/
│   │   │   └── SafeFirewallManager.cs        # Allowlisted Windows Firewall policy executor (disabled by default)
│   │   ├── Models/AgentModels.cs
│   │   ├── Security/DpapiIdentityStore.cs    # Windows DPAPI (LocalMachine) credential & identity protection
│   │   ├── Storage/DurableQueueStore.cs      # SQLite WAL-mode bounded offline queue + FIM baseline + corruption recovery
│   │   └── Sync/BackoffPolicy.cs             # Exponential backoff + randomized jitter
│   ├── Sentinel.Agent.Service/               # Windows Service host (UseWindowsService) + rolling JSONL & EventLog logging
│   └── Sentinel.Agent.Installer/             # Self-contained GUI & CLI Installer/Uninstaller EXE (SentinelAgentSetup.exe)
└── tests/
    └── Sentinel.Agent.Tests/                 # xUnit unit & Firebase Emulator integration tests
```

## 3. Data Collection Boundaries

- **Collected:** CPU %, RAM used/available/total, system drive free/total/%, uptime, Windows version & build, hostname, agent version & self-SHA-256, network interface status/throughput, active TCP connection metadata (IPs, ports, state), targeted Windows Event Log IDs (4625, 4720, 4726, 4946–4948, 7040, 6008, Defender 1116/1117/5001/5010/5012), and incremental SHA-256 hashes of explicitly configured FIM directories.
- **Never Collected:** Passwords, browser cookies, keystrokes, screenshots, private messages, personal user documents, or full packet payloads.

## 4. Spark-Compatible Cadence & Quota Budget

Default intervals keep daily Firestore writes well below the Spark free tier (20,000 writes/day):
- **Heartbeat & Latest Metrics:** 60 seconds (~1,440 writes/day per endpoint)
- **Historical Telemetry Sample:** 300 seconds (~288 writes/day per endpoint)
- **Security Alerts & Policy Acks:** Event-driven (written only when a deterministic rule matches)
- **Incremental FIM Scan:** 900 seconds (writes only when a file's SHA-256 changes)
