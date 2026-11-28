import { Link } from "react-router-dom";
import { Lock, Shield, Globe, AlertTriangle, Server, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isFirebaseConfigured } from "@/lib/firebase";

const FirewallPage = () => {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Lock className="w-6 h-6 text-primary" />
            Firewall Control
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Remote firewall enforcement and network access controls
          </p>
        </div>

        <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-mono border border-warning/40 bg-warning/10 text-warning">
          <AlertTriangle className="w-3.5 h-3.5" />
          GLOBAL C2 API DISCONNECTED
        </span>
      </div>

      {/* Honest unavailable state — never expose or simulate localhost firewall controls */}
      <div className="glass-card rounded-xl p-6 border border-border/60 space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-lg bg-warning/10 border border-warning/30 flex-shrink-0">
            <Shield className="w-5 h-5 text-warning" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-base font-semibold text-foreground">
              Legacy Local Firewall Controls Are Disabled in Hosted Mode
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              The legacy FastAPI firewall endpoints (IP blocking, port blocking, geo-blocking,
              and global panic mode) depended on a local C2 server and are not available on
              Firebase Hosting. Remote firewall actions are intentionally disabled until a
              secure backend and enrolled Windows EDR agent acknowledge them.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <div className="p-4 rounded-lg bg-muted/40 border border-border/50 space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <Shield className="w-3.5 h-3.5" />
              IP &amp; Port Rules
            </div>
            <p className="text-sm font-medium text-foreground">Not Connected</p>
            <p className="text-xs text-muted-foreground">
              Requires enrolled Windows agent policy sync
            </p>
          </div>

          <div className="p-4 rounded-lg bg-muted/40 border border-border/50 space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <Globe className="w-3.5 h-3.5" />
              Geo-Blocking
            </div>
            <p className="text-sm font-medium text-foreground">Unavailable</p>
            <p className="text-xs text-muted-foreground">
              Not supported on Firebase Spark client-only hosting
            </p>
          </div>

          <div className="p-4 rounded-lg bg-muted/40 border border-border/50 space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <Server className="w-3.5 h-3.5" />
              Per-Endpoint Allowlisted Policies
            </div>
            <p className="text-sm font-medium text-foreground">
              {isFirebaseConfigured ? "Available via Endpoints" : "Requires Firebase Config"}
            </p>
            <p className="text-xs text-muted-foreground">
              Managed per enrolled Windows endpoint with audit logging
            </p>
          </div>
        </div>

        <div className="pt-2 flex flex-wrap items-center gap-3">
          <Button asChild variant="default" size="sm">
            <Link to="/dashboard/nodes" className="gap-2">
              Go to Endpoints (EDR)
              <ArrowRight className="w-4 h-4" />
            </Link>
          </Button>
          <span className="text-xs text-muted-foreground">
            Per-endpoint allowlisted policies require an authenticated Firebase session and an
            enrolled Windows agent.
          </span>
        </div>
      </div>
    </div>
  );
};

export default FirewallPage;
