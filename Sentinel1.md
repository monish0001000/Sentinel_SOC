# Sentinel SOC - Level 8 Enterprise Documentation

## 1. Project Overview

Sentinel SOC is a cutting-edge, hybrid Security Operations Center (SOC) designed to monitor, detect, analyze, and respond to cyber threats in real-time. It combines the flexibility of distributed agents with the power of centralized, containerized microservices.

### Key Features
- **Real-Time Monitoring**: WebSocket-based event streaming from agents to the dashboard.
- **Immutable Logging**: Blockchain-inspired SIEM ensuring log data cannot be tampered with.
- **AI-Powered Analysis**: Integration with Ollama for intelligent threat scoring and explanation.
- **Predictive Defense**: Attack graph analysis based on MITRE ATT&CK to predict attacker next moves.
- **Automated Response (SOAR)**: Playbooks for automatic containment of high-severity threats.
- **Cross-Platform**: Dockerized core services with Windows-compatible reporting agents.

---

## 2. System Architecture

The project follows a **Hybrid Microservices Architecture**:

### Core Services (Dockerized)
These run within a Docker network (`sentinel_net`) and handle the heavy lifting.

| Service | Technology | Purpose |
| :--- | :--- | :--- |
| **C2 Core** | Python (FastAPI) | Main API Gateway and WebSocket Server. |
| **SIEM Vault** | Python + SQLite | Secure log storage with cryptographic linking. |
| **SOAR Engine** | Python | Executes automated response playbooks. |
| **AI Brain** | Python + Ollama | Threat analysis and anomaly detection. |
| **Redis** | Redis | Message Bus (Pub/Sub) and Caching. |
| **TimescaleDB** | PostgreSQL | Time-series storage for metrics and logs. |

### Frontend (User Interface)
- **Technology**: React (Vite) + TypeScript + TailwindCSS + Shadcn/UI
- **Location**: `c2_core/UI`
- **Function**: Provides a real-time dashboard for analysts to view alerts, traffic, and manage incidents.

### Endpoint Agents
- **Sentinel Windows Agent**: A standalone Python script (`sentinel_soc_windows.py`) that runs on host machines to monitor Event Logs, Network Traffic, and File Integrity. It communicates with the Core via API and Redis.

---

## 3. Setup & Installation

### Prerequisites
- **Docker Desktop** (running)
- **Node.js** (v18+)
- **Python** (3.10+)
- **Ollama** (Optional, for local AI features)

### A. Core Infrastructure Setup
1. Open a terminal in the project root:
   ```powershell
   cd "d:\project\Sentinel\Sentinel_level8\Sentinel_Level8_Enterprise - Copy"
   ```
2. Build and start the containerized services:
   ```powershell
   docker-compose up --build -d
   ```
3. Verify services are running:
   - Check Docker Desktop or run `docker ps`.
   - **C2 API**: Accessible at `http://localhost:8000/docs`

### B. Frontend Setup
The dashboard runs separately to allow for rapid UI development.

1. Open a new terminal and navigate to the UI directory:
   ```powershell
   cd c2_core/UI
   ```
2. Install dependencies:
   ```powershell
   npm install
   ```
3. Start the development server:
   ```powershell
   npm run dev
   ```
4. Access the dashboard at the URL provided (usually `http://localhost:5173`).

### C. Agent Setup (Optional)
To monitor your local Windows machine:

1. Ensure you have the required Python libraries (see `sentinel_soc_windows.py` imports).
   ```powershell
   pip install psutil redis httpx pywin32 rich
   ```
2. Run the agent:
   ```powershell
   python sentinel_soc_windows.py
   ```

---

## 4. Usage Guide

### Accessing the Dashboard
- Open your browser to `http://localhost:5173` (or the port shown by `npm run dev`).
- **Dashboard**: View live traffic maps, active alerts, and system health.
- **Incidents**: Manage and investigate security incidents created by the SIEM.
- **Firewall**: Manually block IPs/Ports or enable "Panic Mode".

### Simulating Attacks
You can use the `sentinel_soc_windows.py` agent to simulate traffic, or use the API debug endpoints:
- **POST** `http://localhost:8000/api/debug/inject`
- Body:
  ```json
  {
    "message": "Simulated Brute Force Attack",
    "severity": "CRITICAL",
    "source": "192.168.1.50",
    "type": "T1110"
  }
  ```

---

## 5. Troubleshooting

- **Redis Connection Error**: Ensure the `redis` container is running and port 6379 is exposed. If running the agent on the host, `localhost` should work. Inside containers, use `redis` as the hostname.
- **Frontend API Errors**: Ensure the frontend is pointing to `http://localhost:8000`. Check CORS settings in `c2_core/server/api.py`.
- **Database Locks**: If SQLite errors occur (`database is locked`), ensure high-concurrency writes are managed or restart the specific service.

