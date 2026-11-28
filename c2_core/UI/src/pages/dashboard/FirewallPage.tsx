import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Lock,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Ban,
  Unlock,
  RefreshCw,
  Server,
  ArrowRight,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  createSafeFirewallPolicy,
  DesiredFirewallPolicyRecord,
  EndpointRecord,
  FirewallPolicyAck,
  subscribeEndpointPolicies,
  subscribeEndpoints,
  subscribePolicyAcks,
} from "@/lib/sentinelFirebaseRepo";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const FirewallPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [endpoints, setEndpoints] = useState<EndpointRecord[]>([]);
  const [selectedEndpointId, setSelectedEndpointId] = useState<string>("");
  const [policies, setPolicies] = useState<DesiredFirewallPolicyRecord[]>([]);
  const [acks, setAcks] = useState<FirewallPolicyAck[]>([]);

  const [targetIp, setTargetIp] = useState("");
  const [reason, setReason] = useState("");
  const [ttlMinutes, setTtlMinutes] = useState(60);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isFirebaseConfigured || !user?.uid) {
      setEndpoints([]);
      return;
    }
    return subscribeEndpoints(user.uid, (list) => {
      setEndpoints(list);
      if (list.length > 0 && !list.some((e) => e.endpointId === selectedEndpointId)) {
        setSelectedEndpointId(list[0].endpointId);
      }
    });
  }, [user?.uid, selectedEndpointId]);

  useEffect(() => {
    if (!isFirebaseConfigured || !user?.uid || !selectedEndpointId) {
      setPolicies([]);
      setAcks([]);
      return;
    }
    const unsubPol = subscribeEndpointPolicies(user.uid, selectedEndpointId, setPolicies);
    const unsubAck = subscribePolicyAcks(user.uid, selectedEndpointId, setAcks);
    return () => {
      unsubPol();
      unsubAck();
    };
  }, [user?.uid, selectedEndpointId]);

  const selectedEndpoint = endpoints.find((e) => e.endpointId === selectedEndpointId) || null;

  const submitPolicy = async (action: "block_ip" | "unblock_ip" | "query_status", ipOverride?: string) => {
    if (!user?.uid || !selectedEndpoint) return;
    const ipToUse = (ipOverride ?? targetIp).trim();
    if ((action === "block_ip" || action === "unblock_ip") && !ipToUse) {
      toast({ title: "Validation error", description: "Target IPv4/IPv6 is required.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const policyId = await createSafeFirewallPolicy({
        ownerUid: user.uid,
        endpointId: selectedEndpoint.endpointId,
        action,
        targetIp: action === "query_status" ? undefined : ipToUse,
        reason: reason.trim() || `${action} issued from Firewall Control`,
        ttlMinutes,
      });
      toast({
        title: "Firewall Policy Queued",
        description: `Policy ${policyId} created for ${selectedEndpoint.hostname}. Agent applies & acknowledges on next poll.`,
      });
      if (!ipOverride) {
        setTargetIp("");
        setReason("");
      }
    } catch (err: unknown) {
      toast({
        title: "Policy creation failed",
        description: err instanceof Error ? err.message : "Permission error",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Lock className="w-6 h-6 text-primary" />
            Allowlisted Remote Firewall Control
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Per-endpoint Windows Firewall enforcement via Firestore desired-policy &amp; agent acknowledgement
          </p>
        </div>

        <span
          className={cn(
            "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-mono border",
            selectedEndpoint?.firewallEnabled
              ? "border-success/30 bg-success/10 text-success"
              : "border-border bg-muted/40 text-muted-foreground"
          )}
        >
          {selectedEndpoint ? (
            selectedEndpoint.firewallEnabled ? (
              <>
                <ShieldCheck className="w-3.5 h-3.5" />
                HOST FIREWALL ON ({selectedEndpoint.hostname})
              </>
            ) : (
              <>
                <ShieldAlert className="w-3.5 h-3.5 text-warning" />
                HOST FIREWALL OFF / UNKNOWN
              </>
            )
          ) : (
            "NO ENDPOINT SELECTED"
          )}
        </span>
      </div>

      {endpoints.length === 0 ? (
        <div className="glass-card rounded-xl p-8 border border-border/60 text-center space-y-3">
          <Server className="w-10 h-10 text-muted-foreground mx-auto opacity-40" />
          <h2 className="text-base font-semibold text-foreground">No Windows Endpoints Enrolled</h2>
          <p className="text-sm text-muted-foreground max-w-lg mx-auto">
            Enroll a Windows endpoint first to inspect its real Windows Firewall status and queue
            allowlisted <code className="font-mono">SentinelSOC_Managed_*</code> outbound IP rules.
          </p>
          <Button asChild size="sm">
            <Link to="/dashboard/connect-endpoint" className="gap-2">
              Connect Windows Endpoint
              <ArrowRight className="w-4 h-4" />
            </Link>
          </Button>
        </div>
      ) : (
        <>
          {/* Endpoint Selector & Quick Status */}
          <div className="glass-card rounded-xl p-5 border border-border/60 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor="fw-endpoint-select" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Target Endpoint:
              </label>
              <select
                id="fw-endpoint-select"
                value={selectedEndpointId}
                onChange={(e) => setSelectedEndpointId(e.target.value)}
                className="bg-background border border-border rounded-lg px-3 py-2 text-sm font-medium text-foreground"
              >
                {endpoints.map((ep) => (
                  <option key={ep.endpointId} value={ep.endpointId}>
                    {ep.hostname} ({ep.computedStatus.toUpperCase()})
                  </option>
                ))}
              </select>
            </div>

            <Button
              variant="outline"
              size="sm"
              disabled={submitting || !selectedEndpoint}
              onClick={() => submitPolicy("query_status")}
              className="gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Query Managed Rules
            </Button>
          </div>

          {/* Safe Policy Creation Form */}
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="glass-card rounded-xl p-6 border border-border/60 space-y-4">
              <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                <Ban className="w-4 h-4 text-destructive" />
                Queue Outbound IP Block / Unblock Policy
              </h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Policies are validated by the Windows agent against a strict allowlist (public IPs
                only, explicit approval + TTL expiry, only{" "}
                <code className="font-mono">SentinelSOC_Managed_*</code> rules). Private/loopback IPs
                and arbitrary commands are rejected.
              </p>

              <div className="space-y-3">
                <Input
                  value={targetIp}
                  onChange={(e) => setTargetIp(e.target.value)}
                  placeholder="Target Public IPv4/IPv6 (e.g. 203.0.113.50)"
                />
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Justification / Incident ID"
                />
                <div className="flex items-center gap-3">
                  <select
                    aria-label="Policy expiry"
                    value={ttlMinutes}
                    onChange={(e) => setTtlMinutes(Number(e.target.value))}
                    className="h-9 px-3 rounded-md border border-border bg-background text-xs"
                  >
                    <option value={60}>Expires in 1 hour</option>
                    <option value={1440}>Expires in 24 hours</option>
                    <option value={10080}>Expires in 7 days</option>
                  </select>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={submitting}
                    onClick={() => submitPolicy("block_ip")}
                    className="gap-1.5"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    Block IP
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={submitting}
                    onClick={() => submitPolicy("unblock_ip")}
                    className="gap-1.5"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    Unblock IP
                  </Button>
                </div>
              </div>
            </div>

            {/* Agent Enforcement Acknowledgements */}
            <div className="glass-card rounded-xl p-6 border border-border/60 space-y-4">
              <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-success" />
                Endpoint Enforcement Results (Policy Acks)
              </h2>
              {acks.length === 0 ? (
                <p className="text-xs text-muted-foreground italic py-6 text-center">
                  No policy acknowledgements reported by {selectedEndpoint?.hostname} yet.
                </p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {acks.map((ack) => (
                    <div key={ack.id} className="p-3 rounded-lg bg-muted/40 border border-border/60 text-xs space-y-1">
                      <div className="flex items-center justify-between font-mono">
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded font-bold uppercase text-[10px]",
                            ack.state === "applied"
                              ? "bg-success/15 text-success"
                              : "bg-destructive/15 text-destructive"
                          )}
                        >
                          {ack.state}
                        </span>
                        <span className="text-muted-foreground">
                          {ack.acknowledgedAt.toLocaleString()}
                        </span>
                      </div>
                      <p className="font-mono text-muted-foreground">{ack.policyId}</p>
                      <p className="text-foreground break-words">{ack.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Desired Policies List */}
          <div className="glass-card rounded-xl p-6 border border-border/60 space-y-3">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" />
              Queued Policies for {selectedEndpoint?.hostname}
            </h2>
            {policies.length === 0 ? (
              <p className="text-xs text-muted-foreground">No firewall policies queued for this endpoint.</p>
            ) : (
              <div className="divide-y divide-border/50">
                {policies.map((pol) => (
                  <div key={pol.id} className="py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="space-y-0.5">
                      <p className="font-mono font-bold text-foreground">
                        {pol.action.toUpperCase()} {pol.targetIp || ""}
                      </p>
                      <p className="text-muted-foreground">{pol.reason}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1 text-muted-foreground font-mono">
                        <Clock className="w-3 h-3" />
                        Expires {pol.expiresAt.toLocaleString()}
                      </span>
                      {pol.action === "block_ip" && pol.targetIp && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={submitting}
                          onClick={() => submitPolicy("unblock_ip", pol.targetIp || undefined)}
                        >
                          Remove Block
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default FirewallPage;
