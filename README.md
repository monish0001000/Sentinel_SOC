# 🛡️ Sentinel Level-8 Enterprise SOC

<img width="1366" height="1193" alt="screencapture-localhost-8081-dashboard-2026-01-09-11_35_13" src="https://github.com/user-attachments/assets/a741366c-514a-417d-b7ce-5a1893818e9f" />

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

<img width="4093" height="4185" alt="Untitled diagram-2026-01-09-060248" src="https://github.com/user-attachments/assets/0d6f54a4-648a-40ba-9b28-1e9844b27fdc" />

##🧠 Core Components Breakdown
🧠 C2 Core (The Brain)
Role: Central orchestrator & command gateway

Tech: Python 3.10, FastAPI, WebSockets

Responsibilities:

Maintains persistent agent connections

Executes SOAR decisions

Controls Firewall via Windows Filtering Platform (WFP)

##⚡ Redis Event Bus (The Nervous System)
Role: High-speed asynchronous communication layer

##Channels:

soc_logs – Raw telemetry & events

soc_alerts – High-risk alerts

c2_commands – Firewall & isolation actions

##🔮 AI Brain (The Analyst)
Role: Real-time behavioral threat analysis

##Functions:

Detects ransomware, credential access, lateral movement

Generates probabilistic confidence scores (0–100%)

Operates on live streaming telemetry

##🛡️ SOAR Engine (The Judge)
Role: Autonomous decision engine

##Decision Logic:

text
Copy code
IF threat_confidence > 90%
THEN block_ip OR isolate_host
Executes containment without human intervention

##🔒 SIEM Vault (The Auditor)
Role: Immutable forensic log storage

Security Features:

SHA-256 Merkle Chain Hashing

Tamper-evident, audit-ready logs

##🖥️ Frontend Dashboard (The Command Center)
Tech: React 18, Vite, TypeScript, Tailwind CSS, ShadCN UI

##Features:

Real-time alerts

Active agent monitoring

Risk scores & system health

Single Pane of Glass SOC view

##⚡ Life of an Attack (End-to-End Flow)
Scenario: Ransomware attempts rapid file encryption.

Detection – Agent detects abnormal file write frequency

Transmission – Telemetry sent to C2 via WebSocket

Broadcast – Event published to Redis soc_logs

Analysis – AI flags Ransomware (Confidence: 98%)

Decision – SOAR validates threat threshold

Action – block_ip or isolate_host issued

Execution – C2 enforces rule via WFP

Visualization – Dashboard flashes RED ALERT 🚨

##🚀 Key Technical Features
##🧠 Autonomous Intelligence
AI-driven detection with confidence scoring

Zero-delay SOAR execution

No human dependency for containment

##🛡️ Resilience & Self-Healing
Exponential Backoff (2s → 4s → 8s)

Startup reset using Redis flushall()

Live WebSocket UI sync (no polling)

##🔒 Security & Integrity
AES-256 encrypted communication

SHA-256 Merkle-hashed logs

Hybrid Linux Backend + Native Windows Agent

##🛠️ Technology Stack
Layer	Technology
Backend	Python 3.10, FastAPI, AsyncIO
Infrastructure	Docker, Docker Compose
Messaging	Redis (Pub/Sub)
Frontend	React 18, Vite, Tailwind, ShadCN UI
Agent	Native Python, psutil, winreg
Security	AES-256, SHA-256, Windows Filtering Platform

##🧬 Microservices
c2_core – Command gateway & firewall executor

ai_brain – Threat prediction engine

soar_engine – Automated response engine

siem_vault – Immutable forensic storage

##🏁 Getting Started
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

##📜 License
MIT License — see LICENSE file.

<p align="center"> <b>Built with ❤️ by Monish</b><br> <i>Cybersecurity Analyst & Full-Stack Developer</i> </p> ```
