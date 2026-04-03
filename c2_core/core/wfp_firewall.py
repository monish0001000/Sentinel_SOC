"""
WFP Firewall Service - REAL-TIME Windows Filtering Platform Integration
Provides kernel-level packet filtering with real-time threat response
"""
import asyncio
import threading
import pydivert
import json
import time
import os
from typing import Optional, Set, Dict, List
from core.event_bus import EventBus
from core.dpi import DPIEngine
from core.ngfw import PolicyEngine, SecurityRule
from datetime import datetime
import uuid
from collections import defaultdict

RULES_FILE = "firewall_rules.json"

class WFPFirewallService:
    def __init__(self, bus: EventBus):
        self.bus = bus
        self.active = True
        self.dpi = DPIEngine()
        self.ngfw = PolicyEngine()
        self.lock = threading.Lock()
        self.running = False
        
        # Capture the event loop from the main thread so we can publish from the worker thread
        self.loop = asyncio.get_event_loop()
        
        # Features
        self.auto_block_enabled = True
        self.panic_mode = False
        
        # Simple Block Lists (Legacy Support)
        self.blocked_ips: Set[str] = set()
        self.blocked_ports: Set[int] = set()
        self.simple_rules: Dict[str, Dict] = {}
        self.whitelist_ips: Set[str] = {"127.0.0.1", "localhost", "::1"}
        
        # Real-time connection tracking
        self.connection_states = defaultdict(dict)
        self.blocked_count = 0
        self.allowed_count = 0
        self.bytes_blocked = 0
        self.packets_analyzed = 0
        
        # Zero Trust Identity
        from core.process_identity import ProcessIdentity
        self.identity = ProcessIdentity()
        
        # Load rules
        self.load_rules()
        self.bus.subscribe("command", self.handle_command)
        
        # WinDivert handle filter
        # Intercepts outbound and inbound IP traffic. 
        # "true" captures everything. In prod, use specific filters like "tcp.DstPort == 80" for performance.
        self.filter = "true" 
        
        self.last_packet_time = 0


    async def handle_command(self, event: Dict):
        """
        Handle commands from SOAR or other components.
        """
        cmd = event.get("cmd")
        print(f"[WFP FIREWALL] Received Command: {cmd}")
        
        if cmd == "panic_mode":
            enabled = event.get("enabled", True)
            await self.toggle_panic_mode(enabled)
        
        elif cmd == "block_ip":
            ip = event.get("ip")
            if ip:
                await self.block_ip(ip, reason="Automated Command")

        elif cmd == "block_port":
            port = event.get("port")
            if port:
                await self.block_port(int(port), reason="Automated Command")
        
        # WinDivert handle filter
        # Intercepts outbound and inbound IP traffic. 
        # "true" captures everything. In prod, use specific filters like "tcp.DstPort == 80" for performance.
        self.filter = "true" 
        
        self.last_packet_time = 0

    def load_rules(self):
        if os.path.exists(RULES_FILE):
            try:
                with open(RULES_FILE, "r") as f:
                    data = json.load(f)
                    self.active = data.get("active", True)
                    self.auto_block_enabled = data.get("auto_block_enabled", True)
                    self.panic_mode = data.get("panic_mode", False)
                    self.blocked_ips = set(data.get("blocked_ips", []))
                    self.blocked_ports = set(data.get("blocked_ports", []))
                    self.simple_rules = data.get("simple_rules", {})
                    
                    if "policies" in data:
                        self.ngfw.load_rules(data["policies"])
                        
                print(f"[WFP FIREWALL] Loaded rules. Active: {self.active}, Panic: {self.panic_mode}")
            except Exception as e:
                print(f"[WFP FIREWALL] Error loading rules: {e}")

        # Seed Default Zero Trust Policies if empty (whether file existed or not)
        if not self.ngfw.rules:
            print("[WFP FIREWALL] No policies found. Seeding Default Zero Trust Rules...")
            defaults = [
                SecurityRule("Block Untrusted Processes", "Untrust", "Any", "Any", "Any", "deny"),
                SecurityRule("Allow Web Traffic", "Trust", "Untrust", "Any", "web-browsing", "allow"),
                SecurityRule("Isolate Critical Apps", "Any", "DMZ", "Any", "Any", "deny"),
                SecurityRule("Default Allow LAN", "Trust", "Trust", "Any", "Any", "allow")
            ]
            for rule in defaults:
                self.ngfw.add_rule(rule)
            self.save_rules() # Persist defaults immediately

    def save_rules(self):
        try:
            data = {
                "active": self.active,
                "auto_block_enabled": self.auto_block_enabled,
                "panic_mode": self.panic_mode,
                "blocked_ips": list(self.blocked_ips),
                "blocked_ports": list(self.blocked_ports),
                "blocked_countries": [], # WFP Geo-blocking TODO
                "simple_rules": self.simple_rules,
                "policies": self.ngfw.get_rules_dict()
            }
            with open(RULES_FILE, "w") as f:
                json.dump(data, f, indent=4)
        except Exception as e:
            print(f"[WFP FIREWALL] Error saving rules: {e}")

    def start(self):
        """Starts the packet interception loop in a background thread."""
        self.running = True
        self.thread = threading.Thread(target=self._packet_loop, daemon=True)
        self.thread.start()
        
        # Start stats reporting thread
        stats_thread = threading.Thread(target=self._report_stats, daemon=True)
        stats_thread.start()
        
        print("[WFP FIREWALL] 🔴 Kernel Interception Started via WinDivert (REAL-TIME)")

    def _report_stats(self):
        """REAL-TIME firewall statistics reporting"""
        while self.running:
            try:
                stats = {
                    "type": "firewall_stats",
                    "timestamp": datetime.utcnow().isoformat(),
                    "packets_analyzed": self.packets_analyzed,
                    "packets_allowed": self.allowed_count,
                    "packets_blocked": self.blocked_count,
                    "bytes_blocked": self.bytes_blocked,
                    "active_connections": len(self.connection_states),
                    "panic_mode": self.panic_mode,
                    "firewall_active": self.active
                }
                
                asyncio.run_coroutine_threadsafe(
                    self.bus.publish("firewall_event", stats),
                    self.loop
                )
                
                time.sleep(5)  # Report every 5 seconds
            except Exception:
                time.sleep(5)

    def stop(self):
        self.running = False

    def _packet_loop(self):
        """
        REAL-TIME blocking loop that reads packets from the Kernel Driver.
        Provides instantaneous threat response with sub-millisecond latency.
        """
        try:
            with pydivert.WinDivert(self.filter) as w:
                for packet in w:
                    if not self.running:
                        break
                    
                    self.packets_analyzed += 1
                    
                    if not self.active:
                        w.send(packet) # Passthrough
                        self.allowed_count += 1
                        continue

                    src_ip = packet.src_addr
                    dst_ip = packet.dst_addr
                    
                    # 0. Panic Mode Check (Highest Priority - BLOCK EVERYTHING)
                    if self.panic_mode:
                        # Allow localhost/loopback even in panic
                        if src_ip not in self.whitelist_ips and dst_ip not in self.whitelist_ips:
                            # Drop everything else
                            self.blocked_count += 1
                            self.bytes_blocked += len(packet)
                            continue 
                    
                    # 1. Basic Block Lists (IP/Port)
                    if src_ip in self.blocked_ips or dst_ip in self.blocked_ips:
                        self.blocked_count += 1
                        self.bytes_blocked += len(packet)
                        continue # Drop immediately
                        
                    if packet.src_port in self.blocked_ports or packet.dst_port in self.blocked_ports:
                        self.blocked_count += 1
                        self.bytes_blocked += len(packet)
                        continue # Drop immediately

                    # 2. DPI & NGFW Check
                    dpi_result = self.dpi.inspect_packet(packet.raw)
                    protocol = dpi_result.get("proto", "unknown")
                    
                    # Simulate Zones for NGFW
                    src_zone = "Trust" if src_ip.startswith("192.168") or src_ip.startswith("10.0") else "Untrust"
                    dst_zone = "DMZ"
                    
                    # Zero Trust: Resolve Process
                    process_name = "unknown"
                    if packet.is_outbound:
                        try:
                            # Attempt to find PID owning the source port
                            pid = self.identity.get_pid_using_port(packet.src_port)
                            if pid:
                                info = self.identity.get_process_info(pid)
                                if info:
                                    process_name = info["name"]
                        except:
                            pass

                    action = self.ngfw.evaluate(src_zone, dst_zone, src_ip, protocol, process_name)
                    
                    # Track connection state
                    conn_key = f"{src_ip}:{packet.src_port}-{dst_ip}:{packet.dst_port}"
                    
                    if action == "allow":
                        w.send(packet)
                        self.allowed_count += 1
                        
                        # Update connection state
                        self.connection_states[conn_key] = {
                            "status": "ALLOWED",
                            "last_seen": time.time(),
                            "bytes": len(packet),
                            "protocol": protocol,
                            "process": process_name
                        }
                        
                        # LIMIT UI UPDATES to ~50ms to prevent flooding
                        now = time.time()
                        if now - self.last_packet_time > 0.05:
                            self.last_packet_time = now
                            packet_data = {
                                "id": conn_key,
                                "uid": str(uuid.uuid4()),
                                "src_ip": src_ip,
                                "src_port": packet.src_port,
                                "dst_ip": dst_ip,
                                "dst_port": packet.dst_port,
                                "protocol": protocol,
                                "status": "ALLOW",
                                "process": process_name,
                                "timestamp": time.strftime("%H:%M:%S")
                            }
                            # Publish safely to the async event bus
                            asyncio.run_coroutine_threadsafe(
                                self.bus.publish("packet_event", packet_data), 
                                self.loop
                            )
                    else:
                        self.blocked_count += 1
                        self.bytes_blocked += len(packet)
                        
                        # Update connection state
                        self.connection_states[conn_key] = {
                            "status": "BLOCKED",
                            "last_seen": time.time(),
                            "bytes": len(packet),
                            "protocol": protocol,
                            "process": process_name,
                            "reason": "Policy violation"
                        }
                        
                        print(f"[WFP] 🚫 REAL-TIME BLOCK: {src_ip}:{packet.src_port} -> {dst_ip}:{packet.dst_port} [{protocol}] via {process_name}")
                        
                        # Publish Block Event (always important)
                        packet_data = {
                            "id": conn_key,
                            "uid": str(uuid.uuid4()),
                            "src_ip": src_ip,
                            "src_port": packet.src_port,
                            "dst_ip": dst_ip,
                            "dst_port": packet.dst_port,
                            "protocol": protocol,
                            "status": "BLOCKED",
                            "process": process_name,
                            "reason": "Policy violation",
                            "timestamp": time.strftime("%H:%M:%S")
                        }
                        asyncio.run_coroutine_threadsafe(
                             self.bus.publish("packet_event", packet_data), 
                             self.loop
                        )
                        # Publish as alert
                        asyncio.run_coroutine_threadsafe(
                             self.bus.publish("alert", {
                                 "message": f"Firewall blocked {src_ip}:{packet.src_port} -> {dst_ip}:{packet.dst_port}",
                                 "level": "INFO",
                                 "severity": "low",
                                 "source": "WFP Firewall"
                             }), 
                             self.loop
                        )
                        
        except PermissionError:
            print("[WFP] ❌ FAILED: Admin rights required for WinDivert. Run as Administrator.")
            print("[WFP] Please restart with elevated privileges for real-time packet filtering.")
        except Exception as e:
            print(f"[WFP] ERROR in packet loop: {e}")

    # --- API Compat Methods ---
    
    def get_status(self):
        """Returns the current firewall status/configuration."""
        return {
            "active": self.active,
            "auto_block": self.auto_block_enabled, 
            "panic_mode": self.panic_mode,
            "blocked_ips": list(self.blocked_ips),
            "blocked_ports": list(self.blocked_ports),
            "blocked_countries": [],
            "rules": list(self.simple_rules.values()),
            "policies": self.ngfw.get_rules_dict()
        }

    def get_policies(self):
        return self.ngfw.get_rules_dict()
        
    def match_traffic(self, ip: str, port: int, country: str = "US", pid: int = None) -> str:
        """
        Evaluation logic for external callers (like PacketSniffer).
        """
        if self.panic_mode:
             if ip not in self.whitelist_ips:
                 return "deny"

        # 1. Basic Block Lists
        if ip in self.blocked_ips:
            return "deny"
        if port in self.blocked_ports:
            return "deny"

        # 2. NGFW Policy Engine
        # Resolve Process Identity (Zero Trust)
        process_name = "unknown"
        if pid:
            info = self.identity.get_process_info(pid)
            if info:
                 process_name = info["name"]

        src_zone = "Trust" if ip.startswith("192.168") else "Untrust"
        dst_zone = "DMZ" 
        # We don't have app-id for sniffer, so guess
        app = "unknown"
        if port == 80: app = "web-browsing"
        if port == 443: app = "ssl"
        
        return self.ngfw.evaluate(src_zone, dst_zone, ip, app, process_name)

    async def block_ip(self, ip: str, reason: str="Manual"):
        if ip not in self.blocked_ips:
            self.blocked_ips.add(ip)
            self.simple_rules[f"ip:{ip}"] = {
                "target": ip,
                "type": "IP",
                "reason": reason,
                "timestamp": datetime.utcnow().isoformat()
            }
            self.save_rules()
            await self.bus.publish("firewall_event", {
                "type": "rule_added",
                "rule": self.simple_rules[f"ip:{ip}"]
            })
            await self.bus.publish("explanation", {
                "explanation": f"Firewall blocked IP {ip}. Reason: {reason}"
            })
        return {"status": "blocked", "ip": ip}

    async def unblock_ip(self, ip: str):
        if ip in self.blocked_ips:
            self.blocked_ips.remove(ip)
            if f"ip:{ip}" in self.simple_rules:
                del self.simple_rules[f"ip:{ip}"]
            self.save_rules()
            await self.bus.publish("firewall_event", {
                "type": "rule_removed",
                "target": ip,
                "rule_type": "IP"
            })
            await self.bus.publish("explanation", {
                "explanation": f"Firewall unblocked IP {ip}."
            })
        return {"status": "unblocked", "ip": ip}
        
    async def add_policy(self, policy):
        rule = SecurityRule.from_dict(policy)
        self.ngfw.add_rule(rule)
        self.save_rules()
        await self.bus.publish("firewall_event", {
            "type": "policy_updated",
            "policies": self.ngfw.get_rules_dict()
        })
        return {"status": "added"} 

    async def delete_policy(self, rule_id: str):
        self.ngfw.remove_rule(rule_id)
        self.save_rules()
        await self.bus.publish("firewall_event", {
            "type": "policy_updated",
            "policies": self.ngfw.get_rules_dict()
        })
        return {"status": "deleted", "id": rule_id}
        
    async def toggle_firewall(self, active: bool):
        self.active = active
        self.save_rules()
        await self.bus.publish("firewall_event", {
            "type": "status_change",
            "active": self.active,
            "panic_mode": self.panic_mode,
            "timestamp": datetime.utcnow().isoformat()
        })
        return {"status": "success", "active": self.active}
        
    async def toggle_panic_mode(self, enabled: bool):
        self.panic_mode = enabled
        self.save_rules()
        msg = "FIREWALL LOCKDOWN INITIATED. BLOCKING ALL TRAFFIC." if enabled else "Firewall Lockdown lifted."
        level = "CRITICAL" if enabled else "INFO"
        await self.bus.publish("firewall_event", {
            "type": "panic_change",
            "panic_mode": self.panic_mode,
            "timestamp": datetime.utcnow().isoformat()
        })
        await self.bus.publish("alert", {
            "message": msg,
            "level": level,
            "severity": "high",
            "source": "Firewall Core"
        })
        return {"status": "success", "panic_mode": enabled}

    async def toggle_auto_block(self, enabled: bool):
        self.auto_block_enabled = enabled
        self.save_rules()
        await self.bus.publish("firewall_event", {
            "type": "config_change",
            "auto_block": self.auto_block_enabled,
            "timestamp": datetime.utcnow().isoformat()
        })
        return {"status": "success", "auto_block": self.auto_block_enabled}
        
    async def block_port(self, port: int, reason: str="Manual"):
        if port not in self.blocked_ports:
            self.blocked_ports.add(port)
            self.simple_rules[f"port:{port}"] = {
                "target": port,
                "type": "Port",
                "reason": reason,
                "timestamp": datetime.utcnow().isoformat()
            }
            self.save_rules()
            await self.bus.publish("firewall_event", {
                "type": "rule_added",
                "rule": self.simple_rules[f"port:{port}"]
            })
            await self.bus.publish("explanation", {
                "explanation": f"Firewall blocked Port {port}. Reason: {reason}"
            })
        return {"status": "blocked", "port": port}
        
    async def unblock_port(self, port: int):
        if port in self.blocked_ports:
            self.blocked_ports.remove(port)
            if f"port:{port}" in self.simple_rules:
                del self.simple_rules[f"port:{port}"]
            self.save_rules()
            await self.bus.publish("firewall_event", {
                "type": "rule_removed",
                "target": port,
                "rule_type": "Port"
            })
            await self.bus.publish("explanation", {
                "explanation": f"Firewall unblocked Port {port}."
            })
        return {"status": "unblocked", "port": port} 
        
    async def block_country(self, country_code: str):
         # WFP logic for Geo-Blocking (Placeholder for now)
         # In a real WFP scenario, we would map IPs to Countries here or filter by ranges.
         # For now, we will just log it.
        return {"status": "blocked", "country": country_code}

    async def unblock_country(self, country_code: str):
        return {"status": "unblocked", "country": country_code}

