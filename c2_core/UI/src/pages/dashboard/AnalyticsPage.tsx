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
import { Zap, TrendingUp, BarChart3 } from "lucide-react";

const EmptyChartState = ({ label }: { label: string }) => (
  <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground gap-2 px-4">
    <BarChart3 className="w-8 h-8 opacity-30" />
    <p className="text-xs">{label}</p>
  </div>
);

const AnalyticsPage = () => {
  const { chartData, topIPs, threatTypes, targetedPorts, connectionStatus } = useWebSocket();
  const isConnected = connectionStatus === "connected";

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Security Analytics</h1>
          <p className="text-muted-foreground text-sm">
            Real-time threat patterns and attack trends from connected streams
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/40 border border-border/50 self-start">
          <Zap
            className={
              isConnected ? "w-4 h-4 text-success live-pulse" : "w-4 h-4 text-muted-foreground"
            }
          />
          <span className="text-xs font-mono text-muted-foreground">
            {isConnected ? "LIVE DATA" : "STREAM OFFLINE"}
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
            <h3 className="text-lg font-semibold text-foreground">Threat Frequency</h3>
            <div
              className={`flex items-center gap-1.5 ${
                isConnected ? "text-success" : "text-muted-foreground"
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              <span className="text-xs font-mono">{isConnected ? "LIVE" : "AWAITING STREAM"}</span>
            </div>
          </div>
          <div className="h-64">
            {chartData.length === 0 ? (
              <EmptyChartState label="No frequency time-series received from stream." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="threatGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="packetGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis dataKey="time" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="packets"
                    stroke="hsl(var(--primary))"
                    fill="url(#packetGradient)"
                    strokeWidth={2}
                    name="Network Traffic"
                  />
                  <Area
                    type="monotone"
                    dataKey="threats"
                    stroke="hsl(var(--destructive))"
                    fill="url(#threatGradient)"
                    strokeWidth={2}
                    name="Threats"
                  />
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
                  <Pie
                    data={threatTypes}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={5}
                    dataKey="value"
                  >
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
