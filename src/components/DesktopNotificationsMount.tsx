"use client";

import { useDesktopNotifications } from "@/hooks/useDesktopNotifications";

export default function DesktopNotificationsMount() {
  useDesktopNotifications();
  return null;
}
