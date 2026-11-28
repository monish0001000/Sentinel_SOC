import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Radio, Shield, AlertTriangle, Activity, Zap } from "lucide-react";
import { LiveLogViewer } from "@/components/dashboard/LiveLogViewer";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useAuth } from "@/context/AuthContext";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  AuditLogRecord,
  EndpointAlertRecord,
  EndpointRecord,
  subscribeEndpointAlerts,
  subscribeEndpoints,
  subscribeUserAuditLogs,
} from "@/lib/sentinelFirebaseRepo";
import { useToast } from "@/hooks/use-toast";
import { LogEntry } from "@/data/mockData";
import { AnimatedCounter } from "@/components/dashboard/AnimatedCounter";

const LogsPage = () => {
  const { logs: wsLogs, stats: wsStats, connectionStatus } = useWebSocket();
  const { user } = useAuth();
  const { toast } = useToast();

  const [endpoints, setEndpoints] = useState<EndpointRecord[]>([]);
  const [alertsByEndpoint, setAlertsByEndpoint] = useState<Record<string, EndpointAlertRecord[]>>({});
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);

  useEffect(() => {
    if (!isFirebaseConfigured || !user?.uid) {
      setEndpoints([]);
      setAuditLogs([]);
      return;
    }
    const unsubEp = subscribeEndpoints(user.uid, setEndpoints);
    const unsubAudit = subscribeUserAuditLogs(user.uid, setAuditLogs);
    return () => {
      unsubEp();
      unsubAudit();
    };
  }, [user?.uid]);

  useEffect(() => {
    if (!isFirebaseConfigured || !user?.uid || endpoints.length === 0) {
      setAlertsByEndpoint({});
      return;
    }
    const unsubs = endpoints.map((ep) =>
      subscribeEndpointAlerts(user.uid, ep.endpointId, (list) => {
        setAlertsByEndpoint((prev) => ({ ...prev, [ep.endpointId]: list }));
      })
    );
    return () => unsubs.forEach((u) => u());
  }, [user?.uid, endpoints]);

  const firestoreLogs: LogEntry[] = useMemo(() => {
    const entries: { sortMs: number; entry: LogEntry }[] = [];

    endpoints.forEach((ep) => {
      if (ep.lastSeenAt) {
        entries.push({
          sortMs: ep.lastSeenAt.getTime(),
          entry: {
            id: `hb-${ep.endpointId}-${ep.lastSeenAt.getTime()}`,
            timestamp: ep.lastSeenAt.toLocaleTimeString(),
            level: ep.computedStatus === "error" ? "error" : "info",
            source: ep.hostname,
            status: ep.computedStatus === "online" ? "observed" : "suspicious",
            message: `Heartbeat ${ep.computedStatus.toUpperCase()} — CPU ${ep.latestMetrics?.cpuPercent?.toFixed(1) ?? "—"}%, RAM ${ep.latestMetrics?.memoryPercent?.toFixed(1) ?? "—"}%, FW ${ep.firewallEnabled ? "ON" : "OFF"}, ${(ep.activeConnections || []).length} TCP sockets`,
          },
        });
      }

      (ep.activeConnections || []).slice(0, 10).forEach((conn, idx) => {
        entries.push({
          sortMs: (ep.lastSeenAt?.getTime() || Date.now()) - idx,
          entry: {
            id: `conn-${ep.endpointId}-${idx}-${conn.remoteAddress}-${conn.remotePort}`,
            timestamp: ep.lastSeenAt ? ep.lastSeenAt.toLocaleTimeString() : "Recent",
            level: "info",
            source: conn.processName || ep.hostname,
            protocol: conn.protocol,
            port: conn.remotePort,
            ip: conn.remoteAddress,
            status: "observed",
            message: `${conn.processName || "Process"} -> ${conn.remoteHost || conn.remoteAddress}:${conn.remotePort} (${conn.state})`,
          },
        });
      });
    });

    Object.values(alertsByEndpoint)
      .flat()
      .forEach((al) => {
        entries.push({
          sortMs: al.eventTime.getTime(),
          entry: {
            id: `al-${al.id}`,
            timestamp: al.eventTime.toLocaleTimeString(),
            level:
              al.severity === "critical"
                ? "critical"
                : al.severity === "high"
                  ? "error"
                  : "warning",
            source: al.ruleId,
            status: al.enforced ? "blocked" : "suspicious",
            message: `${al.reason} (Endpoint ${al.endpointId.slice(0, 10)})`,
          },
        });
      });

    auditLogs.forEach((au) => {
      entries.push({
        sortMs: au.createdAt.getTime(),
        entry: {
          id: `aud-${au.id}`,
          timestamp: au.createdAt.toLocaleTimeString(),
          level: au.action.includes("block") ? "warning" : "info",
          source: "Audit",
          ip: au.targetIp || undefined,
          status: au.action.includes("block") ? "blocked" : "observed",
          message: `${au.action}: ${au.reason}`,
        },
      });
    });

    return entries
      .sort((a, b) => b.sortMs - a.sortMs)
      .map((x) => x.entry)
      .slice(0, 100);
  }, [endpoints, alertsByEndpoint, auditLogs]);

  const logs = isFirebaseConfigured ? firestoreLogs : wsLogs;
  const anyOnline = endpoints.some((e) => e.computedStatus === "online");
  const isLive = isFirebaseConfigured ? anyOnline : connectionStatus === "connected";

  const alertCount = Object.values(alertsByEndpoint).flat().length;
  const tcpCount = endpoints.reduce((sum, ep) => sum + (ep.activeConnections?.length || 0), 0);

  const handleLogClick = (log: LogEntry) => {
    toast({
      title: `${log.level.toUpperCase()}: ${log.source}`,
      description: log.message,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-foreground">Endpoint Event &amp; Telemetry Stream</h1>
            <div
              className={`flex items-center gap-2 px-2.5 py-1 rounded-full border ${
                isLive ? "bg-success/10 border-success/20" : "bg-muted/30 border-border"
              }`}
            >
              <Radio
                className={`w-3 h-3 ${isLive ? "text-success live-pulse" : "text-muted-foreground"}`}
              />
              <span
                className={`text-[10px] font-mono font-medium ${
                  isLive ? "text-success" : "text-muted-foreground"
                }`}
              >
                {isLive ? "FIRESTORE LIVE" : endpoints.length > 0 ? "AWAITING HEARTBEAT" : "NO ENDPOINTS"}
              </span>
            </div>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            Real endpoint heartbeats, TCP connection metadata, Windows security alerts, and audit events
          </p>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/40 border border-border/60 self-start">
          <Zap className={isLive ? "w-4 h-4 text-success live-pulse" : "w-4 h-4 text-muted-foreground"} />
          <span className="text-xs font-mono text-muted-foreground">
            {isFirebaseConfigured ? `${endpoints.length} ENDPOINT(S)` : "OFFLINE"}
          </span>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-3"
      >
        <div className="glass-card rounded-lg p-3 border border-border/50">
          <div className="flex items-center gap-2 mb-1">
            <Activity className="w-3.5 h-3.5 text-primary" />
            <span className="text-[10px] text-muted-foreground font-medium uppercase">Stream Entries</span>
          </div>
          <AnimatedCounter
            value={isFirebaseConfigured ? logs.length : wsStats.totalPackets}
            className="text-lg font-bold font-mono text-foreground"
          />
        </div>

        <div className="glass-card rounded-lg p-3 border border-destructive/20">
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-3.5 h-3.5 text-destructive" />
            <span className="text-[10px] text-muted-foreground font-medium uppercase">Audit Actions</span>
          </div>
          <AnimatedCounter
            value={isFirebaseConfigured ? auditLogs.length : wsStats.threatsBlocked}
            className="text-lg font-bold font-mono text-destructive"
          />
        </div>

        <div className="glass-card rounded-lg p-3 border border-warning/20">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-3.5 h-3.5 text-warning" />
            <span className="text-[10px] text-muted-foreground font-medium uppercase">Security Alerts</span>
          </div>
          <AnimatedCounter
            value={isFirebaseConfigured ? alertCount : wsStats.suspicious}
            className="text-lg font-bold font-mono text-warning"
          />
        </div>

        <div className="glass-card rounded-lg p-3 border border-success/20">
          <div className="flex items-center gap-2 mb-1">
            <Activity className="w-3.5 h-3.5 text-success" />
            <span className="text-[10px] text-muted-foreground font-medium uppercase">Observed Sockets</span>
          </div>
          <AnimatedCounter
            value={isFirebaseConfigured ? tcpCount : wsStats.allowed}
            className="text-lg font-bold font-mono text-success"
          />
        </div>
      </motion.div>

      <LiveLogViewer logs={logs} onLogClick={handleLogClick} />
    </div>
  );
};

export default LogsPage;
