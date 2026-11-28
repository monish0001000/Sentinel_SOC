import { useEffect, useMemo, useState } from "react";
import { ScrollText, Search, Download, DatabaseZap } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useAuth } from "@/context/AuthContext";
import { isFirebaseConfigured } from "@/lib/firebase";
import { AuditLogRecord, subscribeUserAuditLogs } from "@/lib/sentinelFirebaseRepo";

const ForensicsPage = () => {
  const { logs: wsLogs } = useWebSocket();
  const { user } = useAuth();
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [severityFilter, setSeverityFilter] = useState("ALL");

  useEffect(() => {
    if (!isFirebaseConfigured || !user?.uid) {
      setAuditLogs([]);
      return;
    }
    return subscribeUserAuditLogs(user.uid, setAuditLogs);
  }, [user?.uid]);

  const combinedRows = useMemo(() => {
    if (isFirebaseConfigured) {
      return auditLogs.map((a) => ({
        id: a.id,
        timestamp: a.createdAt.toLocaleString(),
        level: "INFO",
        source: a.targetEndpointId ? `endpoint:${a.targetEndpointId.slice(0, 10)}` : "console",
        ip: a.targetIp || "—",
        message: `${a.action}${a.reason ? ` — ${a.reason}` : ""}`,
      }));
    }
    return wsLogs.map((l) => ({
      id: l.id,
      timestamp: l.timestamp,
      level: l.level.toUpperCase(),
      source: l.source,
      ip: l.ip || "—",
      message: l.message,
    }));
  }, [auditLogs, wsLogs]);

  const filteredLogs = useMemo(() => {
    return combinedRows.filter((row) => {
      const matchesSearch =
        row.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
        row.ip.includes(searchTerm) ||
        row.source.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesSeverity =
        severityFilter === "ALL" || row.level === severityFilter;

      return matchesSearch && matchesSeverity;
    });
  }, [combinedRows, searchTerm, severityFilter]);

  const exportCSV = () => {
    if (filteredLogs.length === 0) return;
    const headers = "ID,Timestamp,Level,Source,IP,Message\n";
    const rows = filteredLogs
      .map(
        (l) =>
          `"${l.id}","${l.timestamp}","${l.level}","${l.source}","${l.ip}","${l.message.replace(/"/g, '""')}"`
      )
      .join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sentinel_forensics_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ScrollText className="w-6 h-6 text-primary" />
            Forensics &amp; Audit History
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isFirebaseConfigured
              ? "Firestore operator audit trail and endpoint action records"
              : "Session log search and export"}
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={exportCSV}
          disabled={filteredLogs.length === 0}
          className="gap-2"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </Button>
      </div>

      <div className="glass-card p-4 rounded-xl flex flex-wrap gap-3 items-center border border-border/60">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Filter audit & event records..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {["ALL", "INFO", "WARNING", "ERROR", "CRITICAL"].map((sev) => (
            <Button
              key={sev}
              size="sm"
              variant={severityFilter === sev ? "default" : "outline"}
              onClick={() => setSeverityFilter(sev)}
              className="text-xs font-mono"
            >
              {sev}
            </Button>
          ))}
        </div>
      </div>

      {filteredLogs.length === 0 ? (
        <div className="glass-card rounded-xl p-10 text-center border border-border/60 space-y-2">
          <DatabaseZap className="w-10 h-10 text-muted-foreground mx-auto opacity-50" />
          <h2 className="text-base font-semibold text-foreground">
            {isFirebaseConfigured ? "No Audit Records Recorded" : "Historical SIEM Archive Not Connected"}
          </h2>
          <p className="text-sm text-muted-foreground max-w-lg mx-auto">
            {isFirebaseConfigured
              ? "Policy actions and operator audit events in Firestore will appear here."
              : "Legacy local FastAPI archive (/logs) is disabled in hosted builds."}
          </p>
        </div>
      ) : (
        <div className="glass-card rounded-xl overflow-hidden border border-border/60">
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead className="bg-muted/40 text-muted-foreground uppercase border-b border-border/60">
                <tr>
                  <th className="p-3">Time</th>
                  <th className="p-3">Level</th>
                  <th className="p-3">Source</th>
                  <th className="p-3">IP</th>
                  <th className="p-3">Message</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-accent/30 transition-colors">
                    <td className="p-3 text-muted-foreground whitespace-nowrap">{log.timestamp}</td>
                    <td className="p-3 font-bold uppercase">{log.level}</td>
                    <td className="p-3 text-primary">{log.source}</td>
                    <td className="p-3">{log.ip}</td>
                    <td className="p-3">{log.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default ForensicsPage;
