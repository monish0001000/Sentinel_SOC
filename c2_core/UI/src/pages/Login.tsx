import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Shield, Lock, Mail, AlertTriangle, Eye, EyeOff, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CyberBackground } from "@/components/ui/CyberBackground";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, isConfigured, signIn } = useAuth();

  useEffect(() => {
    if (isConfigured && user) {
      navigate("/dashboard", { replace: true });
    }
  }, [isConfigured, user, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isConfigured) {
      toast({
        title: "Authentication Unavailable",
        description:
          "Firebase Authentication is not configured in this hosted build. Set VITE_FIREBASE_* environment variables and rebuild to enable sign-in.",
        variant: "destructive",
      });
      return;
    }

    if (!email.trim() || !password) {
      toast({
        title: "Missing Credentials",
        description: "Enter both your email address and password.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const signedInUser = await signIn(email.trim(), password);
      toast({
        title: "Access Granted",
        description: `Signed in as ${signedInUser.email || signedInUser.uid}`,
      });
      navigate("/dashboard", { replace: true });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Invalid email or password.";
      toast({
        title: "Authentication Failed",
        description: message,
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
        <div className="cyber-border bg-card/90 backdrop-blur-xl rounded-lg p-8">
          <div className="text-center mb-8">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.15, type: "spring" }}
              className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4"
            >
              <Shield className="w-8 h-8 text-primary" />
            </motion.div>
            <h1 className="text-2xl font-bold text-foreground">Secure Access</h1>
            <p className="text-muted-foreground text-sm mt-2">
              Sign in with your Sentinel Firebase operator account
            </p>
          </div>

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
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="flex items-start gap-3 p-3 rounded-md bg-warning/10 border border-warning/20 mb-6"
            >
              <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
              <p className="text-xs text-foreground/80">
                Authorized personnel only. Authentication is enforced via Firebase
                Authentication.
              </p>
            </motion.div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
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
                  autoComplete="current-password"
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
              ) : isConfigured ? (
                "Sign In with Firebase"
              ) : (
                "Authentication Unavailable"
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
            ? "Firebase Authentication configured"
            : "Firebase Authentication not configured (hosted preview)"}
        </motion.div>
      </motion.div>
    </div>
  );
};

export default Login;
