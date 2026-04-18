import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { ServerProvider } from "@/context/ServerContext";
import { ChatProvider } from "@/context/ChatContext";
import { NotificationProvider } from "@/context/NotificationContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { ToastProvider } from "@/components/Toast";
import { ConfirmProvider } from "@/components/ConfirmDialog";
import { I18nProvider } from "@/lib/i18n";
import AppShell from "@/components/AppShell";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import InstallPWA from "@/components/InstallPWA";
import PwaTopBar from "@/components/PwaTopBar";
import ViewportLock from "@/components/ViewportLock";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sygen Admin Panel",
  description: "Панель управления многоагентной AI-системой Sygen",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a14" },
  ],
};

const splashScreens: { media: string; href: string }[] = [
  // iPhone 8 / SE2 — 375x667 @2x
  {
    media:
      "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)",
    href: "/splash/splash-750x1334.png",
  },
  // iPhone X / XS / 11 Pro — 375x812 @3x
  {
    media:
      "(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3)",
    href: "/splash/splash-1125x2436.png",
  },
  // iPhone 12/13/14 — 390x844 @3x
  {
    media:
      "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)",
    href: "/splash/splash-1170x2532.png",
  },
  // iPhone 14/15 Pro Max — 428x926 @3x
  {
    media:
      "(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3)",
    href: "/splash/splash-1284x2778.png",
  },
  // iPad — 810x1080 @2x
  {
    media:
      "(device-width: 810px) and (device-height: 1080px) and (-webkit-device-pixel-ratio: 2)",
    href: "/splash/splash-1620x2160.png",
  },
  // iPad Pro 12.9 — 1024x1366 @2x
  {
    media:
      "(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2)",
    href: "/splash/splash-2048x2732.png",
  },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="application-name" content="Sygen Admin" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Sygen" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        {/* Transparent apple-touch-icon — iOS renders it on a black backdrop,
            which matches the Sygen brand regardless of system theme. */}
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon-180.png" />
        <link rel="apple-touch-icon" sizes="192x192" href="/apple-touch-icon-192.png" />
        {splashScreens.map((s) => (
          <link
            key={s.href}
            rel="apple-touch-startup-image"
            media={s.media}
            href={s.href}
          />
        ))}
      </head>
      <body className="min-h-full bg-bg-primary text-text-primary">
        <ThemeProvider>
          <I18nProvider>
            <AuthProvider>
              <ServerProvider>
                <ChatProvider>
                <NotificationProvider>
                <ToastProvider>
                  <ConfirmProvider>
                    <ServiceWorkerRegister />
                    <ViewportLock />
                    <PwaTopBar />
                    <AppShell>{children}</AppShell>
                    <InstallPWA />
                  </ConfirmProvider>
                </ToastProvider>
                </NotificationProvider>
                </ChatProvider>
              </ServerProvider>
            </AuthProvider>
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
