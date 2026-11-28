import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Brain, Send, Sparkles, AlertTriangle, Shield, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  EndpointAlertRecord,
  EndpointRecord,
  FirewallPolicyAck,
  subscribeEndpointAlerts,
  subscribeEndpoints,
  subscribePolicyAcks,
} from "@/lib/sentinelFirebaseRepo";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

const quickActions = [
  { id: "endpoints", label: "Endpoint summary", icon: Lightbulb },
  { id: "connections", label: "Active network connections", icon: Sparkles },
  { id: "alerts", label: "Security alerts", icon: AlertTriangle },
  { id: "firewall", label: "Firewall & policy status", icon: Shield },
];

const AIAnalystPage = () => {
  const { user } = useAuth();

  const [endpoints, setEndpoints] = useState<EndpointRecord[]>([]);
  const [alertsByEp, setAlertsByEp] = useState<Record<string, EndpointAlertRecord[]>>({});
  const [acksByEp, setAcksByEp] = useState<Record<string, FirewallPolicyAck[]>>({});

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Sentinel Telemetry Analyst is active and grounded strictly in live Firestore endpoint state, TCP connections, alerts, and policy acknowledgements. Select a quick check below or ask about any enrolled device, process, IP, or alert.",
      timestamp: new Date().toLocaleTimeString(),
    },
  ]);
  const [input, setInput] = useState("");

  useEffect(() => {
    if (!isFirebaseConfigured || !user?.uid) {
      setEndpoints([]);
      return;
    }
    return subscribeEndpoints(user.uid, setEndpoints);
  }, [user?.uid]);

  useEffect(() => {
    if (!isFirebaseConfigured || !user?.uid || endpoints.length === 0) {
      setAlertsByEp({});
      setAcksByEp({});
      return;
    }
    const unsubs = endpoints.flatMap((ep) => [
      subscribeEndpointAlerts(user.uid, ep.endpointId, (list) => {
        setAlertsByEp((prev) => ({ ...prev, [ep.endpointId]: list }));
      }),
      subscribePolicyAcks(user.uid, ep.endpointId, (list) => {
        setAcksByEp((prev) => ({ ...prev, [ep.endpointId]: list }));
      }),
    ]);
    return () => unsubs.forEach((u) => u());
  }, [user?.uid, endpoints]);

  const allAlerts = Object.values(alertsByEp).flat();
  const allAcks = Object.values(acksByEp).flat();

  const buildGroundedReply = (question: string): string => {
    const q = question.toLowerCase().trim();

    const matchedEndpoint = endpoints.find(
      (e) =>
        q.includes(e.hostname.toLowerCase()) ||
        q.includes(e.endpointId.toLowerCase())
    );

    if (matchedEndpoint && !q.includes("all") && !q.includes("summary")) {
      const m = matchedEndpoint.latestMetrics;
      const conns = matchedEndpoint.activeConnections || [];
      const epAlerts = alertsByEp[matchedEndpoint.endpointId] || [];
      return [
        `Endpoint: ${matchedEndpoint.hostname} (${matchedEndpoint.computedStatus.toUpperCase()})`,
        `OS: ${matchedEndpoint.osVersion} | Agent: v${matchedEndpoint.agentVersion}`,
        `Metrics: CPU ${m?.cpuPercent?.toFixed(1) ?? "—"}%, RAM ${m?.memoryPercent?.toFixed(1) ?? "—"}%, Disk ${m?.diskPercent?.toFixed(1) ?? "—"}%`,
        `Firewall: ${matchedEndpoint.firewallEnabled ? "ENABLED" : "DISABLED/UNSUPPORTED"} | Active Sockets: ${conns.length} | Alerts: ${epAlerts.length}`,
        conns.length > 0
          ? `Top connections:\n${conns
              .slice(0, 6)
              .map(
                (c) =>
                  `  - ${c.processName || "proc"} (${c.protocol}) -> ${c.remoteHost || c.remoteAddress}:${c.remotePort} [${c.state}]`
              )
              .join("\n")}`
          : "No active socket connections reported on last heartbeat.",
      ].join("\n");
    }

    if (q.includes("connection") || q.includes("network") || q.includes("traffic") || q.includes("socket") || q.includes("domain") || q.includes("ip")) {
      const conns = endpoints.flatMap((e) =>
        (e.activeConnections || []).map(
          (c) =>
            `${e.hostname} | ${c.processName || "proc"}${c.processId ? ` (${c.processId})` : ""} -> ${c.remoteHost || c.remoteAddress}:${c.remotePort} (${c.state})`
        )
      );
      if (conns.length === 0) {
        return "No active TCP connections reported yet by enrolled endpoints. Ensure Windows endpoints run SentinelAgentSetup v1.0.2+ or Android agents have readable socket telemetry.";
      }
      const filtered = conns.filter((line) => {
        const tokens = q.split(/\s+/).filter((t) => t.length > 2 && !["analyze", "active", "network", "connections", "traffic", "show"].includes(t));
        return tokens.length === 0 || tokens.some((t) => line.toLowerCase().includes(t));
      });
      const shown = filtered.length > 0 ? filtered : conns;
      return `Observed connections (${shown.length} of ${conns.length}):\n\n${shown.slice(0, 15).join("\n")}`;
    }

    if (q.includes("alert") || q.includes("threat")) {
      if (allAlerts.length === 0) {
        return "No security alerts are currently recorded in Firestore for your enrolled endpoints.";
      }
      const lines = allAlerts
        .slice(0, 10)
        .map((a) => `[${a.severity.toUpperCase()}] ${a.ruleId} (${a.status}): ${a.reason}`);
      return `Recorded Firestore alerts (${allAlerts.length}):\n\n${lines.join("\n")}`;
    }

    if (q.includes("firewall") || q.includes("policy") || q.includes("ack")) {
      if (endpoints.length === 0) return "No endpoints enrolled to report firewall or policy state.";
      const fwLines = endpoints.map(
        (e) =>
          `- ${e.hostname}: Firewall ${e.firewallEnabled ? "ENABLED" : "DISABLED/UNSUPPORTED"} (${e.computedStatus.toUpperCase()})`
      );
      const ackLines =
        allAcks.length > 0
          ? `\n\nRecent Policy Acknowledgements (${allAcks.length}):\n` +
            allAcks
              .slice(0, 6)
              .map((a) => `- ${a.endpointId.slice(0, 10)} | ${a.policyId}: [${a.state.toUpperCase()}] ${a.message}`)
              .join("\n")
          : "\n\nNo policy acknowledgements recorded yet.";
      return fwLines.join("\n") + ackLines;
    }

    if (endpoints.length === 0) {
      return "No endpoints are enrolled yet. Open Connect Endpoint to download and enroll Windows or Android endpoints.";
    }

    return [
      `Enrolled Endpoints (${endpoints.length}):`,
      ...endpoints.map(
        (e) =>
          `- ${e.hostname} (${e.computedStatus.toUpperCase()}, ${e.osVersion}): CPU ${e.latestMetrics?.cpuPercent?.toFixed(1) ?? "—"}%, RAM ${e.latestMetrics?.memoryPercent?.toFixed(1) ?? "—"}%, Disk ${e.latestMetrics?.diskPercent?.toFixed(1) ?? "—"}%, ${(e.activeConnections || []).length} sockets`
      ),
      `Open/Recorded Alerts: ${allAlerts.length} | Recent Policy ACKs: ${allAcks.length}`,
    ].join("\n");
  };

  const handleSend = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const nowLabel = new Date().toLocaleTimeString();
    const userMsg: Message = {
      id: `${Date.now()}-u`,
      role: "user",
      content: trimmed,
      timestamp: nowLabel,
    };
    const replyMsg: Message = {
      id: `${Date.now()}-a`,
      role: "assistant",
      content: buildGroundedReply(trimmed),
      timestamp: nowLabel,
    };
    setMessages((prev) => [...prev, userMsg, replyMsg]);
    setInput("");
  };

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
            <Brain className="w-7 h-7 text-primary" />
            SOC Telemetry Analyst
          </h1>
          <p className="text-muted-foreground text-sm">
            Grounded strictly in live Firestore telemetry ({endpoints.length} endpoint(s), {allAlerts.length} alert(s), {allAcks.length} policy ack(s))
          </p>
        </div>
      </div>

      <div className="flex-1 cyber-border bg-card/80 backdrop-blur-sm rounded-xl overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((message, index) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03 }}
              className={cn(
                "flex gap-3",
                message.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              {message.role === "assistant" && (
                <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                  <Brain className="w-4 h-4 text-primary" />
                </div>
              )}
              <div
                className={cn(
                  "max-w-[75%] rounded-lg p-4",
                  message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/60 text-foreground font-mono text-sm"
                )}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
                <span className="text-xs opacity-60 mt-2 block">{message.timestamp}</span>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="px-4 py-3 border-t border-border">
          <div className="flex gap-2 flex-wrap">
            {quickActions.map((action) => (
              <Button
                key={action.id}
                variant="outline"
                size="sm"
                onClick={() => handleSend(`Analyze ${action.label}`)}
                className="gap-2 text-xs"
              >
                <action.icon className="w-3 h-3" />
                {action.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="p-4 border-t border-border bg-card/60">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend(input);
            }}
            className="flex gap-3"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about enrolled endpoints, active connections, alerts, or policy status..."
              className="flex-1 bg-background/60"
            />
            <Button type="submit" className="gap-2">
              <Send className="w-4 h-4" />
              Analyze
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AIAnalystPage;
