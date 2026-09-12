import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import * as authApi from "@/services/authApi";
import { clearSession, getAccessToken, saveSession } from "@/lib/session";
import type { User } from "@/types";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string, rememberDevice?: boolean) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const hasToken = Boolean(getAccessToken());
    if (!hasToken) {
      setIsLoading(false);
      return;
    }
    authApi
      .fetchCurrentUser()
      .then(setUser)
      .catch(() => {
        clearSession();
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string, rememberDevice = false) => {
    const tokenResponse = await authApi.login(email, password);
    saveSession(tokenResponse.access_token, tokenResponse.refresh_token, rememberDevice);
    setUser(tokenResponse.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      clearSession();
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated: Boolean(user), login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
