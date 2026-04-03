# collectors/network_monitor.py
"""
REAL-TIME Network Traffic Analyzer
Live packet capture with protocol analysis and threat detection
"""
import asyncio
import time
import threading
import json
from collections import defaultdict
from datetime import datetime
import socket

try:
    from scapy.all import sniff, IP, TCP, UDP, DNS, DNSQR, Raw
    SCAPY_AVAILABLE = True
except ImportError:
    SCAPY_AVAILABLE = False

class NetworkMonitor:
    def __init__(self, bus):
        self.bus = bus
        self.connection_states = defaultdict(dict)
        self.dns_queries = []
        self.suspicious_ports = {445, 135, 139, 22, 3389, 5985, 5986}  # Lateral movement
        self.running = False
        self.packet_count = 0
        self.bytes_transferred = 0

    async def start(self):
        """Start real-time packet capture"""
        if not SCAPY_AVAILABLE:
            print("[NETWORK] ⚠️ Scapy not available - packet capture disabled")
            return
        
        print("[NETWORK] 🔴 Starting real-time packet capture...")
        
        # Start packet sniffer in background thread
        self.running = True
        sniffer_thread = threading.Thread(
            target=self._packet_sniffer,
            daemon=True
        )
        sniffer_thread.start()
        
        # Stats reporter thread
        stats_thread = threading.Thread(
            target=self._report_stats,
            daemon=True
        )
        stats_thread.start()
        
        # Keep task alive
        while True:
            await asyncio.sleep(1)

    def _packet_sniffer(self):
        """Real-time packet capture using Scapy"""
        try:
            # Filter for important traffic (not all traffic for performance)
            sniff(
                prn=self._process_packet,
                store=False,
                filter="tcp or udp",  # TCP/UDP only
                iface=None  # All interfaces
            )
        except PermissionError:
            print("[NETWORK] ❌ Admin privileges required for packet capture")
        except Exception as e:
            print(f"[NETWORK] Error in packet sniffer: {e}")

    def _process_packet(self, packet):
        """Process individual packet in real-time"""
        try:
            self.packet_count += 1
            self.bytes_transferred += len(packet)
            
            event_data = {
                "type": "network_packet",
                "timestamp": datetime.utcnow().isoformat(),
                "packet_number": self.packet_count,
                "size": len(packet)
            }
            
            # Layer 3: IP
            if IP in packet:
                ip_layer = packet[IP]
                event_data["src_ip"] = ip_layer.src
                event_data["dst_ip"] = ip_layer.dst
                event_data["ttl"] = ip_layer.ttl
                event_data["protocol"] = ip_layer.proto
                
                # Layer 4: TCP/UDP
                if TCP in packet:
                    tcp_layer = packet[TCP]
                    event_data["transport"] = "TCP"
                    event_data["src_port"] = tcp_layer.sport
                    event_data["dst_port"] = tcp_layer.dport
                    event_data["flags"] = str(tcp_layer.flags)
                    
                    # Track connection state
                    conn_key = f"{event_data['src_ip']}:{event_data['src_port']}->{event_data['dst_ip']}:{event_data['dst_port']}"
                    self.connection_states[conn_key] = {
                        "last_seen": time.time(),
                        "bytes": len(packet),
                        "flags": event_data["flags"]
                    }
                    
                    # Detect lateral movement
                    if tcp_layer.dport in self.suspicious_ports:
                        event_data["threat_indicator"] = "LATERAL_MOVEMENT"
                        event_data["severity"] = "HIGH"
                        print(f"[NETWORK] ⚠️ SUSPICIOUS PORT {tcp_layer.dport}: {event_data['src_ip']} -> {event_data['dst_ip']}")
                    
                elif UDP in packet:
                    udp_layer = packet[UDP]
                    event_data["transport"] = "UDP"
                    event_data["src_port"] = udp_layer.sport
                    event_data["dst_port"] = udp_layer.dport
                    
                    # DNS analysis
                    if udp_layer.dport == 53 or udp_layer.sport == 53:
                        self._analyze_dns(packet, event_data)
            
            # Publish event to bus
            asyncio.run_coroutine_threadsafe(
                self.bus.publish("network_event", event_data),
                self._get_loop()
            )
            
        except Exception as e:
            pass  # Silently skip unparseable packets

    def _analyze_dns(self, packet, event_data):
        """Analyze DNS queries for suspicious domains"""
        try:
            if DNS not in packet:
                return
            
            dns_layer = packet[DNS]
            event_data["dns_query"] = True
            
            if dns_layer.opcode == 0:  # Standard query
                if DNSQR in packet:
                    for qr in packet[DNSQR]:
                        domain = qr.qname.decode() if isinstance(qr.qname, bytes) else str(qr.qname)
                        event_data["domain"] = domain
                        
                        # Check for suspicious patterns
                        suspicious_patterns = [
                            ".ru", ".cn", "c2", "malware", "command", "control",
                            "bypass", "exploit", "payload"
                        ]
                        
                        if any(pattern in domain.lower() for pattern in suspicious_patterns):
                            event_data["threat_indicator"] = "SUSPICIOUS_DNS"
                            event_data["severity"] = "MEDIUM"
                            print(f"[NETWORK] 🔍 Suspicious DNS: {domain}")
                        
                        self.dns_queries.append({
                            "timestamp": datetime.utcnow().isoformat(),
                            "domain": domain
                        })
            
        except Exception as e:
            pass

    def _report_stats(self):
        """Periodically report network statistics"""
        while self.running:
            try:
                stats = {
                    "type": "network_stats",
                    "timestamp": datetime.utcnow().isoformat(),
                    "total_packets": self.packet_count,
                    "total_bytes_mb": self.bytes_transferred / (1024 * 1024),
                    "active_connections": len(self.connection_states),
                    "dns_queries_count": len(self.dns_queries)
                }
                
                # Calculate throughput
                if self.packet_count > 0:
                    stats["avg_packet_size"] = self.bytes_transferred / self.packet_count
                
                asyncio.run_coroutine_threadsafe(
                    self.bus.publish("network_event", stats),
                    self._get_loop()
                )
                
                time.sleep(5)  # Report every 5 seconds
            except Exception as e:
                time.sleep(5)

    def _get_loop(self):
        """Get the current event loop (thread-safe)"""
        try:
            return asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            return loop

    def stop(self):
        """Stop network monitoring"""
        self.running = False
