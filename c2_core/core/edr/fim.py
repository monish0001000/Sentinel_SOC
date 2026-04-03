"""
File Integrity Monitoring (FIM) - REAL-TIME
Monitors critical files for unauthorized modifications, detects ransomware,
and tracks file extension changes
"""
import time
import os
import hashlib
import sqlite3
import threading
import asyncio
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from core.event_bus import EventBus
from datetime import datetime
from collections import defaultdict

DB_FILE = "fim_database.db"

class FileIntegrityMonitor:
    def __init__(self, bus: EventBus):
        self.bus = bus
        self.observer = Observer()
        self.handler = FIMHandler(bus)
        self.running = False
        self.event_history = defaultdict(list)
        self.init_database()
        
        # Paths to monitor
        self.monitored_paths = [
            "C:\\Windows\\System32",
            "C:\\Windows\\SysWOW64",
            "C:\\Users",
            "C:\\ProgramData",
            os.path.expandvars("%APPDATA%"),
            os.path.expandvars("%LOCALAPPDATA%"),
            os.path.expandvars("%TEMP%"),
        ]
        
        # Critical file extensions to protect
        self.critical_extensions = [
            ".exe", ".dll", ".sys", ".msi", ".scr", ".vbs", ".js", ".ps1",
            ".bat", ".cmd", ".com", ".pif"
        ]
        
        # Ransomware signatures (file extension changes)
        self.ransomware_extensions = [
            ".crypto", ".encrypted", ".locked", ".xyz", ".aes", ".gbu",
            ".crypt", ".crpt", ".xxx", ".zzz", ".encoded", ".encr"
        ]

    def init_database(self):
        """Initialize FIM database with baseline"""
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS file_baseline (
                id TEXT PRIMARY KEY,
                path TEXT UNIQUE,
                hash TEXT,
                size INTEGER,
                modified_time REAL,
                created_at DATETIME,
                is_critical INTEGER,
                extension TEXT
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS file_changes (
                id TEXT PRIMARY KEY,
                path TEXT,
                action TEXT,
                old_hash TEXT,
                new_hash TEXT,
                timestamp DATETIME,
                severity TEXT,
                threat_detected TEXT
            )
        ''')
        
        conn.commit()
        conn.close()

    def calculate_file_hash(self, filepath: str) -> str:
        """Calculate SHA-256 hash of file"""
        try:
            if not os.path.isfile(filepath):
                return None
            
            sha256_hash = hashlib.sha256()
            with open(filepath, "rb") as f:
                for byte_block in iter(lambda: f.read(4096), b""):
                    sha256_hash.update(byte_block)
            return sha256_hash.hexdigest()
        except (IOError, OSError):
            return None

    def create_baseline(self):
        """Create baseline of critical files"""
        print("[FIM] 📸 Creating file integrity baseline...")
        
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        
        baseline_count = 0
        
        for root_path in self.monitored_paths:
            if not os.path.exists(root_path):
                continue
            
            try:
                for root, dirs, files in os.walk(root_path):
                    # Skip certain directories
                    dirs[:] = [d for d in dirs if d not in ['$Recycle.Bin', 'System Volume Information']]
                    
                    for file in files:
                        filepath = os.path.join(root, file)
                        
                        # Skip temp and cache files
                        if any(x in filepath.lower() for x in ['.tmp', 'cache', '__pycache__', '$']):
                            continue
                        
                        try:
                            file_hash = self.calculate_file_hash(filepath)
                            if file_hash:
                                _, ext = os.path.splitext(file)
                                is_critical = 1 if ext.lower() in self.critical_extensions else 0
                                
                                cursor.execute('''
                                    INSERT OR REPLACE INTO file_baseline 
                                    (id, path, hash, size, modified_time, created_at, is_critical, extension)
                                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                                ''', (
                                    hashlib.md5(filepath.encode()).hexdigest(),
                                    filepath,
                                    file_hash,
                                    os.path.getsize(filepath),
                                    os.path.getmtime(filepath),
                                    datetime.utcnow().isoformat(),
                                    is_critical,
                                    ext
                                ))
                                
                                baseline_count += 1
                                
                                if baseline_count % 100 == 0:
                                    print(f"[FIM] Baselined {baseline_count} files...")
                        except Exception:
                            pass
            except Exception as e:
                print(f"[FIM] Error scanning {root_path}: {e}")
        
        conn.commit()
        conn.close()
        print(f"[FIM] ✓ Baseline created for {baseline_count} files")

    def verify_file_integrity(self, filepath: str) -> dict:
        """Verify file integrity against baseline"""
        try:
            current_hash = self.calculate_file_hash(filepath)
            if not current_hash:
                return None
            
            conn = sqlite3.connect(DB_FILE)
            cursor = conn.cursor()
            
            cursor.execute('SELECT hash, size FROM file_baseline WHERE path = ?', (filepath,))
            row = cursor.fetchone()
            conn.close()
            
            if row:
                baseline_hash, baseline_size = row
                current_size = os.path.getsize(filepath)
                
                if current_hash != baseline_hash or current_size != baseline_size:
                    return {
                        "modified": True,
                        "baseline_hash": baseline_hash,
                        "current_hash": current_hash,
                        "size_changed": current_size != baseline_size
                    }
            
            return {"modified": False}
        except Exception:
            return None

    def start_monitor(self):
        """Start real-time file monitoring"""
        self.running = True
        
        # Create baseline if needed
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute('SELECT COUNT(*) FROM file_baseline')
        count = cursor.fetchone()[0]
        conn.close()
        
        if count == 0:
            self.create_baseline()
        
        # Start watchdog observer
        for path in self.monitored_paths:
            if os.path.exists(path):
                try:
                    self.observer.schedule(self.handler, path, recursive=True)
                except Exception as e:
                    print(f"[FIM] Could not schedule {path}: {e}")
        
        self.observer.start()
        print("[FIM] 🔴 Real-Time File Integrity Monitor Started")
        
        # Start monitoring thread for ransomware detection
        monitor_thread = threading.Thread(target=self._ransomware_monitor, daemon=True)
        monitor_thread.start()

    def _ransomware_monitor(self):
        """Monitor for ransomware patterns (mass file encryption)"""
        while self.running:
            try:
                now = time.time()
                
                # Check for mass file extensions changes (ransomware indicator)
                for path in self.monitored_paths:
                    if os.path.exists(path):
                        try:
                            file_modifications = 0
                            ransomware_signatures = 0
                            
                            for root, dirs, files in os.walk(path):
                                dirs[:] = [d for d in dirs if d not in ['System Volume Information', '$Recycle.Bin']]
                                
                                for file in files:
                                    filepath = os.path.join(root, file)
                                    _, ext = os.path.splitext(file)
                                    
                                    # Check for ransomware extension
                                    if ext.lower() in self.ransomware_extensions:
                                        ransomware_signatures += 1
                                        
                                        alert_data = {
                                            "message": f"🚨 RANSOMWARE SIGNATURE DETECTED: {filepath}",
                                            "level": "CRITICAL",
                                            "severity": "critical",
                                            "source": "FIM",
                                            "type": "Ransomware",
                                            "filepath": filepath,
                                            "file_extension": ext,
                                            "timestamp": datetime.utcnow().isoformat()
                                        }
                                        
                                        asyncio.run_coroutine_threadsafe(
                                            self.bus.publish("alert", alert_data),
                                            self._get_loop()
                                        )
                        except Exception:
                            pass
                
                time.sleep(5)
            except Exception as e:
                print(f"[FIM] Ransomware monitor error: {e}")
                time.sleep(5)

    def stop_monitor(self):
        """Stop file monitoring"""
        self.running = False
        self.observer.stop()
        self.observer.join()
        print("[FIM] File monitoring stopped")

    def _get_loop(self):
        """Get event loop (thread-safe)"""
        try:
            return asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            return loop


class FIMHandler(FileSystemEventHandler):
    """Watchdog event handler for file system events"""
    
    def __init__(self, bus: EventBus):
        self.bus = bus
        self.fim = FileIntegrityMonitor(bus)
        self.event_history = []
        
        try:
            self.loop = asyncio.get_event_loop()
        except RuntimeError:
            self.loop = None
        
        # Ransomware detection: track modification patterns
        self.file_modifications_window = defaultdict(list)
        self.modification_threshold = 100  # Files modified in 10 seconds

    def on_modified(self, event):
        if not event.is_directory:
            self._process_file_event("modified", event.src_path)

    def on_created(self, event):
        if not event.is_directory:
            self._process_file_event("created", event.src_path)

    def on_deleted(self, event):
        if not event.is_directory:
            self._process_file_event("deleted", event.src_path)

    def _process_file_event(self, action: str, filepath: str):
        """Process file system event"""
        try:
            # Filter out noise
            if any(x in filepath.lower() for x in ['.tmp', '__pycache__', 'cache', 'debug', '$']):
                return
            
            _, ext = os.path.splitext(filepath)
            
            # Check file integrity
            integrity_check = self.fim.verify_file_integrity(filepath)
            
            # Detect ransomware patterns (mass modifications)
            now = time.time()
            self.file_modifications_window[action].append(now)
            self.file_modifications_window[action] = [
                t for t in self.file_modifications_window[action] 
                if now - t < 10  # 10 second window
            ]
            
            if len(self.file_modifications_window[action]) > self.modification_threshold:
                alert_msg = f"🚨 RANSOMWARE PATTERN: {len(self.file_modifications_window[action])} files modified in 10s"
                print(f"[FIM] {alert_msg}")
                
                alert_data = {
                    "message": alert_msg,
                    "level": "CRITICAL",
                    "severity": "critical",
                    "source": "FIM",
                    "type": "Ransomware - Mass Encryption",
                    "modification_count": len(self.file_modifications_window[action]),
                    "timestamp": datetime.utcnow().isoformat()
                }
                
                if self.loop:
                    asyncio.run_coroutine_threadsafe(
                        self.bus.publish("alert", alert_data),
                        self.loop
                    )
            
            # Alert on critical file changes
            if integrity_check and integrity_check.get("modified"):
                if ext.lower() in [".exe", ".dll", ".sys", ".ps1", ".bat"]:
                    alert_msg = f"⚠️ CRITICAL FILE MODIFIED: {os.path.basename(filepath)}"
                    print(f"[FIM] {alert_msg}")
                    
                    alert_data = {
                        "message": alert_msg,
                        "level": "WARNING",
                        "severity": "high",
                        "source": "FIM",
                        "type": "File Integrity Violation",
                        "filepath": filepath,
                        "action": action,
                        "file_extension": ext,
                        "integrity_check": integrity_check,
                        "timestamp": datetime.utcnow().isoformat()
                    }
                    
                    if self.loop:
                        asyncio.run_coroutine_threadsafe(
                            self.bus.publish("alert", alert_data),
                            self.loop
                        )
            
        except Exception as e:
            pass
        if len(self.event_history) > 30 and not self.heuristic_triggered:
            # HEURISTIC TRIGGERED
            print(f"[FIM] 🚨 RANSOMWARE BEHAVIOR DETECTED! (Mass File Mods: {len(self.event_history)}/3s)")
            self.heuristic_triggered = True
            
            alert = {
                "message": f"Ransomware Detected: Mass file modification in {os.path.dirname(path)}",
                "level": "critical",
                "severity": "high",
                "source": "EDR FIM",
                "type": "Ransomware",
                "timestamp": datetime.utcnow().isoformat(),
                "path": path
            }
            
            # Thread-safe publish
            if self.loop:
                asyncio.run_coroutine_threadsafe(
                    self._publish(alert),
                    self.loop
                )
            
            # Reset heuristic after a cooldown (simulate cooldown by not clearing immediately or just boolean)
            # We leave it True to avoid spamming 1000 alerts. Ideally reset after 10s.
        
        # Publish individual low-level events only if needed? 
        # For now, just logging print is enough to keep bus clean, or send DEBUG event.


class FileIntegrityMonitor:
    def __init__(self, bus: EventBus):
        self.bus = bus
        self.observer = Observer()
        self.monitored_paths = [
            # In production: "C:\\Windows\\System32\\drivers\\etc",
            os.path.abspath("."), # Monitor current project dir for demo
        ]
        
    def start(self):
        handler = FIMHandler(self.bus)
        for path in self.monitored_paths:
            if os.path.exists(path):
                self.observer.schedule(handler, path, recursive=True)
                print(f"[FIM] Monitoring: {path}")
        
        self.observer.start()
        
    def stop(self):
        self.observer.stop()
        self.observer.join()
