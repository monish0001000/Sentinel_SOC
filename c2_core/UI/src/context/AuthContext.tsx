import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import { auth, isFirebaseConfigured } from "@/lib/firebase";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  isConfigured: boolean;
  signIn: (email: string, password: string) => Promise<User>;
  register: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: false,
  isConfigured: isFirebaseConfigured,
  signIn: async () => {
    throw new Error("Firebase Authentication is not configured.");
  },
  register: async () => {
    throw new Error("Firebase Authentication is not configured.");
  },
  logout: async () => {},
});

export function mapFirebaseAuthError(err: unknown): string {
  const code =
    typeof err === "object" && err !== null && "code" in err
      ? String((err as { code?: string }).code)
      : "";

  switch (code) {
    case "auth/invalid-credential":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return "Invalid email address or password.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/email-already-in-use":
      return "An account with this email already exists. Try signing in instead.";
    case "auth/weak-password":
      return "Password must be at least 6 characters (8+ recommended).";
    case "auth/operation-not-allowed":
      return "Email/Password sign-in is not enabled in Firebase Console → Authentication → Sign-in method.";
    case "auth/configuration-not-found":
      return "Firebase Authentication is not initialized yet in Firebase Console (click Get Started under Authentication).";
    case "auth/unauthorized-domain":
      return `Domain ${window.location.hostname} is not listed in Firebase Console → Authentication → Settings → Authorized domains.`;
    case "auth/too-many-requests":
      return "Too many failed attempts. Please wait a moment and try again.";
    case "auth/network-request-failed":
      return "Network error while contacting Firebase Authentication. Check your internet connection.";
    case "auth/user-disabled":
      return "This operator account has been disabled.";
    default:
      return err instanceof Error ? err.message : "Authentication failed.";
  }
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(isFirebaseConfigured && Boolean(auth));

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      setUser(null);
      setLoading(false);
      return;
    }

    setPersistence(auth, browserLocalPersistence).catch(() => {
      // Fallback to default persistence if storage is restricted
    });

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signIn = async (email: string, password: string): Promise<User> => {
    if (!isFirebaseConfigured || !auth) {
      throw new Error("Firebase Authentication is not configured for this deployment.");
    }
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    return cred.user;
  };

  const register = async (email: string, password: string): Promise<User> => {
    if (!isFirebaseConfigured || !auth) {
      throw new Error("Firebase Authentication is not configured for this deployment.");
    }
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    return cred.user;
  };

  const logout = async (): Promise<void> => {
    localStorage.removeItem("sentinel_token");
    localStorage.removeItem("sentinel_role");
    if (auth) {
      await signOut(auth);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isConfigured: isFirebaseConfigured,
        signIn,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
