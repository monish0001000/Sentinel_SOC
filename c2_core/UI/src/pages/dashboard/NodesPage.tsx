import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Server,
  Cpu,
  HardDrive,
  Activity,
  Laptop,
  Smartphone,
  Plus,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  WifiOff,
  Trash2,
  PauseCircle,
  PlayCircle,
  Unplug,
  Terminal,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { isFirebaseConfigured } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import {
  createSafeFirewallPolicy,
  EndpointAlertRecord,
  EndpointComputedStatus,
  EndpointRecord,
  FirewallPolicyAck,
  removeEndpointCompletely,
  setEndpointRevoked,
  subscribeEndpointAlerts,
  subscribeEndpoints,
  subscribePolicyAcks,
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
  revoked: { label: "PAUSED / REVOKED", cls: "bg-warning/15 text-warning border-warning/40" },
  error: { label: "ERROR", cls: "bg-destructive/15 text-destructive border-destructive/30" },
};

const NodesPage = () => {
  const { agents: wsAgents } = useWebSocket();
  const { user } = useAuth();
  const { toast } = useToast();

  const [endpoints, setEndpoints] = useState<EndpointRecord[]>([]);
  const [selectedEndpointId, setSelectedEndpointId] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<EndpointAlertRecord[]>([]);
  const [acks, setAcks] = useState<FirewallPolicyAck[]>([]);

  const [blockIp, setBlockIp] = useState("");
  const [blockReason, setBlockReason] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

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

  const selectedEndpoint =
    displayList.find((e) => e.endpointId === selectedEndpointId) || null;

  useEffect(() => {
    if (!isFirebaseConfigured || !currentUid || !selectedEndpoint) {
      setAlerts([]);
      setAcks([]);
      return;
    }
    const unsubAlerts = subscribeEndpointAlerts(
      currentUid,
      selectedEndpoint.endpointId,
      setAlerts
    );
    const unsubAcks = subscribePolicyAcks(
      currentUid,
      selectedEndpoint.endpointId,
      setAcks
    );
    return () => {
      unsubAlerts();
      unsubAcks();
    };
  }, [currentUid, selectedEndpoint]);

  const queueControlAction = async (
    ep: EndpointRecord,
    action: "sync_now" | "query_status" | "unenroll_agent",
    reason: string
  ) => {
    if (!currentUid) return;
    setBusyAction(`${ep.endpointId}:${action}`);
    try {
      const policyId = await createSafeFirewallPolicy({
        ownerUid: currentUid,
        endpointId: ep.endpointId,
        action,
        reason,
        ttlMinutes: 15,
      });
      toast({
        title: action === "unenroll_agent" ? "Remote unenroll sent" : "Control command queued",
        description: `Command ${action} (${policyId.slice(0, 14)}) queued for ${ep.hostname}. Agent polls every 15s.`,
      });
    } catch (err: unknown) {
      toast({
        title: "Command failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleToggleRevoke = async (ep: EndpointRecord) => {
    if (!currentUid) return;
    const nextRevoked = !ep.revoked;
    setBusyAction(`${ep.endpointId}:revoke`);
    try {
      await setEndpointRevoked(currentUid, ep.endpointId, nextRevoked);
      toast({
        title: nextRevoked ? "Endpoint paused / revoked" : "Endpoint resumed",
        description: nextRevoked
          ? `${ep.hostname} is now blocked by Firestore rules from sending telemetry until resumed.`
          : `${ep.hostname} can resume syncing telemetry and polling policies.`,
      });
    } catch (err: unknown) {
      toast({
        title: "Status update failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleRemoveEndpoint = async (ep: EndpointRecord, sendRemoteUnenrollFirst: boolean) => {
    if (!currentUid) return;
    setBusyAction(`${ep.endpointId}:remove`);
    try {
      if (sendRemoteUnenrollFirst && !ep.revoked) {
        await createSafeFirewallPolicy({
          ownerUid: currentUid,
          endpointId: ep.endpointId,
          action: "unenroll_agent",
          reason: "Owner unenrolled endpoint from EDR console",
          ttlMinutes: 15,
        });
        toast({
          title: "Unenroll command sent",
          description: `${ep.hostname} will wipe its local identity and stop its service within ~15s. Click "Delete Record Now" once you want to remove the row from the console.`,
        });
        setConfirmRemoveId(null);
        return;
      }

      await removeEndpointCompletely(currentUid, ep.endpointId, ep.hostname);
      if (selectedEndpointId === ep.endpointId) {
        setSelectedEndpointId(null);
      }
      setConfirmRemoveId(null);
      toast({
        title: "Endpoint removed",
        description: `${ep.hostname} and its telemetry/alerts/policies have been removed from Firestore.`,
      });
    } catch (err: unknown) {
      toast({
        title: "Removal failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleFirewallIpPolicy = async (action: "block_ip" | "unblock_ip") => {
    if (!currentUid || !selectedEndpoint) return;
    if (!blockIp.trim() || !blockReason.trim()) {
      toast({
        title: "Validation error",
        description: "Target IP and justification reason are required.",
        variant: "destructive",
      });
      return;
    }
    setBusyAction(`${selectedEndpoint.endpointId}:${action}`);
    try {
      const policyId = await createSafeFirewallPolicy({
        ownerUid: currentUid,
        endpointId: selectedEndpoint.endpointId,
        action,
        targetIp: blockIp.trim(),
        reason: blockReason.trim(),
        ttlMinutes: 60,
      });
      toast({
        title: `Policy ${action} queued`,
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
    } finally {
      setBusyAction(null);
    }
  };

  const onlineCount = displayList.filter((e) => e.computedStatus === "online").length;

  return (
    <div className="space-y-6 text-foreground">
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Server className="w-7 h-7 text-primary" />
            Enrolled Endpoints (EDR)
          </h1>
          <p className="text-muted-foreground font-mono text-xs mt-1">
            WINDOWS &amp; ANDROID TELEMETRY, LIVE CONTROLS, FIREWALL ENFORCEMENT &amp; LIFECYCLE
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
            <Button asChild size="sm">
              <Link to="/dashboard/connect-endpoint" className="gap-1.5">
                <Plus className="w-4 h-4" />
                Connect Windows / Android
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {displayList.map((ep) => {
          const badge = STATUS_BADGE[ep.computedStatus] || STATUS_BADGE.offline;
          const isMobile = ep.osVersion.toLowerCase().includes("android");
          const isConfirmingRemove = confirmRemoveId === ep.endpointId;
          return (
            <div
              key={ep.id}
              onClick={() => setSelectedEndpointId(ep.endpointId)}
              className={cn(
                "glass-card p-6 rounded-xl border cursor-pointer transition-all hover:border-primary/60 flex flex-col justify-between gap-4",
                selectedEndpoint?.endpointId === ep.endpointId
                  ? "border-primary ring-1 ring-primary/40"
                  : "border-border/60"
              )}
            >
              <div>
                <div className="flex justify-between items-start mb-4 gap-2">
                  <div className="flex gap-3 items-center min-w-0">
                    <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                      {isMobile ? (
                        <Smartphone className="w-6 h-6 text-primary" />
                      ) : (
                        <Laptop className="w-6 h-6 text-primary" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-lg truncate">{ep.hostname}</h3>
                      <p className="text-xs font-mono text-muted-foreground truncate">
                        v{ep.agentVersion} • {ep.endpointId.slice(0, 12)}
                      </p>
                    </div>
                  </div>
                  <span
                    className={cn(
                      "px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider border shrink-0",
                      badge.cls
                    )}
                  >
                    {badge.label}
                  </span>
                </div>

                <div className="space-y-3">
                  <div className="text-xs text-muted-foreground border-b border-border/50 pb-2 flex justify-between gap-2">
                    <span className="truncate">{ep.osVersion}</span>
                    <span className="shrink-0">
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
                        <span className="text-[10px] text-muted-foreground">STORAGE</span>
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
                      {(ep.activeConnections || []).length} sockets • Sync: {ep.syncState || "unknown"}
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

              {isFirebaseConfigured && (
                <div
                  className="pt-3 border-t border-border/50 space-y-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1"
                      disabled={Boolean(busyAction) || Boolean(ep.revoked)}
                      onClick={() =>
                        queueControlAction(ep, "sync_now", "Manual telemetry & connection refresh from EDR console")
                      }
                    >
                      <RefreshCw className="w-3 h-3" />
                      Sync Now
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1"
                      disabled={Boolean(busyAction)}
                      onClick={() => handleToggleRevoke(ep)}
                    >
                      {ep.revoked ? (
                        <>
                          <PlayCircle className="w-3 h-3 text-success" />
                          Resume
                        </>
                      ) : (
                        <>
                          <PauseCircle className="w-3 h-3 text-warning" />
                          Pause / Revoke
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs gap-1 text-destructive hover:text-destructive ml-auto"
                      disabled={Boolean(busyAction)}
                      onClick={() =>
                        setConfirmRemoveId(isConfirmingRemove ? null : ep.endpointId)
                      }
                    >
                      <Trash2 className="w-3 h-3" />
                      Remove
                    </Button>
                  </div>

                  {isConfirmingRemove && (
                    <div className="p-2.5 rounded-lg bg-destructive/10 border border-destructive/30 space-y-2 text-xs">
                      <p className="text-foreground font-medium flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />
                        Remove or unenroll {ep.hostname}?
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {!ep.revoked && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1"
                            disabled={Boolean(busyAction)}
                            onClick={() => handleRemoveEndpoint(ep, true)}
                          >
                            <Unplug className="w-3 h-3" />
                            Unenroll Agent
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-7 text-xs gap-1"
                          disabled={Boolean(busyAction)}
                          onClick={() => handleRemoveEndpoint(ep, false)}
                        >
                          <Trash2 className="w-3 h-3" />
                          Delete Record Now
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() => setConfirmRemoveId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {displayList.length === 0 && (
          <div className="col-span-full py-12 text-center border border-dashed border-border rounded-xl">
            <Server className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-25" />
            <h3 className="text-lg font-bold text-muted-foreground">No Endpoints Enrolled</h3>
            <p className="text-sm text-muted-foreground/80 max-w-md mx-auto mt-2">
              {isFirebaseConfigured ? (
                <>
                  Open <strong>Connect Windows / Android</strong> to download{" "}
                  <code className="font-mono">SentinelAgentSetup.exe</code> or{" "}
                  <code className="font-mono">SentinelAgent.apk</code> and generate an enrollment bundle.
                </>
              ) : (
                "Configure Firebase Authentication and Firestore environment variables to enroll and monitor endpoints."
              )}
            </p>
          </div>
        )}
      </div>

      {selectedEndpoint && isFirebaseConfigured && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-4">
          <div className="glass-card p-5 rounded-xl border border-border/60 space-y-3">
            <h3 className="font-bold text-sm uppercase tracking-wider">
              Endpoint Controls — {selectedEndpoint.hostname}
            </h3>
            <p className="text-xs text-muted-foreground">
              Commands are queued in Firestore and executed by the running Windows or Android agent every 15s.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={Boolean(busyAction) || Boolean(selectedEndpoint.revoked)}
                onClick={() =>
                  queueControlAction(
                    selectedEndpoint,
                    "sync_now",
                    "Immediate telemetry & active sockets sync"
                  )
                }
                className="gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Force Sync Now
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={Boolean(busyAction) || Boolean(selectedEndpoint.revoked)}
                onClick={() =>
                  queueControlAction(
                    selectedEndpoint,
                    "query_status",
                    "Query host firewall rules and posture"
                  )
                }
                className="gap-1.5"
              >
                <Terminal className="w-3.5 h-3.5" />
                Query Firewall Rules
              </Button>
              <Button
                size="sm"
                variant={selectedEndpoint.revoked ? "default" : "secondary"}
                disabled={Boolean(busyAction)}
                onClick={() => handleToggleRevoke(selectedEndpoint)}
                className="gap-1.5"
              >
                {selectedEndpoint.revoked ? (
                  <>
                    <PlayCircle className="w-3.5 h-3.5" />
                    Resume Access
                  </>
                ) : (
                  <>
                    <PauseCircle className="w-3.5 h-3.5" />
                    Pause / Revoke Access
                  </>
                )}
              </Button>
            </div>

            <div className="pt-2 border-t border-border/50 space-y-2">
              <p className="text-xs font-semibold">Outbound IP Firewall Control (Allowlisted)</p>
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
              <div className="flex gap-2">
                <Button
                  onClick={() => handleFirewallIpPolicy("block_ip")}
                  variant="destructive"
                  size="sm"
                  disabled={Boolean(busyAction) || Boolean(selectedEndpoint.revoked)}
                >
                  Block IP
                </Button>
                <Button
                  onClick={() => handleFirewallIpPolicy("unblock_ip")}
                  variant="outline"
                  size="sm"
                  disabled={Boolean(busyAction) || Boolean(selectedEndpoint.revoked)}
                >
                  Unblock IP
                </Button>
              </div>
            </div>
          </div>

          <div className="glass-card p-5 rounded-xl border border-border/60 space-y-3">
            <h3 className="font-bold text-sm uppercase tracking-wider">
              Command &amp; Policy Acknowledgements ({acks.length})
            </h3>
            {acks.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                No command acknowledgements reported by {selectedEndpoint.hostname} yet.
              </p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {acks.map((ack) => (
                  <div key={ack.id} className="p-3 rounded-lg bg-muted/40 border border-border/60 text-xs space-y-1">
                    <div className="flex justify-between font-semibold items-center gap-2">
                      <span className="flex items-center gap-1.5">
                        {ack.state === "applied" ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-warning" />
                        )}
                        {ack.state.toUpperCase()} · {ack.policyId}
                      </span>
                      <span className="text-muted-foreground shrink-0">
                        {ack.acknowledgedAt.toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-muted-foreground">{ack.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="glass-card p-5 rounded-xl border border-border/60 space-y-3">
            <h3 className="font-bold text-sm uppercase tracking-wider">
              Security Alerts ({alerts.length})
            </h3>
            {alerts.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No alerts recorded for this endpoint.</p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
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
        </div>
      )}
    </div>
  );
};

export default NodesPage;
