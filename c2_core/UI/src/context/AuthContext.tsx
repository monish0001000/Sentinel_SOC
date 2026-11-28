import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  onAuthStateChanged,
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
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: false,
  isConfigured: isFirebaseConfigured,
  signIn: async () => {
    throw new Error("Firebase Authentication is not configured.");
  },
  logout: async () => {},
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(isFirebaseConfigured && Boolean(auth));

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      setUser(null);
      setLoading(false);
      return;
    }

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
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
