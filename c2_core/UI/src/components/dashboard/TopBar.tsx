import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Bell, Shield, AlertTriangle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWebSocket } from "@/hooks/useWebSocket";
import { ConnectionIndicator } from "./ConnectionIndicator";
import { RiskScoreGauge } from "./RiskScoreGauge";

export const TopBar = () => {
  // @ts-ignore
  const { connectionStatus, packetRate, aiMode, riskScore, threats, reconnect } = useWebSocket();
  const [currentTime, setCurrentTime] = useState(new Date());

  // Real-time clock
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const criticalThreats = threats.filter((t) => t.severity === "critical" || t.severity === "high");
  const alertCount = criticalThreats.length;

  const threatLevel = riskScore >= 70 ? "high" : riskScore >= 40 ? "medium" : "low";

  const threatConfig = {
    low: { color: "text-success", bg: "bg-success/10", border: "border-success/30", label: "LOW" },
    medium: { color: "text-warning", bg: "bg-warning/10", border: "border-warning/30", label: "MEDIUM" },
    high: { color: "text-destructive", bg: "bg-destructive/10", border: "border-destructive/30", label: "HIGH" },
  };

  const config = threatConfig[threatLevel];

  return (
    <header className="h-14 glass-card border-b border-border/50 px-4 md:px-6 flex items-center justify-between">
      {/* Left: Connection Status & Packet Rate */}
      <div className="flex items-center gap-3 md:gap-6">
        <ConnectionIndicator status={connectionStatus} onReconnect={reconnect} />

        <div className="hidden sm:flex items-center gap-2 px-2 py-1 rounded-md bg-muted/20 border border-border/30">
          <span className="text-[10px] text-muted-foreground font-mono">PKT/s:</span>
          <motion.span
            key={packetRate}
            initial={{ opacity: 0.5 }}
            animate={{ opacity: 1 }}
            className="text-xs font-mono font-bold text-primary update-glow"
          >
            {connectionStatus === "connected" ? packetRate.toLocaleString() : "—"}
          </motion.span>
        </div>

        <div className="hidden md:flex items-center gap-2 px-2 py-1 rounded-md bg-muted/20 border border-border/30">
          <span className="text-[10px] text-muted-foreground font-mono">AI:</span>
          <span className={cn(
            "text-[10px] font-mono font-bold uppercase",
            aiMode === "active" ? "text-success" : aiMode === "learning" ? "text-warning" : "text-muted-foreground"
          )}>
            {aiMode}
          </span>
        </div>

        <div className="h-6 w-px bg-border/50 hidden md:block" />

        {/* Threat Level */}
        <div className="hidden md:flex items-center gap-2">
          <Shield className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground font-mono">THREAT:</span>
          <motion.span
            key={threatLevel}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={cn(
              "px-2 py-0.5 rounded text-[10px] font-bold font-mono border",
              config.bg,
              config.color,
              config.border,
              threatLevel === "high" && "threat-pulse"
            )}
          >
            {config.label}
          </motion.span>
        </div>
      </div>

      {/* Right: Risk Score, Alerts & Time */}
      <div className="flex items-center gap-3 md:gap-4">
        {/* Risk Score Gauge */}
        <div className="hidden lg:block">
          <RiskScoreGauge score={riskScore} />
        </div>

        {/* Active Threat Warning */}
        {threatLevel === "high" && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="hidden md:flex items-center gap-2 px-3 py-1 rounded-md bg-destructive/10 border border-destructive/20"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-destructive animate-pulse" />
            <span className="text-[10px] font-mono font-medium text-destructive">
              ACTIVE THREATS
            </span>
          </motion.div>
        )}

        {/* Alert Bell */}
        <button className="relative p-2 rounded-lg hover:bg-accent/50 transition-colors">
          <Bell className="w-4 h-4 text-muted-foreground" />
          {alertCount > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center font-bold"
            >
              {alertCount > 9 ? "9+" : alertCount}
            </motion.span>
          )}
        </button>

        <div className="h-5 w-px bg-border/50" />

        {/* Current Time */}
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-mono text-muted-foreground">
            {currentTime.toLocaleTimeString("en-US", {
              hour12: false,
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </span>
        </div>

        {/* User */}
        <div className="hidden md:flex items-center gap-2 pl-3 border-l border-border/50">
          <div className="w-7 h-7 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Shield className="w-3.5 h-3.5 text-primary" />
          </div>
          <div className="text-right">
            <p className="text-xs font-medium text-foreground">analyst</p>
            <p className="text-[10px] text-muted-foreground font-mono">SOC-L1</p>
          </div>
        </div>
      </div>
    </header>
  );
};
