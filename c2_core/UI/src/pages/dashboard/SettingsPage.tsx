import { useState } from "react";
import { motion } from "framer-motion";
import { Shield, Bell, Globe, Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { isFirebaseConfigured } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";

const SettingsPage = () => {
  const { user } = useAuth();
  const [timezone, setTimezone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  );

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground text-sm">
          Console configuration and backend capability status
        </p>
      </div>

      <div className="flex items-start gap-3 p-4 rounded-xl border border-border bg-muted/40 text-xs text-muted-foreground">
        <Info className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          Server-side notification, retention, and automated blocking settings are read-only in
          this Spark client build because no persistent policy configuration service is attached.
        </p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="cyber-border bg-card/70 backdrop-blur-sm rounded-xl p-6 space-y-4"
      >
        <div className="flex items-center gap-3">
          <Bell className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Notifications</h2>
        </div>

        <div className="flex items-center justify-between opacity-70">
          <div>
            <Label className="text-foreground">Email Alerts</Label>
            <p className="text-xs text-muted-foreground">
              Requires server-side alerting (not available on Firebase Spark)
            </p>
          </div>
          <Switch checked={false} disabled />
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="cyber-border bg-card/70 backdrop-blur-sm rounded-xl p-6 space-y-5"
      >
        <div className="flex items-center gap-3">
          <Shield className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Authentication &amp; Policy</h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 text-xs">
          <div className="p-3 rounded-lg bg-muted/40 border border-border/60">
            <p className="text-muted-foreground">Firebase SDK</p>
            <p className="font-semibold text-foreground mt-1">
              {isFirebaseConfigured ? "Configured" : "Not Configured"}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-muted/40 border border-border/60">
            <p className="text-muted-foreground">Signed-in Operator</p>
            <p className="font-semibold text-foreground mt-1 truncate">
              {user?.email || user?.uid || "None"}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between opacity-70">
          <div>
            <Label className="text-foreground">Global Auto-Block</Label>
            <p className="text-xs text-muted-foreground">
              Managed per endpoint with explicit approval in Endpoints (EDR)
            </p>
          </div>
          <Switch checked={false} disabled />
        </div>

        <div className="space-y-2 opacity-70">
          <Label className="text-foreground">Log Retention (Days)</Label>
          <Input type="number" value="90" disabled className="max-w-xs bg-background/50" />
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="cyber-border bg-card/70 backdrop-blur-sm rounded-xl p-6 space-y-4"
      >
        <div className="flex items-center gap-3">
          <Globe className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Display</h2>
        </div>

        <div className="space-y-2">
          <Label htmlFor="timezone-select" className="text-foreground">
            Browser Timezone
          </Label>
          <select
            id="timezone-select"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="w-full max-w-xs px-3 py-2 rounded-md bg-background border border-border text-foreground text-sm"
          >
            <option value={timezone}>{timezone}</option>
            <option value="UTC">UTC</option>
          </select>
        </div>
      </motion.div>
    </div>
  );
};

export default SettingsPage;
