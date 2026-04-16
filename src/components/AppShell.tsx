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
      <main className="lg:ml-64 min-h-screen">
        <div className="p-3 sm:p-4 md:p-6 lg:p-8 pt-16 md:pt-6 lg:pt-8">{children}</div>
      </main>
    </>
  );
}
