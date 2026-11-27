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
  const { alerts, metrics, stats, firewall } = useWebSocket();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content:
        "This page can summarize current dashboard data. No AI model is connected in this build, so it will not invent analysis or threat findings.",
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
        responseContent = "There are no active alerts in the current dashboard feed. This does not prove the host is secure; it only means no alert is currently being reported.";
      } else {
        const latest = alerts[alerts.length - 1];
        responseContent = `Current dashboard alerts: **${alerts.length}**\\n\\nLatest alert: **[${latest.level || "unknown"}] ${latest.message || "No message provided"}**\\n\\nThis is a summary of received alert data, not an independent AI verdict.`;
      }
    } else if (lowerMsg.includes("status") || lowerMsg.includes("system")) {
      responseContent = `**Live dashboard snapshot**\\n- WebSocket: ${metrics ? "connected data available" : "metrics not received"}\\n- Observed connection rate: ${metrics?.packet_rate ?? "not available"}/sec\\n- Active connections: ${metrics?.connections ?? "not available"}\\n- Connection events: ${stats?.totalPackets ?? "not available"}\\n- Current alerts: ${alerts.length}`;
    } else if (lowerMsg.includes("firewall") || lowerMsg.includes("block")) {
      responseContent = `**Firewall service state**\\n- Active flag: ${firewall.active}\\n- Auto-block flag: ${firewall.autoBlock}\\n- Policy entries: ${firewall.rules.length}\\n- Blocked IP entries: ${firewall.blockedIPs.length}\\n\\nThese are application-reported settings. The Docker passive connection monitor does not itself block host traffic.`;
    } else {
      responseContent = "No AI model is connected to this page in the current build. I can summarize live alerts, connection metrics and firewall settings only; I will not invent threat findings or simulated analysis.";
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
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
          <Brain className="w-7 h-7 text-primary" />
          SOC Context Assistant
        </h1>
        <p className="text-muted-foreground">Rule-based summaries from live dashboard data. No LLM is connected in this build.</p>
      </div>

      {/* Chat Area */}
      <div className="flex-1 cyber-border bg-card/30 backdrop-blur-sm rounded-lg overflow-hidden flex flex-col">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((message, index) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
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
                  "max-w-[70%] rounded-lg p-4",
                  message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/50 text-foreground font-mono text-sm"
                )}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
                <span className="text-xs opacity-50 mt-2 block">
                  {message.timestamp}
                </span>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Quick Actions */}
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

        {/* Input */}
        <div className="p-4 border-t border-border bg-card/50">
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
              placeholder="Ask about current alerts, metrics, or firewall settings..."
              className="flex-1 bg-background/50"
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
