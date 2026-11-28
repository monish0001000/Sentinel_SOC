import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Download,
  Shield,
  Copy,
  Check,
  Clock,
  Laptop,
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

const AGENT_RELEASE = {
  version: "1.0.0",
  compatibility: "Windows 10 / Windows 11 (x64, self-contained .NET 8)",
  fileName: "SentinelAgentSetup.exe",
  fileSize: "105.0 MB (110,079,871 bytes)",
  sha256: "b330c0166e5f27d60dac2f08d929c2217de00fb03090ade1a51a6d105a50428e",
  downloadUrl:
    import.meta.env.VITE_AGENT_DOWNLOAD_URL ||
    "https://github.com/monish0001000/Sentinel_SOC/releases/download/v1.0.0/SentinelAgentSetup.exe",
  releasesPageUrl: "https://github.com/monish0001000/Sentinel_SOC/releases/tag/v1.0.0",
};

const ConnectEndpointPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [label, setLabel] = useState("Windows Workstation");
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
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
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
      const res = await createEndpointEnrollment(user.uid, label.trim() || "Windows Endpoint");
      const payload = {
        FirebaseProjectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
        FirebaseWebApiKey: import.meta.env.VITE_FIREBASE_API_KEY,
        OwnerUid: res.ownerUid,
        EnrollmentToken: res.pairingToken,
        ExpiresAt: res.expiresAt.toISOString(),
      };
      setBundleJson(JSON.stringify(payload, null, 2));
      setExpiresAt(res.expiresAt);
      toast({
        title: "Enrollment Bundle Generated",
        description: "Single-use token valid for 15 minutes.",
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
            Connect Windows Endpoint
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Download the self-contained Windows EDR installer and generate a single-use enrollment bundle.
          </p>
        </div>

        <Button asChild variant="outline" size="sm">
          <Link to="/dashboard/nodes" className="gap-2">
            View All Endpoints
            <ArrowRight className="w-4 h-4" />
          </Link>
        </Button>
      </div>

      {/* Step 1: Download Installer */}
      <div className="glass-card rounded-xl p-6 border border-border/60 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-primary">
              Step 1 — Download Installer
            </span>
            <h2 className="text-lg font-bold text-foreground">{AGENT_RELEASE.fileName}</h2>
            <p className="text-xs text-muted-foreground">{AGENT_RELEASE.compatibility}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <a href={AGENT_RELEASE.downloadUrl} target="_blank" rel="noopener noreferrer" className="gap-2">
                <Download className="w-4 h-4" />
                Download Windows Agent (v{AGENT_RELEASE.version})
              </a>
            </Button>
            <Button asChild variant="outline" size="icon" title="View GitHub Release">
              <a href={AGENT_RELEASE.releasesPageUrl} target="_blank" rel="noopener noreferrer" aria-label="View GitHub Release">
                <ExternalLink className="w-4 h-4" />
              </a>
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 text-xs">
          <div className="p-3 rounded-lg bg-muted/40 border border-border/60">
            <p className="text-muted-foreground">Agent Version</p>
            <p className="font-mono font-semibold text-foreground mt-1">v{AGENT_RELEASE.version}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/40 border border-border/60">
            <p className="text-muted-foreground">Installer File Size</p>
            <p className="font-mono font-semibold text-foreground mt-1">{AGENT_RELEASE.fileSize}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/40 border border-border/60">
            <p className="text-muted-foreground">Runtime Requirement</p>
            <p className="font-semibold text-foreground mt-1">Self-contained (no .NET install needed)</p>
          </div>
        </div>

        <div className="p-3 rounded-lg bg-muted/40 border border-border/60 text-xs space-y-1">
          <p className="text-muted-foreground font-semibold">SHA-256 Checksum</p>
          <p className="font-mono text-foreground break-all select-all">{AGENT_RELEASE.sha256}</p>
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
              Single-Use Pairing Token
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

        <div className="flex flex-wrap gap-3">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Endpoint label (e.g. Corp-Laptop-01)"
            className="max-w-sm"
            disabled={!isFirebaseConfigured || generating}
          />
          <Button onClick={handleGenerate} disabled={!isFirebaseConfigured || generating} className="gap-2">
            <KeyRound className="w-4 h-4" />
            {generating ? "Generating..." : "Generate Enrollment Bundle"}
          </Button>
        </div>

        {bundleJson && (
          <div className="space-y-3 pt-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Paste this JSON into <code className="font-mono">SentinelAgentSetup.exe</code> or import the downloaded file:
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

      {/* Step 3: Live Connection & First Heartbeat Status */}
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
              No endpoints enrolled yet. Run SentinelAgentSetup.exe to register your first device.
            </div>
          ) : (
            <div className="space-y-2 pt-2">
              {endpoints.slice(0, 4).map((ep) => (
                <div key={ep.id} className="flex items-center justify-between text-xs p-2.5 rounded-lg bg-muted/30 border border-border/50">
                  <span className="font-semibold text-foreground">{ep.hostname}</span>
                  <span className="font-mono uppercase text-primary">{ep.computedStatus}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Instructions & Troubleshooting */}
        <div className="glass-card rounded-xl p-6 border border-border/60 space-y-3">
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5" />
            Installation &amp; Troubleshooting
          </span>
          <ol className="space-y-2 text-xs text-muted-foreground list-decimal list-inside leading-relaxed">
            <li>Download <code className="font-mono text-foreground">SentinelAgentSetup.exe</code> and verify its SHA-256 checksum.</li>
            <li>Run the installer and approve the Windows UAC prompt to register <code className="font-mono text-foreground">SentinelSOCAgent</code>.</li>
            <li>Paste or import the enrollment JSON before the 15-minute token expires and click <strong>Install Agent</strong>.</li>
            <li>If enrollment shows pending connectivity, inspect <code className="font-mono text-foreground">C:\ProgramData\SentinelSOC\logs</code> and ensure Anonymous Auth + Firestore are enabled on <code className="font-mono text-foreground">monix-soc</code>.</li>
          </ol>
          <div className="flex items-center gap-2 text-xs text-foreground pt-1">
            <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" />
            <span>
              Remote firewall control remains disabled by default unless explicitly opted in during setup.
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Shield className="w-4 h-4 text-primary flex-shrink-0" />
            <span>Uninstall cleanly from Windows Settings → Apps or re-run the installer.</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConnectEndpointPage;
