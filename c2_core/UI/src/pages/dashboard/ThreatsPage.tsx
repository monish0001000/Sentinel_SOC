import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Shield, CheckCircle2, Server } from "lucide-react";
import { ThreatCard } from "@/components/dashboard/ThreatCard";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useAuth } from "@/context/AuthContext";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  acknowledgeEndpointAlert,
  EndpointAlertRecord,
  EndpointRecord,
  subscribeEndpointAlerts,
  subscribeEndpoints,
} from "@/lib/sentinelFirebaseRepo";
import { AnimatedCounter } from "@/components/dashboard/AnimatedCounter";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const ThreatsPage = () => {
  const { threats: wsThreats, connectionStatus } = useWebSocket();
  const { user } = useAuth();
  const { toast } = useToast();
  const [endpoints, setEndpoints] = useState<EndpointRecord[]>([]);
  const [alertsByEndpoint, setAlertsByEndpoint] = useState<Record<string, EndpointAlertRecord[]>>({});

  useEffect(() => {
    if (!isFirebaseConfigured || !user?.uid) {
      setEndpoints([]);
      return;
    }
    return subscribeEndpoints(user.uid, setEndpoints);
  }, [user?.uid]);

  useEffect(() => {
    if (!isFirebaseConfigured || !user?.uid || endpoints.length === 0) {
      setAlertsByEndpoint({});
      return;
    }
    const unsubs = endpoints.map((ep) =>
      subscribeEndpointAlerts(user.uid, ep.endpointId, (list) => {
        setAlertsByEndpoint((prev) => ({ ...prev, [ep.endpointId]: list }));
      })
    );
    return () => unsubs.forEach((u) => u());
  }, [user?.uid, endpoints]);

  const firestoreAlerts = Object.values(alertsByEndpoint)
    .flat()
    .sort((a, b) => b.eventTime.getTime() - a.eventTime.getTime());

  const criticalCount = isFirebaseConfigured
    ? firestoreAlerts.filter((a) => a.severity === "critical").length
    : wsThreats.filter((t) => t.severity === "critical").length;
  const highCount = isFirebaseConfigured
    ? firestoreAlerts.filter((a) => a.severity === "high").length
    : wsThreats.filter((t) => t.severity === "high").length;
  const mediumCount = isFirebaseConfigured
    ? firestoreAlerts.filter((a) => a.severity === "medium").length
    : wsThreats.filter((t) => t.severity === "medium").length;
  const lowCount = isFirebaseConfigured
    ? firestoreAlerts.filter((a) => a.severity === "low").length
    : wsThreats.filter((t) => t.severity === "low").length;

  const totalCount = isFirebaseConfigured ? firestoreAlerts.length : wsThreats.length;

  const handleAcknowledge = async (al: EndpointAlertRecord) => {
    if (!user?.uid) return;
    try {
      await acknowledgeEndpointAlert(user.uid, al.endpointId, al.id);
      toast({ title: "Alert acknowledged", description: `${al.ruleId} marked acknowledged.` });
    } catch (err: unknown) {
      toast({
        title: "Failed to acknowledge alert",
        description: err instanceof Error ? err.message : "Permission denied",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Threat Detection &amp; Alerts</h1>
          <p className="text-muted-foreground text-sm">
            Evidence-backed security incidents reported by enrolled Windows endpoints
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/40 border border-border/50 self-start">
          <Server className="w-4 h-4 text-primary" />
          <span className="text-xs font-mono text-muted-foreground">
            {isFirebaseConfigured
              ? `${endpoints.length} FIRESTORE ENDPOINT(S)`
              : connectionStatus === "connected"
                ? "LIVE STREAM"
                : "STREAM OFFLINE"}
          </span>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-4"
      >
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 glass-card">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            <span className="text-sm text-muted-foreground">Critical</span>
          </div>
          <AnimatedCounter value={criticalCount} className="text-3xl font-bold text-destructive font-mono" />
        </div>
        <div className="p-4 rounded-lg bg-threat-high/10 border border-threat-high/20 glass-card">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-5 h-5 text-threat-high" />
            <span className="text-sm text-muted-foreground">High</span>
          </div>
          <AnimatedCounter value={highCount} className="text-3xl font-bold text-threat-high font-mono" />
        </div>
        <div className="p-4 rounded-lg bg-warning/10 border border-warning/20 glass-card">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-5 h-5 text-warning" />
            <span className="text-sm text-muted-foreground">Medium</span>
          </div>
          <AnimatedCounter value={mediumCount} className="text-3xl font-bold text-warning font-mono" />
        </div>
        <div className="p-4 rounded-lg bg-success/10 border border-success/20 glass-card">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-5 h-5 text-success" />
            <span className="text-sm text-muted-foreground">Low</span>
          </div>
          <AnimatedCounter value={lowCount} className="text-3xl font-bold text-success font-mono" />
        </div>
      </motion.div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Reported Alerts</h2>
          <span className="text-xs font-mono text-muted-foreground">{totalCount} recorded</span>
        </div>

        {totalCount === 0 ? (
          <div className="text-center py-12 text-muted-foreground glass-card rounded-xl border border-border/50 px-6">
            <Shield className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
            <p className="font-mono text-sm text-foreground">No security alerts recorded</p>
            <p className="text-xs mt-1">
              {isFirebaseConfigured
                ? "Genuine detection alerts uploaded by enrolled Windows agents will appear here."
                : "Configure Firebase or connect a live stream to view alerts."}
            </p>
          </div>
        ) : isFirebaseConfigured ? (
          <div className="grid gap-4">
            {firestoreAlerts.map((al) => (
              <div
                key={`${al.endpointId}-${al.id}`}
                className="glass-card p-4 rounded-xl border border-border/60 space-y-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-primary/10 text-primary">
                      {al.severity}
                    </span>
                    <span className="font-semibold text-sm text-foreground">{al.ruleId}</span>
                    <span className="text-xs font-mono text-muted-foreground">
                      Endpoint: {al.endpointId.slice(0, 12)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground font-mono">
                      {al.eventTime.toLocaleString()}
                    </span>
                    {al.status !== "acknowledged" ? (
                      <Button size="sm" variant="outline" onClick={() => handleAcknowledge(al)}>
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                        Acknowledge
                      </Button>
                    ) : (
                      <span className="text-xs font-mono text-success px-2 py-0.5 rounded bg-success/10">
                        ACKNOWLEDGED
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">{al.reason}</p>
                {al.evidence && Object.keys(al.evidence).length > 0 && (
                  <pre className="p-2.5 rounded-lg bg-muted/40 border border-border/50 text-xs font-mono overflow-x-auto">
                    {JSON.stringify(al.evidence, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-4">
            {wsThreats.map((threat, index) => (
              <ThreatCard key={threat.id || `threat-${index}`} threat={threat} index={index} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ThreatsPage;
