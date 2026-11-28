import { useWebSocket } from "@/hooks/useWebSocket";
import { useState } from "react";
import { motion } from "framer-motion";
import { Brain, Send, Sparkles, AlertTriangle, Shield, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

const quickActions = [
  { id: "explain", label: "Summarize latest alert", icon: Lightbulb },
  { id: "suspicious", label: "Summarize alerts", icon: AlertTriangle },
  { id: "attackType", label: "Alert types", icon: Shield },
  { id: "recommendation", label: "Firewall status", icon: Sparkles },
];

const AIAnalystPage = () => {
  const { alerts, metrics, stats, firewall, connected } = useWebSocket();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content:
        "This page summarizes connected dashboard telemetry using deterministic rules. No LLM or AI inference backend is connected in this build.",
      timestamp: new Date().toLocaleTimeString(),
    },
  ]);
  const [input, setInput] = useState("");

  const handleSend = (message: string) => {
    if (!message.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: message,
      timestamp: new Date().toLocaleTimeString(),
    };

    const lowerMsg = message.toLowerCase();
    let responseContent = "";

    if (lowerMsg.includes("threat") || lowerMsg.includes("alert") || lowerMsg.includes("suspicious")) {
      if (alerts.length === 0) {
        responseContent =
          "There are no active alerts in the current session feed. This does not imply the host is secure; no alert events have been received.";
      } else {
        const latest = alerts[alerts.length - 1] as { level?: string; severity?: string; message?: string; description?: string };
        responseContent = `Current session alerts: ${alerts.length}\n\nLatest alert: [${latest.level || latest.severity || "unknown"}] ${latest.message || latest.description || "No message provided"}\n\nThis is a direct summary of received data, not an AI verdict.`;
      }
    } else if (lowerMsg.includes("status") || lowerMsg.includes("system")) {
      responseContent = `Live stream snapshot\n- Stream status: ${connected ? "connected" : "not connected"}\n- Packet rate: ${metrics?.packet_rate ?? "not available"}/sec\n- Active connections: ${metrics?.connections ?? "not available"}\n- Connection events: ${stats?.totalPackets ?? 0}\n- Current alerts: ${alerts.length}`;
    } else if (lowerMsg.includes("firewall") || lowerMsg.includes("block")) {
      responseContent = `Legacy firewall service state\n- Active flag: ${firewall.active}\n- Auto-block flag: ${firewall.autoBlock}\n- Policy entries: ${firewall.rules.length}\n- Blocked IP entries: ${firewall.blockedIPs.length}\n\nRemote firewall enforcement requires the Firestore endpoint policy flow on Endpoints (EDR).`;
    } else {
      responseContent =
        "No AI model is connected in this build. I can summarize received session alerts, telemetry counters, and firewall flags only.";
    }

    const assistantMessage: Message = {
      id: `${Date.now()}-assistant`,
      role: "assistant",
      content: responseContent,
      timestamp: new Date().toLocaleTimeString(),
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setInput("");
  };

  const handleQuickAction = (action: string) => {
    const prompts = {
      explain: "Summarize the latest alert",
      suspicious: "Summarize the current alerts",
      attackType: "What alert types are currently present?",
      recommendation: "Show the current firewall status",
    };
    handleSend(prompts[action as keyof typeof prompts]);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)]">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
          <Brain className="w-7 h-7 text-primary" />
          SOC Context Assistant
        </h1>
        <p className="text-muted-foreground text-sm">
          Rule-based summaries from connected session data. No LLM is connected in this build.
        </p>
      </div>

      <div className="flex-1 cyber-border bg-card/80 backdrop-blur-sm rounded-xl overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((message, index) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
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
                onClick={() => handleQuickAction(action.id)}
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
              placeholder="Ask about session alerts, telemetry, or firewall status..."
              className="flex-1 bg-background/60"
            />
            <Button type="submit" className="gap-2">
              <Send className="w-4 h-4" />
              Send
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AIAnalystPage;
