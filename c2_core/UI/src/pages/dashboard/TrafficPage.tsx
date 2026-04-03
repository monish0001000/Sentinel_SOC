import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Network, Activity, Pause, Play, Trash2, Filter,
    Upload, Download, Shield, AlertTriangle, ChevronDown,
    X, ExternalLink, Ban, CheckCircle, Clock, Cpu
} from 'lucide-react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { cn } from '@/lib/utils';

interface PacketEvent {
    uid: string;
    id: string;
    timestamp: string;
    protocol: string;
    app_protocol: string;
    src_ip: string;
    src_port: number;
    dst_ip: string;
    dst_port: number;
    status: string;
    action: string;
    pid: number;
    process: string;
    bytes_sent: number;
    bytes_recv: number;
    duration: number;
    risk_score: number;
    info: string;
}

// Protocol color mapping
const PROTOCOL_COLORS: Record<string, string> = {
    "HTTPS": "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    "HTTP": "bg-blue-500/20 text-blue-400 border-blue-500/30",
    "DNS": "bg-purple-500/20 text-purple-400 border-purple-500/30",
    "SSH": "bg-orange-500/20 text-orange-400 border-orange-500/30",
    "RDP": "bg-red-500/20 text-red-400 border-red-500/30",
    "SMB": "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    "FTP": "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
    "MYSQL": "bg-sky-500/20 text-sky-400 border-sky-500/30",
    "REDIS": "bg-rose-500/20 text-rose-400 border-rose-500/30",
    "UNKNOWN": "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

const getProtocolColor = (proto: string) => PROTOCOL_COLORS[proto] || PROTOCOL_COLORS["UNKNOWN"];

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

    // Process incoming packets
    useEffect(() => {
        if (isPaused || !packetStream) return;

        setPackets(prev => {
            const newPackets = [packetStream as PacketEvent, ...prev].slice(0, 500);
            return newPackets;
        });
    }, [packetStream, isPaused]);

    // Auto-scroll
    useEffect(() => {
        if (autoScroll && scrollRef.current) {
            scrollRef.current.scrollTop = 0;
        }
    }, [packets, autoScroll]);

    // Filter packets
    const filteredPackets = useMemo(() => {
        return packets.filter(pkt => {
            if (protocolFilter !== "ALL" && pkt.app_protocol !== protocolFilter) return false;
            if (textFilter) {
                const search = textFilter.toLowerCase();
                return (
                    pkt.src_ip.includes(search) ||
                    pkt.dst_ip.includes(search) ||
                    pkt.process.toLowerCase().includes(search) ||
                    String(pkt.src_port).includes(search) ||
                    String(pkt.dst_port).includes(search)
                );
            }
            return true;
        });
    }, [packets, protocolFilter, textFilter]);

    // Stats
    const stats = useMemo(() => {
        const protoCount: Record<string, number> = {};
        let totalBytes = 0;
        let riskyCount = 0;

        packets.forEach(p => {
            protoCount[p.app_protocol] = (protoCount[p.app_protocol] || 0) + 1;
            totalBytes += p.bytes_sent + p.bytes_recv;
            if (p.risk_score > 30) riskyCount++;
        });

        return { protoCount, totalBytes, riskyCount, total: packets.length };
    }, [packets]);

    const clearPackets = () => {
        setPackets([]);
        setSelectedPacket(null);
    };

    const formatBytes = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    return (
        <div className="h-full flex flex-col text-foreground overflow-hidden">
            {/* Header */}
            <div className="flex-shrink-0 p-4 border-b border-white/10 bg-background/50 backdrop-blur-sm">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <Network className="w-6 h-6 text-cyan-400" />
                            <h1 className="text-xl font-bold">Network Traffic</h1>
                        </div>
                        <div className={cn(
                            "flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono",
                            connectionStatus === "connected"
                                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                : "bg-red-500/20 text-red-400 border border-red-500/30"
                        )}>
                            <span className={cn(
                                "w-2 h-2 rounded-full",
                                connectionStatus === "connected" ? "bg-emerald-400 animate-pulse" : "bg-red-400"
                            )} />
                            {connectionStatus === "connected" ? "LIVE CAPTURE" : "OFFLINE"}
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Stats Pills */}
                        <div className="hidden md:flex items-center gap-2">
                            <div className="glass-card px-3 py-1.5 rounded-lg border border-white/10">
                                <span className="text-xs text-muted-foreground">Packets</span>
                                <span className="ml-2 font-mono font-bold text-cyan-400">{stats.total}</span>
                            </div>
                            <div className="glass-card px-3 py-1.5 rounded-lg border border-white/10">
                                <span className="text-xs text-muted-foreground">Data</span>
                                <span className="ml-2 font-mono font-bold text-purple-400">{formatBytes(stats.totalBytes)}</span>
                            </div>
                            {stats.riskyCount > 0 && (
                                <div className="glass-card px-3 py-1.5 rounded-lg border border-orange-500/30 bg-orange-500/10">
                                    <AlertTriangle className="w-3 h-3 inline mr-1 text-orange-400" />
                                    <span className="font-mono font-bold text-orange-400">{stats.riskyCount}</span>
                                </div>
                            )}
                        </div>

                        {/* Controls */}
                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            className={cn(
                                "p-2 rounded-lg transition-colors",
                                showFilters ? "bg-cyan-500/20 text-cyan-400" : "bg-white/5 text-muted-foreground hover:bg-white/10"
                            )}
                        >
                            <Filter className="w-4 h-4" />
                        </button>
                        <button
                            onClick={clearPackets}
                            className="p-2 rounded-lg bg-white/5 text-muted-foreground hover:bg-white/10 transition-colors"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setIsPaused(!isPaused)}
                            className={cn(
                                "p-2 rounded-lg transition-colors",
                                isPaused ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
                            )}
                        >
                            {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                        </button>
                    </div>
                </div>

                {/* Filter Bar */}
                <AnimatePresence>
                    {showFilters && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                        >
                            <div className="flex items-center gap-4 mt-4 pt-4 border-t border-white/10">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground">Protocol:</span>
                                    <select
                                        value={protocolFilter}
                                        onChange={(e) => setProtocolFilter(e.target.value)}
                                        className="bg-zinc-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-cyan-500/50 text-white cursor-pointer"
                                        style={{ colorScheme: 'dark' }}
                                    >
                                        <option value="ALL" className="bg-zinc-900 text-white">All Protocols</option>
                                        <option value="HTTPS" className="bg-zinc-900 text-white">HTTPS</option>
                                        <option value="HTTP" className="bg-zinc-900 text-white">HTTP</option>
                                        <option value="DNS" className="bg-zinc-900 text-white">DNS</option>
                                        <option value="SSH" className="bg-zinc-900 text-white">SSH</option>
                                        <option value="RDP" className="bg-zinc-900 text-white">RDP</option>
                                        <option value="SMB" className="bg-zinc-900 text-white">SMB</option>
                                        <option value="FTP" className="bg-zinc-900 text-white">FTP</option>
                                        <option value="UNKNOWN" className="bg-zinc-900 text-white">UNKNOWN</option>
                                    </select>
                                </div>
                                <div className="flex-1">
                                    <input
                                        type="text"
                                        placeholder="Filter by IP, port, or process..."
                                        value={textFilter}
                                        onChange={(e) => setTextFilter(e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-cyan-500/50 placeholder:text-muted-foreground/50"
                                    />
                                </div>
                                {(protocolFilter !== "ALL" || textFilter) && (
                                    <button
                                        onClick={() => { setProtocolFilter("ALL"); setTextFilter(""); }}
                                        className="text-xs text-muted-foreground hover:text-white flex items-center gap-1"
                                    >
                                        <X className="w-3 h-3" /> Clear
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex overflow-hidden">
                {/* Packet List */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Column Headers */}
                    <div className="flex-shrink-0 grid grid-cols-12 gap-2 px-4 py-2 bg-white/5 font-mono text-[10px] font-bold text-cyan-400/70 border-b border-white/10 uppercase">
                        <div className="col-span-1">Time</div>
                        <div className="col-span-1">Proto</div>
                        <div className="col-span-3">Source</div>
                        <div className="col-span-3">Destination</div>
                        <div className="col-span-2">Process</div>
                        <div className="col-span-2 text-right">Info</div>
                    </div>

                    {/* Packet Rows */}
                    <div
                        ref={scrollRef}
                        className="flex-1 overflow-y-auto custom-scrollbar"
                        onScroll={(e) => {
                            const el = e.currentTarget;
                            setAutoScroll(el.scrollTop < 50);
                        }}
                    >
                        <AnimatePresence initial={false}>
                            {filteredPackets.map((pkt) => (
                                <motion.div
                                    key={pkt.uid}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0 }}
                                    onClick={() => setSelectedPacket(pkt)}
                                    className={cn(
                                        "grid grid-cols-12 gap-2 px-4 py-1.5 font-mono text-xs border-b border-white/5 cursor-pointer transition-colors",
                                        selectedPacket?.uid === pkt.uid
                                            ? "bg-cyan-500/20 border-cyan-500/30"
                                            : "hover:bg-white/5",
                                        pkt.action === "DENY" && "bg-red-500/10",
                                        pkt.risk_score > 50 && "bg-orange-500/10"
                                    )}
                                >
                                    <div className="col-span-1 text-muted-foreground">{pkt.timestamp}</div>
                                    <div className="col-span-1">
                                        <span className={cn(
                                            "px-1.5 py-0.5 rounded text-[9px] font-bold border",
                                            getProtocolColor(pkt.app_protocol)
                                        )}>
                                            {pkt.app_protocol}
                                        </span>
                                    </div>
                                    <div className="col-span-3 flex items-center gap-1 text-emerald-400/80 truncate">
                                        <Upload className="w-3 h-3 opacity-40 flex-shrink-0" />
                                        <span className="truncate">{pkt.src_ip}:{pkt.src_port}</span>
                                    </div>
                                    <div className="col-span-3 flex items-center gap-1 text-purple-400/80 truncate">
                                        <Download className="w-3 h-3 opacity-40 flex-shrink-0" />
                                        <span className="truncate">{pkt.dst_ip}:{pkt.dst_port}</span>
                                    </div>
                                    <div className="col-span-2 flex items-center gap-1 text-muted-foreground truncate">
                                        <Cpu className="w-3 h-3 opacity-40 flex-shrink-0" />
                                        <span className="truncate">{pkt.process}</span>
                                    </div>
                                    <div className="col-span-2 text-right text-muted-foreground/60 truncate">
                                        {pkt.info}
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>

                        {filteredPackets.length === 0 && (
                            <div className="flex flex-col items-center justify-center h-full text-muted-foreground/30">
                                <Network className="w-16 h-16 mb-4 opacity-30" />
                                <span className="font-mono text-sm">
                                    {packets.length === 0 ? "WAITING FOR TRAFFIC..." : "NO MATCHING PACKETS"}
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Detail Panel */}
                <AnimatePresence>
                    {selectedPacket && (
                        <motion.div
                            initial={{ width: 0, opacity: 0 }}
                            animate={{ width: 350, opacity: 1 }}
                            exit={{ width: 0, opacity: 0 }}
                            className="flex-shrink-0 border-l border-white/10 bg-background/80 backdrop-blur-sm overflow-hidden"
                        >
                            <div className="p-4 h-full overflow-y-auto custom-scrollbar">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="font-bold text-sm">Packet Details</h3>
                                    <button
                                        onClick={() => setSelectedPacket(null)}
                                        className="p-1 rounded hover:bg-white/10 text-muted-foreground"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>

                                <div className="space-y-4">
                                    {/* Status */}
                                    <div className={cn(
                                        "flex items-center gap-2 p-3 rounded-lg",
                                        selectedPacket.action === "ALLOW"
                                            ? "bg-emerald-500/10 border border-emerald-500/20"
                                            : "bg-red-500/10 border border-red-500/20"
                                    )}>
                                        {selectedPacket.action === "ALLOW"
                                            ? <CheckCircle className="w-5 h-5 text-emerald-400" />
                                            : <Ban className="w-5 h-5 text-red-400" />
                                        }
                                        <div>
                                            <div className="font-bold text-sm">{selectedPacket.action}</div>
                                            <div className="text-xs text-muted-foreground">{selectedPacket.status}</div>
                                        </div>
                                    </div>

                                    {/* Risk Score */}
                                    {selectedPacket.risk_score > 0 && (
                                        <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs text-muted-foreground">Risk Score</span>
                                                <span className={cn(
                                                    "font-mono font-bold",
                                                    selectedPacket.risk_score > 50 ? "text-red-400" : "text-orange-400"
                                                )}>
                                                    {selectedPacket.risk_score}%
                                                </span>
                                            </div>
                                            <div className="mt-2 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                                <div
                                                    className={cn(
                                                        "h-full rounded-full transition-all",
                                                        selectedPacket.risk_score > 50 ? "bg-red-500" : "bg-orange-500"
                                                    )}
                                                    style={{ width: `${selectedPacket.risk_score}%` }}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {/* Connection Info */}
                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Protocol</span>
                                            <span className="font-mono">{selectedPacket.protocol} / {selectedPacket.app_protocol}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Source</span>
                                            <span className="font-mono text-emerald-400">{selectedPacket.src_ip}:{selectedPacket.src_port}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Destination</span>
                                            <span className="font-mono text-purple-400">{selectedPacket.dst_ip}:{selectedPacket.dst_port}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Process</span>
                                            <span className="font-mono">{selectedPacket.process} (PID: {selectedPacket.pid})</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Duration</span>
                                            <span className="font-mono">{selectedPacket.duration}s</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Bytes Sent</span>
                                            <span className="font-mono text-emerald-400">{formatBytes(selectedPacket.bytes_sent)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Bytes Recv</span>
                                            <span className="font-mono text-purple-400">{formatBytes(selectedPacket.bytes_recv)}</span>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="pt-4 border-t border-white/10 space-y-2">
                                        <button className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors text-sm">
                                            <Ban className="w-4 h-4" />
                                            Block IP
                                        </button>
                                        <button className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-white/5 text-muted-foreground hover:bg-white/10 transition-colors text-sm">
                                            <ExternalLink className="w-4 h-4" />
                                            Lookup IP
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Scanline Effect */}
            <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.3)_50%)] bg-[length:100%_4px] opacity-10" />
        </div>
    );
};

export default TrafficPage;
