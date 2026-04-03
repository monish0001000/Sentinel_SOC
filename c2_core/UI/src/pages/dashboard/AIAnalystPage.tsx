import { useWebSocket } from "@/hooks/useWebSocket";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Brain, Send, Sparkles, AlertTriangle, Shield, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { mockAIResponses } from "@/data/mockData";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

const quickActions = [
  { id: "explain", label: "Explain this log", icon: Lightbulb },
  { id: "suspicious", label: "Is this suspicious?", icon: AlertTriangle },
  { id: "attackType", label: "Attack type", icon: Shield },
  { id: "recommendation", label: "Security tips", icon: Sparkles },
];

const AIAnalystPage = () => {
  const { alerts, metrics, stats, firewall } = useWebSocket();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content:
        "Hello, SOC Analyst. I'm Sentinel AI, your security intelligence assistant. I can help you analyze logs, identify attack patterns, and provide security recommendations. How can I assist you today?",
      timestamp: new Date().toLocaleTimeString(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  const handleSend = (message: string) => {
    if (!message.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: message,
      timestamp: new Date().toLocaleTimeString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsTyping(true);

    // Simulate AI response with REAL context
    setTimeout(() => {
      let responseContent = "";
      const lowerMsg = message.toLowerCase();

      if (lowerMsg.includes("threat") || lowerMsg.includes("alert")) {
        if (alerts.length === 0) {
          responseContent = "I am currently detecting **0 active threats**. The system appears stable and secure.";
        } else {
          responseContent = `I have identified **${alerts.length} active threats** currently targeting the system.\n\nMost recent alert: **[${alerts[alerts.length - 1].level}] ${alerts[alerts.length - 1].message}**.\n\nRecommended Action: Investigate the source IP immediately and verify firewall rules.`;
        }
      } else if (lowerMsg.includes("status") || lowerMsg.includes("system")) {
        responseContent = `**System Status Report**:\n- Packet Rate: ${metrics?.packet_rate}/sec\n- Active Connections: ${metrics?.connections}\n- Total Packets Processed: ${stats?.totalPackets}\n\nThe system is operational.`;
      } else if (lowerMsg.includes("firewall") || lowerMsg.includes("block")) {
        // Firewall queries
        if (lowerMsg.includes("auto")) {
          responseContent = `**Firewall Auto-Block** is currently **${firewall.autoBlock ? "ENABLED" : "DISABLED"}**.\n\nStatus: **${firewall.active ? "Active Enforcement" : "Bypassed"}**`;
        } else if (lowerMsg.includes("why") && (lowerMsg.includes("ip") || lowerMsg.includes("port"))) {
          // Try to find an IP in the message
          const ipMatch = message.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
          const portMatch = message.match(/port\s*(\d+)/i);

          if (ipMatch) {
            const rule = firewall.rules.find(r => r.target === ipMatch[0]);
            if (rule) {
              responseContent = `IP **${ipMatch[0]}** was blocked on **${new Date(rule.timestamp).toLocaleTimeString()}**.\n\nReason: **${rule.reason}**`;
            } else {
              responseContent = `IP **${ipMatch[0]}** is NOT currently blocked by the firewall.`;
            }
          } else if (portMatch) {
            const port = parseInt(portMatch[1]);
            const rule = firewall.rules.find(r => r.target === port);
            if (rule) {
              responseContent = `Port **${port}** was blocked on **${new Date(rule.timestamp).toLocaleTimeString()}**.\n\nReason: **${rule.reason}**`;
            } else {
              responseContent = `Port **${port}** is NOT currently blocked.`;
            }
          } else {
            responseContent = `I can explain why an IP or Port was blocked. Please specify the IP or Port number.`;
          }
        } else if (lowerMsg.includes("list") || lowerMsg.includes("show")) {
          responseContent = `**Firewall Block List**:\n- Blocked IPs: ${firewall.blockedIPs.length}\n- Blocked Ports: ${firewall.blockedPorts.length}\n\nTop blocked: ${firewall.blockedIPs.slice(0, 3).join(", ")}...`;
        } else {
          responseContent = `**Firewall Status**:\n- Active: ${firewall.active}\n- Auto-Block: ${firewall.autoBlock}\n- Rules Active: ${firewall.rules.length}\n\nI can help you manage the firewall or explain blocks.`;
        }
      } else {
        const responseKey = Object.keys(mockAIResponses).find((key) =>
          message.toLowerCase().includes(key.toLowerCase())
        ) as keyof typeof mockAIResponses || "default";
        // Check if responseKey is valid in mockAIResponses
        if (responseKey !== "default" && mockAIResponses[responseKey as keyof typeof mockAIResponses]) {
          responseContent = mockAIResponses[responseKey as keyof typeof mockAIResponses].join("\n\n");
        } else {
          responseContent = "I am analyzing the latest security telemetry. I can help you identifying threats, explaining logs, or checking system status. What would you like to know?";
        }
      }

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: responseContent,
        timestamp: new Date().toLocaleTimeString(),
      };

      setMessages((prev) => [...prev, aiMessage]);
      setIsTyping(false);
    }, 1200);
  };

  const handleQuickAction = (action: string) => {
    const prompts = {
      explain: "Explain the latest brute force attack log entry",
      suspicious: "Is the SSH login attempt from 192.168.1.105 suspicious?",
      attackType: "What type of attack is happening based on recent logs?",
      recommendation: "What security recommendations do you have?",
    };
    handleSend(prompts[action as keyof typeof prompts]);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
          <Brain className="w-7 h-7 text-primary" />
          AI Security Analyst
        </h1>
        <p className="text-muted-foreground">Ask questions about logs and threats</p>
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

          {isTyping && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex gap-3"
            >
              <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Brain className="w-4 h-4 text-primary animate-pulse" />
              </div>
              <div className="bg-muted/50 rounded-lg p-4">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-primary rounded-full animate-bounce" />
                  <span className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:0.2s]" />
                  <span className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:0.4s]" />
                </div>
              </div>
            </motion.div>
          )}
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
              placeholder="Ask about logs, threats, or security recommendations..."
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
