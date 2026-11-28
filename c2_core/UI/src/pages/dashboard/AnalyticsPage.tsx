import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useAuth } from "@/context/AuthContext";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  EndpointRecord,
  subscribeEndpoints,
  subscribeEndpointTelemetry,
  TelemetrySampleRecord,
} from "@/lib/sentinelFirebaseRepo";
import { Zap, TrendingUp, BarChart3 } from "lucide-react";

const EmptyChartState = ({ label }: { label: string }) => (
  <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground gap-2 px-4">
    <BarChart3 className="w-8 h-8 opacity-30" />
    <p className="text-xs">{label}</p>
  </div>
);

const AnalyticsPage = () => {
  const { chartData, topIPs, threatTypes, targetedPorts, connectionStatus } = useWebSocket();
  const { user } = useAuth();
  const [endpoints, setEndpoints] = useState<EndpointRecord[]>([]);
  const [samples, setSamples] = useState<TelemetrySampleRecord[]>([]);

  useEffect(() => {
    if (!isFirebaseConfigured || !user?.uid) {
      setEndpoints([]);
      return;
    }
    return subscribeEndpoints(user.uid, setEndpoints);
  }, [user?.uid]);

  useEffect(() => {
    if (!isFirebaseConfigured || !user?.uid || endpoints.length === 0) {
      setSamples([]);
      return;
    }
    return subscribeEndpointTelemetry(user.uid, endpoints[0].endpointId, setSamples);
  }, [user?.uid, endpoints]);

  const telemetrySeries = useMemo(
    () =>
      samples.map((s) => ({
        time: s.capturedAt.toLocaleTimeString(),
        cpu: Number(s.cpuPercent.toFixed(1)),
        memory: Number(s.memoryPercent.toFixed(1)),
      })),
    [samples]
  );

  const isConnected = connectionStatus === "connected" || (isFirebaseConfigured && samples.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Security &amp; Endpoint Analytics</h1>
          <p className="text-muted-foreground text-sm">
            Real telemetry trends and threat distributions from connected sources
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/40 border border-border/50 self-start">
          <Zap
            className={
              isConnected ? "w-4 h-4 text-success live-pulse" : "w-4 h-4 text-muted-foreground"
            }
          />
          <span className="text-xs font-mono text-muted-foreground">
            {isConnected ? "GENUINE DATA" : "AWAITING TELEMETRY"}
          </span>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card border border-border/60 rounded-xl p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-foreground">
              {telemetrySeries.length > 0
                ? `Endpoint CPU & RAM (${endpoints[0]?.hostname || "Primary"})`
                : "Threat Frequency"}
            </h3>
            <div
              className={`flex items-center gap-1.5 ${
                isConnected ? "text-success" : "text-muted-foreground"
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              <span className="text-xs font-mono">{isConnected ? "REAL SAMPLES" : "NO SAMPLES"}</span>
            </div>
          </div>
          <div className="h-64">
            {telemetrySeries.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={telemetrySeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis dataKey="time" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                  <YAxis domain={[0, 100]} stroke="hsl(var(--muted-foreground))" fontSize={10} />
                  <Tooltip />
                  <Legend />
                  <Area type="monotone" dataKey="cpu" stroke="hsl(var(--primary))" fillOpacity={0.15} fill="hsl(var(--primary))" name="CPU %" />
                  <Area type="monotone" dataKey="memory" stroke="hsl(var(--success))" fillOpacity={0.15} fill="hsl(var(--success))" name="Memory %" />
                </AreaChart>
              </ResponsiveContainer>
            ) : chartData.length === 0 ? (
              <EmptyChartState label="No real telemetry or frequency samples received yet." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis dataKey="time" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} />
                  <Tooltip />
                  <Area type="monotone" dataKey="packets" stroke="hsl(var(--primary))" fillOpacity={0.2} fill="hsl(var(--primary))" name="Network Traffic" />
                  <Area type="monotone" dataKey="threats" stroke="hsl(var(--destructive))" fillOpacity={0.2} fill="hsl(var(--destructive))" name="Threats" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card border border-border/60 rounded-xl p-5"
        >
          <h3 className="text-lg font-semibold text-foreground mb-4">Threat Type Distribution</h3>
          <div className="h-64">
            {threatTypes.length === 0 ? (
              <EmptyChartState label="No threat distribution data received." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={threatTypes} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={5} dataKey="value">
                    {threatTypes.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-card border border-border/60 rounded-xl p-5"
        >
          <h3 className="text-lg font-semibold text-foreground mb-4">Top Source IPs</h3>
          <div className="h-64">
            {topIPs.length === 0 ? (
              <EmptyChartState label="No source IP analytics received." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topIPs} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                  <YAxis dataKey="ip" type="category" stroke="hsl(var(--muted-foreground))" fontSize={10} width={100} />
                  <Tooltip />
                  <Bar dataKey="attacks" fill="hsl(var(--destructive))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass-card border border-border/60 rounded-xl p-5"
        >
          <h3 className="text-lg font-semibold text-foreground mb-4">Most Targeted Ports</h3>
          <div className="h-64">
            {targetedPorts.length === 0 ? (
              <EmptyChartState label="No targeted port analytics received." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={targetedPorts}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis dataKey="port" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="attacks" fill="hsl(var(--destructive))" name="Attacks" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="service" fill="hsl(var(--primary))" name="Service" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default AnalyticsPage;
