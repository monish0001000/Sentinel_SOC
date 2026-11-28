import { useEffect, useMemo, useState } from "react";
import {
  Network,
  Filter,
  Upload,
  Download,
  X,
  Ban,
  Cpu,
  Globe,
  Info,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  createSafeFirewallPolicy,
  EndpointConnectionRecord,
  EndpointRecord,
  subscribeEndpoints,
} from "@/lib/sentinelFirebaseRepo";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface ConnectionRow extends EndpointConnectionRecord {
  uid: string;
  endpointId: string;
  endpointHostname: string;
  appProtocol: string;
}

const inferAppProtocol = (port: number, fallback: string): string => {
  switch (port) {
    case 443:
      return "HTTPS";
    case 80:
      return "HTTP";
    case 53:
      return "DNS";
    case 22:
      return "SSH";
    case 3389:
      return "RDP";
    case 445:
      return "SMB";
    case 21:
      return "FTP";
    default:
      return fallback || "TCP";
  }
};

const PROTOCOL_COLORS: Record<string, string> = {
  HTTPS: "bg-success/15 text-success border-success/30",
  HTTP: "bg-primary/15 text-primary border-primary/30",
  DNS: "bg-accent text-accent-foreground border-border",
  SSH: "bg-warning/15 text-warning border-warning/30",
  RDP: "bg-destructive/15 text-destructive border-destructive/30",
  SMB: "bg-warning/15 text-warning border-warning/30",
  FTP: "bg-primary/15 text-primary border-primary/30",
  TCP: "bg-muted text-muted-foreground border-border",
};

const TrafficPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { packets: wsPackets, connectionStatus } = useWebSocket();

  const [endpoints, setEndpoints] = useState<EndpointRecord[]>([]);
  const [selectedConn, setSelectedConn] = useState<ConnectionRow | null>(null);
  const [protocolFilter, setProtocolFilter] = useState<string>("ALL");
  const [textFilter, setTextFilter] = useState("");
  const [showFilters, setShowFilters] = useState(true);
  const [blockingIp, setBlockingIp] = useState(false);

  useEffect(() => {
    if (!isFirebaseConfigured || !user?.uid) {
      setEndpoints([]);
      return;
    }
    return subscribeEndpoints(user.uid, setEndpoints);
  }, [user?.uid]);

  const rows: ConnectionRow[] = useMemo(() => {
    if (isFirebaseConfigured) {
      const list: ConnectionRow[] = [];
      endpoints.forEach((ep) => {
        (ep.activeConnections || []).forEach((conn, idx) => {
          list.push({
            ...conn,
            uid: `${ep.endpointId}-${conn.localAddress}-${conn.localPort}-${conn.remoteAddress}-${conn.remotePort}-${idx}`,
            endpointId: ep.endpointId,
            endpointHostname: ep.hostname,
            appProtocol: inferAppProtocol(conn.remotePort, conn.protocol),
          });
        });
      });
      return list;
    }

    return wsPackets.map((pkt, idx) => ({
      uid: pkt.uid || `ws-${idx}`,
      endpointId: "local-ws",
      endpointHostname: "Local Stream",
      protocol: pkt.protocol,
      localAddress: pkt.src_ip,
      localPort: pkt.src_port,
      remoteAddress: pkt.dst_ip,
      remotePort: pkt.dst_port,
      state: pkt.action,
      processName: pkt.process,
      appProtocol: pkt.app_protocol || inferAppProtocol(pkt.dst_port, pkt.protocol),
    }));
  }, [endpoints, wsPackets]);

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (protocolFilter !== "ALL" && r.appProtocol !== protocolFilter) return false;
      if (textFilter) {
        const q = textFilter.toLowerCase();
        return (
          (r.processName || "").toLowerCase().includes(q) ||
          (r.remoteHost || "").toLowerCase().includes(q) ||
          r.remoteAddress.toLowerCase().includes(q) ||
          r.localAddress.toLowerCase().includes(q) ||
          String(r.remotePort).includes(q) ||
          String(r.processId || "").includes(q)
        );
      }
      return true;
    });
  }, [rows, protocolFilter, textFilter]);

  const anyOnlineEndpoint = endpoints.some((e) => e.computedStatus === "online");
  const isLive = isFirebaseConfigured ? anyOnlineEndpoint : connectionStatus === "connected";

  const handleBlockDestination = async (conn: ConnectionRow) => {
    if (!user?.uid || !isFirebaseConfigured || conn.endpointId === "local-ws") return;
    setBlockingIp(true);
    try {
      const policyId = await createSafeFirewallPolicy({
        ownerUid: user.uid,
        endpointId: conn.endpointId,
        action: "block_ip",
        targetIp: conn.remoteAddress,
        reason: `Blocked from Live Traffic (${conn.processName || "process"} -> ${conn.remoteHost || conn.remoteAddress})`,
        ttlMinutes: 60,
      });
      toast({
        title: "Outbound Block Policy Queued",
        description: `Policy ${policyId} queued for ${conn.endpointHostname} (${conn.remoteAddress}).`,
      });
    } catch (err: unknown) {
      toast({
        title: "Failed to queue policy",
        description: err instanceof Error ? err.message : "Check permissions",
        variant: "destructive",
      });
    } finally {
      setBlockingIp(false);
    }
  };

  return (
    <div className="h-full flex flex-col text-foreground overflow-hidden gap-4">
      <div className="glass-card rounded-xl p-4 border border-border/60 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Network className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-xl font-bold">Live Endpoint Network Connections</h1>
              <p className="text-xs text-muted-foreground">
                Real TCP sockets, owning Windows applications (PID), and resolved destination domains
              </p>
            </div>
            <div
              className={cn(
                "flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono border",
                isLive
                  ? "bg-success/15 text-success border-success/30"
                  : "bg-muted text-muted-foreground border-border"
              )}
            >
              <span
                className={cn(
                  "w-2 h-2 rounded-full",
                  isLive ? "bg-success animate-pulse" : "bg-muted-foreground"
                )}
              />
              {isLive ? "FIRESTORE LIVE" : endpoints.length > 0 ? "AWAITING HEARTBEAT" : "NO ENDPOINTS"}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="px-3 py-1.5 rounded-lg bg-muted/40 border border-border/60 text-xs">
              <span className="text-muted-foreground">Connections</span>
              <span className="ml-2 font-mono font-bold text-primary">{filteredRows.length}</span>
            </div>
            <button
              type="button"
              aria-label="Toggle traffic filters"
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                "p-2 rounded-lg border transition-colors",
                showFilters
                  ? "bg-primary/15 text-primary border-primary/30"
                  : "bg-muted/40 text-muted-foreground border-border hover:text-foreground"
              )}
            >
              <Filter className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex items-start gap-2 text-[11px] text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 border border-border/50">
          <Info className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
          <span>
            Captured via Windows <code className="font-mono">GetExtendedTcpTable</code> + reverse DNS
            (updated each agent heartbeat). Encrypted HTTPS URL paths inside TLS payloads are never
            intercepted or decrypted.
          </span>
        </div>

        {showFilters && (
          <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-border/60">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Protocol:</span>
              <select
                value={protocolFilter}
                onChange={(e) => setProtocolFilter(e.target.value)}
                className="bg-background border border-border rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-primary text-foreground"
              >
                <option value="ALL">All</option>
                <option value="HTTPS">HTTPS (443)</option>
                <option value="HTTP">HTTP (80)</option>
                <option value="DNS">DNS (53)</option>
                <option value="SSH">SSH (22)</option>
                <option value="RDP">RDP (3389)</option>
                <option value="SMB">SMB (445)</option>
                <option value="TCP">Other TCP</option>
              </select>
            </div>
            <div className="flex-1 min-w-[220px]">
              <input
                type="text"
                placeholder="Filter by app (chrome, msedge), domain, IP, or port..."
                value={textFilter}
                onChange={(e) => setTextFilter(e.target.value)}
                className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-primary"
              />
            </div>
            {(protocolFilter !== "ALL" || textFilter) && (
              <button
                type="button"
                onClick={() => {
                  setProtocolFilter("ALL");
                  setTextFilter("");
                }}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <X className="w-3 h-3" /> Clear
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 flex gap-4 overflow-hidden min-h-[380px]">
        <div className="flex-1 flex flex-col glass-card rounded-xl border border-border/60 overflow-hidden">
          <div className="flex-shrink-0 grid grid-cols-12 gap-2 px-4 py-2.5 bg-muted/40 font-mono text-[10px] font-bold text-muted-foreground border-b border-border uppercase">
            <div className="col-span-2">Application</div>
            <div className="col-span-1">Proto</div>
            <div className="col-span-2">Local Socket</div>
            <div className="col-span-3">Destination IP:Port</div>
            <div className="col-span-3">Resolved Domain / Host</div>
            <div className="col-span-1 text-right">State</div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {filteredRows.map((conn) => (
              <div
                key={conn.uid}
                onClick={() => setSelectedConn(conn)}
                className={cn(
                  "grid grid-cols-12 gap-2 px-4 py-2 font-mono text-xs border-b border-border/40 cursor-pointer transition-colors items-center",
                  selectedConn?.uid === conn.uid ? "bg-primary/10" : "hover:bg-accent/40"
                )}
              >
                <div className="col-span-2 flex items-center gap-1.5 font-semibold text-foreground truncate">
                  <Cpu className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                  <span className="truncate">
                    {conn.processName || "unknown"}
                    {conn.processId ? ` (${conn.processId})` : ""}
                  </span>
                </div>
                <div className="col-span-1">
                  <span
                    className={cn(
                      "px-1.5 py-0.5 rounded text-[9px] font-bold border",
                      PROTOCOL_COLORS[conn.appProtocol] || PROTOCOL_COLORS.TCP
                    )}
                  >
                    {conn.appProtocol}
                  </span>
                </div>
                <div className="col-span-2 flex items-center gap-1 text-muted-foreground truncate">
                  <Upload className="w-3 h-3 opacity-50 flex-shrink-0" />
                  <span className="truncate">
                    {conn.localAddress}:{conn.localPort}
                  </span>
                </div>
                <div className="col-span-3 flex items-center gap-1 text-primary truncate">
                  <Download className="w-3 h-3 opacity-50 flex-shrink-0" />
                  <span className="truncate">
                    {conn.remoteAddress}:{conn.remotePort}
                  </span>
                </div>
                <div className="col-span-3 flex items-center gap-1 text-foreground truncate">
                  <Globe className="w-3 h-3 text-success opacity-70 flex-shrink-0" />
                  <span className="truncate">{conn.remoteHost || "—"}</span>
                </div>
                <div className="col-span-1 text-right text-[10px] text-muted-foreground truncate">
                  {conn.state}
                </div>
              </div>
            ))}

            {filteredRows.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full min-h-[260px] text-muted-foreground px-4 text-center">
                <Network className="w-12 h-12 mb-3 opacity-25" />
                <p className="font-mono text-sm">
                  {endpoints.length === 0
                    ? "No Windows endpoints enrolled yet"
                    : "Waiting for endpoint heartbeat with TCP connection metadata (agent v1.0.2+)"}
                </p>
              </div>
            )}
          </div>
        </div>

        {selectedConn && (
          <div className="w-80 flex-shrink-0 glass-card rounded-xl border border-border/60 p-4 overflow-y-auto space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm">Connection Details</h3>
              <button
                type="button"
                aria-label="Close connection details"
                onClick={() => setSelectedConn(null)}
                className="p-1 rounded hover:bg-muted text-muted-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Endpoint</span>
                <span className="font-mono font-semibold">{selectedConn.endpointHostname}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Application</span>
                <span className="font-mono">
                  {selectedConn.processName || "unknown"} (PID {selectedConn.processId ?? "?"})
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Protocol</span>
                <span className="font-mono">
                  {selectedConn.protocol} / {selectedConn.appProtocol}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Local Socket</span>
                <span className="font-mono">
                  {selectedConn.localAddress}:{selectedConn.localPort}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Destination</span>
                <span className="font-mono text-primary">
                  {selectedConn.remoteAddress}:{selectedConn.remotePort}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Resolved Host</span>
                <span className="font-mono break-all text-right">
                  {selectedConn.remoteHost || "Unresolved"}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">TCP State</span>
                <span className="font-mono">{selectedConn.state}</span>
              </div>
            </div>

            {isFirebaseConfigured && selectedConn.endpointId !== "local-ws" && (
              <div className="pt-3 border-t border-border space-y-2">
                <Button
                  variant="destructive"
                  size="sm"
                  className="w-full gap-2"
                  disabled={blockingIp}
                  onClick={() => handleBlockDestination(selectedConn)}
                >
                  <Ban className="w-3.5 h-3.5" />
                  {blockingIp ? "Queuing Block Policy..." : `Block ${selectedConn.remoteAddress}`}
                </Button>
                <p className="text-[10px] text-muted-foreground">
                  Queues a 60-minute allowlisted outbound block policy (requires remote firewall opt-in on the agent).
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default TrafficPage;
