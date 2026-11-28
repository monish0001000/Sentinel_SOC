import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Shield, ArrowRight, Clock, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  DesiredFirewallPolicyRecord,
  EndpointRecord,
  FirewallPolicyAck,
  subscribeEndpointPolicies,
  subscribeEndpoints,
  subscribePolicyAcks,
} from "@/lib/sentinelFirebaseRepo";
import { cn } from "@/lib/utils";

const PoliciesPage = () => {
  const { user } = useAuth();
  const [endpoints, setEndpoints] = useState<EndpointRecord[]>([]);
  const [policiesByEp, setPoliciesByEp] = useState<Record<string, DesiredFirewallPolicyRecord[]>>({});
  const [acksByEp, setAcksByEp] = useState<Record<string, FirewallPolicyAck[]>>({});

  useEffect(() => {
    if (!isFirebaseConfigured || !user?.uid) {
      setEndpoints([]);
      return;
    }
    return subscribeEndpoints(user.uid, setEndpoints);
  }, [user?.uid]);

  useEffect(() => {
    if (!isFirebaseConfigured || !user?.uid || endpoints.length === 0) {
      setPoliciesByEp({});
      setAcksByEp({});
      return;
    }
    const unsubs: (() => void)[] = [];
    endpoints.forEach((ep) => {
      unsubs.push(
        subscribeEndpointPolicies(user.uid, ep.endpointId, (list) => {
          setPoliciesByEp((prev) => ({ ...prev, [ep.endpointId]: list }));
        })
      );
      unsubs.push(
        subscribePolicyAcks(user.uid, ep.endpointId, (list) => {
          setAcksByEp((prev) => ({ ...prev, [ep.endpointId]: list }));
        })
      );
    });
    return () => unsubs.forEach((u) => u());
  }, [user?.uid, endpoints]);

  const allPolicies = Object.values(policiesByEp)
    .flat()
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const allAcks = Object.values(acksByEp).flat();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary" />
            Firewall Policy Engine
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Allowlisted per-endpoint policies and Windows agent enforcement status
          </p>
        </div>

        <Button asChild size="sm">
          <Link to="/dashboard/firewall" className="gap-2">
            Manage Firewall Policies
            <ArrowRight className="w-4 h-4" />
          </Link>
        </Button>
      </div>

      {allPolicies.length === 0 ? (
        <div className="glass-card rounded-xl p-8 border border-border/60 space-y-3 text-center">
          <Shield className="w-10 h-10 text-muted-foreground mx-auto opacity-40" />
          <h2 className="text-base font-semibold text-foreground">No Endpoint Policies Queued</h2>
          <p className="text-sm text-muted-foreground max-w-xl mx-auto">
            {endpoints.length === 0
              ? "Enroll a Windows endpoint first, then queue allowlisted outbound policies from Firewall Control."
              : "No firewall policies have been created for your enrolled endpoints yet."}
          </p>
        </div>
      ) : (
        <div className="glass-card rounded-xl border border-border/60 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-muted/40 text-muted-foreground uppercase border-b border-border/60">
                <tr>
                  <th className="p-3">Endpoint</th>
                  <th className="p-3">Action</th>
                  <th className="p-3">Target IP</th>
                  <th className="p-3">Reason</th>
                  <th className="p-3">Expires</th>
                  <th className="p-3">Agent Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {allPolicies.map((pol) => {
                  const ep = endpoints.find((e) => e.endpointId === pol.targetEndpointId);
                  const ack = allAcks.find((a) => a.policyId === pol.id);
                  return (
                    <tr key={pol.id} className="hover:bg-accent/30">
                      <td className="p-3 font-semibold">{ep?.hostname || pol.targetEndpointId.slice(0, 10)}</td>
                      <td className="p-3 uppercase">{pol.action}</td>
                      <td className="p-3 text-primary">{pol.targetIp || "—"}</td>
                      <td className="p-3">{pol.reason}</td>
                      <td className="p-3 text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {pol.expiresAt.toLocaleString()}
                      </td>
                      <td className="p-3">
                        {ack ? (
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 px-2 py-0.5 rounded uppercase text-[10px] font-bold",
                              ack.state === "applied"
                                ? "bg-success/15 text-success"
                                : "bg-destructive/15 text-destructive"
                            )}
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            {ack.state}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">PENDING</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default PoliciesPage;
