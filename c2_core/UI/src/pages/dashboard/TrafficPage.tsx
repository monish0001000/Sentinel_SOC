import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Network,
  Pause,
  Play,
  Trash2,
  Filter,
  Upload,
  Download,
  AlertTriangle,
  X,
  Ban,
  CheckCircle,
  Cpu,
} from "lucide-react";
import { useWebSocket, type PacketEvent } from "@/hooks/useWebSocket";
import { cn } from "@/lib/utils";

const PROTOCOL_COLORS: Record<string, string> = {
  HTTPS: "bg-success/15 text-success border-success/30",
  HTTP: "bg-primary/15 text-primary border-primary/30",
  DNS: "bg-accent text-accent-foreground border-border",
  SSH: "bg-warning/15 text-warning border-warning/30",
  RDP: "bg-destructive/15 text-destructive border-destructive/30",
  SMB: "bg-warning/15 text-warning border-warning/30",
  FTP: "bg-primary/15 text-primary border-primary/30",
  UNKNOWN: "bg-muted text-muted-foreground border-border",
};

const getProtocolColor = (proto?: string) =>
  PROTOCOL_COLORS[proto || "UNKNOWN"] || PROTOCOL_COLORS.UNKNOWN;

const TrafficPage = () => {
  const { packetStream, connectionStatus } = useWebSocket();
  const [isPaused, setIsPaused] = useState(false);
  const [packets, setPackets] = useState<PacketEvent[]>([]);
  const [selectedPacket, setSelectedPacket] = useState<PacketEvent | null>(null);
  const [protocolFilter, setProtocolFilter] = useState<string>("ALL");
  const [textFilter, setTextFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (isPaused || !packetStream) return;
    setPackets((prev) => [packetStream, ...prev].slice(0, 500));
  }, [packetStream, isPaused]);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [packets, autoScroll]);

  const filteredPackets = useMemo(() => {
    return packets.filter((pkt) => {
      const appProto = pkt.app_protocol || pkt.protocol || "UNKNOWN";
      if (protocolFilter !== "ALL" && appProto !== protocolFilter) return false;
      if (textFilter) {
        const search = textFilter.toLowerCase();
        return (
          (pkt.src_ip || "").includes(search) ||
          (pkt.dst_ip || "").includes(search) ||
          (pkt.process || "").toLowerCase().includes(search) ||
          String(pkt.src_port || "").includes(search) ||
          String(pkt.dst_port || "").includes(search)
        );
      }
      return true;
    });
  }, [packets, protocolFilter, textFilter]);

  const stats = useMemo(() => {
    let totalBytes = 0;
    let riskyCount = 0;

    packets.forEach((p) => {
      totalBytes += (p.bytes_sent || 0) + (p.bytes_recv || 0) + (p.packet_size || 0);
      if ((p.risk_score || 0) > 30) riskyCount++;
    });

    return { totalBytes, riskyCount, total: packets.length };
  }, [packets]);

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="h-full flex flex-col text-foreground overflow-hidden gap-4">
      <div className="glass-card rounded-xl p-4 border border-border/60">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Network className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-bold">Network Traffic</h1>
            <div
              className={cn(
                "flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono border",
                connectionStatus === "connected"
                  ? "bg-success/15 text-success border-success/30"
                  : "bg-muted text-muted-foreground border-border"
              )}
            >
              <span
                className={cn(
                  "w-2 h-2 rounded-full",
                  connectionStatus === "connected" ? "bg-success animate-pulse" : "bg-muted-foreground"
                )}
              />
              {connectionStatus === "connected" ? "LIVE CAPTURE" : "STREAM OFFLINE"}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-2 mr-2">
              <div className="px-3 py-1.5 rounded-lg bg-muted/40 border border-border/60 text-xs">
                <span className="text-muted-foreground">Packets</span>
                <span className="ml-2 font-mono font-bold text-primary">{stats.total}</span>
              </div>
              <div className="px-3 py-1.5 rounded-lg bg-muted/40 border border-border/60 text-xs">
                <span className="text-muted-foreground">Data</span>
                <span className="ml-2 font-mono font-bold text-foreground">
                  {formatBytes(stats.totalBytes)}
                </span>
              </div>
              {stats.riskyCount > 0 && (
                <div className="px-3 py-1.5 rounded-lg border border-warning/30 bg-warning/10 text-xs">
                  <AlertTriangle className="w-3 h-3 inline mr-1 text-warning" />
                  <span className="font-mono font-bold text-warning">{stats.riskyCount}</span>
                </div>
              )}
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
            <button
              type="button"
              aria-label="Clear captured packets"
              onClick={() => {
                setPackets([]);
                setSelectedPacket(null);
              }}
              className="p-2 rounded-lg bg-muted/40 border border-border text-muted-foreground hover:text-foreground transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              aria-label={isPaused ? "Resume stream" : "Pause stream"}
              onClick={() => setIsPaused(!isPaused)}
              className={cn(
                "p-2 rounded-lg border transition-colors",
                isPaused
                  ? "bg-success/15 text-success border-success/30"
                  : "bg-muted/40 text-muted-foreground border-border hover:text-foreground"
              )}
            >
              {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="flex flex-wrap items-center gap-4 mt-4 pt-4 border-t border-border">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Protocol:</span>
                  <select
                    value={protocolFilter}
                    onChange={(e) => setProtocolFilter(e.target.value)}
                    className="bg-background border border-border rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-primary text-foreground"
                  >
                    <option value="ALL">All Protocols</option>
                    <option value="HTTPS">HTTPS</option>
                    <option value="HTTP">HTTP</option>
                    <option value="DNS">DNS</option>
                    <option value="SSH">SSH</option>
                    <option value="RDP">RDP</option>
                    <option value="SMB">SMB</option>
                    <option value="FTP">FTP</option>
                    <option value="UNKNOWN">UNKNOWN</option>
                  </select>
                </div>
                <div className="flex-1 min-w-[200px]">
                  <input
                    type="text"
                    placeholder="Filter by IP, port, or process..."
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
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex-1 flex gap-4 overflow-hidden min-h-[360px]">
        <div className="flex-1 flex flex-col glass-card rounded-xl border border-border/60 overflow-hidden">
          <div className="flex-shrink-0 grid grid-cols-12 gap-2 px-4 py-2.5 bg-muted/40 font-mono text-[10px] font-bold text-muted-foreground border-b border-border uppercase">
            <div className="col-span-2">Time</div>
            <div className="col-span-1">Proto</div>
            <div className="col-span-3">Source</div>
            <div className="col-span-3">Destination</div>
            <div className="col-span-2">Process</div>
            <div className="col-span-1 text-right">Info</div>
          </div>

          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto"
            onScroll={(e) => {
              setAutoScroll(e.currentTarget.scrollTop < 50);
            }}
          >
            {filteredPackets.map((pkt, index) => {
              const proto = pkt.app_protocol || pkt.protocol || "UNKNOWN";
              const key = pkt.uid || `${pkt.timestamp}-${index}`;
              return (
                <div
                  key={key}
                  onClick={() => setSelectedPacket(pkt)}
                  className={cn(
                    "grid grid-cols-12 gap-2 px-4 py-2 font-mono text-xs border-b border-border/40 cursor-pointer transition-colors",
                    selectedPacket === pkt ? "bg-primary/10" : "hover:bg-accent/40",
                    pkt.action === "DENY" && "bg-destructive/5"
                  )}
                >
                  <div className="col-span-2 text-muted-foreground truncate">{pkt.timestamp}</div>
                  <div className="col-span-1">
                    <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-bold border", getProtocolColor(proto))}>
                      {proto}
                    </span>
                  </div>
                  <div className="col-span-3 flex items-center gap-1 text-success truncate">
                    <Upload className="w-3 h-3 opacity-50 flex-shrink-0" />
                    <span className="truncate">{pkt.src_ip}:{pkt.src_port}</span>
                  </div>
                  <div className="col-span-3 flex items-center gap-1 text-primary truncate">
                    <Download className="w-3 h-3 opacity-50 flex-shrink-0" />
                    <span className="truncate">{pkt.dst_ip}:{pkt.dst_port}</span>
                  </div>
                  <div className="col-span-2 flex items-center gap-1 text-muted-foreground truncate">
                    <Cpu className="w-3 h-3 opacity-50 flex-shrink-0" />
                    <span className="truncate">{pkt.process || "—"}</span>
                  </div>
                  <div className="col-span-1 text-right text-muted-foreground truncate">
                    {pkt.info || pkt.action}
                  </div>
                </div>
              );
            })}

            {filteredPackets.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full min-h-[260px] text-muted-foreground px-4 text-center">
                <Network className="w-12 h-12 mb-3 opacity-25" />
                <p className="font-mono text-sm">
                  {packets.length === 0
                    ? connectionStatus === "connected"
                      ? "Waiting for live connection events..."
                      : "No packet capture stream connected"
                    : "No matching packets"}
                </p>
              </div>
            )}
          </div>
        </div>

        {selectedPacket && (
          <div className="w-80 flex-shrink-0 glass-card rounded-xl border border-border/60 p-4 overflow-y-auto space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm">Packet Details</h3>
              <button
                type="button"
                aria-label="Close packet details"
                onClick={() => setSelectedPacket(null)}
                className="p-1 rounded hover:bg-muted text-muted-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div
              className={cn(
                "flex items-center gap-2 p-3 rounded-lg border",
                selectedPacket.action === "ALLOW" || selectedPacket.action === "ALLOWED"
                  ? "bg-success/10 border-success/25"
                  : "bg-destructive/10 border-destructive/25"
              )}
            >
              {selectedPacket.action === "ALLOW" || selectedPacket.action === "ALLOWED" ? (
                <CheckCircle className="w-5 h-5 text-success" />
              ) : (
                <Ban className="w-5 h-5 text-destructive" />
              )}
              <div>
                <div className="font-bold text-sm">{selectedPacket.action}</div>
                <div className="text-xs text-muted-foreground">{selectedPacket.status || "Observed"}</div>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Protocol</span>
                <span className="font-mono">
                  {selectedPacket.protocol}
                  {selectedPacket.app_protocol ? ` / ${selectedPacket.app_protocol}` : ""}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Source</span>
                <span className="font-mono">{selectedPacket.src_ip}:{selectedPacket.src_port}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Destination</span>
                <span className="font-mono">{selectedPacket.dst_ip}:{selectedPacket.dst_port}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Process</span>
                <span className="font-mono">{selectedPacket.process || "—"}</span>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground pt-2 border-t border-border">
              Remote IP blocking is only available for enrolled endpoints via Endpoints (EDR).
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TrafficPage;
