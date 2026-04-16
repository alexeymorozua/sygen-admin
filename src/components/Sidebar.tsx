"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Bot,
  MessageSquare,
  Clock,
  Webhook,
  ListTodo,
  Bell,
  Brain,
  Settings,
  Menu,
  X,
  Hexagon,
  Server,
  Sun,
  Moon,
  Users,
  User,
  FolderOpen,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { useTranslation } from "@/lib/i18n";
import ConnectionStatus from "./ConnectionStatus";
import ServerSwitcher from "./ServerSwitcher";
import LanguageSwitcher from "./LanguageSwitcher";
import { useNotifications } from "@/context/NotificationContext";

interface NavItem {
  href: string;
  labelKey: string;
  icon: typeof LayoutDashboard;
  minRole?: "viewer" | "operator" | "admin";
}

const navItems: NavItem[] = [
  { href: "/", labelKey: "nav.dashboard", icon: LayoutDashboard },
  { href: "/agents", labelKey: "nav.agents", icon: Bot },
  { href: "/chat", labelKey: "nav.chat", icon: MessageSquare },
  { href: "/cron", labelKey: "nav.cron", icon: Clock, minRole: "operator" },
  { href: "/webhooks", labelKey: "nav.webhooks", icon: Webhook, minRole: "operator" },
  { href: "/tasks", labelKey: "nav.tasks", icon: ListTodo },
  { href: "/files", labelKey: "nav.files", icon: FolderOpen },
  { href: "/notifications", labelKey: "nav.notifications", icon: Bell },
  { href: "/memory", labelKey: "nav.memory", icon: Brain, minRole: "operator" },
  { href: "/skills", labelKey: "nav.skills", icon: Sparkles, minRole: "operator" },
  { href: "/users", labelKey: "nav.users", icon: Users, minRole: "admin" },
  { href: "/servers", labelKey: "nav.servers", icon: Server, minRole: "admin" },
  { href: "/settings", labelKey: "nav.settings", icon: Settings },
  { href: "/profile", labelKey: "nav.profile", icon: User },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const { t } = useTranslation();
  const { hasRole, user } = useAuth();
  const { unreadCount } = useNotifications();

  const visibleNav = navItems.filter((item) => !item.minRole || hasRole(item.minRole));

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && mobileOpen) {
        setMobileOpen(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mobileOpen]);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const nav = (
    <>
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-6">
        <Hexagon size={28} className="text-danger" />
        <span className="text-xl font-bold tracking-wider">SYGEN</span>
      </div>

      {/* Server Switcher */}
      <ServerSwitcher />

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-1">
        {visibleNav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
              isActive(item.href)
                ? "bg-accent text-accent-foreground"
                : "text-text-secondary hover:text-text-primary hover:bg-white/5"
            )}
          >
            <div className="relative">
              <item.icon size={18} />
              {item.href === "/notifications" && unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-danger text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </div>
            {t(item.labelKey)}
          </Link>
        ))}
      </nav>

      {/* Theme toggle + Language + Connection Status */}
      <div className="border-t border-border">
        <button
          type="button"
          onClick={toggleTheme}
          className="flex items-center gap-3 w-full px-6 py-3 text-sm text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors"
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
        >
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          {theme === "dark" ? "Light Mode" : "Dark Mode"}
        </button>
        <LanguageSwitcher />
        <ConnectionStatus />
      </div>
    </>
  );

  return (
    <>
      {/* Mobile toggle */}
      <button
        type="button"
        onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-bg-card border border-border rounded-lg"
        aria-label={mobileOpen ? "Close menu" : "Open menu"}
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/60 z-30"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed top-0 left-0 h-full w-64 bg-bg-sidebar border-r border-border flex flex-col z-40 transition-transform duration-200",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {nav}
      </aside>
    </>
  );
}
