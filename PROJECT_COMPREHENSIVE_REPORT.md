# Sentinel SOC - Comprehensive Project Report
*(Version 2.0.0 - Real-Time Enterprise Edition)*

## 1. Executive Summary
**Sentinel SOC** is a production-grade, real-time Security Operations Center (SOC) engineered to provide comprehensive cybersecurity monitoring, threat detection, and automated incident response specifically focused on Windows environments. Diverging from simulated environments, version 2.0.0 operates entirely in real-time, delivering sub-millisecond response capabilities and incorporating an advanced hybrid microservices architecture. The platform combines decentralized endpoint agents with a centralized, containerized command-and-control (C2) core, utilizing artificial intelligence, immutable blockchain-secured logging, and Security Orchestration, Automation, and Response (SOAR).

## 2. High-Level System Architecture
The system architecture adopts a hybrid containerized/endpoint model running over Docker networks:
- **C2 Core (Command & Control):** Acts as the central nervous system built on FastAPI, handling API requests and WebSocket streams for real-time visualization.
- **SIEM Vault:** A proprietary Security Information and Event Management database utilizing cryptographic hashing (blockchain-inspired) to prevent log tampering.
- **SOAR Engine:** The automated response framework executing playbooks for threat remediation.
- **AI Brain:** An intelligence module powered by Large Language Models (like Ollama) and predictive algorithms to profile risks and anticipate attacker movement.
- **Dashboard Frontend:** A Next.js/React UI providing deep observability to security analysts.
- **Endpoint Agent:** Independent Python agents (`sentinel_soc_windows.py`) deployed on host machines performing raw data ingestion.

## 3. Detailed Structural & Functional Breakdown
The project is strictly organized into functional domains represented by core directories.

### A. Core Platform (`c2_core/`)
The primary backend processing and user interface engine.
- **`UI/` (Frontend Dashboard):**
  - Built with React, Vite, TypeScript, and TailwindCSS.
  - Contains `src/components/`, `src/pages/`, `src/context/` allowing operators to view global risk, incident logs, traffic maps, and manage firewall rules via WebSocket streams.
- **`server/` (API & Communcation):**
  - `api.py`: FastAPI routing definitions managing REST endpoints for incidents, firewall control, SIEM logs, and AI hunters.
  - `websocket_manager.py`: Handles high-frequency real-time payload broadcasting (<100ms latency) to connected UI clients.
  - `auth.py`, `database.py`: Authentication (OAuth2) and primary SQLite connection orchestration.
- **`core/` (Security Engines):**
  - `firewall.py` & `wfp_firewall.py`: Kernel-level firewall interception using Windows Filtering Platform (WFP) capable of sub-5ms blocking.
  - `adaptive_response.py` & `self_healing.py`: Mechanisms for the system to automatically adjust defense postures based on current risk quotients.
  - `threat_intel.py`: Contacts external IP/domain reputation APIs (e.g., AbuseIPDB, VirusTotal).
  - `global_risk_engine.py`: Computes overarching threat scores based on aggregate anomalies.
  - `incident_manager.py`: Evaluates triggers and manages the lifecycle of generated security incidents.
- **`collectors/` & `detection/`**: Submodules dedicated to ingesting raw telemetry and mapping them to predefined detection logic (like LOLBin abuse or process injection).

### B. Artificial Intelligence Engine (`ai_brain/`)
A dedicated microservice providing cognitive security analysis.
- **`ai/analyst.py`**: Interacts with local/remote LLMs to parse complex incident logs, generate human-readable explanations, and recommend mitigation steps.
- **`ai/predictive_engine.py`**: Utilizes the MITRE ATT&CK framework to anticipate an attacker's potential next steps (e.g., predicting lateral movement after a privilege escalation).
- **`ai/hunter.py`**: Proactive autonomous threat hunting functions querying the SIEM for hidden anomalies.
- **`ai/risk_scoring.py`**: Machine learning evaluations assigning confidence levels and criticality to events.
- **`ai/traffic_model.py`**: Network behavior analysis modeling normal baselines and flagging outliers.

### C. Security Orchestration, Automation, and Response (`soar_engine/`)
The automated enforcement arm of the SOC.
- **`playbook.py`**: Contains codified procedures to mitigate defined threats automatically (e.g., Ransomware Containment, Malicious IP Block).
- **`active_defense.py`**: Implements trap mechanisms ranging from honeypots to reactive credential honeytokens.
- **`listener.py`**: Subscribes to the internal event bus (Redis) to trigger playbooks the moment an incident severity crosses a critical threshold.

### D. Secure Data Architecture
- **`siem_vault/`**:
  - `core/verify_siem_integrity.py`: Validates the cryptographic chain of all stored logs. Prevents "Defense Evasion" techniques where attackers attempt to clear or modify event logs.
- **`db_archiver/`**:
  - `main.py` & `models.py`: Handles the long-term archiving, rotation, and schema mapping (SQLAlchemy) of `incident.db` and `sentinel_siem.db` to maintain performance during high-throughput ingestion.

### E. Endpoint Agent Integration
- **`sentinel_soc_windows.py`**: The edge node software running on client machines.
  - Collects live Windows Event Logs (streaming rather than polling).
  - Performs network packet captures via Npcap.
  - Executes File Integrity Monitoring (FIM) and process behavior analysis.
  - Forwards normalized data via highly compressed network boundaries back to the C2 Core.

### F. DevOps & Automation Scripts
- **`verify_realtime.py` & `verify_level9.py`**: Diagnostics scripts ensuring the dependencies, permissions, and network sockets are correctly configured for real-time operations.
- **`docker-compose.yml`**: Automates the container orchestration for the overarching network schema (`sentinel_net`) combining the backend APIs, databases, and message brokers like Redis/TimescaleDB (where configured).
- **`README.md` & `README_V2_REALTIME.md`**: Master documentation detailing installation parameters, performance metrics, and feature lists.

## 4. Key Operational Workflows
1. **Detection & Ingestion:** The Windows agent (`sentinel_soc_windows.py`) intercepts a malicious process injection event. It forwards this data via Redis/API to the C2 server within 50ms.
2. **Analysis:** `c2_core/core/incident_manager.py` evaluates the severity. The `ai_brain` maps this to MITRE ATT&CK and scores it.
3. **Storage:** The raw telemetry is written to the `siem_vault`, generating a cryptographic block-hash.
4. **Action:** The `soar_engine/listener.py` detects a critical score, immediately triggering a containment playbook in `playbook.py`, which invokes the kernel-level `wfp_firewall.py` to isolate the host within 5ms.
5. **Reporting:** Concurrently, `websocket_manager.py` streams the alert visualization to the Next.js `UI`, instantly notifying the SOC operator.

## 5. System Limits & Performance Benchmarks
Based on testing parameters outlined in the system documentation:
- **Event Log Ingestion:** < 50ms latency
- **Network Detection:** < 200ms
- **Process Alerting:** < 100ms
- **Firewall Efficacy:** < 5ms blocking via Kernel interception
- **Throughput:** > 10,000 events/sec

## 6. Conclusion
Sentinel SOC V2 represents a highly cohesive, hybrid microservices ecosystem. It effectively abstracts complex, low-level Windows security operations (WFP interaction, Npcap packet analysis) through an intelligent C2 framework, augmented heavily by AI and SOAR principles to negate manual mitigation latency.
