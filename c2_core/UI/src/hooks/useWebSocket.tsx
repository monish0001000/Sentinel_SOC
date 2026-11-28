import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { LogEntry, Threat } from "@/data/mockData";

export type ConnectionStatus = "connected" | "disconnected" | "connecting" | "error";

export interface PacketEvent {
  uid?: string;
  id?: string;
  timestamp: string;
  protocol: string;
  app_protocol?: string;
  src_ip: string;
  src_port: number;
  dst_ip: string;
  dst_port: number;
  status?: string;
  action: string;
  pid?: number;
  process?: string;
  bytes_sent?: number;
  bytes_recv?: number;
  packet_size?: number;
  duration?: number;
  risk_score?: number;
  info?: string;
}

export interface AgentInfo {
  id: string;
  hostname: string;
  os: string;
  ip: string;
  status: string;
  last_seen: number | string;
  stats?: {
    cpu: number;
    memory: number;
    disk: number;
    processes: number;
  };
}

export interface FirewallState {
  active: boolean;
  autoBlock: boolean;
  panicMode: boolean;
  blockedIPs: string[];
  blockedPorts: number[];
  blockedCountries: string[];
  rules: unknown[];
}

export interface TelemetryMetrics {
  cpu_usage?: number;
  memory_usage?: number;
  packet_rate?: number;
  connections?: number;
}

export interface TelemetryStats {
  totalPackets: number;
  threatsBlocked: number;
  suspicious: number;
  allowed: number;
}

export interface ChartPoint {
  time: string;
  packets: number;
  threats: number;
}

export interface TopIpPoint {
  ip: string;
  attacks: number;
}

export interface ThreatTypePoint {
  name: string;
  value: number;
  color: string;
}

export interface TargetedPortPoint {
  port: string | number;
  attacks: number;
  service: number;
}

export interface SystemInfo {
  hostname?: string;
  os?: string;
}

export interface SystemAlert {
  id?: string;
  type?: string;
  source?: string;
  message: string;
  level: string;
  severity?: Threat["severity"];
  timestamp: string;
}

interface RawWsMessage {
  type?: string;
  data?: AgentInfo[];
  payload?: Record<string, unknown>;
  metrics?: TelemetryMetrics;
  alerts?: Threat[];
  stats?: Partial<TelemetryStats>;
  analytics?: {
    chartData?: ChartPoint[];
    topIPs?: TopIpPoint[];
    threatTypes?: ThreatTypePoint[];
    targetedPorts?: TargetedPortPoint[];
  };
}

interface WebSocketContextValue {
  connectionStatus: ConnectionStatus;
  isConfigured: boolean;
  connected: boolean;
  agents: AgentInfo[];
  logs: LogEntry[];
  packets: PacketEvent[];
  packetStream: PacketEvent | null;
  metrics: TelemetryMetrics | null;
  packetRate: number;
  alerts: Threat[];
  threats: Threat[];
  stats: TelemetryStats;
  chartData: ChartPoint[];
  topIPs: TopIpPoint[];
  threatTypes: ThreatTypePoint[];
  targetedPorts: TargetedPortPoint[];
  systemInfo: SystemInfo | null;
  firewall: FirewallState;
  riskScore: number | null;
  hostRiskScores: Record<string, number>;
  reconnect: () => void;
  sendMessage: (msg: Record<string, unknown>) => void;
}

const initialStats: TelemetryStats = {
  totalPackets: 0,
  threatsBlocked: 0,
  suspicious: 0,
  allowed: 0,
};

const initialFirewall: FirewallState = {
  active: false,
  autoBlock: false,
  panicMode: false,
  blockedIPs: [],
  blockedPorts: [],
  blockedCountries: [],
  rules: [],
};

const WebSocketContext = createContext<WebSocketContextValue>({
  connectionStatus: "disconnected",
  isConfigured: false,
  connected: false,
  agents: [],
  logs: [],
  packets: [],
  packetStream: null,
  metrics: null,
  packetRate: 0,
  alerts: [],
  threats: [],
  stats: initialStats,
  chartData: [],
  topIPs: [],
  threatTypes: [],
  targetedPorts: [],
  systemInfo: null,
  firewall: initialFirewall,
  riskScore: null,
  hostRiskScores: {},
  reconnect: () => {},
  sendMessage: () => {},
});

function resolveWsUrl(): string | null {
  const configured = (import.meta.env.VITE_WS_URL || "").trim();
  if (!configured) return null;

  if (import.meta.env.PROD) {
    try {
      const parsed = new URL(configured);
      if (
        parsed.hostname === "localhost" ||
        parsed.hostname === "127.0.0.1" ||
        parsed.hostname === "::1"
      ) {
        return null;
      }
      if (window.location.protocol === "https:" && parsed.protocol === "ws:") {
        return null;
      }
    } catch {
      return null;
    }
  }

  return configured;
}

export const WebSocketProvider = ({ children }: { children: ReactNode }) => {
  const wsUrl = resolveWsUrl();
  const isConfigured = Boolean(wsUrl);

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [packets, setPackets] = useState<PacketEvent[]>([]);
  const [packetStream, setPacketStream] = useState<PacketEvent | null>(null);
  const [metrics, setMetrics] = useState<TelemetryMetrics | null>(null);
  const [alerts, setAlerts] = useState<Threat[]>([]);
  const [stats, setStats] = useState<TelemetryStats>(initialStats);
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [topIPs, setTopIPs] = useState<TopIpPoint[]>([]);
  const [threatTypes, setThreatTypes] = useState<ThreatTypePoint[]>([]);
  const [targetedPorts, setTargetedPorts] = useState<TargetedPortPoint[]>([]);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [firewall, setFirewall] = useState<FirewallState>(initialFirewall);
  const [riskScore, setRiskScore] = useState<number | null>(null);
  const [hostRiskScores, setHostRiskScores] = useState<Record<string, number>>({});

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (!wsUrl) {
      setConnectionStatus("disconnected");
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setConnectionStatus("connecting");

    try {
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        setConnectionStatus("connected");
        socket.send(JSON.stringify({ type: "ui_client" }));
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as RawWsMessage;

          if (data.type === "agent_update" && Array.isArray(data.data)) {
            setAgents(data.data);
          }

          if (data.type === "update") {
            if (data.metrics) setMetrics(data.metrics);
            if (Array.isArray(data.alerts)) setAlerts(data.alerts);
            if (data.stats) setStats((prev) => ({ ...prev, ...data.stats }));
            if (data.analytics?.chartData) setChartData(data.analytics.chartData);
            if (data.analytics?.topIPs) setTopIPs(data.analytics.topIPs);
            if (data.analytics?.threatTypes) setThreatTypes(data.analytics.threatTypes);
            if (data.analytics?.targetedPorts) setTargetedPorts(data.analytics.targetedPorts);
          }

          if (data.type === "system_info" && data.payload) {
            setSystemInfo(data.payload as SystemInfo);
          }

          if ((data.type === "firewall_event" || data.type === "firewall_update") && data.payload) {
            const payload = data.payload;
            setFirewall((prev) => {
              const next = { ...prev };
              if (payload.type === "status_change") {
                next.active = Boolean(payload.active);
                next.panicMode = Boolean(payload.panic_mode);
              } else if (payload.type === "rule_added" && payload.rule) {
                next.rules = [...next.rules, payload.rule];
              }
              return next;
            });
          }

          if (data.type === "packet_event" && data.payload) {
            const pkt = data.payload as unknown as PacketEvent;
            setPacketStream(pkt);
            setPackets((prev) => [pkt, ...prev].slice(0, 200));

            const eventStatus: LogEntry["status"] =
              pkt.status === "BLOCKED"
                ? "blocked"
                : pkt.status === "POLICY_MATCH"
                  ? "suspicious"
                  : "observed";

            const logEntry: LogEntry = {
              id: pkt.uid || `${pkt.id || "conn"}-${pkt.timestamp || Date.now()}`,
              timestamp: pkt.timestamp || new Date().toISOString(),
              level: pkt.status === "BLOCKED" || pkt.status === "POLICY_MATCH" ? "warning" : "info",
              source: pkt.process || "Connection Monitor",
              message: `${pkt.status || "OBSERVED"} ${pkt.src_ip || "?"}:${pkt.src_port || "?"} -> ${pkt.dst_ip || "?"}:${pkt.dst_port || "?"} (${pkt.protocol || "unknown"})`,
              ip: pkt.src_ip,
              status: eventStatus,
              protocol: pkt.protocol,
              port: pkt.dst_port,
            };
            setLogs((prev) => [logEntry, ...prev].slice(0, 200));
          }

          if ((data.type === "risk" || data.type === "global_risk") && data.payload) {
            if (typeof data.payload.score === "number") {
              setRiskScore(data.payload.score);
            }
            if (data.payload.host_scores && typeof data.payload.host_scores === "object") {
              setHostRiskScores(data.payload.host_scores as Record<string, number>);
            }
          }
        } catch {
          // Ignore malformed telemetry frames
        }
      };

      socket.onerror = () => {
        setConnectionStatus("error");
      };

      socket.onclose = () => {
        setConnectionStatus("disconnected");
        wsRef.current = null;
        if (wsUrl) {
          reconnectTimeoutRef.current = setTimeout(connect, 5000);
        }
      };
    } catch {
      setConnectionStatus("error");
    }
  }, [wsUrl]);

  useEffect(() => {
    if (!wsUrl) return;
    connect();
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, [connect, wsUrl]);

  const sendMessage = useCallback((msg: Record<string, unknown>) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  return (
    <WebSocketContext.Provider
      value={{
        connectionStatus,
        isConfigured,
        connected: connectionStatus === "connected",
        agents,
        logs,
        packets,
        packetStream,
        metrics,
        packetRate: metrics?.packet_rate ?? 0,
        alerts,
        threats: alerts,
        stats,
        chartData,
        topIPs,
        threatTypes,
        targetedPorts,
        systemInfo,
        firewall,
        riskScore,
        hostRiskScores,
        reconnect: connect,
        sendMessage,
      }}
    >
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocket = () => useContext(WebSocketContext);
