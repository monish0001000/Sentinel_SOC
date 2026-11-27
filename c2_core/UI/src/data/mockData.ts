/** Shared UI data types. Live values must come from the backend WebSocket. */

export interface Threat {
  id: string;
  type: string;
  severity: "critical" | "high" | "medium" | "low";
  sourceIp: string;
  timestamp: string;
  description: string;
  location?: string;
  aiConfidence: number;
  actionTaken: "blocked" | "allowed" | "rate-limited";
  aiExplanation: string;
  targetPort?: number;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: "info" | "warning" | "error" | "critical";
  source: string;
  message: string;
  ip?: string;
  status: "allowed" | "blocked" | "suspicious" | "observed";
  protocol?: string;
  port?: number;
}
