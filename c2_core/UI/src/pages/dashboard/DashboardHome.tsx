import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Cpu,
  HardDrive,
  MemoryStick,
  Monitor,
  Network,
  ShieldCheck,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useAuth } from "@/context/AuthContext";
import { isFirebaseConfigured } from "@/lib/firebase";
import { EndpointRecord, subscribeEndpoints } from "@/lib/sentinelFirebaseRepo";
import { Threat } from "@/data/mockData";

const numberOrDash = (value: unknown, suffix = "") => {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  return Number.isFinite(n)
    ? `${n.toLocaleString(undefined, { maximumFractionDigits: 1 })}${suffix}`
    : String(value);
};

function MetricCard({
  title,
  value,
  note,
  icon: Icon,
  tint,
  index,
}: {
  title: string;
  value: string;
  note: string;
  icon: typeof Activity;
  tint: string;
  index: number;
}) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.07 }}
      whileHover={{ y: -5, rotateX: 2 }}
      className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-[0_12px_36px_-28px_rgba(24,54,100,.32)] transition-shadow hover:shadow-[0_22px_48px_-28px_rgba(37,99,235,.25)]"
    >
      <div className={`absolute -right-7 -top-7 h-24 w-24 rounded-full blur-2xl opacity-60 ${tint}`} />
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold tracking-wide text-slate-500">{title}</p>
          <p className="mt-4 text-3xl font-black tracking-tight text-slate-900">{value}</p>
          <p className="mt-2 text-[11px] text-slate-400">{note}</p>
        </div>
        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-100 bg-slate-50 text-blue-600 transition-transform duration-500 group-hover:rotate-[-8deg] group-hover:scale-110">
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </motion.article>
  );
}

function UsageBar({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: unknown;
  icon: typeof Cpu;
  color: string;
}) {
  const n = Number(value);
  const valid = value !== null && value !== undefined && Number.isFinite(n);
  const pct = valid ? Math.max(0, Math.min(100, n)) : 0;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Icon className="h-4 w-4 text-slate-400" />
          {label}
        </span>
        <span className="text-sm font-bold tabular-nums text-slate-800">
          {valid ? `${n.toFixed(1)}%` : "Awaiting data"}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className={`h-full rounded-full ${color}`}
        />
      </div>
    </div>
  );
}

type AlertFeedItem = Partial<Threat> & {
  level?: string;
  message?: string;
  source?: string;
};

export default function DashboardHome() {
  const { connected, metrics, alerts = [], systemInfo, riskScore, agents = [] } = useWebSocket();
  const { user } = useAuth();
  const [fbEndpoints, setFbEndpoints] = useState<EndpointRecord[]>([]);

  useEffect(() => {
    if (!isFirebaseConfigured || !user?.uid) {
      setFbEndpoints([]);
      return;
    }
    return subscribeEndpoints(user.uid, setFbEndpoints);
  }, [user?.uid]);

  const primaryFbEndpoint = fbEndpoints.length > 0 ? fbEndpoints[0] : null;
  const activeAgent = agents.length ? agents[0] : null;

  const endpointCount = isFirebaseConfigured ? fbEndpoints.length : agents.length;
  const cpu = primaryFbEndpoint?.latestMetrics?.cpuPercent ?? activeAgent?.stats?.cpu ?? metrics?.cpu_usage;
  const memory =
    primaryFbEndpoint?.latestMetrics?.memoryPercent ?? activeAgent?.stats?.memory ?? metrics?.memory_usage;
  const disk = primaryFbEndpoint?.latestMetrics?.diskPercent ?? activeAgent?.stats?.disk;
  const host =
    primaryFbEndpoint?.hostname ||
    activeAgent?.hostname ||
    systemInfo?.hostname ||
    "No endpoint reported";
  const os =
    primaryFbEndpoint?.osVersion ||
    activeAgent?.os ||
    systemInfo?.os ||
    "Waiting for endpoint";

  const recentAlerts = ([...alerts] as AlertFeedItem[]).slice(-6).reverse();
  const risk =
    riskScore !== null && Number.isFinite(Number(riskScore)) ? numberOrDash(riskScore) : "—";

  const streamLabel = isFirebaseConfigured
    ? "Firestore & Stream"
    : "Telemetry Stream";
  const streamStatus = isFirebaseConfigured
    ? "Firestore Ready"
    : connected
      ? "Connected"
      : "Not Connected";
  const isHealthyStream = isFirebaseConfigured || connected;

  return (
    <div className="space-y-7 pb-10">
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55 }}
        className="relative overflow-hidden rounded-[26px] border border-blue-100 bg-gradient-to-br from-white via-[#f5f8ff] to-[#eaf2ff] p-6 shadow-[0_24px_70px_-42px_rgba(37,99,235,.38)] md:p-8"
      >
        <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full border-[36px] border-white/50" />
        <div className="pointer-events-none absolute -right-2 top-10 h-44 w-44 rounded-full bg-blue-200/30 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white/80 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.18em] text-blue-700">
              <ShieldCheck className="h-3.5 w-3.5" /> Security operations workspace
            </div>
            <h1 className="text-3xl font-black tracking-[-.04em] text-slate-950 md:text-4xl">
              Good to see you, Analyst.
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
              A clear view of endpoint health and security events reported to this console.
            </p>
          </div>
          <div className="flex items-center gap-3 self-start rounded-2xl border border-white bg-white/85 px-4 py-3 shadow-sm lg:self-auto">
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                isHealthyStream ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
              }`}
            >
              {isHealthyStream ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
            </span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                {streamLabel}
              </p>
              <p
                className={`mt-0.5 text-sm font-bold ${
                  isHealthyStream ? "text-emerald-700" : "text-amber-700"
                }`}
              >
                {streamStatus}
              </p>
            </div>
          </div>
        </div>
      </motion.section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Reported endpoints"
          value={numberOrDash(endpointCount)}
          note={
            endpointCount
              ? "Endpoint agent records received"
              : "No endpoint has reported yet"
          }
          icon={Monitor}
          tint="bg-blue-200"
          index={0}
        />
        <MetricCard
          title="Open alerts"
          value={numberOrDash(alerts.length)}
          note="Events currently in this stream"
          icon={AlertTriangle}
          tint="bg-rose-200"
          index={1}
        />
        <MetricCard
          title="Current risk score"
          value={risk}
          note="Value from connected data source"
          icon={ShieldCheck}
          tint="bg-violet-200"
          index={2}
        />
        <MetricCard
          title="Network rate"
          value={connected ? numberOrDash(metrics?.packet_rate) : "—"}
          note="Packets per second, when reported"
          icon={Network}
          tint="bg-cyan-200"
          index={3}
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.05fr_.95fr]">
        <motion.article
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="rounded-2xl border border-slate-200/80 bg-white/90 p-6 shadow-[0_12px_36px_-28px_rgba(24,54,100,.32)]"
        >
          <div className="mb-7 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.16em] text-blue-600">
                Endpoint telemetry
              </p>
              <h2 className="mt-1 text-lg font-extrabold text-slate-900">System health</h2>
            </div>
            <span className="rounded-full bg-slate-50 px-3 py-1 text-[10px] font-semibold text-slate-500">
              Latest reported values
            </span>
          </div>
          <div className="space-y-7">
            <UsageBar
              label="Processor usage"
              value={cpu}
              icon={Cpu}
              color="bg-gradient-to-r from-blue-600 to-cyan-400"
            />
            <UsageBar
              label="Memory usage"
              value={memory}
              icon={MemoryStick}
              color="bg-gradient-to-r from-violet-500 to-indigo-400"
            />
            <UsageBar
              label="Disk usage"
              value={disk}
              icon={HardDrive}
              color="bg-gradient-to-r from-emerald-500 to-teal-400"
            />
          </div>
          <div className="mt-8 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Endpoint
              </p>
              <p className="mt-1 truncate text-sm font-bold text-slate-800">{host}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Operating system
              </p>
              <p className="mt-1 truncate text-sm font-semibold text-slate-700">{os}</p>
            </div>
          </div>
        </motion.article>

        <motion.article
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.22 }}
          className="flex min-h-[360px] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-[0_12px_36px_-28px_rgba(24,54,100,.32)]"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.16em] text-blue-600">
                Evidence feed
              </p>
              <h2 className="mt-1 text-lg font-extrabold text-slate-900">Recent alerts</h2>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500">
              {alerts.length} total
            </span>
          </div>
          <div className="flex-1 divide-y divide-slate-100">
            {recentAlerts.length === 0 ? (
              <div className="flex h-full min-h-[240px] flex-col items-center justify-center px-6 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 text-slate-400">
                  <Activity className="h-5 w-5" />
                </span>
                <p className="mt-4 text-sm font-bold text-slate-700">No alert evidence received</p>
                <p className="mt-1 max-w-xs text-xs leading-5 text-slate-400">
                  When a connected source reports an alert, it will appear here. This panel does not
                  generate sample events.
                </p>
              </div>
            ) : (
              recentAlerts.map((alert, index) => {
                const level = alert.severity || alert.level || "Unclassified";
                const text = alert.description || alert.message || "Alert reported without a message";
                return (
                  <motion.div
                    key={alert.id || `${alert.timestamp || "ts"}-${index}`}
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.04 }}
                    className="flex gap-3 px-6 py-4 transition-colors hover:bg-slate-50/80"
                  >
                    <span
                      className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                        level === "critical" || level === "high" ? "bg-rose-500" : "bg-blue-500"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          {level}
                        </p>
                        <time className="shrink-0 text-[10px] text-slate-400">
                          {alert.timestamp
                            ? new Date(alert.timestamp).toLocaleTimeString()
                            : "Time unavailable"}
                        </time>
                      </div>
                      <p className="mt-1 break-words text-xs leading-5 text-slate-700">{text}</p>
                      <p className="mt-1 text-[10px] text-slate-400">
                        {alert.source || "Source not supplied"} · {alert.id || "No event ID"}
                      </p>
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 px-6 py-3 text-[10px] text-slate-400">
            <span>Only source-reported events are displayed</span>
            <Link to="/dashboard/threats" className="flex items-center gap-1 text-blue-600 hover:underline">
              View feed <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
        </motion.article>
      </section>
    </div>
  );
}
