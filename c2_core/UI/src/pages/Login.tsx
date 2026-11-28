import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Shield, Lock, Mail, AlertTriangle, Eye, EyeOff, Info, UserPlus, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CyberBackground } from "@/components/ui/CyberBackground";
import { useToast } from "@/hooks/use-toast";
import { mapFirebaseAuthError, useAuth } from "@/context/AuthContext";

const Login = () => {
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, isConfigured, signIn, register } = useAuth();

  useEffect(() => {
    if (isConfigured && user) {
      navigate("/dashboard", { replace: true });
    }
  }, [isConfigured, user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner(null);

    if (!isConfigured) {
      const msg =
        "Firebase Authentication is not configured in this hosted build. Set VITE_FIREBASE_* environment variables and rebuild.";
      setErrorBanner(msg);
      toast({
        title: "Authentication Unavailable",
        description: msg,
        variant: "destructive",
      });
      return;
    }

    if (!email.trim() || !password) {
      setErrorBanner("Enter both your email address and password.");
      return;
    }

    if (mode === "register") {
      if (password.length < 8) {
        setErrorBanner("Password must be at least 8 characters long.");
        return;
      }
      if (password !== confirmPassword) {
        setErrorBanner("Passwords do not match.");
        return;
      }
    }

    setIsLoading(true);
    try {
      const authedUser =
        mode === "signin"
          ? await signIn(email.trim(), password)
          : await register(email.trim(), password);

      toast({
        title: mode === "signin" ? "Access Granted" : "Account Created",
        description: `Signed in as ${authedUser.email || authedUser.uid}`,
      });
      navigate("/dashboard", { replace: true });
    } catch (err: unknown) {
      const friendly = mapFirebaseAuthError(err);
      setErrorBanner(friendly);
      toast({
        title: mode === "signin" ? "Authentication Failed" : "Registration Failed",
        description: friendly,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center px-6 py-10">
      <CyberBackground />

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="cyber-border bg-card/90 backdrop-blur-xl rounded-xl p-8">
          <div className="text-center mb-6">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.15, type: "spring" }}
              className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4"
            >
              <Shield className="w-8 h-8 text-primary" />
            </motion.div>
            <h1 className="text-2xl font-bold text-foreground">
              {mode === "signin" ? "Secure Access" : "Create Operator Account"}
            </h1>
            <p className="text-muted-foreground text-sm mt-2">
              {mode === "signin"
                ? "Sign in with your Sentinel Firebase operator account"
                : "Register a Firebase Authentication account for Sentinel SOC"}
            </p>
          </div>

          {isConfigured && (
            <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-muted/60 border border-border mb-5">
              <button
                type="button"
                onClick={() => {
                  setMode("signin");
                  setErrorBanner(null);
                }}
                className={`flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-semibold transition-colors ${
                  mode === "signin"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <LogIn className="w-3.5 h-3.5" />
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("register");
                  setErrorBanner(null);
                }}
                className={`flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-semibold transition-colors ${
                  mode === "register"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <UserPlus className="w-3.5 h-3.5" />
                Register
              </button>
            </div>
          )}

          {!isConfigured ? (
            <div className="flex items-start gap-3 p-3.5 rounded-md bg-destructive/10 border border-destructive/25 mb-6">
              <Info className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
              <div className="text-xs text-foreground/85 space-y-1">
                <p className="font-semibold text-destructive">
                  Firebase Authentication Not Configured
                </p>
                <p className="text-muted-foreground leading-relaxed">
                  This hosted build does not have{" "}
                  <code className="font-mono">VITE_FIREBASE_*</code> configuration
                  variables set, and legacy local FastAPI login is disabled on
                  Firebase Hosting.
                </p>
              </div>
            </div>
          ) : errorBanner ? (
            <div className="flex items-start gap-3 p-3 rounded-md bg-destructive/10 border border-destructive/25 mb-5">
              <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-xs text-destructive leading-relaxed">{errorBanner}</p>
            </div>
          ) : (
            <div className="flex items-start gap-3 p-3 rounded-md bg-warning/10 border border-warning/20 mb-5">
              <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
              <p className="text-xs text-foreground/80">
                Authorized personnel only. Authentication is enforced via Firebase
                Authentication.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm text-muted-foreground">
                Email Address
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="analyst@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={!isConfigured || isLoading}
                  className="pl-10 bg-background/60 border-border focus:border-primary focus:ring-primary/20"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm text-muted-foreground">
                Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={!isConfigured || isLoading}
                  className="pl-10 pr-10 bg-background/60 border-border focus:border-primary focus:ring-primary/20"
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={!isConfigured}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {mode === "register" && (
              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-sm text-muted-foreground">
                  Confirm Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="••••••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={!isConfigured || isLoading}
                    className="pl-10 bg-background/60 border-border focus:border-primary focus:ring-primary/20"
                  />
                </div>
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={!isConfigured || isLoading}
            >
              {isLoading ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                >
                  <Shield className="w-4 h-4" />
                </motion.div>
              ) : !isConfigured ? (
                "Authentication Unavailable"
              ) : mode === "signin" ? (
                "Sign In with Firebase"
              ) : (
                "Create Operator Account"
              )}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <Link
              to="/"
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              ← Return to Home
            </Link>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35 }}
          className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground"
        >
          <span
            className={`w-2 h-2 rounded-full ${
              isConfigured ? "bg-success animate-pulse" : "bg-warning"
            }`}
          />
          {isConfigured
            ? "Firebase Authentication ready (monix-soc)"
            : "Firebase Authentication not configured (hosted preview)"}
        </motion.div>
      </motion.div>
    </div>
  );
};

export default Login;
