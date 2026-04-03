# collectors/system_logs.py
"""
REAL-TIME Windows Event Log Collector
Streams events from Windows Event Log in real-time using subscriptions
"""
import psutil
import asyncio
import time
import threading
import json
from datetime import datetime
import platform

try:
    import win32evtlog
    import win32con
    WIN32_AVAILABLE = True
except ImportError:
    WIN32_AVAILABLE = False

class SystemLogCollector:
    def __init__(self, bus):
        self.bus = bus
        self.running = False
        self.event_log_handles = {}
        self.metrics_thread = None
        self.event_log_thread = None

    async def start(self):
        """Start real-time monitoring"""
        # Start system metrics collection (1 second interval)
        self.metrics_thread = threading.Thread(target=self._collect_metrics, daemon=True)
        self.metrics_thread.start()
        
        # Start Event Log collection (real-time)
        if WIN32_AVAILABLE:
            self.event_log_thread = threading.Thread(target=self._collect_event_logs, daemon=True)
            self.event_log_thread.start()
            print("[SYSTEM LOGS] 🔴 Real-time Windows Event Log monitoring ACTIVE")
        else:
            print("[SYSTEM LOGS] ⚠️ pywin32 not available - metrics only")
        
        # Keep the task alive
        while True:
            await asyncio.sleep(1)

    def _collect_metrics(self):
        """Continuously collect system metrics (1s interval)"""
        self.running = True
        while self.running:
            try:
                cpu = psutil.cpu_percent(interval=0.1)
                mem = psutil.virtual_memory()
                disk = psutil.disk_usage('C:/' if 'C:' not in psutil.disk_partitions()[0].device else 'C:')
                
                event = {
                    "type": "system_metrics",
                    "cpu_percent": cpu,
                    "memory_percent": mem.percent,
                    "memory_used_mb": mem.used // (1024 * 1024),
                    "memory_total_mb": mem.total // (1024 * 1024),
                    "disk_percent": disk.percent,
                    "disk_free_mb": disk.free // (1024 * 1024),
                    "timestamp": time.time(),
                    "process_count": len(psutil.pids()),
                    "network_connections": len(psutil.net_connections())
                }
                
                asyncio.run_coroutine_threadsafe(
                    self.bus.publish("system_event", event),
                    self._get_loop()
                )
                
                time.sleep(1)  # 1 second interval
            except Exception as e:
                print(f"[SYSTEM LOGS] Metrics error: {e}")
                time.sleep(1)

    def _collect_event_logs(self):
        """REAL-TIME collection from Windows Event Log"""
        if not WIN32_AVAILABLE:
            return
        
        print("[SYSTEM LOGS] Starting real-time Event Log collection...")
        
        # Event logs to monitor
        logs_to_monitor = [
            ("Security", win32evtlog.EVENTLOG_BACKWARDS_READ),
            ("System", win32evtlog.EVENTLOG_BACKWARDS_READ),
            ("Application", win32evtlog.EVENTLOG_BACKWARDS_READ),
        ]
        
        # Check for Sysmon if available
        try:
            win32evtlog.OpenEventLog(None, "Microsoft-Windows-Sysmon/Operational")
            logs_to_monitor.append(("Microsoft-Windows-Sysmon/Operational", win32evtlog.EVENTLOG_BACKWARDS_READ))
        except:
            pass
        
        for log_name, flags in logs_to_monitor:
            threading.Thread(
                target=self._monitor_log,
                args=(log_name, flags),
                daemon=True
            ).start()
            print(f"[SYSTEM LOGS] Monitoring '{log_name}'...")

    def _monitor_log(self, log_name: str, read_flags):
        """Monitor a specific event log for real-time events"""
        try:
            handle = win32evtlog.OpenEventLog(None, log_name)
            last_record_number = None
            
            while self.running:
                try:
                    # Get total records
                    flags = win32evtlog.EVENTLOG_SEQUENTIAL_READ | read_flags
                    events = win32evtlog.ReadEventLog(handle, flags, 0)
                    
                    if events:
                        for event in events:
                            record_number = event.RecordNumber
                            
                            # Process new events
                            if last_record_number is None or record_number > last_record_number:
                                try:
                                    event_data = self._parse_event(log_name, event)
                                    asyncio.run_coroutine_threadsafe(
                                        self.bus.publish("system_event", event_data),
                                        self._get_loop()
                                    )
                                except Exception as e:
                                    pass
                            
                            last_record_number = record_number
                    
                    # Poll every 100ms for new events
                    time.sleep(0.1)
                    
                except Exception as e:
                    print(f"[SYSTEM LOGS] Error reading {log_name}: {e}")
                    time.sleep(1)
        except Exception as e:
            print(f"[SYSTEM LOGS] Failed to open {log_name}: {e}")

    def _parse_event(self, log_name: str, event) -> dict:
        """Parse Windows Event Log entry into structured format"""
        try:
            event_id = event.EventID
            event_type = event.EventType
            timestamp = event.TimeGenerated
            computer = event.ComputerName
            data = event.StringInserted
            
            # Map event types
            type_map = {
                win32con.EVENTLOG_ERROR_TYPE: "ERROR",
                win32con.EVENTLOG_WARNING_TYPE: "WARNING",
                win32con.EVENTLOG_INFORMATION_TYPE: "INFO",
                win32con.EVENTLOG_AUDIT_SUCCESS: "AUDIT_SUCCESS",
                win32con.EVENTLOG_AUDIT_FAILURE: "AUDIT_FAILURE",
            }
            
            severity = type_map.get(event_type, "UNKNOWN")
            
            # Extract critical events
            extracted_data = {
                "msg": data[0] if data else "",
                "raw_data": data if data else []
            }
            
            # Sysmon events
            if "Sysmon" in log_name:
                extracted_data["is_sysmon"] = True
            
            # Security events (authentication, lateral movement, etc)
            if log_name == "Security":
                critical_events = [4624, 4625, 4688, 4689, 4720, 4722, 4625, 4663, 5156, 5157]
                if event_id in critical_events:
                    extracted_data["is_critical"] = True
            
            return {
                "type": "windows_event_log",
                "log_source": log_name,
                "event_id": event_id,
                "severity": severity,
                "computer": computer,
                "timestamp": timestamp.isoformat() if hasattr(timestamp, 'isoformat') else str(timestamp),
                "data": extracted_data,
                "collected_at": datetime.utcnow().isoformat()
            }
        except Exception as e:
            return {
                "type": "windows_event_log",
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat()
            }

    def _get_loop(self):
        """Get the current event loop (thread-safe)"""
        try:
            return asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            return loop

    def stop(self):
        """Stop all monitoring"""
        self.running = False
