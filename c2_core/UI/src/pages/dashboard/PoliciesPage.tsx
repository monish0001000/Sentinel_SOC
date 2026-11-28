import { Link } from "react-router-dom";
import { Shield, AlertCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isFirebaseConfigured } from "@/lib/firebase";

const PoliciesPage = () => {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary" />
            Firewall Policy Engine
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Allowlisted endpoint firewall policies and audit trail
          </p>
        </div>

        <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-mono border border-border bg-muted/50 text-muted-foreground">
          <AlertCircle className="w-3.5 h-3.5 text-warning" />
          LEGACY POLICY API DISABLED
        </span>
      </div>

      <div className="glass-card rounded-xl p-6 border border-border/60 space-y-4">
        <h2 className="text-base font-semibold text-foreground">
          Local Policy Engine Not Connected
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
          The legacy local FastAPI policy endpoint (<code className="font-mono">/firewall/policies</code>)
          is not reachable from Firebase Hosting and is disabled in production builds. No rules
          are simulated or fabricated here.
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
          {isFirebaseConfigured
            ? "To queue an allowlisted outbound IP block policy for a specific enrolled Windows endpoint, select the endpoint in the Endpoints (EDR) view."
            : "Configure Firebase Authentication and Firestore environment variables and enroll a Windows endpoint to manage allowlisted policies."}
        </p>

        <div className="pt-1">
          <Button asChild size="sm">
            <Link to="/dashboard/nodes" className="gap-2">
              Open Endpoints (EDR)
              <ArrowRight className="w-4 h-4" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PoliciesPage;
