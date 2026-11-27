# main.py
import asyncio
import sys
import os
import platform
import threading
import json
import redis
from uvicorn import Config, Server
import server.api as api

# Core Imports
from core.event_bus import EventBus
from core.firewall import FirewallService
from core.siem import LogRepository
from core.sniffer import PacketSniffer
from core.global_risk_engine import GlobalRiskEngine
from core.incident_manager import IncidentManager
from server.websocket_manager import start_websocket_server
from server.lifecycle import verify_startup_ports
from core.seeder import seed_data
from core.redis_state import initialize_redis_state

# Collectors & Engines
from collectors.system_logs import SystemLogCollector
from collectors.network_stats import NetworkCollector
from collectors.system_info import SystemInfoCollector
from detection.rules_engine import RulesEngine
from ai.predictive_engine import PredictiveEngine
from ai.explanation import ExplainAI
from core.edr.fim import FileIntegrityMonitor
from core.edr.behavior import BehaviorEngine
from core.soar.engine import SOAREngine
from core.soar.playbooks import register_default_playbooks
from ai.traffic_model import TrafficAnalyzer


def start_redis_listener(firewall_service, loop):
    """Listen for commands from AI/SOAR via Redis."""
    redis_host = os.getenv("REDIS_HOST", "redis")
    try:
        client = redis.Redis(host=redis_host, port=6379, db=0)
        pubsub = client.pubsub()
        pubsub.subscribe("c2_commands")
        print("[C2] Listening for commands on 'c2_commands'...")
        for message in pubsub.listen():
            if message["type"] == "message":
                try:
                    data = json.loads(message["data"])
                    action = data.get("action")
                    target = data.get("target")
                    reason = data.get("reason", "Remote Command")
                    if action == "block_ip" and target:
                        print(f"[C2] RECEIVED COMMAND: Block {target}", flush=True)
                        asyncio.run_coroutine_threadsafe(
                            firewall_service.block_ip(target, reason=reason), loop
                        )
                except Exception as exc:
                    print(f"[C2] Command Error: {exc}")
    except Exception as exc:
        print(f"[C2] Redis Listener Failed: {exc}")


async def main():
    # 1. Startup Checks
    verify_startup_ports()

    # 2. Initialise Sentinel-owned Redis keys without deleting shared state.
    redis_host = os.getenv("REDIS_HOST", "redis")
    try:
        client = redis.Redis(host=redis_host, port=6379, db=0)
        client.ping()
        created = initialize_redis_state(client)
        print(f"[MAIN] Redis connected. Initialised missing Sentinel keys: {created}")
    except Exception as exc:
        print(f"[MAIN] Redis state initialisation failed: {exc}")

    # 3. Initialise Event Bus
    bus = EventBus()
    api.set_event_bus(bus)

    # 4. Initialise Firewall (WFP or fallback)
    if platform.system() == "Windows":
        try:
            from core.wfp_firewall import WFPFirewallService
            firewall = WFPFirewallService(bus)
            firewall.start()
            print("[MAIN] Windows packet interception service loaded.")
        except ImportError:
            print("[MAIN] pydivert unavailable. Using the configured fallback firewall.")
            firewall = FirewallService(bus)
        except Exception as exc:
            print(f"[MAIN] Windows firewall initialisation failed ({exc}). Using fallback.")
            firewall = FirewallService(bus)
    else:
        firewall = FirewallService(bus)

    api.set_firewall_service(firewall)

    # 5. Initialise Core Services
    siem = LogRepository(bus)
    api.set_siem_service(siem)

    predictive_engine = PredictiveEngine(bus)
    api.set_predictive_engine(predictive_engine)

    global_risk_engine = GlobalRiskEngine(bus)
    api.set_global_risk_engine(global_risk_engine)

    incident_manager = IncidentManager(bus)
    api.set_incident_manager(incident_manager)

    # 6. Initialise event consumers and endpoint engines once.
    RulesEngine(bus)
    ExplainAI(bus)

    fim = FileIntegrityMonitor(bus)
    fim.start()

    behavior_engine = BehaviorEngine(bus)
    behavior_engine.start_monitor()

    from ai.hunter import HunterAI
    hunter = HunterAI(bus, siem)
    bus.subscribe("alert", hunter.investigate)

    soar = SOAREngine(bus)
    register_default_playbooks(soar)

    from core.adaptive_response import AdaptiveResponseEngine
    adaptive_engine = AdaptiveResponseEngine(bus, firewall)

    from core.self_healing import SelfHealingEngine
    self_healing = SelfHealingEngine(bus)
    asyncio.create_task(self_healing.start())

    # Packet sniffer and collectors are each instantiated once.
    sniffer = PacketSniffer(bus, firewall)
    sys_collector = SystemLogCollector(bus)
    net_collector = NetworkCollector(bus)
    info_collector = SystemInfoCollector(bus)

    # 7. Start Servers
    config = Config(app=api.app, host="0.0.0.0", port=8000, loop="asyncio")
    api_server = Server(config)

    loop = asyncio.get_running_loop()
    threading.Thread(
        target=start_redis_listener, args=(firewall, loop), daemon=True
    ).start()

    # Seed configuration only. Synthetic SIEM events are intentionally not generated.
    await seed_data(firewall, siem)

    print("[MAIN] System Starting...")
    await asyncio.gather(
        sys_collector.start(),
        net_collector.start(),
        info_collector.start(),
        sniffer.start(),
        start_websocket_server(bus),
        api_server.serve(),
    )


if __name__ == "__main__":
    asyncio.run(main())
