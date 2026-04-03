import asyncio
import psutil
import time
from datetime import datetime
from core.event_bus import EventBus

class PacketSniffer:
    def __init__(self, bus: EventBus, firewall):
        self.bus = bus
        self.firewall = firewall
        self.known_connections = set()

    async def start(self):
        print("[SNIFFER] Starting Real-Time Traffic Monitor...")
        last_refresh_time = 0
        
        while True:
            try:
                # Get all active network connections
                connections = psutil.net_connections(kind='inet')
                current_conns = set()
                now = time.time()
                
                # Periodically re-announce active connections to simulate flow updates (Every 3s)
                force_refresh = (now - last_refresh_time) > 3.0
                if force_refresh:
                    last_refresh_time = now

                for conn in connections:
                    # Filter for ESTABLISHED or active states
                    if conn.status not in ["ESTABLISHED", "SYN_SENT", "SYN_RECV", "UDP"]:
                        continue
                        
                    if not conn.raddr:
                        continue
                        
                    conn_id = f"{conn.laddr.ip}:{conn.laddr.port}-{conn.raddr.ip}:{conn.raddr.port}"
                    current_conns.add(conn_id)
                    
                    # If new OR force refresh (to keep UI alive for long-lived connections)
                    if (conn_id not in self.known_connections) or force_refresh:
                        # Determine Protocol
                        proto = "TCP" if conn.type == 1 else "UDP"
                        remote_ip = conn.raddr.ip
                        remote_port = conn.raddr.port
                        
                        # --- ENFORCEMENT POINT ---
                        # Check against Firewall Policy
                        # Zero Trust: Pass PID to Firewall for Process Verification
                        action = self.firewall.match_traffic(remote_ip, remote_port, pid=conn.pid)
                        
                        status = conn.status
                        if action == "deny":
                            status = "BLOCKED"
                            # Emit Alert for Blocked Traffic
                            # Limit alert spam
                            if conn_id not in self.known_connections:
                                await self.bus.publish("alert", {
                                    "message": f"Firewall Rule Hit: Blocked traffic to/from {remote_ip}:{remote_port}",
                                    "level": "WARNING",
                                    "severity": "medium",
                                    "source": "Wall",
                                    "type": "Policy Violation"
                                })

                        packet_data = {
                            "id": conn_id,
                            "src_ip": conn.laddr.ip,
                            "src_port": conn.laddr.port,
                            "dst_ip": conn.raddr.ip,
                            "dst_port": conn.raddr.port,
                            "protocol": proto,
                            "status": status, # BLOCKED or ESTABLISHED
                            "pid": conn.pid,
                            "timestamp": datetime.now().strftime("%H:%M:%S")
                        }
                        
                        # Randomize slightly to prevent burst
                        await asyncio.sleep(0.01) 
                        await self.bus.publish("packet_event", packet_data)
                
                self.known_connections = current_conns
                
            except Exception as e:
                # print(f"[SNIFFER] Error: {e}") # Reduce spam
                pass
                
            await asyncio.sleep(1) # Scan interval
