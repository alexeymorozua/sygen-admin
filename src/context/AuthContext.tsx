"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SygenAPI, getStoredUser } from "@/lib/api";
import type { UserInfo, LoginResponse } from "@/lib/api";

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: UserInfo | null;
  login: (credentials: { username: string; password: string }) => Promise<LoginResponse>;
  login2FA: (tempToken: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  hasRole: (minRole: "viewer" | "operator" | "admin") => boolean;
  canAccessAgent: (agentName: string) => boolean;
  refreshUser: (updated: UserInfo) => void;
}

const ROLE_LEVELS: Record<string, number> = { viewer: 0, operator: 1, admin: 2 };

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  isLoading: true,
  user: null,
  login: async () => ({ access_token: "", refresh_token: "", user: {} as UserInfo }),
  login2FA: async () => {},
  logout: async () => {},
  hasRole: () => false,
  canAccessAgent: () => false,
  refreshUser: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

const PUBLIC_PATHS = ["/login"];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<UserInfo | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    async function init() {
      if (SygenAPI.isAuthenticated()) {
        const success = await SygenAPI.autoLogin();
        if (success) {
          setIsAuthenticated(true);
          const stored = getStoredUser();
          if (stored) setUser(stored);
          try {
            const me = await SygenAPI.getMe();
            setUser(me);
          } catch { /* ignore network errors, keep stored */ }
        } else {
          setIsAuthenticated(false);
          setUser(null);
          SygenAPI.logout();
        }
      } else {
        setIsAuthenticated(false);
        setUser(null);
      }
      setIsLoading(false);
    }
    init();
  }, []);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated && !PUBLIC_PATHS.includes(pathname)) {
      router.replace("/login");
    }
  }, [isAuthenticated, isLoading, pathname, router]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const me = await SygenAPI.getMe();
        setUser(me);
      } catch { /* ignore */ }
    };
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, [isAuthenticated]);

  const login = useCallback(async (credentials: { username: string; password: string }) => {
    const response = await SygenAPI.login(credentials);
    if (response.requires_2fa) {
      // Don't authenticate yet — caller handles 2FA step
      return response;
    }
    setIsAuthenticated(true);
    setUser(response.user || null);
    router.replace("/");
    return response;
  }, [router]);

  const login2FA = useCallback(async (tempToken: string, code: string) => {
    const response = await SygenAPI.login2FA(tempToken, code);
    setIsAuthenticated(true);
    setUser(response.user || null);
    router.replace("/");
  }, [router]);

  const logout = useCallback(async () => {
    await SygenAPI.logout();
    if (typeof navigator !== "undefined" && navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({ type: "CLEAR_PAGES_CACHE" });
    }
    setIsAuthenticated(false);
    setUser(null);
    router.replace("/login");
  }, [router]);

  const hasRole = useCallback((minRole: "viewer" | "operator" | "admin") => {
    if (!user) return false;
    const userLevel = ROLE_LEVELS[user.role] ?? -1;
    const requiredLevel = ROLE_LEVELS[minRole] ?? 0;
    return userLevel >= requiredLevel;
  }, [user]);

  const canAccessAgent = useCallback((agentName: string) => {
    if (!user) return false;
    if (!user.allowed_agents || user.allowed_agents.length === 0) return true;
    return user.allowed_agents.includes(agentName);
  }, [user]);

  const refreshUser = useCallback((updated: UserInfo) => {
    setUser(updated);
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, user, login, login2FA, logout, hasRole, canAccessAgent, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}
