import { AlertCircle, Cloud } from "lucide-react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { isFirebaseConfigured } from "@/lib/firebase";

export const SystemStatusBanner = () => {
  const { connectionStatus, isConfigured: wsConfigured, reconnect } = useWebSocket();

  if (connectionStatus === "connected") {
    return null;
  }

  if (!wsConfigured) {
    return (
      <div className="bg-accent/70 border-b border-border/60 px-4 md:px-6 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 text-foreground/85">
          <Cloud className="w-3.5 h-3.5 text-primary flex-shrink-0" />
          <span>
            {isFirebaseConfigured
              ? "Cloud EDR mode active (Firebase Auth & Firestore). Real-time local packet stream is not attached in hosted mode."
              : "Hosted UI preview mode: Firebase project environment variables and real-time packet stream are not configured."}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-warning/15 border-b border-warning/30 px-4 md:px-6 py-2 flex items-center justify-between gap-3 text-xs">
      <div className="flex items-center gap-2 text-foreground">
        <AlertCircle className="w-3.5 h-3.5 text-warning flex-shrink-0" />
        <span className="font-medium">
          Live telemetry WebSocket disconnected. Waiting for configured stream.
        </span>
      </div>
      <button
        type="button"
        onClick={reconnect}
        className="text-primary font-medium hover:underline flex-shrink-0"
      >
        Retry
      </button>
    </div>
  );
};
