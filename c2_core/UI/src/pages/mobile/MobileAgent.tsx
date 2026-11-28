import { Link } from "react-router-dom";
import { Shield, Laptop, WifiOff, ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CyberBackground } from "@/components/ui/CyberBackground";

const MobileAgent = () => {
  return (
    <div className="relative min-h-screen flex items-center justify-center px-6 py-12">
      <CyberBackground />

      <div className="relative z-10 w-full max-w-lg cyber-border bg-card/90 backdrop-blur-xl rounded-xl p-8 space-y-6">
        <div className="flex items-center justify-between border-b border-border/60 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">Sentinel Endpoint Agent</h1>
              <p className="text-xs font-mono text-muted-foreground">
                GENUINE HOST TELEMETRY ONLY
              </p>
            </div>
          </div>

          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono bg-muted text-muted-foreground border border-border">
            <WifiOff className="w-3 h-3" />
            BROWSER SIM DISABLED
          </span>
        </div>

        <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            Browser-based simulated heartbeats and synthetic CPU/disk metrics have been
            removed. Browsers cannot collect real OS process, firewall, or network telemetry.
          </p>
          <p>
            Genuine endpoint monitoring uses the native{" "}
            <strong className="text-foreground">Sentinel Windows Agent</strong> paired
            via a one-time enrollment token from the dashboard.
          </p>
        </div>

        <div className="p-4 rounded-lg bg-muted/40 border border-border/60 space-y-2.5 text-xs text-foreground">
          <div className="flex items-center gap-2 font-semibold">
            <Laptop className="w-4 h-4 text-primary" />
            Windows EDR Enrollment Flow
          </div>
          <ul className="space-y-1.5 text-muted-foreground">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-primary flex-shrink-0" />
              Sign in with Firebase Authentication in the SOC Console
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-primary flex-shrink-0" />
              Open Endpoints (EDR) and generate a 15-minute pairing bundle
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-primary flex-shrink-0" />
              Run the Windows agent service to stream genuine host metrics to Firestore
            </li>
          </ul>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <Link
            to="/"
            className="text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            ← Back to Home
          </Link>
          <Button asChild size="sm">
            <Link to="/dashboard/connect-endpoint" className="gap-2">
              Connect Windows Endpoint
              <ArrowRight className="w-4 h-4" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default MobileAgent;
