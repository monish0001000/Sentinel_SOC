# Sentinel SOC — Windows Agent Test Report

**Date:** 2026-11-28  
**Branch:** `feature/firebase-web-edr-mvp`  
**Build Configuration:** `Release` (`win-x64`, self-contained .NET 8)  
**Signing Status:** Unsigned development build (no Authenticode certificate configured)

## 1. Automated Unit & Component Tests (`Sentinel.Agent.Tests`)

Executed via `dotnet test tests/Sentinel.Agent.Tests/Sentinel.Agent.Tests.csproj -c Release --no-restore --verbosity normal`:

- **Total:** 22 | **Passed:** 22 | **Failed:** 0 | **Skipped:** 0 | **Duration:** 1 s

| Category | Test Coverage | Result |
| :--- | :--- | :--- |
| **Offline Queue & Storage** | Persistence across restart, idempotency key deduplication, priority ordering (Alerts before TelemetrySamples), max-item bounded eviction, automatic corrupted SQLite recovery | **PASS** |
| **DPAPI Identity Store** | `LocalMachine` DPAPI encryption roundtrip (`Save` -> `Load` -> `Delete`) | **PASS** |
| **Genuine Telemetry** | Real Windows `GetSystemTimes` CPU, `GlobalMemoryStatusEx` RAM, `DriveInfo` disk, uptime, OS version/build, network interfaces | **PASS** |
| **File Integrity (FIM)** | Incremental baseline skip for unchanged files + SHA-256 mismatch alert on modification | **PASS** |
| **Security Event Classification** | Deterministic mapping for Windows Security (4625), Defender (5001), etc. | **PASS** |
| **Safe Remote Firewall** | Rejection of loopback, link-local, multicast, broadcast, RFC1918 (unless lab mode), shell-injection strings, disabled/expired/unapproved policies, non-allowlisted actions | **PASS** |
| **Backoff & Jitter** | Exponential growth, cap, randomized jitter bounds, reset on success | **PASS** |

## 2. Build & Packaging Verification

| Artifact | Result | Measured Size / Hash |
| :--- | :--- | :--- |
| `c2_core/UI/dist/index.html` (Vite Production Build) | **PASS** | Built cleanly with Firebase SDK (`firebase`) |
| `Sentinel.Agent.Service.exe` (Self-contained `win-x64`) | **PASS** | SHA-256: `91695309D163286FF7D2584AADE2A183488D98831F49D7BB70D4662F46D03A09` |
| `SentinelAgentSetup.exe` (Self-contained Installer + Embedded Service) | **PASS** | SHA-256: `971DD0919FE3D0F42045D01EEA2DFC4A10BFF92419904CBB8A89B51EF5C3531E` |

## 3. Measured Resource Consumption (Local Windows 10 x64)

Measured by launching `Sentinel.Agent.Service.exe` for 5 seconds and inspecting `Get-Process`:
- **Working Set RAM:** `38.16 MB` (Target: `< 100 MB`)
- **Private Memory:** `10.44 MB`
- **Total CPU Time (including cold startup):** `0.52 s` over 5 s

## 4. Tests Marked `NOT RUN` (Honest Scope)

The following tests were **NOT RUN** in this session and must be executed in a dedicated elevated Windows + Firebase environment before production release:
- **Firebase Local Emulator / Live Cloud End-to-End Test (`FirebaseEmulatorIntegrationTests`):** Compiled, but skipped at runtime without `SENTINEL_RUN_EMULATOR_TESTS=1` and a running Firebase Emulator Suite / configured `.env.local` project.
- **Elevated Windows Service Install / Upgrade / Repair / Uninstall (`sc.exe`):** Requires interactive UAC elevation as Administrator on the target Windows 10/11 host.
- **Windows Reboot Persistence & 24-Hour Soak Test:** Not executed within this session's timeframe.
- **Live Windows Defender / Security Log Event Injection & Live `netsh` Rule Application:** Requires elevated `LocalSystem` service execution.
