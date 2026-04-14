"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SygenAPI, getStoredUser } from "@/lib/api";
import type { UserInfo } from "@/lib/api";

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: UserInfo | null;
  login: (credentials: { username: string; password: string } | { token: string }) => Promise<void>;
  logout: () => Promise<void>;
  hasRole: (minRole: "viewer" | "operator" | "admin") => boolean;
  canAccessAgent: (agentName: string) => boolean;
}

const ROLE_LEVELS: Record<string, number> = { viewer: 0, operator: 1, admin: 2 };

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  isLoading: true,
  user: null,
  login: async () => {},
  logout: async () => {},
  hasRole: () => false,
  canAccessAgent: () => false,
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
          if (stored) {
            setUser(stored);
          } else {
            try {
              const me = await SygenAPI.getMe();
              setUser(me);
            } catch { /* ignore */ }
          }
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

  const login = useCallback(async (credentials: { username: string; password: string } | { token: string }) => {
    const response = await SygenAPI.login(credentials);
    setIsAuthenticated(true);
    setUser(response.user || null);
    router.replace("/");
  }, [router]);

  const logout = useCallback(async () => {
    await SygenAPI.logout();
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

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, user, login, logout, hasRole, canAccessAgent }}>
      {children}
    </AuthContext.Provider>
  );
}
