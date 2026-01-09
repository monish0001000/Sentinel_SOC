# 🛡️ Sentinel Level-8 Enterprise SOC

<img width="1366" height="768" alt="Screenshot (619)" src="https://github.com/user-attachments/assets/a454be14-dba5-458d-81f0-c129f6f5a141" />


![Build Status](https://img.shields.io/badge/Build-Passing-brightgreen)
![Python](https://img.shields.io/badge/Python-3.10-blue)
![Docker](https://img.shields.io/badge/Container-Docker-2496ED)
![React](https://img.shields.io/badge/Frontend-React_Vite-61DAFB)
![License](https://img.shields.io/badge/License-MIT-orange)

> **A Hybrid Microservices-based Enterprise SOC with AI-driven threat detection, autonomous SOAR response, and immutable SIEM logging.**

---

## 📖 Executive Summary

**Sentinel Level-8 Enterprise SOC** is a centralized **Command & Control (C2)** security platform designed to protect enterprise endpoints using **AI-powered detection and fully autonomous response mechanisms**.

Unlike traditional EDR or monitoring tools, Sentinel Level-8 operates on a **complete autonomous OODA Loop**:

- **Observe** – Collect real-time endpoint telemetry  
- **Orient** – Analyze behavior patterns using AI  
- **Decide** – Validate threats via SOAR logic  
- **Act** – Execute firewall blocks or host isolation in milliseconds  

Human intervention is optional — the system is designed to **act first, report instantly**.

---

## 🏗️ System Architecture (Microservices)

Sentinel follows a **containerized, fault-tolerant microservices architecture** orchestrated using Docker.

```mermaid
graph TD
    Attacker((Threat Actor)) -->|Malicious Activity| Agent[Sentinel Agent - Windows]
    Agent -->|Encrypted WebSocket| C2[C2 Core - FastAPI]
    C2 -->|Publish| Redis[(Redis Event Bus)]

    subgraph Internal_Services
        Redis -->|soc_logs| AI[AI Brain]
        Redis -->|soc_logs| SIEM[SIEM Vault]
        AI -->|High Confidence Alert| SOAR[SOAR Engine]
        SOAR -->|c2_commands| Redis
    end

    Redis -->|Execute Command| C2
    C2 -->|Firewall Rule| WFP[Windows Filtering Platform]
    WFP -->|Block / Isolate| Attacker

    Redis -->|Live Events| UI[React SOC Dashboard]
🧠 Core Components Breakdown
🧠 C2 Core (The Brain)
Role: Central orchestrator & command gateway

Tech: Python 3.10, FastAPI, WebSockets

Functionality:

Maintains persistent agent connections

Executes SOAR commands

Controls Firewall via Windows Filtering Platform (WFP)

⚡ Redis Event Bus (The Nervous System)
Role: High-speed asynchronous communication layer

Channels:

soc_logs – Raw telemetry & events

soc_alerts – High-risk alerts

c2_commands – Firewall & isolation actions

🔮 AI Brain (The Analyst)
Role: Real-time behavioral threat analysis

Function:

Detects ransomware, credential theft, lateral movement

Outputs probabilistic confidence scores (0–100%)

Operates on live streaming telemetry

🛡️ SOAR Engine (The Judge)
Role: Autonomous decision engine

Logic Example:

matlab
Copy code
IF threat_confidence > 90%
THEN block_ip OR isolate_host
Executes responses without human approval

🔒 SIEM Vault (The Auditor)
Role: Immutable forensic log storage

Security:

SHA-256 Merkle Chain Hashing

Tamper-evident, blockchain-style log integrity

🖥️ Frontend Dashboard (The Command Center)
Tech: React 18, Vite, TypeScript, Tailwind CSS, ShadCN UI

Features:

Real-time alerts

Active agent monitoring

Risk scores & system health

Single Pane of Glass SOC view

⚡ Life of an Attack (End-to-End Flow)
Scenario: Ransomware attempts rapid file encryption.

Detection
Sentinel Agent detects abnormal high-frequency file writes.

Transmission
Telemetry sent to C2 Core via WebSocket.

Broadcast
Event published to Redis soc_logs.

Analysis
AI Brain flags behavior as Ransomware (Confidence: 98%).

Decision
SOAR validates threat > threshold.

Action
block_ip or isolate_host command issued.

Execution
C2 Core enforces rule via WFP Firewall.

Visualization
SOC Dashboard flashes RED ALERT instantly 🚨

🚀 Key Technical Features
🧠 Autonomous Intelligence
AI-driven detection with probabilistic scoring

Zero-delay SOAR execution

No human dependency for containment

🛡️ Resilience & Self-Healing
Exponential Backoff: Agent reconnects (2s → 4s → 8s)

Startup Reset: Redis flushall() clears stale panic states

Live Sync: WebSocket-based UI updates (no polling)

🔒 Security & Integrity
AES-256 encrypted communication

SHA-256 Merkle-hashed logs

Hybrid Linux (Backend) + Native Windows (Agent)

🛠️ Technology Stack
Layer	Technology
Backend	Python 3.10, FastAPI, AsyncIO
Infrastructure	Docker, Docker Compose
Messaging	Redis (Pub/Sub)
Frontend	React 18, Vite, Tailwind, ShadCN UI
Agent	Native Python, psutil, winreg
Security	AES-256, SHA-256, Windows Filtering Platform

🧬 Microservices
c2_core – Command gateway & firewall executor

ai_brain – Threat prediction engine

soar_engine – Automated response engine

siem_vault – Immutable forensic storage

🏁 Getting Started
Prerequisites
Docker Desktop (WSL2 enabled)

Python 3.10+

Node.js & npm

Step 1: Start Backend
bash
Copy code
cd Sentinel_Level8_Enterprise
docker-compose up --build
Step 2: Start Frontend
bash
Copy code
cd c2_core/UI
npm install
npm run dev
Access: http://localhost:8081

Step 3: Run Agent
bash
Copy code
cd c2_core/agent
python sentinel_agent.py
Step 4: Simulate Attack
text
Copy code
simulate_attack
Dashboard turns RED and Firewall blocks instantly 🔥

📜 License
MIT License — see LICENSE file.

<p align="center"> <b>Built with ❤️ by Monish</b><br> <i>Cybersecurity Analyst & Full-Stack Developer</i> </p> ```
