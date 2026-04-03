"""
EDR Behavioral Engine - REAL-TIME Process Analysis
Detects suspicious process chains, code injection, privilege escalation
and lateral movement techniques using MITRE ATT&CK mapping
"""
import psutil
import time
import threading
import asyncio
from core.event_bus import EventBus
from datetime import datetime
from collections import defaultdict

class BehaviorEngine:
    def __init__(self, bus: EventBus):
        self.bus = bus
        self.running = False
        self.loop = asyncio.get_event_loop()
        
        # Track processes over time
        self.process_cache = {}
        self.process_parents = {}
        self.process_history = defaultdict(list)
        
        # Suspicious indicators
        self.suspicious_chains = [
            # Parent -> Child (Process Injection, Living-off-land)
            {"parent": "cmd.exe", "child": "powershell.exe", "mitre": "T1086"},
            {"parent": "winword.exe", "child": "powershell.exe", "mitre": "T1566"},
            {"parent": "excel.exe", "child": "cmd.exe", "mitre": "T1566"},
            {"parent": "svchost.exe", "child": "cmd.exe", "mitre": "T1566"},
            {"parent": "explorer.exe", "child": "powershell.exe", "mitre": "T1559"},
            # Lateral Movement
            {"parent": "wmiprvse.exe", "child": "powershell.exe", "mitre": "T1566"},
            {"parent": "wmiprvse.exe", "child": "cmd.exe", "mitre": "T1566"},
            {"parent": "services.exe", "child": "cmd.exe", "mitre": "T1546"},
            {"parent": "lsass.exe", "child": "cmd.exe", "mitre": "T1547"},
            # Credential Dumping
            {"parent": "winlogon.exe", "child": "lsass.exe", "mitre": "T1003"},
            # Known LOLBins
            {"parent": "reg.exe", "child": "powershell.exe", "mitre": "T1014"},
            {"parent": "wmic.exe", "child": "powershell.exe", "mitre": "T1047"},
        ]
        
        self.lolbins = [
            "certutil.exe", "mshta.exe", "rundll32.exe", "regsvcs.exe",
            "regasm.exe", "installutil.exe", "csc.exe", "jsc.exe",
            "vbc.exe", "cvtres.exe", "tracker.exe", "msbuild.exe"
        ]
        
        self.dangerous_command_patterns = [
            "System.Diagnostics.Process",
            "ExecutionPolicy",
            "Invoke-Expression",
            "IEX",
            "DownloadString",
            "DownloadFile",
            "base64",
            "encoded",
            "obfuscated"
        ]

    def get_process_tree(self, pid: int, depth: int = 5) -> dict:
        """Get full process tree for analysis"""
        if depth <= 0:
            return {}
        
        try:
            proc = psutil.Process(pid)
            children = []
            for child in proc.children(recursive=False):
                try:
                    children.append(self.get_process_tree(child.pid, depth - 1))
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass
            
            tree = {
                "pid": proc.pid,
                "name": proc.name(),
                "ppid": proc.ppid(),
                "cmdline": " ".join(proc.cmdline()) if proc.cmdline() else "",
                "create_time": proc.create_time(),
                "children": children,
                "status": proc.status()
            }
            
            return tree
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            return {}

    def analyze_cmdline(self, cmdline: str) -> dict:
        """Analyze command line for suspicious patterns"""
        analysis = {
            "dangerous_keywords": [],
            "encoded_data": False,
            "remote_download": False,
            "obfuscation": False,
            "risk_score": 0
        }
        
        cmdline_lower = cmdline.lower()
        
        # Check for dangerous patterns
        for pattern in self.dangerous_command_patterns:
            if pattern.lower() in cmdline_lower:
                analysis["dangerous_keywords"].append(pattern)
                analysis["risk_score"] += 2
        
        # Detect encoding/obfuscation
        if any(x in cmdline_lower for x in ["$([char]", "([byte[])", "base64", "[convert]"]):
            analysis["encoded_data"] = True
            analysis["risk_score"] += 3
        
        # Detect remote downloads
        if any(x in cmdline_lower for x in ["http://", "https://", "ftp://", ".net.webclient"]):
            analysis["remote_download"] = True
            analysis["risk_score"] += 3
        
        return analysis

    def scan_processes(self):
        """REAL-TIME process scanning and anomaly detection"""
        alive_pids = set(psutil.pids())
        
        # Detect new processes
        new_pids = alive_pids - set(self.process_cache.keys())
        
        # Detect terminated processes
        dead_pids = set(self.process_cache.keys()) - alive_pids
        for pid in dead_pids:
            del self.process_cache[pid]
        
        # Analyze all processes
        for proc in psutil.process_iter(['pid', 'name', 'ppid', 'cmdline', 'create_time']):
            try:
                pid = proc.info['pid']
                p_name = proc.info['name'].lower()
                ppid = proc.info['ppid']
                cmdline = " ".join(proc.info['cmdline']) if proc.info['cmdline'] else ""
                
                # Cache process
                self.process_cache[pid] = {
                    "name": p_name,
                    "ppid": ppid,
                    "cmdline": cmdline,
                    "create_time": proc.info['create_time'],
                    "last_seen": time.time()
                }
                
                # Track parent-child relationships
                if ppid:
                    self.process_parents[pid] = ppid
                
                # Store in history for pattern analysis
                self.process_history[p_name].append({
                    "pid": pid,
                    "timestamp": datetime.utcnow().isoformat(),
                    "cmdline": cmdline[:100]  # First 100 chars
                })
                
                # Check suspicious chains
                if ppid and ppid in self.process_cache:
                    parent_proc = self.process_cache[ppid]
                    pp_name = parent_proc['name'].lower()
                    
                    for chain in self.suspicious_chains:
                        if pp_name == chain['parent'].lower() and p_name == chain['child'].lower():
                            severity = "CRITICAL"
                            msg = f"🚨 SUSPICIOUS PROCESS CHAIN: {pp_name} -> {p_name} [PID: {pid}] (MITRE: {chain['mitre']})"
                            print(f"[EDR] {msg}")
                            
                            alert_data = {
                                "message": msg,
                                "level": severity,
                                "severity": "critical",
                                "source": "EDR Behavior Engine",
                                "type": "Process Anomaly",
                                "mitre_technique": chain['mitre'],
                                "parent_process": pp_name,
                                "child_process": p_name,
                                "child_pid": pid,
                                "parent_pid": ppid,
                                "command_line": cmdline[:200],
                                "timestamp": datetime.utcnow().isoformat(),
                                "process_tree": self.get_process_tree(pid)
                            }
                            
                            asyncio.run_coroutine_threadsafe(
                                self.bus.publish("alert", alert_data),
                                self.loop
                            )
                
                # Detect LOLBins execution
                if p_name in self.lolbins:
                    cmdline_analysis = self.analyze_cmdline(cmdline)
                    if cmdline_analysis["risk_score"] > 2:
                        msg = f"⚠️ LOLBIN DETECTED with suspicious cmdline: {p_name} [PID: {pid}]"
                        print(f"[EDR] {msg}")
                        
                        alert_data = {
                            "message": msg,
                            "level": "WARNING",
                            "severity": "high",
                            "source": "EDR Behavior Engine",
                            "type": "LOLBin Execution",
                            "process": p_name,
                            "pid": pid,
                            "command_line": cmdline[:200],
                            "analysis": cmdline_analysis,
                            "timestamp": datetime.utcnow().isoformat()
                        }
                        
                        asyncio.run_coroutine_threadsafe(
                            self.bus.publish("alert", alert_data),
                            self.loop
                        )
                
                # Detect elevated processes spawning new processes
                try:
                    proc_obj = psutil.Process(pid)
                    # Check if running as SYSTEM or Administrator
                    if "SYSTEM" in str(proc_obj.username()).upper() or "ADMIN" in str(proc_obj.username()).upper():
                        if ppid and ppid in self.process_cache:
                            parent = self.process_cache[ppid]
                            if parent['name'] not in ['system', 'services.exe', 'csrss.exe']:
                                msg = f"⚠️ ELEVATED PROCESS from user context: {p_name} spawned by {parent['name']}"
                                print(f"[EDR] {msg}")
                                
                                alert_data = {
                                    "message": msg,
                                    "level": "WARNING",
                                    "severity": "medium",
                                    "source": "EDR Behavior Engine",
                                    "type": "Privilege Escalation",
                                    "parent_process": parent['name'],
                                    "child_process": p_name,
                                    "mitre_technique": "T1134",
                                    "timestamp": datetime.utcnow().isoformat()
                                }
                                
                                asyncio.run_coroutine_threadsafe(
                                    self.bus.publish("alert", alert_data),
                                    self.loop
                                )
                except Exception:
                    pass
                
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess, TypeError):
                continue

    def start_monitor(self):
        """Start real-time behavior monitoring"""
        self.running = True
        self.thread = threading.Thread(target=self._monitor_loop, daemon=True)
        self.thread.start()
        print("[EDR] 🔴 Real-Time Behavior Monitor Started")

    def _monitor_loop(self):
        """Continuous monitoring loop"""
        while self.running:
            try:
                self.scan_processes()
                time.sleep(2)  # Poll every 2 seconds for fast detection
            except Exception as e:
                print(f"[EDR] Monitor error: {e}")
                time.sleep(2)

    def stop(self):
        """Stop monitoring"""
        self.running = False
