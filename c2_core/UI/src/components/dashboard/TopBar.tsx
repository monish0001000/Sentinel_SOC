import { useState, useEffect } from "react";
import { User, Clock, Activity, Menu } from "lucide-react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useAuth } from "@/context/AuthContext";
import { ConnectionIndicator } from "./ConnectionIndicator";
import { RiskScoreGauge } from "./RiskScoreGauge";
import { Button } from "@/components/ui/button";

interface TopBarProps {
  onMenuClick?: () => void;
}

export const TopBar = ({ onMenuClick }: TopBarProps) => {
  const { connectionStatus, isConfigured: wsConfigured, reconnect, stats } = useWebSocket();
  const { user } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const operatorLabel = user?.email || user?.uid || "Operator";
  const isStreamConnected = connectionStatus === "connected";

  return (
    <header className="h-16 border-b border-border/50 bg-card/70 backdrop-blur-md px-4 md:px-6 flex items-center justify-between gap-3">
      {/* Left: Mobile Menu + Telemetry Stream */}
      <div className="flex items-center gap-3 md:gap-6 min-w-0">
        {onMenuClick && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onMenuClick}
            aria-label="Open navigation menu"
            className="md:hidden h-9 w-9 flex-shrink-0"
          >
            <Menu className="w-5 h-5" />
          </Button>
        )}

        <ConnectionIndicator
          status={connectionStatus}
          onReconnect={wsConfigured ? reconnect : undefined}
        />

        <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground">
          <Activity className="w-3.5 h-3.5 text-primary" />
          <span className="font-mono">
            {isStreamConnected
              ? `${stats.packets_per_sec} pkt/s`
              : "No active packet stream"}
          </span>
        </div>
      </div>

      {/* Right: Risk Score, Time & Operator */}
      <div className="flex items-center gap-4 md:gap-6 flex-shrink-0">
        <RiskScoreGauge
          score={stats.risk_score}
          hasData={isStreamConnected}
          className="hidden sm:flex"
        />

        <div className="hidden lg:flex items-center gap-2 text-xs text-muted-foreground font-mono">
          <Clock className="w-3.5 h-3.5 text-primary" />
          <span>{currentTime.toLocaleTimeString()}</span>
        </div>

        <div className="flex items-center gap-2.5 pl-3 md:pl-4 border-l border-border/50">
          <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center flex-shrink-0">
            <User className="w-4 h-4 text-primary" />
          </div>
          <div className="hidden sm:block max-w-[180px]">
            <p className="text-xs font-medium text-foreground truncate">{operatorLabel}</p>
            <p className="text-[10px] font-mono text-muted-foreground">
              {user ? "Firebase Auth" : "Unauthenticated"}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
};
