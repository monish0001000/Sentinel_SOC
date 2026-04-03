import { useState, useEffect } from "react";
import { Search, Database, Filter, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

const API_URL = "http://localhost:8000";

interface LogEntry {
    id: string;
    timestamp: string;
    level: string;
    message: string;
    source: string;
    type: string;
    metadata: string;
}

const ForensicsPage = () => {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [filterLevel, setFilterLevel] = useState("all");
    const [filterType, setFilterType] = useState("all");
    const [loading, setLoading] = useState(false);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            let url = `${API_URL}/logs?limit=200`;
            if (filterLevel !== "all") url += `&level=${filterLevel}`;
            if (filterType !== "all") url += `&type=${filterType}`;

            const token = localStorage.getItem("sentinel_token");
            if (!token) {
                window.location.href = "/login";
                return;
            }

            const res = await fetch(url, {
                headers: { "Authorization": `Bearer ${token}` }
            });

            if (res.status === 401) {
                window.location.href = "/login";
                return;
            }

            if (!res.ok) throw new Error("Failed to fetch logs");

            const data = await res.json();
            if (Array.isArray(data)) {
                setLogs(data);
            } else {
                setLogs([]);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
    }, [filterLevel, filterType]);

    return (
        <div className="space-y-6 text-foreground p-6">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Database className="w-8 h-8 text-amber-500" />
                        Digital Forensics (SIEM)
                    </h1>
                    <p className="text-muted-foreground font-mono text-xs">PERSISTENT EVENT STORAGE // SEARCH & ANALYSIS</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={fetchLogs} className="bg-primary/20 hover:bg-primary/30 text-primary px-4 py-2 rounded-lg font-bold border border-primary/30">
                        Refresh
                    </button>
                </div>
            </div>

            {/* Controls */}
            <div className="flex gap-4 mb-6">
                <div className="glass-card px-4 py-2 flex items-center gap-2 border border-white/10 rounded-lg">
                    <Filter className="w-4 h-4 text-muted-foreground" />
                    <select
                        value={filterLevel}
                        onChange={e => setFilterLevel(e.target.value)}
                        className="bg-transparent text-sm focus:outline-none"
                    >
                        <option value="all">All Levels</option>
                        <option value="INFO">INFO</option>
                        <option value="WARNING">WARNING</option>
                        <option value="CRITICAL">CRITICAL</option>
                    </select>
                </div>

                <div className="glass-card px-4 py-2 flex items-center gap-2 border border-white/10 rounded-lg">
                    <Search className="w-4 h-4 text-muted-foreground" />
                    <select
                        value={filterType}
                        onChange={e => setFilterType(e.target.value)}
                        className="bg-transparent text-sm focus:outline-none"
                    >
                        <option value="all">All Types</option>
                        <option value="Config">Config Changes</option>
                        <option value="Alert">Security Alerts</option>
                        <option value="Policy Violation">Policy Violations</option>
                    </select>
                </div>
            </div>

            {/* Table */}
            <div className="glass-card rounded-xl border border-white/10 overflow-hidden">
                <div className="grid grid-cols-12 gap-4 p-3 bg-white/5 font-mono text-xs font-bold text-muted-foreground border-b border-white/10 uppercase">
                    <div className="col-span-2">Timestamp</div>
                    <div className="col-span-1">Level</div>
                    <div className="col-span-2">Source</div>
                    <div className="col-span-2">Type</div>
                    <div className="col-span-5">Message</div>
                </div>

                <div className="max-h-[600px] overflow-y-auto">
                    {logs.map((log) => (
                        <div key={log.id} className="grid grid-cols-12 gap-4 p-3 border-b border-white/5 hover:bg-white/5 transition-colors font-mono text-xs items-center">
                            <div className="col-span-2 opacity-70">{new Date(log.timestamp).toLocaleString()}</div>
                            <div className="col-span-1">
                                <span className={cn(
                                    "px-1.5 py-0.5 rounded font-bold",
                                    log.level === "CRITICAL" ? "bg-red-500/20 text-red-500" :
                                        log.level === "WARNING" ? "bg-orange-500/20 text-orange-400" :
                                            "bg-blue-500/20 text-blue-400"
                                )}>
                                    {log.level}
                                </span>
                            </div>
                            <div className="col-span-2 text-cyan-400">{log.source}</div>
                            <div className="col-span-2 opacity-70">{log.type}</div>
                            <div className="col-span-5 truncate text-white/90" title={log.message}>{log.message}</div>
                        </div>
                    ))}
                    {logs.length === 0 && !loading && (
                        <div className="p-8 text-center text-muted-foreground">No logs found in archive.</div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ForensicsPage;
