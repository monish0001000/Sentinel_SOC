import { useEffect, useState } from "react";
import {
  Server,
  Cpu,
  HardDrive,
  Activity,
  Laptop,
  Plus,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  Copy,
  Check,
  WifiOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { isFirebaseConfigured } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import {
  createEndpointEnrollment,
  createSafeFirewallPolicy,
  EndpointAlertRecord,
  EndpointComputedStatus,
  EndpointRecord,
  subscribeEndpointAlerts,
  subscribeEndpoints,
} from "@/lib/sentinelFirebaseRepo";
import { useWebSocket } from "@/hooks/useWebSocket";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

const STATUS_BADGE: Record<EndpointComputedStatus, { label: string; cls: string }> = {
  enrolled: { label: "ENROLLED", cls: "bg-primary/15 text-primary border-primary/30" },
  online: { label: "ONLINE", cls: "bg-success/15 text-success border-success/30" },
  stale: { label: "STALE", cls: "bg-warning/15 text-warning border-warning/30" },
  offline: { label: "OFFLINE", cls: "bg-muted text-muted-foreground border-border" },
  error: { label: "ERROR", cls: "bg-destructive/15 text-destructive border-destructive/30" },
};

const NodesPage = () => {
  const { agents: wsAgents } = useWebSocket();
  const { user } = useAuth();
  const { toast } = useToast();

  const [endpoints, setEndpoints] = useState<EndpointRecord[]>([]);
  const [selectedEndpoint, setSelectedEndpoint] = useState<EndpointRecord | null>(null);
  const [alerts, setAlerts] = useState<EndpointAlertRecord[]>([]);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrollLabel, setEnrollLabel] = useState("Windows Workstation");
  const [enrollBundle, setEnrollBundle] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [blockIp, setBlockIp] = useState("");
  const [blockReason, setBlockReason] = useState("");

  const currentUid = user?.uid;

  useEffect(() => {
    if (!isFirebaseConfigured || !currentUid) {
      setEndpoints([]);
      return;
    }
    const unsub = subscribeEndpoints(
      currentUid,
      (list) => setEndpoints(list),
      (err) =>
        toast({
          title: "Firestore Subscription Error",
          description: err.message,
          variant: "destructive",
        })
    );
    return () => unsub();
  }, [currentUid, toast]);

  useEffect(() => {
    if (!isFirebaseConfigured || !currentUid || !selectedEndpoint) {
      setAlerts([]);
      return;
    }
    return subscribeEndpointAlerts(currentUid, selectedEndpoint.endpointId, setAlerts);
  }, [currentUid, selectedEndpoint]);

  const handleGenerateEnrollment = async () => {
    if (!currentUid) {
      toast({
        title: "Sign in required",
        description: "Sign in with Firebase Auth to generate an endpoint enrollment token.",
        variant: "destructive",
      });
      return;
    }
    try {
      const res = await createEndpointEnrollment(currentUid, enrollLabel);
      const bundle = JSON.stringify(
        {
          FirebaseProjectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
          FirebaseWebApiKey: import.meta.env.VITE_FIREBASE_API_KEY,
          OwnerUid: res.ownerUid,
          EnrollmentToken: res.pairingToken,
          ExpiresAt: res.expiresAt.toISOString(),
        },
        null,
        2
      );
      setEnrollBundle(bundle);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Check Firestore rules and permissions.";
      toast({
        title: "Enrollment creation failed",
        description: message,
        variant: "destructive",
      });
    }
  };

  const handleCopyBundle = async () => {
    if (!enrollBundle) return;
    await navigator.clipboard.writeText(enrollBundle);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCreateBlockPolicy = async () => {
    if (!currentUid || !selectedEndpoint) return;
    if (!blockIp.trim() || !blockReason.trim()) {
      toast({
        title: "Validation error",
        description: "Target IP and reason are required.",
        variant: "destructive",
      });
      return;
    }
    try {
      const policyId = await createSafeFirewallPolicy({
        ownerUid: currentUid,
        endpointId: selectedEndpoint.endpointId,
        action: "block_ip",
        targetIp: blockIp.trim(),
        reason: blockReason.trim(),
        ttlMinutes: 60,
      });
      toast({
        title: "Policy queued",
        description: `Policy ${policyId} created and awaiting endpoint acknowledgement.`,
      });
      setBlockIp("");
      setBlockReason("");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast({
        title: "Policy creation failed",
        description: message,
        variant: "destructive",
      });
    }
  };

  const displayList: EndpointRecord[] = isFirebaseConfigured
    ? endpoints
    : wsAgents.map((a) => ({
        id: a.id,
        endpointId: a.id,
        hostname: a.hostname,
        osVersion: a.os,
        agentVersion: "legacy-ws",
        computedStatus: a.status?.toLowerCase() === "online" ? "online" : "offline",
        latestMetrics: a.stats
          ? {
              cpuPercent: a.stats.cpu,
              memoryPercent: a.stats.memory,
              memoryUsedMb: 0,
              memoryTotalMb: 0,
              diskPercent: a.stats.disk,
              diskFreeGb: 0,
              diskTotalGb: 0,
              processCount: a.stats.processes,
              networkTxBytesPerSec: 0,
              networkRxBytesPerSec: 0,
            }
          : undefined,
      }));

  const onlineCount = displayList.filter((e) => e.computedStatus === "online").length;

  return (
    <div className="space-y-6 text-foreground">
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Server className="w-7 h-7 text-primary" />
            Windows Endpoints (EDR)
          </h1>
          <p className="text-muted-foreground font-mono text-xs mt-1">
            GENUINE ENDPOINT TELEMETRY, OFFLINE SYNC &amp; ALLOWLISTED FIREWALL CONTROL
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="glass-card px-3 py-1.5 text-xs font-mono flex items-center gap-2 rounded-md border">
            <span
              className={cn(
                "w-2 h-2 rounded-full",
                onlineCount > 0 ? "bg-success animate-pulse" : "bg-muted-foreground"
              )}
            />
            {onlineCount} / {displayList.length} ONLINE
          </div>
          {isFirebaseConfigured && (
            <Button
              onClick={() => {
                setEnrollOpen(!enrollOpen);
                setEnrollBundle(null);
              }}
              size="sm"
            >
              <Plus className="w-4 h-4 mr-1" />
              Enroll Windows Endpoint
            </Button>
          )}
        </div>
      </div>

      {enrollOpen && (
        <div className="glass-card p-5 rounded-xl border border-primary/30 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-base">Generate One-Time Endpoint Enrollment Bundle</h2>
            <span className="text-xs text-muted-foreground">Valid for 15 minutes • Single-use</span>
          </div>
          <div className="flex flex-wrap gap-3">
            <Input
              value={enrollLabel}
              onChange={(e) => setEnrollLabel(e.target.value)}
              placeholder="Endpoint label (e.g. Finance-Laptop-01)"
              className="max-w-sm"
            />
            <Button onClick={handleGenerateEnrollment}>Generate Token</Button>
          </div>
          {enrollBundle && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Paste this JSON into the Sentinel Windows Agent Installer:</span>
                <Button variant="outline" size="sm" onClick={handleCopyBundle}>
                  {copied ? <Check className="w-3.5 h-3.5 mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                  {copied ? "Copied" : "Copy Config"}
                </Button>
              </div>
              <pre className="p-3 rounded-lg bg-muted/50 text-xs font-mono overflow-x-auto border border-border">
                {enrollBundle}
              </pre>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {displayList.map((ep) => {
          const badge = STATUS_BADGE[ep.computedStatus] || STATUS_BADGE.offline;
          return (
            <div
              key={ep.id}
              onClick={() => setSelectedEndpoint(ep)}
              className={cn(
                "glass-card p-6 rounded-xl border cursor-pointer transition-all hover:border-primary/60",
                selectedEndpoint?.id === ep.id ? "border-primary ring-1 ring-primary/40" : "border-border/60"
              )}
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex gap-3 items-center">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Laptop className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">{ep.hostname}</h3>
                    <p className="text-xs font-mono text-muted-foreground">
                      v{ep.agentVersion} • {ep.endpointId.slice(0, 12)}
                    </p>
                  </div>
                </div>
                <span className={cn("px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider border", badge.cls)}>
                  {badge.label}
                </span>
              </div>

              <div className="space-y-3">
                <div className="text-xs text-muted-foreground border-b border-border/50 pb-2 flex justify-between">
                  <span>{ep.osVersion}</span>
                  <span>
                    {ep.lastSeenAt ? `Seen ${ep.lastSeenAt.toLocaleTimeString()}` : "Never seen"}
                  </span>
                </div>

                {ep.latestMetrics ? (
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-muted/40 p-2 rounded flex flex-col items-center">
                      <Cpu className="w-4 h-4 text-primary mb-1" />
                      <span className="text-xs font-bold">{ep.latestMetrics.cpuPercent.toFixed(1)}%</span>
                      <span className="text-[10px] text-muted-foreground">CPU</span>
                    </div>
                    <div className="bg-muted/40 p-2 rounded flex flex-col items-center">
                      <Activity className="w-4 h-4 text-primary mb-1" />
                      <span className="text-xs font-bold">{ep.latestMetrics.memoryPercent.toFixed(1)}%</span>
                      <span className="text-[10px] text-muted-foreground">RAM</span>
                    </div>
                    <div className="bg-muted/40 p-2 rounded flex flex-col items-center">
                      <HardDrive className="w-4 h-4 text-warning mb-1" />
                      <span className="text-xs font-bold">{ep.latestMetrics.diskPercent.toFixed(1)}%</span>
                      <span className="text-[10px] text-muted-foreground">DISK</span>
                    </div>
                  </div>
                ) : (
                  <div className="h-16 flex items-center justify-center text-xs text-muted-foreground italic gap-2">
                    <WifiOff className="w-4 h-4" />
                    No telemetry received yet
                  </div>
                )}

                <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
                  <span className="flex items-center gap-1">
                    <RefreshCw className="w-3 h-3" />
                    Sync: {ep.syncState || "unknown"}
                    {(ep.pendingQueueCount ?? 0) > 0 ? ` (${ep.pendingQueueCount} queued)` : ""}
                  </span>
                  <span className="flex items-center gap-1">
                    {ep.firewallEnabled ? (
                      <ShieldCheck className="w-3.5 h-3.5 text-success" />
                    ) : (
                      <ShieldAlert className="w-3.5 h-3.5 text-warning" />
                    )}
                    FW {ep.firewallEnabled ? "ON" : "OFF"}
                  </span>
                </div>
              </div>
            </div>
          );
        })}

        {displayList.length === 0 && (
          <div className="col-span-full py-12 text-center border border-dashed border-border rounded-xl">
            <Server className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-25" />
            <h3 className="text-lg font-bold text-muted-foreground">No Windows Endpoints Enrolled</h3>
            <p className="text-sm text-muted-foreground/80 max-w-md mx-auto mt-2">
              {isFirebaseConfigured ? (
                <>
                  Click <strong>Enroll Windows Endpoint</strong> to generate a one-time pairing token
                  and run <code className="font-mono">SentinelAgentSetup.exe</code> on your Windows 10/11 host.
                </>
              ) : (
                "Configure Firebase Authentication and Firestore environment variables to enroll and monitor Windows endpoints."
              )}
            </p>
          </div>
        )}
      </div>

      {selectedEndpoint && isFirebaseConfigured && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4">
          <div className="glass-card p-5 rounded-xl border border-border/60 space-y-3">
            <h3 className="font-bold text-sm uppercase tracking-wider">
              Genuine Security Alerts — {selectedEndpoint.hostname}
            </h3>
            {alerts.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No alerts recorded for this endpoint.</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {alerts.map((al) => (
                  <div key={al.id} className="p-3 rounded-lg bg-muted/40 border border-border/60 text-xs space-y-1">
                    <div className="flex justify-between font-semibold">
                      <span>[{al.severity.toUpperCase()}] {al.ruleId}</span>
                      <span className="text-muted-foreground">{al.eventTime.toLocaleString()}</span>
                    </div>
                    <p>{al.reason}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="glass-card p-5 rounded-xl border border-border/60 space-y-3">
            <h3 className="font-bold text-sm uppercase tracking-wider">
              Safe Remote Firewall Policy (Allowlisted)
            </h3>
            <p className="text-xs text-muted-foreground">
              Creates a 60-minute outbound IP block policy. Private/loopback/link-local IPs are rejected by the agent unless lab mode is enabled.
            </p>
            <div className="flex flex-col gap-2">
              <Input
                value={blockIp}
                onChange={(e) => setBlockIp(e.target.value)}
                placeholder="Public IPv4/IPv6 (e.g. 203.0.113.50)"
              />
              <Input
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                placeholder="Justification / Ticket ID"
              />
              <Button onClick={handleCreateBlockPolicy} variant="secondary" size="sm" className="w-fit">
                Queue Outbound Block Policy
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NodesPage;
