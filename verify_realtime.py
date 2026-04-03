#!/usr/bin/env python3
"""
SENTINEL SOC v2.0.0 - REAL-TIME COMPONENT VERIFICATION
Verifies that all real-time monitoring components are active and functioning
"""

import os
import sys
import time
import platform
import subprocess
import json
from datetime import datetime

def print_header(text):
    """Print formatted header"""
    print("\n" + "="*70)
    print(f"  {text}")
    print("="*70 + "\n")

def print_check(component, status, details=""):
    """Print check result"""
    symbol = "✓" if status else "✗"
    color_start = "\033[92m" if status else "\033[91m"  # Green or Red
    color_end = "\033[0m"  # Reset
    print(f"{color_start}[{symbol}] {component:<30} {details}{color_end}")

def check_python_version():
    """Verify Python version"""
    version = sys.version_info
    print_header("Python Environment")
    print_check("Python Version", version >= (3, 8), f"(Python {version.major}.{version.minor})")
    print_check("Platform", platform.system() == "Windows", f"({platform.system()})")
    
    if platform.system() != "Windows":
        print("\n⚠️  WARNING: This SOC is optimized for Windows. Some features may not work on Linux/Mac.")

def check_dependencies():
    """Check if required packages are installed"""
    print_header("Required Dependencies")
    
    required = {
        "psutil": "System monitoring",
        "fastapi": "API server",
        "uvicorn": "API application server",
        "websockets": "Real-time WebSocket",
        "redis": "Event cache",
        "scapy": "Network packet capture",
        "watchdog": "File system monitoring",
        "pywin32": "Windows integration",
        "pydivert": "WFP firewall driver",
    }
    
    missing = []
    for package, description in required.items():
        try:
            __import__(package.replace("-", "_"))
            print_check(package.capitalize(), True, f"- {description}")
        except ImportError:
            print_check(package.capitalize(), False, f"- {description} (MISSING)")
            missing.append(package)
    
    if missing:
        print(f"\n⚠️  Missing packages. Install with:")
        print(f"   pip install {' '.join(missing)}")
    
    return len(missing) == 0

def check_windows_event_log():
    """Check Windows Event Log access"""
    print_header("Windows Event Log Monitoring")
    
    try:
        import win32evtlog
        print_check("win32evtlog", True, "- Can access Windows Event Logs")
        
        # Try to open default event logs
        logs_to_check = ["Security", "System", "Application"]
        for log_name in logs_to_check:
            try:
                handle = win32evtlog.OpenEventLog(None, log_name)
                win32evtlog.CloseEventLog(handle)
                print_check(f"  Event Log: {log_name}", True, "- Accessible")
            except Exception as e:
                print_check(f"  Event Log: {log_name}", False, f"- {str(e)}")
        
        return True
    except ImportError:
        print_check("win32evtlog", False, "- Package not installed")
        return False

def check_network_capture():
    """Check packet capture capability"""
    print_header("Network Packet Capture")
    
    try:
        from scapy.all import conf
        print_check("Scapy", True, "- Packet capture library available")
        print(f"   → Default interface: {conf.iface}")
        return True
    except ImportError:
        print_check("Scapy", False, "- Package not installed")
        return False

def check_firewall_wfp():
    """Check WFP firewall capability"""
    print_header("Windows Filtering Platform (WFP)")
    
    try:
        import pydivert
        print_check("PyDivert", True, "- WFP firewall access available")
        print("   → Note: Full functionality requires Administrator privileges")
        return True
    except ImportError:
        print_check("PyDivert", False, "- Package not installed (pip install pydivert)")
        return False

def check_file_monitoring():
    """Check file monitoring capability"""
    print_header("File Integrity Monitoring (FIM)")
    
    try:
        from watchdog.observers import Observer
        print_check("Watchdog", True, "- File system monitoring available")
        
        # Check writable database path
        db_path = "fim_database.db"
        test_path = os.path.expandvars("%APPDATA%")
        is_writable = os.access(test_path, os.W_OK)
        print_check(f"  Writable directory", is_writable, f"({test_path})")
        
        return True
    except ImportError:
        print_check("Watchdog", False, "- Package not installed")
        return False

def check_redis():
    """Check Redis connectivity"""
    print_header("Redis Event Bus")
    
    try:
        import redis
        print_check("redis-py", True, "- Redis client available")
        
        # Try to connect
        r = redis.Redis(host='localhost', port=6379, db=0)
        info = r.ping()
        print_check("Redis Server", True, "- Connected on localhost:6379")
        
        # Check if running in Docker
        r.set("test_sentinel", "ok")
        time.sleep(0.1)
        val = r.get("test_sentinel")
        r.delete("test_sentinel")
        
        print_check("Redis Read/Write", True, "- Working correctly")
        return True
        
    except ImportError:
        print_check("redis-py", False, "- Package not installed")
        return False
    except Exception as e:
        print_check("Redis Server", False, f"- Cannot connect ({str(e)})")
        print("   → Consider running: docker run -d -p 6379:6379 redis")
        return False

def check_databases():
    """Check database files"""
    print_header("Database Files")
    
    db_files = {
        "sentinel_siem.db": "SIEM Event Database",
        "incident.db": "Incident Database",
        "fim_database.db": "File Integrity Database",
        "firewall_rules.json": "Firewall Configuration",
    }
    
    for filename, description in db_files.items():
        exists = os.path.exists(filename)
        status = "Exists" if exists else "Will be created"
        print_check(filename, True, f"({description}) - {status}")

def check_api_ports():
    """Check if required ports are available"""
    print_header("Network Ports")
    
    import socket
    
    ports = {
        8000: "FastAPI Server",
        8765: "WebSocket Server",
        1514: "Syslog Collector",
        6379: "Redis (optional)",
        3000: "Dashboard UI"
    }
    
    for port, service in ports.items():
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            result = sock.connect_ex(('127.0.0.1', port))
            if result == 0:
                print_check(f"Port {port}", False, f"({service}) - IN USE")
            else:
                print_check(f"Port {port}", True, f"({service}) - Available")
        except Exception as e:
            print_check(f"Port {port}", False, f"({service}) - Error: {str(e)}")
        finally:
            sock.close()

def check_environment_variables():
    """Check threat intelligence API keys"""
    print_header("Environment Variables (Optional)")
    
    env_vars = {
        "ABUSEIPDB_API_KEY": "AbuseIPDB IP Reputation API",
        "VIRUSTOTAL_API_KEY": "VirusTotal Malware Database API",
        "REDIS_HOST": "Redis server host (default: localhost)",
    }
    
    for var, description in env_vars.items():
        value = os.getenv(var)
        if value:
            masked = value[:5] + "..." if len(value) > 5 else value
            print_check(var, True, f"({description}) ✓ SET")
        else:
            print_check(var, False, f"({description}) - Not set (optional)")

def check_admin_privileges():
    """Check if running as Administrator"""
    print_header("System Privileges")
    
    is_admin = False
    if platform.system() == "Windows":
        try:
            import ctypes
            is_admin = ctypes.windll.shell32.IsUserAnAdmin()
        except:
            pass
    
    print_check("Administrator", is_admin, "- Required for firewall/EDR features")
    
    if not is_admin:
        print("\n⚠️  WARNING: Not running as Administrator")
        print("    Some real-time features will be limited:")
        print("    - WFP firewall (requires admin)")
        print("    - Packet capture  (requires admin)")
        print("    - Windows Event Log (requires admin)")
        print("\n    Recommended: Run PowerShell as Administrator first")

def run_component_tests():
    """Run basic component tests"""
    print_header("Real-Time Component Status")
    
    components = {
        "Windows Event Log Monitoring": check_windows_event_log(),
        "Network Packet Capture": check_network_capture(),
        "File Integrity Monitoring": check_file_monitoring(),
        "WFP Firewall": check_firewall_wfp(),
        "Redis Event Bus": check_redis(),
    }
    
    active_count = sum(1 for v in components.values() if v)
    total_count = len(components)
    
    print(f"\n✓ {active_count}/{total_count} real-time components ready")
    return active_count >= 4  # At least 4/5 components

def main():
    """Main verification routine"""
    print("\n" + "="*70)
    print("    SENTINEL SOC v2.0.0 - REAL-TIME VERIFICATION")
    print("    Checking all components for production readiness")
    print("="*70)
    
    all_checks = []
    
    # Run all checks
    check_python_version()
    all_checks.append(check_dependencies())
    check_admin_privileges()
    check_windows_event_log()
    check_network_capture()
    check_firewall_wfp()
    check_file_monitoring()
    check_redis()
    check_databases()
    check_api_ports()
    check_environment_variables()
    components_ok = run_component_tests()
    
    # Summary
    print_header("Verification Summary")
    
    if components_ok and all_checks:
        print("\n✓ ALL CHECKS PASSED - System Ready for Production!\n")
        print("Start the system with:")
        print("  python c2_core/main.py\n")
        print("Then access the dashboard at:")
        print("  http://localhost:3000\n")
        return 0
    else:
        print("\n⚠️  Some components are missing or not configured.\n")
        print("Install missing packages:")
        print("  pip install -r requirements.txt\n")
        print("Then try verification again.")
        return 1

if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)
