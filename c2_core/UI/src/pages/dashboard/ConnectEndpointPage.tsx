import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Download,
  Shield,
  Copy,
  Check,
  Clock,
  Laptop,
  Smartphone,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  KeyRound,
  FileJson,
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  createEndpointEnrollment,
  EndpointRecord,
  subscribeEndpoints,
} from "@/lib/sentinelFirebaseRepo";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const WINDOWS_RELEASE = {
  version: "1.0.2",
  compatibility: "Windows 10 / Windows 11 (x64, self-contained .NET 8)",
  fileName: "SentinelAgentSetup.exe",
  fileSize: "105.0 MB (110,089,017 bytes)",
  sha256: "47abc4d328c4ce99e0dba8bab60317406edd3b9a5825f5ca5562eb5193f6e330",
  downloadUrl:
    import.meta.env.VITE_AGENT_DOWNLOAD_URL ||
    "https://github.com/monish0001000/Sentinel_SOC/releases/download/v1.0.2/SentinelAgentSetup.exe",
  releasesPageUrl: "https://github.com/monish0001000/Sentinel_SOC/releases/tag/v1.0.2",
};

const ANDROID_RELEASE = {
  version: "1.0.3",
  compatibility: "Android 8.0+ (API 26–35, signed APK, no root required)",
  fileName: "SentinelAgent.apk",
  fileSize: "Pending v1.0.3 release",
  sha256: "Will be populated after v1.0.3 release checksum verification",
  downloadUrl:
    import.meta.env.VITE_ANDROID_AGENT_DOWNLOAD_URL ||
    "https://github.com/monish0001000/Sentinel_SOC/releases/download/v1.0.3/SentinelAgent.apk",
  releasesPageUrl: "https://github.com/monish0001000/Sentinel_SOC/releases/tag/v1.0.3",
};

const ConnectEndpointPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [label, setLabel] = useState("Workstation / Mobile Device");
  const [ttlMinutes, setTtlMinutes] = useState<number>(10080); // Default 7 days (1 week)
  const [bundleJson, setBundleJson] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [endpoints, setEndpoints] = useState<EndpointRecord[]>([]);

  useEffect(() => {
    if (!isFirebaseConfigured || !user?.uid) {
      setEndpoints([]);
      return;
    }
    return subscribeEndpoints(user.uid, setEndpoints);
  }, [user?.uid]);

  useEffect(() => {
    if (!expiresAt) {
      setRemainingSeconds(0);
      return;
    }
    const update = () => {
      const diff = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
      setRemainingSeconds(diff);
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  const formatCountdown = (secs: number) => {
    const days = Math.floor(secs / 86400);
    const hours = Math.floor((secs % 86400) / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    const remSecs = secs % 60;
    if (days > 0) return `${days}d ${hours}h ${mins}m`;
    if (hours > 0) return `${hours}h ${mins}m ${remSecs}s`;
    return `${String(mins).padStart(2, "0")}:${String(remSecs).padStart(2, "0")}`;
  };

  const handleGenerate = async () => {
    if (!isFirebaseConfigured || !user?.uid) {
      toast({
        title: "Firebase Sign-In Required",
        description: "Sign in with Firebase Authentication to generate an enrollment bundle.",
        variant: "destructive",
      });
      return;
    }

    setGenerating(true);
    try {
      const res = await createEndpointEnrollment(
        user.uid,
        label.trim() || "Endpoint Device",
        ttlMinutes
      );
      const payload = {
        FirebaseProjectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
        FirebaseWebApiKey: import.meta.env.VITE_FIREBASE_API_KEY,
        OwnerUid: res.ownerUid,
        EnrollmentToken: res.pairingToken,
        ExpiresAt: res.expiresAt.toISOString(),
      };
      setBundleJson(JSON.stringify(payload, null, 2));
      setExpiresAt(res.expiresAt);
      const validityLabel =
        ttlMinutes >= 43200
          ? "30 days (1 month)"
          : ttlMinutes >= 10080
            ? "7 days (1 week)"
            : ttlMinutes >= 1440
              ? "24 hours"
              : `${ttlMinutes} minutes`;
      toast({
        title: "Enrollment Bundle Generated",
        description: `Single-use token valid for ${validityLabel}. Works on Windows EXE and Android APK.`,
      });
    } catch (err: unknown) {
      toast({
        title: "Enrollment Generation Failed",
        description: err instanceof Error ? err.message : "Check Firestore rules and connectivity.",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!bundleJson) return;
    await navigator.clipboard.writeText(bundleJson);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadBundle = () => {
    if (!bundleJson) return;
    const blob = new Blob([bundleJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sentinel-enrollment.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const onlineEndpoints = endpoints.filter((e) => e.computedStatus === "online");
  const latestHeartbeat = endpoints
    .map((e) => e.lastSeenAt)
    .filter((d): d is Date => Boolean(d))
    .sort((a, b) => b.getTime() - a.getTime())[0];

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Laptop className="w-6 h-6 text-primary" />
            Connect Windows &amp; Android Endpoints
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Download the native Windows installer or Android APK and generate a single-use enrollment bundle.
          </p>
        </div>

        <Button asChild variant="outline" size="sm">
          <Link to="/dashboard/nodes" className="gap-2">
            Manage Enrolled Endpoints
            <ArrowRight className="w-4 h-4" />
          </Link>
        </Button>
      </div>

      {/* Step 1: Download Agent (Windows + Android) */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Windows Card */}
        <div className="glass-card rounded-xl p-6 border border-border/60 space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                  <Laptop className="w-3.5 h-3.5" />
                  Step 1A — Windows x64
                </span>
                <h2 className="text-lg font-bold text-foreground">{WINDOWS_RELEASE.fileName}</h2>
                <p className="text-xs text-muted-foreground">{WINDOWS_RELEASE.compatibility}</p>
              </div>
              <Button asChild variant="outline" size="icon" title="View Windows GitHub Release">
                <a href={WINDOWS_RELEASE.releasesPageUrl} target="_blank" rel="noopener noreferrer" aria-label="View Windows GitHub Release">
                  <ExternalLink className="w-4 h-4" />
                </a>
              </Button>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 text-xs">
              <div className="p-2.5 rounded-lg bg-muted/40 border border-border/60">
                <p className="text-muted-foreground">Version</p>
                <p className="font-mono font-semibold text-foreground mt-0.5">v{WINDOWS_RELEASE.version}</p>
              </div>
              <div className="p-2.5 rounded-lg bg-muted/40 border border-border/60">
                <p className="text-muted-foreground">File Size</p>
                <p className="font-mono font-semibold text-foreground mt-0.5">{WINDOWS_RELEASE.fileSize}</p>
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-muted/40 border border-border/60 text-xs space-y-1">
              <p className="text-muted-foreground font-semibold">SHA-256 Checksum</p>
              <p className="font-mono text-foreground break-all select-all text-[11px]">{WINDOWS_RELEASE.sha256}</p>
            </div>
          </div>

          <Button asChild className="w-full">
            <a href={WINDOWS_RELEASE.downloadUrl} target="_blank" rel="noopener noreferrer" className="gap-2">
              <Download className="w-4 h-4" />
              Download Windows Agent (v{WINDOWS_RELEASE.version})
            </a>
          </Button>
        </div>

        {/* Android APK Card */}
        <div className="glass-card rounded-xl p-6 border border-border/60 space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5" />
                  Step 1B — Android Mobile
                </span>
                <h2 className="text-lg font-bold text-foreground">{ANDROID_RELEASE.fileName}</h2>
                <p className="text-xs text-muted-foreground">{ANDROID_RELEASE.compatibility}</p>
              </div>
              <Button asChild variant="outline" size="icon" title="View Android GitHub Release">
                <a href={ANDROID_RELEASE.releasesPageUrl} target="_blank" rel="noopener noreferrer" aria-label="View Android GitHub Release">
                  <ExternalLink className="w-4 h-4" />
                </a>
              </Button>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 text-xs">
              <div className="p-2.5 rounded-lg bg-muted/40 border border-border/60">
                <p className="text-muted-foreground">Version</p>
                <p className="font-mono font-semibold text-foreground mt-0.5">v{ANDROID_RELEASE.version}</p>
              </div>
              <div className="p-2.5 rounded-lg bg-muted/40 border border-border/60">
                <p className="text-muted-foreground">File Size</p>
                <p className="font-mono font-semibold text-foreground mt-0.5">{ANDROID_RELEASE.fileSize}</p>
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-muted/40 border border-border/60 text-xs space-y-1">
              <p className="text-muted-foreground font-semibold">SHA-256 Checksum</p>
              <p className="font-mono text-foreground break-all select-all text-[11px]">{ANDROID_RELEASE.sha256}</p>
            </div>
          </div>

          <Button asChild variant="secondary" className="w-full">
            <a href={ANDROID_RELEASE.downloadUrl} target="_blank" rel="noopener noreferrer" className="gap-2">
              <Download className="w-4 h-4" />
              Download Android APK (v{ANDROID_RELEASE.version})
            </a>
          </Button>
        </div>
      </div>

      {/* Step 2: Generate Enrollment Bundle */}
      <div className="glass-card rounded-xl p-6 border border-border/60 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-primary">
              Step 2 — Generate One-Time Enrollment Bundle
            </span>
            <h2 className="text-lg font-bold text-foreground mt-0.5">
              Single-Use Pairing Token (Windows &amp; Android)
            </h2>
          </div>

          {expiresAt && (
            <div
              className={cn(
                "flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono border",
                remainingSeconds > 0
                  ? "bg-primary/10 text-primary border-primary/30"
                  : "bg-destructive/10 text-destructive border-destructive/30"
              )}
            >
              <Clock className="w-3.5 h-3.5" />
              {remainingSeconds > 0
                ? `Expires in ${formatCountdown(remainingSeconds)}`
                : "Expired — generate a new token"}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Endpoint label (e.g. Pixel-8 / Corp-Laptop-01)"
            className="max-w-xs"
            disabled={!isFirebaseConfigured || generating}
          />
          <select
            aria-label="Token validity period"
            value={ttlMinutes}
            onChange={(e) => setTtlMinutes(Number(e.target.value))}
            disabled={!isFirebaseConfigured || generating}
            className="h-10 px-3 rounded-md border border-border bg-background text-sm text-foreground"
          >
            <option value={15}>Valid for 15 minutes</option>
            <option value={1440}>Valid for 24 hours (1 day)</option>
            <option value={10080}>Valid for 7 days (1 week)</option>
            <option value={43200}>Valid for 30 days (1 month)</option>
          </select>
          <Button onClick={handleGenerate} disabled={!isFirebaseConfigured || generating} className="gap-2">
            <KeyRound className="w-4 h-4" />
            {generating ? "Generating..." : "Generate Enrollment Bundle"}
          </Button>
        </div>

        {bundleJson && (
          <div className="space-y-3 pt-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Paste or import this JSON into <code className="font-mono">SentinelAgentSetup.exe</code> (Windows) or <code className="font-mono">SentinelAgent.apk</code> (Android):
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5">
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "Copied" : "Copy JSON"}
                </Button>
                <Button variant="outline" size="sm" onClick={handleDownloadBundle} className="gap-1.5">
                  <FileJson className="w-3.5 h-3.5" />
                  Download JSON
                </Button>
              </div>
            </div>
            <pre className="p-3.5 rounded-lg bg-muted/50 border border-border text-xs font-mono overflow-x-auto">
              {bundleJson}
            </pre>
          </div>
        )}
      </div>

      {/* Step 3: Live Connection & Installation Instructions */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="glass-card rounded-xl p-6 border border-border/60 space-y-3">
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-primary">
            Step 3 — Live Endpoint Status
          </span>
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="p-3 rounded-lg bg-muted/40 border border-border/60">
              <p className="text-xs text-muted-foreground">Enrolled / Online</p>
              <p className="text-2xl font-black text-foreground mt-1">
                {endpoints.length} / {onlineEndpoints.length}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-muted/40 border border-border/60">
              <p className="text-xs text-muted-foreground">Latest Heartbeat</p>
              <p className="text-xs font-mono font-semibold text-foreground mt-2">
                {latestHeartbeat ? latestHeartbeat.toLocaleString() : "Waiting for first heartbeat"}
              </p>
            </div>
          </div>

          {endpoints.length === 0 ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2">
              <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0" />
              No endpoints enrolled yet. Install SentinelAgentSetup.exe or SentinelAgent.apk to register a device.
            </div>
          ) : (
            <div className="space-y-2 pt-2">
              {endpoints.slice(0, 4).map((ep) => (
                <div key={ep.id} className="flex items-center justify-between text-xs p-2.5 rounded-lg bg-muted/30 border border-border/50">
                  <span className="font-semibold text-foreground">
                    {ep.hostname} <span className="text-muted-foreground font-normal">({ep.osVersion})</span>
                  </span>
                  <span className="font-mono uppercase text-primary">{ep.computedStatus}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Installation & Troubleshooting */}
        <div className="glass-card rounded-xl p-6 border border-border/60 space-y-3">
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5" />
            Setup Guide (Windows &amp; Android)
          </span>
          <ol className="space-y-2 text-xs text-muted-foreground list-decimal list-inside leading-relaxed">
            <li><strong>Windows:</strong> Run <code className="font-mono text-foreground">SentinelAgentSetup.exe</code> with UAC, paste or import <code className="font-mono text-foreground">sentinel-enrollment.json</code>, and click <strong>Install Agent</strong> (or <strong>Upgrade Agent</strong>).</li>
            <li><strong>Android:</strong> Install <code className="font-mono text-foreground">SentinelAgent.apk</code> (enable Install Unknown Apps if prompted), open the app, grant Notification permission, paste or import <code className="font-mono text-foreground">sentinel-enrollment.json</code>, and tap <strong>Enroll &amp; Start Agent</strong>.</li>
            <li>Both agents stream genuine telemetry every 15 seconds, support offline SQLite queueing, and execute remote <code className="font-mono text-foreground">sync_now</code> / <code className="font-mono text-foreground">unenroll_agent</code> commands from the Endpoints page.</li>
          </ol>
          <div className="flex items-center gap-2 text-xs text-foreground pt-1">
            <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" />
            <span>
              Remote firewall blocking requires explicit opt-in on Windows and stays sandbox-safe on non-root Android.
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Shield className="w-4 h-4 text-primary flex-shrink-0" />
            <span>You can pause, sync, unenroll, or delete any endpoint anytime from the Endpoints (EDR) page.</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConnectEndpointPage;
