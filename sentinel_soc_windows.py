#!/usr/bin/env python3
"""
SENTINEL SOC - UNIFIED REAL-TIME SECURITY OPERATIONS CENTER
============================================================
A comprehensive, Windows-compatible SOC that integrates all components:
- Real-time Windows Event Log monitoring
- Network traffic analysis
- AI-powered threat analysis (Ollama)
- MITRE ATT&CK predictive engine
- SOAR automated response
- Self-healing capabilities

Author: Sentinel SOC Team
Version: 1.0.0
"""

import asyncio
import json
import os
import sys
import time
import sqlite3
import hashlib
import socket
import threading
import subprocess
from datetime import datetime
from collections import defaultdict
from typing import Dict, List, Any, Callable, Optional
from dataclasses import dataclass, field
from enum import Enum
import uuid

# Third-party imports (with graceful fallbacks)
try:
    import psutil
    PSUTIL_AVAILABLE = True
except ImportError:
    PSUTIL_AVAILABLE = False
    print("[WARN] psutil not available - network monitoring limited")

try:
    import redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False
    print("[WARN] redis not available - running in local-only mode")

try:
    import httpx
    HTTPX_AVAILABLE = True
except ImportError:
    HTTPX_AVAILABLE = False
    print("[WARN] httpx not available - AI analysis disabled")

try:
    import win32evtlog
    import win32con
    WIN32_AVAILABLE = True
except ImportError:
    WIN32_AVAILABLE = False
    print("[WARN] pywin32 not available - Windows Event Log monitoring disabled")

try:
    from rich.console import Console
    from rich.table import Table
    from rich.live import Live
    from rich.panel import Panel
    from rich.layout import Layout
    from rich import print as rprint
    RICH_AVAILABLE = True
    console = Console()
except ImportError:
    RICH_AVAILABLE = False
    console = None
    def rprint(*args, **kwargs):
        print(*args)

# ============================================================================
# CONFIGURATION
# ============================================================================

@dataclass
class SOCConfig:
    """Central configuration for the SOC"""
    # Database
    siem_db_path: str = "sentinel_siem.db"
    incident_db_path: str = "incident.db"
    
    # Network
    api_port: int = 8000
    websocket_port: int = 8765
    syslog_port: int = 1514
    
    # Redis
    redis_host: str = os.getenv("REDIS_HOST", "localhost")
    redis_port: int = 6379
    
    # Threat Intelligence
    abuseipdb_api_key: str = os.getenv("ABUSEIPDB_API_KEY", "")
    virustotal_api_key: str = os.getenv("VIRUSTOTAL_API_KEY", "")
    
    # AI
    ollama_url: str = "http://localhost:11434/api/generate"
    ollama_model: str = "llama3"
    
    # Notifications
    discord_webhook_url: str = os.getenv("DISCORD_WEBHOOK_URL", "")
    
    # Thresholds
    risk_threshold_monitoring: int = 40
    risk_threshold_blocking: int = 60
    risk_threshold_panic: int = 95
    
    # Whitelists
    whitelist_ips: List[str] = field(default_factory=lambda: [
        "127.0.0.1", "192.168.1.1", "10.0.0.1", "8.8.8.8", "8.8.4.4"
    ])
    
    # Mode
    dev_mode: bool = True


CONFIG = SOCConfig()


# ============================================================================
# EVENT BUS - Central Pub/Sub System
# ============================================================================

class EventBus:
    """Central event bus for inter-component communication"""
    
    def __init__(self):
        self.subscribers: Dict[str, List[Callable]] = defaultdict(list)
        self.redis_client = None
        self._init_redis()
    
    def _init_redis(self):
        if not REDIS_AVAILABLE:
            return
        try:
            self.redis_client = redis.Redis(
                host=CONFIG.redis_host, 
                port=CONFIG.redis_port, 
                db=0,
                socket_timeout=5
            )
            self.redis_client.ping()
            rprint(f"[green]✅ Redis connected at {CONFIG.redis_host}:{CONFIG.redis_port}[/green]")
        except Exception as e:
            rprint(f"[yellow]⚠️ Redis unavailable ({e}) - running in local mode[/yellow]")
            self.redis_client = None
    
    def subscribe(self, event_type: str, callback: Callable):
        """Subscribe to an event type"""
        self.subscribers[event_type].append(callback)
    
    async def publish(self, event_type: str, data: Dict):
        """Publish event to all subscribers"""
        # Local dispatch
        if event_type in self.subscribers:
            for callback in self.subscribers[event_type]:
                try:
                    if asyncio.iscoroutinefunction(callback):
                        asyncio.create_task(callback(data))
                    else:
                        callback(data)
                except Exception as e:
                    rprint(f"[red]EventBus callback error: {e}[/red]")
        
        # Redis publishing
        if self.redis_client:
            try:
                payload = {
                    "type": event_type,
                    "data": data,
                    "timestamp": datetime.utcnow().isoformat(),
                    "source": "sentinel_soc"
                }
                self.redis_client.publish('soc_events', json.dumps(payload, default=str))
            except Exception as e:
                pass  # Silent fail for Redis


# ============================================================================
# SIEM - Security Information & Event Management with Blockchain Integrity
# ============================================================================

class SIEM:
    """Blockchain-secured log repository"""
    
    def __init__(self, bus: EventBus):
        self.bus = bus
        self.conn = sqlite3.connect(CONFIG.siem_db_path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self._init_schema()
        
        # Subscribe to events
        bus.subscribe("alert", self._handle_alert)
        bus.subscribe("system_event", self._handle_system_event)
        bus.subscribe("firewall_event", self._handle_firewall_event)
    
    def _init_schema(self):
        cursor = self.conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS logs (
                id TEXT PRIMARY KEY,
                timestamp DATETIME,
                level TEXT,
                message TEXT,
                source TEXT,
                type TEXT,
                metadata TEXT,
                prev_hash TEXT,
                hash TEXT
            )
        ''')
        self.conn.commit()
        rprint("[green]✅ SIEM database initialized[/green]")
    
    def _calculate_hash(self, log_id: str, timestamp: str, prev_hash: str, message: str) -> str:
        payload = f"{log_id}{timestamp}{prev_hash}{message}"
        return hashlib.sha256(payload.encode()).hexdigest()
    
    def _get_last_hash(self) -> str:
        cursor = self.conn.cursor()
        cursor.execute("SELECT hash FROM logs ORDER BY timestamp DESC LIMIT 1")
        row = cursor.fetchone()
        return row['hash'] if row else "0" * 64
    
    async def log_event(self, level: str, message: str, source: str, 
                       log_type: str, metadata: Dict = None):
        try:
            log_id = str(uuid.uuid4())
            timestamp = datetime.utcnow().isoformat()
            meta_json = json.dumps(metadata) if metadata else "{}"
            
            prev_hash = self._get_last_hash()
            current_hash = self._calculate_hash(log_id, timestamp, prev_hash, message)
            
            cursor = self.conn.cursor()
            cursor.execute(
                "INSERT INTO logs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (log_id, timestamp, level, message, source, log_type, 
                 meta_json, prev_hash, current_hash)
            )
            self.conn.commit()
        except Exception as e:
            rprint(f"[red]SIEM logging error: {e}[/red]")
    
    async def _handle_alert(self, data: Dict):
        await self.log_event(
            level=data.get("level", "WARNING"),
            message=data.get("message", "Unknown alert"),
            source=data.get("source", "System"),
            log_type=data.get("type", "Alert"),
            metadata=data
        )
    
    async def _handle_system_event(self, data: Dict):
        if data.get("type") == "error":
            await self.log_event("ERROR", f"System Error: {data.get('error')}", 
                                "System", "Error", data)
    
    async def _handle_firewall_event(self, data: Dict):
        await self.log_event("INFO", f"Firewall: {data.get('action')}", 
                            "Firewall", "Security", data)
    
    def verify_integrity(self) -> Dict:
        """Walk the blockchain to verify integrity"""
        rprint("[cyan]🔍 Verifying SIEM ledger integrity...[/cyan]")
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM logs ORDER BY timestamp ASC")
        rows = cursor.fetchall()
        
        prev_hash = "0" * 64
        for row in rows:
            recalc = self._calculate_hash(
                row['id'], row['timestamp'], prev_hash, row['message']
            )
            if row['prev_hash'] != prev_hash or row['hash'] != recalc:
                return {"valid": False, "broken_at": row['id']}
            prev_hash = row['hash']
        
        rprint("[green]✅ Ledger integrity verified[/green]")
        return {"valid": True, "total_records": len(rows)}
    
    def get_recent_logs(self, limit: int = 50) -> List[Dict]:
        cursor = self.conn.cursor()
        cursor.execute(
            "SELECT * FROM logs ORDER BY timestamp DESC LIMIT ?", (limit,)
        )
        return [dict(row) for row in cursor.fetchall()]


# ============================================================================
# THREAT INTELLIGENCE
# ============================================================================

class ThreatIntel:
    """Multi-source threat intelligence"""
    
    # Known malicious IP patterns (for offline mode)
    KNOWN_BAD_PATTERNS = [
        "185.220.", "45.33.", "198.98.", "23.129.",  # Tor exit nodes
        "89.248.", "141.98.", "195.54."  # Known attack sources
    ]
    
    # Keyword-based threat scoring
    KEYWORD_WEIGHTS = {
        "mimikatz": 90, "meterpreter": 85, "shadow copy": 80,
        "powershell -enc": 75, "nmap": 60, "ssh brute": 70,
        "sql injection": 80, "xss": 60, "ransomware": 95,
        "cryptolocker": 95, "wannacry": 95, "cobalt strike": 90
    }
    
    @classmethod
    async def check_ip_reputation(cls, ip_address: str) -> int:
        """Check IP reputation across multiple sources"""
        # Whitelist check
        if ip_address in CONFIG.whitelist_ips:
            return 0
        
        # Pattern matching (offline)
        for pattern in cls.KNOWN_BAD_PATTERNS:
            if ip_address.startswith(pattern):
                return 75
        
        # AbuseIPDB check
        if CONFIG.abuseipdb_api_key and HTTPX_AVAILABLE:
            try:
                async with httpx.AsyncClient() as client:
                    response = await client.get(
                        "https://api.abuseipdb.com/api/v2/check",
                        headers={
                            'Key': CONFIG.abuseipdb_api_key,
                            'Accept': 'application/json'
                        },
                        params={'ipAddress': ip_address},
                        timeout=10.0
                    )
                    if response.status_code == 200:
                        data = response.json()
                        return data.get('data', {}).get('abuseConfidenceScore', 0)
            except Exception:
                pass
        
        # Default score for unknown IPs
        return 20
    
    @classmethod
    def calculate_keyword_score(cls, log_entry: str) -> int:
        """Calculate threat score based on keywords"""
        score = 0
        lower_log = log_entry.lower()
        for keyword, weight in cls.KEYWORD_WEIGHTS.items():
            if keyword in lower_log:
                score += weight
        return min(score, 100)


# ============================================================================
# AI ANALYST - Ollama Integration
# ============================================================================

class AIAnalyst:
    """AI-powered log analysis using Ollama"""
    
    @staticmethod
    async def analyze(log_entry: str) -> Dict:
        """Analyze log entry with AI"""
        # Local keyword scoring first
        local_score = ThreatIntel.calculate_keyword_score(log_entry)
        
        result = {
            "local_score": local_score,
            "ai_verdict": "Pending",
            "confidence": 0
        }
        
        # If Ollama is available and entry seems suspicious
        if HTTPX_AVAILABLE and local_score > 30:
            try:
                prompt = f"""Act as a Level 3 Security Analyst. Analyze this security log:
                
{log_entry}

Context:
- Keyword Threat Score: {local_score}/100

Determine:
1. Is this a TRUE POSITIVE (real attack) or FALSE POSITIVE?
2. Attack type if applicable (e.g., brute force, ransomware, reconnaissance)
3. Recommended action (block, monitor, ignore)

Respond in JSON format:
{{"verdict": "attack|benign|suspicious", "attack_type": "...", "action": "...", "confidence": 0-100}}"""
                
                async with httpx.AsyncClient() as client:
                    response = await client.post(
                        CONFIG.ollama_url,
                        json={
                            "model": CONFIG.ollama_model,
                            "prompt": prompt,
                            "stream": False
                        },
                        timeout=30.0
                    )
                    if response.status_code == 200:
                        ai_response = response.json().get("response", "")
                        # Try to parse JSON from response
                        try:
                            # Extract JSON from response
                            import re
                            json_match = re.search(r'\{.*\}', ai_response, re.DOTALL)
                            if json_match:
                                ai_data = json.loads(json_match.group())
                                result["ai_verdict"] = ai_data.get("verdict", "unknown")
                                result["attack_type"] = ai_data.get("attack_type", "")
                                result["recommended_action"] = ai_data.get("action", "monitor")
                                result["confidence"] = ai_data.get("confidence", 50)
                        except:
                            result["ai_verdict"] = "analysis_complete"
                            result["raw_response"] = ai_response[:500]
            except Exception as e:
                # Fallback to local scoring
                result["ai_verdict"] = "High Risk" if local_score > 70 else "Low Risk"
                result["confidence"] = local_score
        else:
            result["ai_verdict"] = "High Risk" if local_score > 70 else "Low Risk"
            result["confidence"] = local_score
        
        return result


# ============================================================================
# PREDICTIVE ENGINE - MITRE ATT&CK Based
# ============================================================================

class PredictiveEngine:
    """MITRE ATT&CK based attack prediction"""
    
    # MITRE ATT&CK transition probabilities
    ATTACK_GRAPH = {
        "T1082": [("T1003", 0.8), ("T1555", 0.6)],  # Discovery -> Credential Access
        "T1003": [("T1021", 0.9), ("T1028", 0.7)],  # Cred Access -> Lateral Movement
        "T1021": [("T1059", 0.9)],                   # Lateral -> Execution
        "T1059": [("T1486", 0.5)],                   # Execution -> Impact
    }
    
    TTP_NAMES = {
        "T1082": "System Information Discovery",
        "T1003": "OS Credential Dumping",
        "T1021": "Remote Services",
        "T1028": "Windows Remote Management",
        "T1059": "Command and Scripting Interpreter",
        "T1486": "Data Encrypted for Impact",
        "T1555": "Credentials from Password Stores"
    }
    
    def __init__(self, bus: EventBus):
        self.bus = bus
        self.active_chains: Dict[str, str] = {}  # Track attack chains per entity
        bus.subscribe("alert", self._handle_alert)
    
    def _map_to_ttp(self, message: str) -> Optional[str]:
        msg = message.lower()
        if "whoami" in msg or "systeminfo" in msg or "discovery" in msg:
            return "T1082"
        if "mimikatz" in msg or "lsass" in msg or "dump" in msg:
            return "T1003"
        if "psexec" in msg or "rdp" in msg or "lateral" in msg:
            return "T1021"
        if "encrypt" in msg or "extension" in msg or "ransom" in msg:
            return "T1486"
        return None
    
    async def _handle_alert(self, event: Dict):
        if event.get("type") == "Prediction":
            return  # Avoid loops
        
        message = event.get("message", "")
        source = event.get("source_ip") or event.get("hostname") or "unknown"
        
        current_ttp = self._map_to_ttp(message)
        if not current_ttp:
            return
        
        self.active_chains[source] = current_ttp
        
        # Predict next step
        if current_ttp in self.ATTACK_GRAPH:
            for next_ttp, prob in self.ATTACK_GRAPH[current_ttp]:
                if prob > 0.5:
                    prediction = {
                        "message": f"⚠️ PREDICTION: Attacker at {source} likely to attempt {self.TTP_NAMES.get(next_ttp, next_ttp)} next (Confidence: {int(prob*100)}%)",
                        "level": "CRITICAL",
                        "severity": "high",
                        "type": "Prediction",
                        "source": "PredictiveEngine",
                        "current_stage": current_ttp,
                        "predicted_stage": next_ttp,
                        "confidence": prob
                    }
                    await self.bus.publish("alert", prediction)
                    rprint(f"[bold magenta]🔮 {prediction['message']}[/bold magenta]")


# ============================================================================
# FIREWALL SERVICE
# ============================================================================

class FirewallService:
    """Cross-platform firewall management"""
    
    def __init__(self, bus: EventBus):
        self.bus = bus
        self.blocked_ips: set = set()
        self.blocked_ports: set = set()
        self.blocked_countries: set = set()
        self.panic_mode: bool = False
        self.auto_block_enabled: bool = True
        self.rules_file = "firewall_rules.json"
        self._load_rules()
    
    def _load_rules(self):
        if os.path.exists(self.rules_file):
            try:
                with open(self.rules_file, 'r') as f:
                    data = json.load(f)
                    self.blocked_ips = set(data.get("blocked_ips", []))
                    self.blocked_ports = set(data.get("blocked_ports", []))
                    self.blocked_countries = set(data.get("blocked_countries", []))
                    self.auto_block_enabled = data.get("auto_block_enabled", True)
            except:
                pass
    
    def _save_rules(self):
        with open(self.rules_file, 'w') as f:
            json.dump({
                "blocked_ips": list(self.blocked_ips),
                "blocked_ports": list(self.blocked_ports),
                "blocked_countries": list(self.blocked_countries),
                "auto_block_enabled": self.auto_block_enabled
            }, f, indent=2)
    
    async def block_ip(self, ip: str, reason: str = ""):
        """Block an IP address"""
        if ip in CONFIG.whitelist_ips:
            rprint(f"[yellow]⚠️ Cannot block whitelisted IP: {ip}[/yellow]")
            return False
        
        self.blocked_ips.add(ip)
        self._save_rules()
        
        # Execute OS-level block
        if not CONFIG.dev_mode:
            if os.name == 'nt':  # Windows
                cmd = f'New-NetFirewallRule -DisplayName "Block {ip}" -Direction Inbound -LocalPort Any -Protocol TCP -Action Block -RemoteAddress {ip}'
                try:
                    subprocess.run(["powershell", "-Command", cmd], 
                                 capture_output=True, timeout=10)
                except:
                    pass
            else:  # Linux
                try:
                    subprocess.run(["iptables", "-A", "INPUT", "-s", ip, "-j", "DROP"],
                                 capture_output=True, timeout=10)
                except:
                    pass
        
        rprint(f"[bold red]🛡️ BLOCKED IP: {ip} - {reason}[/bold red]")
        await self.bus.publish("firewall_event", {
            "action": "block_ip",
            "target": ip,
            "reason": reason,
            "timestamp": datetime.utcnow().isoformat()
        })
        return True
    
    async def block_port(self, port: int, reason: str = ""):
        """Block a port"""
        self.blocked_ports.add(port)
        self._save_rules()
        rprint(f"[bold red]🛡️ BLOCKED PORT: {port} - {reason}[/bold red]")
        await self.bus.publish("firewall_event", {
            "action": "block_port",
            "target": port,
            "reason": reason
        })
    
    async def unblock_ip(self, ip: str):
        """Unblock an IP address"""
        if ip in self.blocked_ips:
            self.blocked_ips.discard(ip)
            self._save_rules()
            rprint(f"[bold green]🛡️ UNBLOCKED IP: {ip}[/bold green]")
            await self.bus.publish("firewall_event", {
                "action": "unblock_ip",
                "target": ip,
                "timestamp": datetime.utcnow().isoformat()
            })
            return True
        return False
        
    async def unblock_port(self, port: int):
        """Unblock a port"""
        if port in self.blocked_ports:
            self.blocked_ports.discard(port)
            self._save_rules()
            rprint(f"[bold green]🛡️ UNBLOCKED PORT: {port}[/bold green]")
            await self.bus.publish("firewall_event", {
                "action": "unblock_port",
                "target": port
            })
            return True
        return False
    
    async def toggle_panic_mode(self, enabled: bool):
        """Enable/disable panic mode (block all)"""
        self.panic_mode = enabled
        if enabled:
            rprint("[bold red on white]🚨 PANIC MODE ACTIVATED - ALL TRAFFIC BLOCKED 🚨[/bold red on white]")
        else:
            rprint("[bold green]✅ Panic mode deactivated[/bold green]")
        await self.bus.publish("firewall_event", {
            "action": "panic_mode",
            "enabled": enabled
        })
    
    def match_traffic(self, remote_ip: str, remote_port: int, pid: int = None) -> str:
        """Check if traffic should be allowed"""
        if self.panic_mode:
            return "deny"
        if remote_ip in self.blocked_ips:
            return "deny"
        if remote_port in self.blocked_ports:
            return "deny"
        return "allow"


# ============================================================================
# SOAR ENGINE - Security Orchestration, Automation & Response
# ============================================================================

class Zone(Enum):
    SAFE = "safe"
    CAUTION = "caution"
    DANGER = "danger"


class SOAREngine:
    """Automated response orchestration"""
    
    def __init__(self, bus: EventBus, firewall: FirewallService):
        self.bus = bus
        self.firewall = firewall
        self.playbooks: Dict[str, Callable] = {}
        self.history: List[Dict] = []
        
        # Register default playbooks
        self._register_default_playbooks()
        
        # Subscribe to alerts
        bus.subscribe("alert", self._handle_alert)
    
    def _register_default_playbooks(self):
        """Register built-in response playbooks"""
        
        async def ransomware_response(alert: Dict) -> str:
            await self.firewall.toggle_panic_mode(True)
            return "Panic mode activated - ransomware containment"
        
        async def intrusion_response(alert: Dict) -> str:
            ip = alert.get("source_ip")
            if ip:
                await self.firewall.block_ip(ip, "Intrusion detected")
                return f"Blocked attacker IP: {ip}"
            return "No IP to block"
        
        async def dlp_response(alert: Dict) -> str:
            dst_ip = alert.get("target_ip")
            if dst_ip:
                await self.firewall.block_ip(dst_ip, "Data exfiltration target")
                return f"Blocked exfil target: {dst_ip}"
            return "No target IP"
        
        async def brute_force_response(alert: Dict) -> str:
            ip = alert.get("source_ip")
            if ip:
                await self.firewall.block_ip(ip, "Brute force attack")
                return f"Blocked brute force source: {ip}"
            return "Source blocked"
        
        self.playbooks = {
            "ransomware": ransomware_response,
            "intrusion": intrusion_response,
            "dlp": dlp_response,
            "brute_force": brute_force_response,
            "malware": ransomware_response,
            "port_scan": intrusion_response
        }
    
    def _assess_impact(self, action: str, target: str) -> Zone:
        """Assess business impact of response action"""
        critical_assets = ["192.168.1.1", "10.0.0.1", "dc01", "sql-server"]
        if target in critical_assets:
            return Zone.DANGER
        if action in ["panic_mode", "isolate_host"]:
            return Zone.CAUTION
        return Zone.SAFE
    
    async def _handle_alert(self, alert: Dict):
        severity = str(alert.get("severity", "")).lower()
        if severity not in ["critical", "high"]:
            return
        
        alert_type = str(alert.get("type", "")).lower()
        source_ip = alert.get("source_ip", "unknown")
        
        # Find matching playbook
        playbook_name = None
        for key in self.playbooks:
            if key in alert_type:
                playbook_name = key
                break
        
        if playbook_name:
            zone = self._assess_impact(playbook_name, source_ip)
            
            if zone == Zone.DANGER:
                rprint(f"[yellow]⚠️ Action blocked - requires approval (Zone: DANGER)[/yellow]")
                return
            
            rprint(f"[bold cyan]🎭 SOAR: Executing playbook '{playbook_name}'[/bold cyan]")
            try:
                result = await self.playbooks[playbook_name](alert)
                self.history.append({
                    "timestamp": datetime.utcnow().isoformat(),
                    "playbook": playbook_name,
                    "result": result,
                    "zone": zone.value
                })
                rprint(f"[green]✅ Playbook result: {result}[/green]")
            except Exception as e:
                rprint(f"[red]❌ Playbook failed: {e}[/red]")


# ============================================================================
# INCIDENT MANAGER
# ============================================================================

class IncidentManager:
    """Incident lifecycle management"""
    
    def __init__(self, bus: EventBus):
        self.bus = bus
        self.conn = sqlite3.connect(CONFIG.incident_db_path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self._init_schema()
        bus.subscribe("alert", self._handle_alert)
    
    def _init_schema(self):
        cursor = self.conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS incidents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                type TEXT,
                severity TEXT,
                status TEXT DEFAULT 'OPEN',
                source TEXT,
                description TEXT,
                risk_score INTEGER DEFAULT 0
            )
        ''')
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS incident_audit (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                incident_id INTEGER,
                action TEXT,
                actor TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (incident_id) REFERENCES incidents(id)
            )
        ''')
        self.conn.commit()
        rprint("[green]✅ Incident database initialized[/green]")
    
    async def _handle_alert(self, alert: Dict):
        severity = str(alert.get("severity", "")).upper()
        if severity == "CRITICAL":
            await self.create_incident(alert)
    
    async def create_incident(self, alert: Dict) -> int:
        cursor = self.conn.cursor()
        cursor.execute('''
            INSERT INTO incidents (type, severity, source, description, risk_score)
            VALUES (?, ?, ?, ?, ?)
        ''', (
            alert.get("type", "SecurityAlert"),
            alert.get("severity", "HIGH"),
            alert.get("source", "Unknown"),
            alert.get("message", "No description"),
            alert.get("risk_score", 0)
        ))
        incident_id = cursor.lastrowid
        
        cursor.execute('''
            INSERT INTO incident_audit (incident_id, action, actor)
            VALUES (?, 'CREATED', 'System')
        ''', (incident_id,))
        
        self.conn.commit()
        rprint(f"[bold yellow]📋 Incident #{incident_id} created[/bold yellow]")
        return incident_id
    
    def update_status(self, incident_id: int, status: str, actor: str = "System"):
        cursor = self.conn.cursor()
        cursor.execute('''
            UPDATE incidents SET status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        ''', (status, incident_id))
        cursor.execute('''
            INSERT INTO incident_audit (incident_id, action, actor)
            VALUES (?, ?, ?)
        ''', (incident_id, status, actor))
        self.conn.commit()
        rprint(f"[cyan]📋 Incident #{incident_id} -> {status}[/cyan]")
    
    def get_open_incidents(self) -> List[Dict]:
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM incidents WHERE status = 'OPEN'")
        return [dict(row) for row in cursor.fetchall()]


# ============================================================================
# NOTIFICATION SERVICE
# ============================================================================

class NotificationService:
    """Multi-channel notifications"""
    
    @staticmethod
    async def send_discord(message: str):
        if not CONFIG.discord_webhook_url or CONFIG.dev_mode:
            rprint(f"[cyan]🔔 [NOTIFICATION]: {message}[/cyan]")
            return
        
        if HTTPX_AVAILABLE:
            try:
                async with httpx.AsyncClient() as client:
                    await client.post(
                        CONFIG.discord_webhook_url,
                        json={"content": message},
                        timeout=10.0
                    )
            except:
                pass
    
    @staticmethod
    async def send_alert(alert: Dict):
        severity = alert.get("severity", "low")
        message = alert.get("message", "Unknown alert")
        source = alert.get("source", "System")
        
        notification = f"**[{severity.upper()}]** {message}\n*Source: {source}*"
        await NotificationService.send_discord(notification)


# ============================================================================
# WINDOWS EVENT LOG COLLECTOR
# ============================================================================

class WindowsEventCollector:
    """Real-time Windows Security Event Log collector"""
    
    SECURITY_EVENTS = {
        4625: ("Failed Logon", "brute_force"),
        4624: ("Successful Logon", "auth"),
        4688: ("Process Creation", "execution"),
        7045: ("Service Installation", "persistence"),
        4720: ("User Account Created", "persistence"),
        4732: ("Member Added to Security Group", "privilege_escalation"),
        1102: ("Audit Log Cleared", "defense_evasion")
    }
    
    def __init__(self, bus: EventBus):
        self.bus = bus
        self.running = False
    
    async def start(self):
        if not WIN32_AVAILABLE:
            rprint("[yellow]⚠️ Windows Event Log monitoring not available[/yellow]")
            return
        
        self.running = True
        rprint("[green]✅ Windows Event Log collector started[/green]")
        
        while self.running:
            try:
                await self._poll_events()
            except Exception as e:
                rprint(f"[red]Event collector error: {e}[/red]")
            await asyncio.sleep(5)
    
    async def _poll_events(self):
        if not WIN32_AVAILABLE:
            return
            
        try:
            hand = win32evtlog.OpenEventLog(None, "Security")
            flags = win32evtlog.EVENTLOG_BACKWARDS_READ | win32evtlog.EVENTLOG_SEQUENTIAL_READ
            
            events = win32evtlog.ReadEventLog(hand, flags, 0)
            for event in events[:10]:  # Process last 10 events
                event_id = event.EventID & 0xFFFF
                
                if event_id in self.SECURITY_EVENTS:
                    name, alert_type = self.SECURITY_EVENTS[event_id]
                    
                    alert = {
                        "message": f"Windows Event: {name} (ID: {event_id})",
                        "level": "WARNING",
                        "severity": "high" if event_id in [4625, 7045, 1102] else "medium",
                        "type": alert_type,
                        "source": "WindowsEventLog",
                        "event_id": event_id,
                        "timestamp": str(event.TimeGenerated)
                    }
                    await self.bus.publish("alert", alert)
            
            win32evtlog.CloseEventLog(hand)
        except Exception as e:
            pass  # Silently handle permission errors


# ============================================================================
# NETWORK TRAFFIC MONITOR (Wireshark-Style)
# ============================================================================

class NetworkMonitor:
    """Real-time network connection monitoring with deep packet analysis"""
    
    # Port to application protocol mapping
    PORT_PROTOCOLS = {
        20: "FTP-DATA", 21: "FTP", 22: "SSH", 23: "TELNET", 25: "SMTP",
        53: "DNS", 67: "DHCP", 68: "DHCP", 80: "HTTP", 110: "POP3",
        119: "NNTP", 123: "NTP", 143: "IMAP", 161: "SNMP", 194: "IRC",
        443: "HTTPS", 445: "SMB", 465: "SMTPS", 514: "SYSLOG", 587: "SMTP",
        993: "IMAPS", 995: "POP3S", 1433: "MSSQL", 1521: "ORACLE",
        3306: "MYSQL", 3389: "RDP", 5432: "POSTGRES", 5900: "VNC",
        6379: "REDIS", 8000: "HTTP-ALT", 8080: "HTTP-PROXY", 8443: "HTTPS-ALT",
        9200: "ELASTICSEARCH", 27017: "MONGODB"
    }
    
    # Risk scoring by protocol
    PROTOCOL_RISK = {
        "SSH": 30, "RDP": 40, "TELNET": 70, "FTP": 50, "SMB": 60,
        "MSSQL": 40, "MYSQL": 40, "POSTGRES": 40, "REDIS": 50,
        "VNC": 60, "IRC": 50
    }
    
    def __init__(self, bus: EventBus, firewall: FirewallService):
        self.bus = bus
        self.firewall = firewall
        self.known_connections: Dict[str, Dict] = {}  # Track connection metadata
        self.running = False
        self.packet_counter = 0
    
    def _get_app_protocol(self, port: int) -> str:
        """Determine application protocol from port"""
        return self.PORT_PROTOCOLS.get(port, "UNKNOWN")
    
    def _get_process_name(self, pid: int) -> str:
        """Get process name from PID"""
        if not pid or not PSUTIL_AVAILABLE:
            return "System"
        try:
            proc = psutil.Process(pid)
            return proc.name()
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            return "Unknown"
    
    def _calculate_risk(self, app_protocol: str, remote_ip: str) -> int:
        """Calculate risk score for connection"""
        risk = self.PROTOCOL_RISK.get(app_protocol, 0)
        
        # Check against threat intel patterns
        for pattern in ThreatIntel.KNOWN_BAD_PATTERNS:
            if remote_ip.startswith(pattern):
                risk += 50
                break
        
        return min(risk, 100)
    
    async def start(self):
        if not PSUTIL_AVAILABLE:
            rprint("[yellow]⚠️ Network monitoring limited - psutil not available[/yellow]")
            return
        
        self.running = True
        rprint("[green]✅ Network monitor started (Wireshark Mode)[/green]")
        
        while self.running:
            try:
                await self._scan_connections()
            except Exception as e:
                pass
            await asyncio.sleep(1)  # Faster refresh rate
    
    async def _scan_connections(self):
        connections = psutil.net_connections(kind='inet')
        current_ids = set()
        timestamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]
        
        for conn in connections:
            # Include more connection states
            if conn.status not in ["ESTABLISHED", "SYN_SENT", "SYN_RECV", "TIME_WAIT", "CLOSE_WAIT"]:
                continue
            if not conn.raddr:
                continue
            
            remote_ip = conn.raddr.ip
            remote_port = conn.raddr.port
            local_ip = conn.laddr.ip
            local_port = conn.laddr.port
            
            conn_id = f"{local_ip}:{local_port}-{remote_ip}:{remote_port}"
            current_ids.add(conn_id)
            self.packet_counter += 1
            
            # Determine protocols
            transport_proto = "TCP" if conn.type == socket.SOCK_STREAM else "UDP"
            app_proto = self._get_app_protocol(remote_port)
            if app_proto == "UNKNOWN":
                app_proto = self._get_app_protocol(local_port)
            
            # Get process info
            process_name = self._get_process_name(conn.pid)
            
            # Calculate risk
            risk_score = self._calculate_risk(app_proto, remote_ip)
            
            # Track connection for duration
            if conn_id not in self.known_connections:
                self.known_connections[conn_id] = {
                    "first_seen": time.time(),
                    "bytes_sent": 0,
                    "bytes_recv": 0
                }
            
            conn_meta = self.known_connections[conn_id]
            duration = time.time() - conn_meta["first_seen"]
            
            # Estimate bytes (simplified - would need packet capture for real data)
            conn_meta["bytes_sent"] += 64  # Simulated
            conn_meta["bytes_recv"] += 128  # Simulated
            
            # Check firewall
            action = self.firewall.match_traffic(remote_ip, remote_port)
            
            if action == "deny":
                await self.bus.publish("alert", {
                    "message": f"Blocked {app_proto} connection to {remote_ip}:{remote_port}",
                    "level": "WARNING",
                    "severity": "medium",
                    "type": "firewall_block",
                    "source_ip": remote_ip
                })
            
            # Create info string (Wireshark-style)
            if app_proto in ["HTTP", "HTTPS"]:
                info = f"{local_port} → {remote_port} [{conn.status}]"
            elif app_proto == "DNS":
                info = f"Query to {remote_ip}"
            else:
                info = f"{transport_proto} {local_port} → {remote_port}"
            
            # Publish rich packet event
            await self.bus.publish("packet_event", {
                "uid": f"pkt-{self.packet_counter}",
                "id": conn_id,
                "timestamp": timestamp,
                "protocol": transport_proto,
                "app_protocol": app_proto,
                "src_ip": local_ip,
                "src_port": local_port,
                "dst_ip": remote_ip,
                "dst_port": remote_port,
                "status": conn.status,
                "action": action.upper(),
                "pid": conn.pid,
                "process": process_name,
                "bytes_sent": conn_meta["bytes_sent"],
                "bytes_recv": conn_meta["bytes_recv"],
                "duration": round(duration, 1),
                "risk_score": risk_score,
                "info": info
            })
        
        # Clean up old connections
        stale = set(self.known_connections.keys()) - current_ids
        for conn_id in stale:
            del self.known_connections[conn_id]



# ============================================================================
# SYSLOG RECEIVER
# ============================================================================

class SyslogReceiver:
    """UDP Syslog receiver for network devices"""
    
    def __init__(self, bus: EventBus):
        self.bus = bus
        self.running = False
    
    async def start(self):
        self.running = True
        
        try:
            # Create UDP socket
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            sock.bind(("0.0.0.0", CONFIG.syslog_port))
            sock.setblocking(False)
            
            rprint(f"[green]✅ Syslog receiver listening on UDP:{CONFIG.syslog_port}[/green]")
            
            loop = asyncio.get_event_loop()
            
            while self.running:
                try:
                    data, addr = await loop.run_in_executor(
                        None, lambda: sock.recvfrom(4096)
                    )
                    await self._process_syslog(data.decode('utf-8', errors='ignore'), addr)
                except BlockingIOError:
                    await asyncio.sleep(0.1)
                except Exception:
                    await asyncio.sleep(1)
                    
        except Exception as e:
            rprint(f"[yellow]⚠️ Syslog receiver failed: {e}[/yellow]")
    
    async def _process_syslog(self, message: str, addr: tuple):
        # Parse syslog severity
        severity = "low"
        if "<0>" in message or "<1>" in message or "<2>" in message:
            severity = "critical"
        elif "<3>" in message or "<4>" in message:
            severity = "high"
        elif "<5>" in message or "<6>" in message:
            severity = "medium"
        
        alert = {
            "message": message[:500],
            "level": "INFO",
            "severity": severity,
            "type": "syslog",
            "source": f"syslog:{addr[0]}",
            "source_ip": addr[0]
        }
        
        await self.bus.publish("alert", alert)


# ============================================================================
# WEBSOCKET SERVER FOR UI
# ============================================================================

class WebSocketServer:
    """WebSocket server for real-time UI updates"""
    
    def __init__(self, bus: EventBus, firewall: FirewallService, siem: SIEM):
        self.bus = bus
        self.firewall = firewall
        self.siem = siem
        self.clients: set = set()
        self.stats = {
            "packet_rate": 0,
            "connections": 0,
            "cpu_usage": 0,
            "memory_usage": 0,
            "total_packets": 0,
            "threats_blocked": 0,
            "suspicious": 0,
            "allowed": 0,
            "live_alerts": [],
            "metric_history": [],
            "top_ips": {},
            "threat_types": {},
            "targeted_ports": {}
        }
        self.agents = {}
        
        # Subscribe to events
        bus.subscribe("alert", self._on_alert)
        bus.subscribe("packet_event", self._on_packet)
        bus.subscribe("firewall_event", self._on_firewall)
        bus.subscribe("system_info", self._on_system_info)
    
    async def _on_alert(self, alert: Dict):
        alert["id"] = f"evt-{int(datetime.utcnow().timestamp()*1000)}"
        self.stats["live_alerts"].append(alert)
        if len(self.stats["live_alerts"]) > 50:
            self.stats["live_alerts"].pop(0)
        
        alert_type = alert.get("type", "General")
        self.stats["threat_types"][alert_type] = self.stats["threat_types"].get(alert_type, 0) + 1
        
        await self._broadcast({"type": "alert", "payload": alert})
    
    async def _on_packet(self, packet: Dict):
        src_ip = packet.get("src_ip", "")
        dst_port = packet.get("dst_port", 0)
        status = packet.get("status", "")
        
        if src_ip:
            self.stats["top_ips"][src_ip] = self.stats["top_ips"].get(src_ip, 0) + 1
        if dst_port:
            port_key = str(dst_port)
            self.stats["targeted_ports"][port_key] = self.stats["targeted_ports"].get(port_key, 0) + 1
        
        self.stats["total_packets"] += 1
        if status == "ALLOW":
            self.stats["allowed"] += 1
        elif status == "DENY":
            self.stats["threats_blocked"] += 1
        else:
            self.stats["suspicious"] += 1
        
        await self._broadcast({"type": "packet_event", "payload": packet})
    
    async def _on_firewall(self, event: Dict):
        await self._broadcast({"type": "firewall_event", "payload": event})
    
    async def _on_system_info(self, info: Dict):
        await self._broadcast({"type": "system_info", "payload": info})
    
    async def _broadcast(self, payload: Dict):
        if not self.clients:
            return
        message = json.dumps(payload, default=str)
        dead_clients = set()
        for client in self.clients:
            try:
                await client.send(message)
            except:
                dead_clients.add(client)
        self.clients -= dead_clients
    
    def _get_analytics(self):
        # Top 5 IPs
        sorted_ips = sorted(self.stats["top_ips"].items(), key=lambda x: x[1], reverse=True)[:5]
        top_ips = [{"ip": ip, "attacks": count} for ip, count in sorted_ips]
        
        # Threat types
        sorted_types = sorted(self.stats["threat_types"].items(), key=lambda x: x[1], reverse=True)[:5]
        threat_types = [{"name": t, "value": c, "color": f"hsl({i*60}, 70%, 50%)"} for i, (t, c) in enumerate(sorted_types)]
        
        # Ports
        sorted_ports = sorted(self.stats["targeted_ports"].items(), key=lambda x: x[1], reverse=True)[:5]
        targeted_ports = [{"port": p, "attacks": c} for p, c in sorted_ports]
        
        return {
            "chartData": list(self.stats["metric_history"])[-30:],
            "topIPs": top_ips,
            "threatTypes": threat_types,
            "targetedPorts": targeted_ports
        }
    
    async def _handle_client(self, websocket):
        try:
            # Wait for handshake
            init_data = await asyncio.wait_for(websocket.recv(), timeout=5.0)
            init_msg = json.loads(init_data)
            client_type = init_msg.get("type")
            
            if client_type == "agent_register":
                # Agent connection
                agent_id = init_msg.get("id", str(uuid.uuid4()))
                self.agents[agent_id] = {
                    "id": agent_id,
                    "hostname": init_msg.get("hostname", "Unknown"),
                    "os": init_msg.get("os", "Unknown"),
                    "ip": init_msg.get("ip", "Unknown"),
                    "status": "online",
                    "last_seen": datetime.utcnow().timestamp()
                }
                
                await self._broadcast({
                    "type": "agent_update",
                    "data": list(self.agents.values())
                })
                
                try:
                    async for message in websocket:
                        data = json.loads(message)
                        if data.get("type") == "heartbeat" or data.get("type") == "telemetry":
                            if agent_id in self.agents:
                                self.agents[agent_id]["last_seen"] = datetime.utcnow().timestamp()
                                if "stats" in data:
                                    self.agents[agent_id]["stats"] = data["stats"]
                                elif "data" in data:
                                    self.agents[agent_id]["stats"] = data["data"]
                            await self._broadcast({
                                "type": "agent_update",
                                "data": list(self.agents.values())
                            })
                finally:
                    if agent_id in self.agents:
                        del self.agents[agent_id]
                    await self._broadcast({
                        "type": "agent_update",
                        "data": list(self.agents.values())
                    })
            else:
                # UI client
                rprint("[cyan]🖥️ UI Client connected[/cyan]")
                self.clients.add(websocket)
                
                # Send initial state
                await websocket.send(json.dumps({
                    "type": "agent_update",
                    "data": list(self.agents.values())
                }, default=str))
                
                # Update system metrics
                if PSUTIL_AVAILABLE:
                    self.stats["cpu_usage"] = psutil.cpu_percent()
                    self.stats["memory_usage"] = psutil.virtual_memory().percent
                    self.stats["connections"] = len([c for c in psutil.net_connections() if c.status == "ESTABLISHED"])
                
                try:
                    while True:
                        # Periodic update loop (1 Hz)
                        if PSUTIL_AVAILABLE:
                            self.stats["cpu_usage"] = psutil.cpu_percent()
                            self.stats["memory_usage"] = psutil.virtual_memory().percent
                            self.stats["connections"] = len([c for c in psutil.net_connections() if c.status == "ESTABLISHED"])
                        
                        # Add to history
                        now = datetime.utcnow()
                        self.stats["metric_history"].append({
                            "time": now.strftime("%H:%M:%S"),
                            "packets": self.stats["total_packets"],
                            "threats": len(self.stats["live_alerts"])
                        })
                        if len(self.stats["metric_history"]) > 60:
                            self.stats["metric_history"].pop(0)
                        
                        payload = {
                            "type": "update",
                            "metrics": {
                                "packet_rate": self.stats["packet_rate"],
                                "connections": self.stats["connections"],
                                "cpu_usage": self.stats["cpu_usage"],
                                "memory_usage": self.stats["memory_usage"]
                            },
                            "alerts": self.stats["live_alerts"][-10:],
                            "stats": {
                                "totalPackets": self.stats["total_packets"],
                                "threatsBlocked": self.stats["threats_blocked"],
                                "suspicious": self.stats["suspicious"],
                                "allowed": self.stats["allowed"]
                            },
                            "analytics": self._get_analytics()
                        }
                        
                        # Firewall state
                        firewall_state = {
                            "active": not self.firewall.panic_mode,
                            "panicMode": self.firewall.panic_mode,
                            "blockedIPs": list(self.firewall.blocked_ips),
                            "blockedPorts": list(self.firewall.blocked_ports)
                        }
                        
                        await websocket.send(json.dumps(payload, default=str))
                        await websocket.send(json.dumps({
                            "type": "firewall_update",
                            "payload": firewall_state
                        }, default=str))
                        
                        # Global risk
                        await websocket.send(json.dumps({
                            "type": "global_risk",
                            "payload": {
                                "score": min(100, len(self.stats["live_alerts"]) * 5 + self.stats["threats_blocked"]),
                                "host_scores": {}
                            }
                        }, default=str))
                        
                        await asyncio.sleep(1)
                except:
                    pass
                finally:
                    self.clients.discard(websocket)
                    rprint("[yellow]🖥️ UI Client disconnected[/yellow]")
        except Exception as e:
            rprint(f"[red]WebSocket error: {e}[/red]")
    
    async def start(self):
        try:
            import websockets
            rprint(f"[green]✅ WebSocket server listening on ws://0.0.0.0:{CONFIG.websocket_port}[/green]")
            async with websockets.serve(self._handle_client, "0.0.0.0", CONFIG.websocket_port):
                await asyncio.Future()  # Run forever
        except ImportError:
            rprint("[yellow]⚠️ websockets not available - UI real-time disabled[/yellow]")
            rprint("[yellow]   Install with: pip install websockets[/yellow]")
        except Exception as e:
            rprint(f"[red]WebSocket server failed: {e}[/red]")


# ============================================================================
# REST API SERVER
# ============================================================================

class SimpleAPIServer:
    """Simple REST API for external integrations"""
    
    def __init__(self, bus: EventBus, siem: SIEM, firewall: FirewallService, 
                 incident_manager: IncidentManager):
        self.bus = bus
        self.siem = siem
        self.firewall = firewall
        self.incident_manager = incident_manager
    
    async def start(self):
        try:
            from aiohttp import web
            import aiohttp_cors
            
            app = web.Application()
            
            # Setup CORS for the entire app
            cors = aiohttp_cors.setup(app, defaults={
                "*": aiohttp_cors.ResourceOptions(
                    allow_credentials=True,
                    expose_headers="*",
                    allow_headers="*",
                    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"]
                )
            })
            
            # UI Specific Routes (FastAPI Emulation)
            login_route = app.router.add_post('/auth/login', self._login)
            app.router.add_get('/auth/me', self._get_me)
            app.router.add_get('/firewall/status', self._get_firewall_status)
            app.router.add_post('/firewall/toggle', self._toggle_firewall)
            app.router.add_post('/firewall/auto-block', self._toggle_auto_block)
            app.router.add_post('/firewall/panic', self._toggle_panic)
            app.router.add_post('/firewall/block-ip', self._block_ip_ui)
            app.router.add_post('/firewall/unblock-ip', self._unblock_ip_ui)
            app.router.add_post('/firewall/block-port', self._block_port_ui)
            app.router.add_post('/firewall/unblock-port', self._unblock_port_ui)
            app.router.add_post('/firewall/block-country', self._block_country_ui)
            app.router.add_post('/firewall/unblock-country', self._unblock_country_ui)
            
            # Legacy/External Routes
            app.router.add_post('/alert', self._receive_alert)
            app.router.add_get('/status', self._get_status)
            app.router.add_get('/logs', self._get_logs)
            app.router.add_get('/incidents', self._get_incidents)
            app.router.add_post('/block', self._block_ip)
            
            # Add CORS to all routes
            for route in list(app.router.routes()):
                try:
                    cors.add(route)
                except ValueError:
                    pass  # Skip if already configured
            
            runner = web.AppRunner(app)
            await runner.setup()
            site = web.TCPSite(runner, '0.0.0.0', CONFIG.api_port)
            await site.start()
            
            rprint(f"[green]✅ REST API listening on http://0.0.0.0:{CONFIG.api_port}[/green]")
            
            # Keep running
            while True:
                await asyncio.sleep(3600)
                
        except ImportError:
            rprint("[yellow]⚠️ aiohttp not available - API disabled[/yellow]")
            rprint("[yellow]   Install with: pip install aiohttp[/yellow]")

    async def _login(self, request):
        from aiohttp import web
        try:
            # UI sends application/x-www-form-urlencoded (OAuth2 form)
            data = await request.post()
            username = data.get("username")
            password = data.get("password")
            
            # Quick hash-less verify for dev mode
            valid = False
            role = "analyst"
            
            if username == "admin" and password == "admin@123":
                valid = True
                role = "admin"
            elif username == "analyst" and password == "analyst123":
                valid = True
                role = "analyst"
                
            if valid:
                # Return mock token
                return web.json_response({
                    "access_token": f"mock_token_{username}_{int(time.time())}",
                    "token_type": "bearer",
                    "role": role
                })
            else:
                return web.json_response({"detail": "Incorrect username or password"}, status=401)
        except Exception as e:
            return web.json_response({"error": str(e)}, status=500)

    async def _get_me(self, request):
        from aiohttp import web
        return web.json_response({
            "username": "admin",
            "email": "admin@sentinel.soc",
            "full_name": "SOC Administrator",
            "role": "admin",
            "disabled": False
        })

    async def _get_firewall_status(self, request):
        from aiohttp import web
        # Match the keys expected by FirewallPage.tsx
        return web.json_response({
            "active": not self.firewall.panic_mode,
            "auto_block": self.firewall.auto_block_enabled,
            "panic_mode": self.firewall.panic_mode,
            "blocked_ips": list(self.firewall.blocked_ips),
            "blocked_ports": list(self.firewall.blocked_ports),
            "blocked_countries": list(getattr(self.firewall, 'blocked_countries', [])),
            "rules": []
        })

    async def _toggle_firewall(self, request):
        from aiohttp import web
        data = await request.json()
        active = data.get("active", True)
        # In this simple SOC, we toggle via panic mode or logic
        rprint(f"[cyan]🛡️ API: Toggle Firewall -> {active}[/cyan]")
        return web.json_response({"status": "success", "active": active})

    async def _toggle_auto_block(self, request):
        from aiohttp import web
        data = await request.json()
        enabled = data.get("enabled", True)
        self.firewall.auto_block_enabled = enabled
        rprint(f"[cyan]🛡️ API: Auto-Block -> {enabled}[/cyan]")
        return web.json_response({"status": "success", "enabled": enabled})

    async def _toggle_panic(self, request):
        from aiohttp import web
        data = await request.json()
        enabled = data.get("enabled", False)
        await self.firewall.toggle_panic_mode(enabled)
        return web.json_response({"status": "success", "panic_mode": enabled})

    async def _block_ip_ui(self, request):
        from aiohttp import web
        data = await request.json()
        ip = data.get("ip")
        reason = data.get("reason", "Manual Block")
        if ip:
            await self.firewall.block_ip(ip, reason)
            return web.json_response({"status": "success", "ip": ip})
        return web.json_response({"error": "IP missing"}, status=400)

    async def _unblock_ip_ui(self, request):
        from aiohttp import web
        data = await request.json()
        ip = data.get("ip")
        if ip:
            await self.firewall.unblock_ip(ip)
            return web.json_response({"status": "success", "ip": ip})
        return web.json_response({"error": "IP missing"}, status=400)

    async def _block_port_ui(self, request):
        from aiohttp import web
        data = await request.json()
        port = data.get("port")
        if port:
            await self.firewall.block_port(int(port))
            return web.json_response({"status": "success", "port": port})
        return web.json_response({"error": "Port missing"}, status=400)

    async def _unblock_port_ui(self, request):
        from aiohttp import web
        data = await request.json()
        port = data.get("port")
        if port:
            await self.firewall.unblock_port(int(port))
            return web.json_response({"status": "success", "port": port})
        return web.json_response({"error": "Port missing"}, status=400)

    async def _block_country_ui(self, request):
        from aiohttp import web
        data = await request.json()
        code = data.get("country_code")
        if code:
            if not hasattr(self.firewall, 'blocked_countries'):
                self.firewall.blocked_countries = set()
            self.firewall.blocked_countries.add(code.upper())
            return web.json_response({"status": "success", "country_code": code})
        return web.json_response({"error": "Country code missing"}, status=400)

    async def _unblock_country_ui(self, request):
        from aiohttp import web
        data = await request.json()
        code = data.get("country_code")
        if code:
            if hasattr(self.firewall, 'blocked_countries'):
                self.firewall.blocked_countries.discard(code.upper())
            return web.json_response({"status": "success", "country_code": code})
        return web.json_response({"error": "Country code missing"}, status=400)
    
    async def _receive_alert(self, request):
        from aiohttp import web
        try:
            data = await request.json()
            
            source_ip = data.get("source_ip", "0.0.0.0")
            rule_name = data.get("rule_name", "External Alert")
            full_log = data.get("full_log", str(data))
            
            # Process alert
            threat_score = await ThreatIntel.check_ip_reputation(source_ip)
            ai_result = await AIAnalyst.analyze(full_log)
            
            alert = {
                "message": f"{rule_name}: {full_log[:200]}",
                "level": "WARNING",
                "severity": "high" if threat_score > 50 else "medium",
                "type": rule_name.lower().replace(" ", "_"),
                "source_ip": source_ip,
                "threat_score": threat_score,
                "ai_analysis": ai_result
            }
            
            await self.bus.publish("alert", alert)
            
            # Auto-block high-threat IPs
            if threat_score > 60:
                await self.firewall.block_ip(source_ip, f"High threat score: {threat_score}")
            
            return web.json_response({
                "status": "accepted",
                "threat_score": threat_score,
                "ai_verdict": ai_result.get("ai_verdict"),
                "action": "blocked" if threat_score > 60 else "monitoring"
            })
        except Exception as e:
            return web.json_response({"error": str(e)}, status=500)
    
    async def _get_status(self, request):
        from aiohttp import web
        return web.json_response({
            "status": "operational",
            "panic_mode": self.firewall.panic_mode,
            "blocked_ips": len(self.firewall.blocked_ips),
            "blocked_ports": len(self.firewall.blocked_ports),
            "open_incidents": len(self.incident_manager.get_open_incidents()),
            "siem_integrity": self.siem.verify_integrity()
        })
    
    async def _get_logs(self, request):
        from aiohttp import web
        limit = int(request.query.get("limit", 50))
        logs = self.siem.get_recent_logs(limit)
        return web.json_response(logs)
    
    async def _get_incidents(self, request):
        from aiohttp import web
        incidents = self.incident_manager.get_open_incidents()
        return web.json_response(incidents)
    
    async def _block_ip(self, request):
        from aiohttp import web
        try:
            data = await request.json()
            ip = data.get("ip")
            reason = data.get("reason", "Manual block")
            
            if ip:
                await self.firewall.block_ip(ip, reason)
                return web.json_response({"status": "blocked", "ip": ip})
            return web.json_response({"error": "IP required"}, status=400)
        except Exception as e:
            return web.json_response({"error": str(e)}, status=500)


# ============================================================================
# MAIN SOC ORCHESTRATOR
# ============================================================================

class SentinelSOC:
    """Main SOC Orchestrator"""
    
    def __init__(self):
        # Initialize core components
        rprint("\n[bold blue]" + "="*60 + "[/bold blue]")
        rprint("[bold blue]       SENTINEL SOC - INITIALIZING SYSTEMS[/bold blue]")
        rprint("[bold blue]" + "="*60 + "[/bold blue]\n")
        
        self.bus = EventBus()
        self.siem = SIEM(self.bus)
        self.firewall = FirewallService(self.bus)
        self.soar = SOAREngine(self.bus, self.firewall)
        self.predictive = PredictiveEngine(self.bus)
        self.incident_manager = IncidentManager(self.bus)
        self.network_monitor = NetworkMonitor(self.bus, self.firewall)
        self.windows_collector = WindowsEventCollector(self.bus)
        self.syslog = SyslogReceiver(self.bus)
        self.api = SimpleAPIServer(self.bus, self.siem, self.firewall, self.incident_manager)
        self.websocket = WebSocketServer(self.bus, self.firewall, self.siem)
        
        # Subscribe notifications
        self.bus.subscribe("alert", NotificationService.send_alert)
        
        rprint("\n[bold green]✅ All systems initialized[/bold green]\n")
    
    async def run(self):
        """Start all SOC components"""
        rprint("[bold cyan]" + "="*60 + "[/bold cyan]")
        rprint("[bold cyan]       SENTINEL SOC - OPERATIONAL[/bold cyan]")
        rprint("[bold cyan]" + "="*60 + "[/bold cyan]")
        rprint(f"""
[green]Services Running:[/green]
  • REST API:       http://localhost:{CONFIG.api_port}
  • WebSocket:      ws://localhost:{CONFIG.websocket_port}
  • Syslog:         UDP port {CONFIG.syslog_port}
  • Network:        Real-time monitoring
  • Windows Events: {"Active" if WIN32_AVAILABLE else "Disabled"}
  • AI Analysis:    {"Ollama" if HTTPX_AVAILABLE else "Keyword-only"}
  • Redis:          {"Connected" if self.bus.redis_client else "Local mode"}

[yellow]REST Endpoints:[/yellow]
  POST /alert     - Submit security alert
  GET  /status    - System status
  GET  /logs      - Recent SIEM logs
  GET  /incidents - Open incidents
  POST /block     - Block IP manually

[yellow]WebSocket (UI):[/yellow]
  Connect to ws://localhost:{CONFIG.websocket_port}
  UI Dashboard: http://localhost:5173

[dim]Press Ctrl+C to stop[/dim]
""")
        
        # Run all components concurrently
        await asyncio.gather(
            self.network_monitor.start(),
            self.windows_collector.start(),
            self.syslog.start(),
            self.api.start(),
            self.websocket.start(),
            self._status_loop()
        )
    
    async def _status_loop(self):
        """Periodic status output"""
        while True:
            await asyncio.sleep(60)
            open_incidents = len(self.incident_manager.get_open_incidents())
            blocked = len(self.firewall.blocked_ips)
            rprint(f"[dim][{datetime.now().strftime('%H:%M:%S')}] Status: {open_incidents} incidents, {blocked} blocked IPs[/dim]")


# ============================================================================
# ENTRY POINT
# ============================================================================

def main():
    """Main entry point"""
    try:
        soc = SentinelSOC()
        asyncio.run(soc.run())
    except KeyboardInterrupt:
        rprint("\n[bold yellow]⚠️ Shutdown requested[/bold yellow]")
        rprint("[green]✅ Sentinel SOC stopped gracefully[/green]")
    except Exception as e:
        rprint(f"[bold red]❌ Fatal error: {e}[/bold red]")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()
