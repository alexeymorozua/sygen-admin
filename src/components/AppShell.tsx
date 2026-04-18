"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import Sidebar from "@/components/Sidebar";
import CommandPalette from "@/components/CommandPalette";
import KeyboardShortcuts from "@/components/KeyboardShortcuts";
import { Loader2 } from "lucide-react";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-text-secondary" />
      </div>
    );
  }

  if (isLoginPage || !isAuthenticated) {
    return <>{children}</>;
  }

  return (
    <>
      <Sidebar />
      <CommandPalette />
      <KeyboardShortcuts />
      <main className="lg:ml-64 h-[100dvh] flex flex-col overflow-hidden">
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-3 sm:p-4 md:p-6 lg:p-8 pt-[calc(env(safe-area-inset-top)+3.5rem)] md:pt-6 lg:pt-8">
          {children}
        </div>
      </main>
    </>
  );
}
