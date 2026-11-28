import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Brain, Send, Sparkles, AlertTriangle, Shield, Lightbulb, KeyRound, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  EndpointAlertRecord,
  EndpointRecord,
  subscribeEndpointAlerts,
  subscribeEndpoints,
} from "@/lib/sentinelFirebaseRepo";
import { useWebSocket } from "@/hooks/useWebSocket";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

const SESSION_KEY_STORAGE = "sentinel_ai_session_key";
const SESSION_PROVIDER_STORAGE = "sentinel_ai_provider";

const quickActions = [
  { id: "endpoints", label: "Endpoint summary", icon: Lightbulb },
  { id: "connections", label: "Active network connections", icon: Sparkles },
  { id: "alerts", label: "Security alerts", icon: AlertTriangle },
  { id: "firewall", label: "Firewall status", icon: Shield },
];

const AIAnalystPage = () => {
  const { user } = useAuth();
  const { alerts: wsAlerts } = useWebSocket();

  const [endpoints, setEndpoints] = useState<EndpointRecord[]>([]);
  const [alertsByEp, setAlertsByEp] = useState<Record<string, EndpointAlertRecord[]>>({});
  const [apiKeyInput, setApiKeyInput] = useState<string>(
    () => sessionStorage.getItem(SESSION_KEY_STORAGE) || ""
  );
  const [provider, setProvider] = useState<"groq" | "openai">(
    () => (sessionStorage.getItem(SESSION_PROVIDER_STORAGE) as "groq" | "openai") || "groq"
  );
  const [isSending, setIsSending] = useState(false);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content:
        "Connected to live Firestore endpoint telemetry, active TCP sockets, and security alerts. Enter a session-only Groq/OpenAI key above for LLM analysis (kept in browser sessionStorage only — never written to Firestore or Git), or use deterministic summaries without an API key.",
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
      return;
    }
    const unsubs = endpoints.map((ep) =>
      subscribeEndpointAlerts(user.uid, ep.endpointId, (list) => {
        setAlertsByEp((prev) => ({ ...prev, [ep.endpointId]: list }));
      })
    );
    return () => unsubs.forEach((u) => u());
  }, [user?.uid, endpoints]);

  const allAlerts = Object.values(alertsByEp).flat();

  const buildGroundedSnapshot = () => {
    return {
      endpoints: endpoints.map((ep) => ({
        hostname: ep.hostname,
        status: ep.computedStatus,
        osVersion: ep.osVersion,
        firewallEnabled: ep.firewallEnabled,
        lastSeenAt: ep.lastSeenAt?.toISOString() || null,
        metrics: ep.latestMetrics || null,
        activeConnections: (ep.activeConnections || []).slice(0, 15),
      })),
      alerts: allAlerts.slice(0, 15).map((a) => ({
        ruleId: a.ruleId,
        severity: a.severity,
        reason: a.reason,
        status: a.status,
        eventTime: a.eventTime.toISOString(),
      })),
    };
  };

  const saveSessionKey = () => {
    const trimmed = apiKeyInput.trim();
    if (!trimmed) {
      sessionStorage.removeItem(SESSION_KEY_STORAGE);
      return;
    }
    sessionStorage.setItem(SESSION_KEY_STORAGE, trimmed);
    const detected = trimmed.startsWith("gsk_") ? "groq" : provider;
    setProvider(detected);
    sessionStorage.setItem(SESSION_PROVIDER_STORAGE, detected);
  };

  const clearSessionKey = () => {
    setApiKeyInput("");
    sessionStorage.removeItem(SESSION_KEY_STORAGE);
  };

  const buildDeterministicReply = (question: string): string => {
    const q = question.toLowerCase();
    if (q.includes("connection") || q.includes("network") || q.includes("traffic")) {
      const conns = endpoints.flatMap((e) =>
        (e.activeConnections || []).map((c) => `${e.hostname} | ${c.processName || "proc"} -> ${c.remoteHost || c.remoteAddress}:${c.remotePort} (${c.state})`)
      );
      if (conns.length === 0) {
        return "No active TCP connections reported yet by enrolled endpoints.";
      }
      return `Active TCP connections (${conns.length}):\n\n${conns.slice(0, 12).join("\n")}`;
    }

    if (q.includes("alert") || q.includes("threat")) {
      if (allAlerts.length === 0 && wsAlerts.length === 0) {
        return "No security alerts are currently recorded in Firestore for your enrolled endpoints.";
      }
      const lines = allAlerts
        .slice(0, 8)
        .map((a) => `[${a.severity.toUpperCase()}] ${a.ruleId}: ${a.reason}`);
      return `Recorded Firestore alerts (${allAlerts.length}):\n\n${lines.join("\n")}`;
    }

    if (q.includes("firewall")) {
      if (endpoints.length === 0) return "No endpoints enrolled to report Windows Firewall state.";
      return endpoints
        .map((e) => `- ${e.hostname}: Firewall ${e.firewallEnabled ? "ENABLED" : "DISABLED/UNKNOWN"} (${e.computedStatus})`)
        .join("\n");
    }

    if (endpoints.length === 0) {
      return "No Windows endpoints are enrolled yet. Connect a Windows endpoint first to inspect real telemetry.";
    }

    return endpoints
      .map(
        (e) =>
          `- ${e.hostname} (${e.computedStatus}): CPU ${e.latestMetrics?.cpuPercent?.toFixed(1) ?? "—"}%, RAM ${e.latestMetrics?.memoryPercent?.toFixed(1) ?? "—"}%, Disk ${e.latestMetrics?.diskPercent?.toFixed(1) ?? "—"}%, ${(e.activeConnections || []).length} TCP sockets`
      )
      .join("\n");
  };

  const handleSend = async (text: string) => {
    if (!text.trim() || isSending) return;
    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: text,
      timestamp: new Date().toLocaleTimeString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    const sessionKey = sessionStorage.getItem(SESSION_KEY_STORAGE) || apiKeyInput.trim();
    if (!sessionKey) {
      const reply = buildDeterministicReply(text);
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-det`,
          role: "assistant",
          content: reply,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
      return;
    }

    setIsSending(true);
    try {
      const endpointUrl =
        provider === "groq"
          ? "https://api.groq.com/openai/v1/chat/completions"
          : "https://api.openai.com/v1/chat/completions";
      const model = provider === "groq" ? "llama-3.3-70b-versatile" : "gpt-4o-mini";

      const res = await fetch(endpointUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          messages: [
            {
              role: "system",
              content:
                "You are a concise SOC Analyst. Answer strictly using the provided real endpoint telemetry, TCP connections, and alerts JSON. Never invent events, IPs, or alerts not present in the context.",
            },
            {
              role: "user",
              content: `LIVE TELEMETRY CONTEXT:\n${JSON.stringify(buildGroundedSnapshot())}\n\nANALYST QUESTION:\n${text}`,
            },
          ],
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`API returned ${res.status}: ${errText.slice(0, 220)}`);
      }

      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content =
        data.choices?.[0]?.message?.content || "LLM returned an empty response.";

      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-llm`,
          role: "assistant",
          content,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "LLM request failed.";
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-err`,
          role: "assistant",
          content: `LLM request failed (${msg}).\n\nDeterministic telemetry fallback:\n${buildDeterministicReply(text)}`,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
            <Brain className="w-7 h-7 text-primary" />
            SOC AI Analyst
          </h1>
          <p className="text-muted-foreground text-sm">
            Grounded in live Firestore telemetry ({endpoints.length} endpoint(s), {allAlerts.length} alert(s))
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="AI Provider"
            value={provider}
            onChange={(e) => {
              const p = e.target.value as "groq" | "openai";
              setProvider(p);
              sessionStorage.setItem(SESSION_PROVIDER_STORAGE, p);
            }}
            className="h-9 px-2.5 rounded-md border border-border bg-background text-xs"
          >
            <option value="groq">Groq API</option>
            <option value="openai">OpenAI-Compatible</option>
          </select>
          <div className="relative">
            <KeyRound className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="Session API key (never saved to DB)"
              className="pl-8 h-9 w-64 text-xs"
            />
          </div>
          <Button size="sm" variant="outline" onClick={saveSessionKey}>
            Use Session Key
          </Button>
          {apiKeyInput && (
            <Button size="sm" variant="ghost" onClick={clearSessionKey} title="Clear session key">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
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
              placeholder="Ask about your endpoints, active TCP connections, alerts, or firewall..."
              className="flex-1 bg-background/60"
            />
            <Button type="submit" disabled={isSending} className="gap-2">
              <Send className="w-4 h-4" />
              {isSending ? "Analyzing..." : "Send"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AIAnalystPage;
