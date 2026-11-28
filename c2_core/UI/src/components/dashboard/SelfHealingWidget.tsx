import React, { useEffect, useState } from "react";
import { ShieldCheck, RefreshCw, Activity } from "lucide-react";

interface HealingLog {
  timestamp: string;
  message: string;
  item: string;
}

interface HealingAlertInput {
  type?: string;
  source?: string;
  timestamp?: string;
  message?: string;
}

interface SelfHealingWidgetProps {
  alerts: HealingAlertInput[];
}

const SelfHealingWidget: React.FC<SelfHealingWidgetProps> = ({ alerts }) => {
  const [logs, setLogs] = useState<HealingLog[]>([]);

  useEffect(() => {
    const healingAlerts = alerts
      .filter((a) => a.type === "Self-Healing" || a.source === "Self-Healing Engine")
      .map((a) => {
        const message = a.message || "System Restoration";
        return {
          timestamp: a.timestamp ? new Date(a.timestamp).toLocaleTimeString() : "—",
          message,
          item: message.includes(":") ? message.split(": ")[1] : "System Restoration",
        };
      })
      .slice(0, 5);

    setLogs(healingAlerts);
  }, [alerts]);

  return (
    <div className="glass-card p-4 rounded-xl border border-border/60">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
          <ShieldCheck size={18} className="text-success" /> Self-Healing Activity
        </h3>
        <Activity size={16} className="text-muted-foreground" />
      </div>

      <div className="space-y-3">
        {logs.length === 0 ? (
          <div className="text-muted-foreground text-sm text-center py-4">
            No healing actions reported.
          </div>
        ) : (
          logs.map((log, idx) => (
            <div
              key={`${log.timestamp}-${idx}`}
              className="flex items-start gap-3 bg-muted/40 p-2.5 rounded-lg border border-border/50"
            >
              <RefreshCw size={15} className="text-success mt-0.5 shrink-0" />
              <div>
                <p className="text-foreground text-sm font-medium">{log.message}</p>
                <p className="text-muted-foreground text-xs">{log.timestamp}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default SelfHealingWidget;
