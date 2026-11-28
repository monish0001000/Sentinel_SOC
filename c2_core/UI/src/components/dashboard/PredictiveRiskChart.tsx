import React, { useState, useEffect } from "react";
import { AreaChart, Area, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { ShieldAlert } from "lucide-react";

interface PredictiveRiskChartProps {
  currentRisk: number | null;
}

const PredictiveRiskChart: React.FC<PredictiveRiskChartProps> = ({ currentRisk }) => {
  const [data, setData] = useState<{ time: string; risk: number }[]>([]);

  useEffect(() => {
    if (currentRisk === null) return;
    const interval = setInterval(() => {
      setData((prev) => [
        ...prev.slice(-19),
        {
          time: new Date().toLocaleTimeString(),
          risk: currentRisk,
        },
      ]);
    }, 1000);

    return () => clearInterval(interval);
  }, [currentRisk]);

  return (
    <div className="glass-card p-4 rounded-2xl border border-border/60 relative overflow-hidden h-[300px] flex flex-col">
      <div className="flex items-center gap-2 mb-4 z-10 relative">
        <ShieldAlert className="w-5 h-5 text-warning" />
        <h3 className="text-sm font-bold text-foreground uppercase tracking-widest">
          Risk Trend
        </h3>
      </div>

      <div className="absolute top-0 right-0 p-4 z-10">
        <span
          className={`text-4xl font-black font-mono ${
            currentRisk === null
              ? "text-muted-foreground"
              : currentRisk > 80
                ? "text-destructive"
                : currentRisk > 50
                  ? "text-warning"
                  : "text-success"
          }`}
        >
          {currentRisk === null ? "—" : currentRisk}
        </span>
        <span className="text-xs text-muted-foreground block text-right">CURRENT SCORE</span>
      </div>

      <div className="flex-1 w-full min-h-0 flex items-center justify-center">
        {data.length === 0 ? (
          <p className="text-xs text-muted-foreground">No live risk samples received.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="colorRisk" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor={(currentRisk ?? 0) > 50 ? "#f97316" : "#10b981"}
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="95%"
                    stopColor={(currentRisk ?? 0) > 50 ? "#f97316" : "#10b981"}
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <YAxis domain={[0, 100]} hide />
              <Tooltip />
              <Area
                type="monotone"
                dataKey="risk"
                stroke={(currentRisk ?? 0) > 50 ? "#f97316" : "#10b981"}
                fillOpacity={1}
                fill="url(#colorRisk)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

export default PredictiveRiskChart;
