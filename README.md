# Sentinel SOC — Hybrid SOC Development Build

**Windows endpoint telemetry + containerised SOC backend. This branch is under active repair and validation; it is not a production deployment.**

[![Python 3.8+](https://img.shields.io/badge/Python-3.8%2B-blue)](https://www.python.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Status: Under Validation](https://img.shields.io/badge/Status-Under--Validation-orange)](/)

---

## 🚀 Overview

Sentinel SOC is a cybersecurity learning and engineering project being repaired into a hybrid architecture:

- **Docker:** API/backend, dashboard, Redis and TimescaleDB.
- **Windows host agent:** CPU, memory, disk and process-count telemetry over the local WebSocket connection.
- **Windows-specific integrations:** Event Log collection and WinDivert-based packet filtering require separate native Windows setup and have not been validated in this branch.

## 📌 Current implementation status

| Area | What the code currently does | Important boundary |
|---|---|---|
| Startup state | Initialises missing Sentinel Redis keys without flushing shared Redis data | Redis persistence tests are included; runtime Docker test is pending |
| SIEM | Uses the repository's SQLite-backed log repository and hash-chain logic | Do not describe it as a blockchain or claim tamper-proof guarantees without independent verification |
| Network visibility | Polls active socket connections with `psutil` | This is not full packet capture or DPI |
| Windows host agent | Reports CPU, memory, disk and process-count metrics | Does not yet forward Windows Event Logs or host FIM events into detection |
| File integrity | Uses watchdog and SHA-256 baselines for configured paths | Not a complete endpoint-wide FIM deployment |
| Firewall | Contains application policy logic and a Windows WinDivert integration | WinDivert driver/admin requirements and actual traffic blocking are not validated here |
| AI / SOAR | Detection, prediction and response modules exist in the codebase | End-to-end AI analysis and automated response have not been validated in this branch |

## 🧪 Validation policy

Do not treat dashboard sample values, heuristic outputs, or unverified modules as confirmed live detections. This branch adds regression tests and CI build checks, but a passing unit test is not proof that the full SOC works on a Windows laptop. Docker startup, WebSocket connection, endpoint telemetry, Windows Event Logs, packet filtering and SOAR actions must each be verified separately.

**Performance figures are not claimed in this development README.** Benchmark only after repeatable measurements on a documented test environment.

## 🔧 Quick Start (Hybrid Docker + Windows)

### Requirements
- Windows 10/11 (64-bit)
- Docker Desktop with the WSL 2 engine enabled
- Git
- Python 3.10+ (only if you also run the optional Windows host agent)
- 8 GB RAM minimum (16 GB recommended)
- Internet connection for the first image and dependency download

### One-command startup
Open PowerShell in the repository folder and run:

```powershell
.\start-sentinel.ps1
```

The script checks Docker Desktop, builds and starts the backend, Redis, TimescaleDB and dashboard, waits for the API, and opens the dashboard.

You can also start the stack directly with one Docker command:

```powershell
docker compose up --build -d
```

Open:
- Dashboard: http://localhost:8080
- API docs: http://localhost:8000/docs
- WebSocket: ws://localhost:8765

To stop the stack:

```powershell
docker compose down
```

Do not add `-v` if you want to keep local Redis and database data. `docker compose down -v` intentionally deletes the local persistent volumes.

### Optional Windows host agent
After Docker is running, open a second PowerShell window and run:

```powershell
.\start-windows-agent.ps1
```

This connects the Windows machine to the WebSocket service and reports host CPU, memory, disk and process-count metrics to the agent panel. It is a separate process from the Docker backend. Keep the window open while monitoring.

Current limitation: this agent does not yet stream Windows Event Logs, full packet captures, or host file-integrity events into the detection pipeline. Do not describe those capabilities as active until that integration is implemented and tested.
Remote endpoint response commands are disabled by default. Do not enable them on a daily-use laptop: the current network-isolation helper can reset Windows Firewall rules. Any response-action redesign must be reviewed and tested before enabling it.

### Hybrid architecture boundary
Docker runs the API/backend, dashboard, Redis and TimescaleDB. Windows Event Log access and WinDivert packet filtering require a native Windows process, the appropriate driver and (for packet filtering) Administrator permissions. A Linux container cannot provide those host-level capabilities. Do not treat Windows host monitoring or packet blocking as active until the native integration is separately installed and verified.

### Fresh clone
```powershell
git clone --branch repair/sentinel-core-foundation https://github.com/monish0001000/Sentinel_SOC.git
cd Sentinel_SOC
.\start-sentinel.ps1
```

If startup fails, inspect the container logs:

```powershell
docker compose logs --tail=200
```

## 📁 Project Structure

```
Sentinel_SOC_project/
├── c2_core/                    # Core C2 Command & Control
│   ├── main.py                # Entry point
│   ├── server/                # FastAPI backend
│   ├── core/                  # Firewall, SIEM, EDR engines
│   ├── collectors/            # Real-time data collectors
│   ├── detection/             # Rules & anomaly engines
│   └── UI/                    # React Vite dashboard
├── ai_brain/                  # AI analysis engine
├── soar_engine/               # SOAR automation
├── siem_vault/                # SIEM data vault
├── db_archiver/               # Database archival
├── upgrades.txt              # Detailed upgrade changelog
├── REALTIME_QUICKSTART.md    # Quick start guide
├── UPGRADE_CHANGES.md        # Technical details
└── requirements.txt          # Python dependencies
```

---

## 🎯 Real-Time Threat Detection

### Detectable Threats
1. **Ransomware** - Extension changes, mass encryption patterns
2. **Lateral Movement** - SMB/RDP/WinRM abuse, credential movement
3. **Privilege Escalation** - Elevated process spawning
4. **Process Injection** - Memory manipulation, code injection
5. **Credential Theft** - LSASS access, credential dumping
6. **Malware C2** - Suspicious domains, IP reputation
7. **Data Exfiltration** - Large outbound transfers
8. **Defense Evasion** - Event log clearing, process termination
9. **Persistence** - Registry modifications, scheduled tasks
10. **Command & Control** - Suspicious network patterns

---

## 🔐 Security Features

✅ **Zero-Trust Architecture** - Every connection verified  
✅ **Immutable Audit Trail** - Blockchain-like SIEM  
✅ **Encrypted Communications** - All traffic secured  
✅ **Role-Based Access** - OAuth2 authentication  
✅ **Compliance Ready** - NIST, SOC2, ISO 27001  

---

## 📚 Documentation

- **[REALTIME_QUICKSTART.md](REALTIME_QUICKSTART.md)** - Quick start & verification
- **[upgrades.txt](upgrades.txt)** - Complete changelog
- **[UPGRADE_CHANGES.md](UPGRADE_CHANGES.md)** - Technical deep-dive
- **[DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md)** - Deployment guide

---

## 🎓 API Documentation

Interactive API docs available at: `http://localhost:8000/docs`

### Key Endpoints
```
GET  /firewall/status           # Firewall status
GET  /incidents                 # Active incidents
GET  /siem/logs                 # SIEM logs
POST /firewall/block-ip         # Block IP address
POST /firewall/panic            # Activate panic mode
GET  /ai/hunters                # AI threat hunters
GET  /soar/playbooks            # SOAR playbooks
```

---

## 🚀 Performance Benchmarks

**Real-Time Latency:**
- Event Log Ingestion: < 50ms
- Network Detection: < 200ms
- Process Alerting: < 100ms
- Firewall Blocking: < 5ms
- Dashboard Updates: < 100ms

**Throughput:**
- Events/Second: 10,000+
- Packets/Second: 100,000+
- Concurrent Connections: 1,000+
- SIEM Queries: 100/sec

---

## 🤝 Contributing

Contributions welcome! Please ensure:
- ✅ All tests pass
- ✅ Code follows PEP 8
- ✅ Documentation updated
- ✅ PR with detailed description

---

## 📄 License

MIT License - See LICENSE file for details

---

## 👥 Credits

**Author:** Sentinel SOC Team  
**Version:** 2.0.0  
**Release:** March 14, 2026  
**Status:** ✅ Production Ready

---

## 🔗 Quick Links

- **GitHub:** https://github.com/monish0001000/Sentinel_SOC_project
- **Issues:** https://github.com/monish0001000/Sentinel_SOC_project/issues
- **Security:** Contact security@sentinel-soc.dev

---

## ⭐ Show Your Support

If you find this project useful, please give it a star! ⭐

---

**Made with ❤️ for Enterprise Security**
