import { useMemo, useState } from "react";
import { ScrollText, Search, Download, DatabaseZap } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useWebSocket } from "@/hooks/useWebSocket";

const ForensicsPage = () => {
  const { logs, connectionStatus } = useWebSocket();
  const [searchTerm, setSearchTerm] = useState("");
  const [severityFilter, setSeverityFilter] = useState("ALL");

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const matchesSearch =
        log.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (log.ip || "").includes(searchTerm) ||
        log.source.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesSeverity =
        severityFilter === "ALL" || log.level.toUpperCase() === severityFilter;

      return matchesSearch && matchesSeverity;
    });
  }, [logs, searchTerm, severityFilter]);

  const exportCSV = () => {
    if (filteredLogs.length === 0) return;
    const headers = "ID,Timestamp,Level,Source,Protocol,Port,IP,Status,Message\n";
    const rows = filteredLogs
      .map(
        (l) =>
          `"${l.id}","${l.timestamp}","${l.level}","${l.source}","${l.protocol || ""}","${l.port || ""}","${l.ip || ""}","${l.status}","${l.message.replace(/"/g, '""')}"`
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
            Forensics &amp; Historical Logs
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Session log search and export — persistent SQL/SIEM archive requires a backend connector
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

      {/* Filters */}
      <div className="glass-card p-4 rounded-xl flex flex-wrap gap-3 items-center border border-border/60">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Filter session events by message, IP, or source..."
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

      {/* Results or Honest Empty State */}
      {filteredLogs.length === 0 ? (
        <div className="glass-card rounded-xl p-10 text-center border border-border/60 space-y-2">
          <DatabaseZap className="w-10 h-10 text-muted-foreground mx-auto opacity-50" />
          <h2 className="text-base font-semibold text-foreground">
            Historical SIEM Archive Not Connected
          </h2>
          <p className="text-sm text-muted-foreground max-w-lg mx-auto">
            {connectionStatus === "connected"
              ? "No captured session logs match the current filter."
              : "Legacy local FastAPI archive (/logs) is disabled in hosted builds, and no live stream events have been received in this session."}
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
                    <td className="p-3">{log.ip || "—"}</td>
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
