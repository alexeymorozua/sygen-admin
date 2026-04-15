import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import NotificationBell from "@/components/NotificationBell";
import type { Notification } from "@/components/NotificationBell";
import { I18nProvider } from "@/lib/i18n";

function renderWithI18n(ui: React.ReactElement) {
  return render(<I18nProvider>{ui}</I18nProvider>);
}

const mockNotifications: Notification[] = [
  {
    id: "n1",
    type: "task_completed",
    message: "Task 'Deploy' completed",
    timestamp: new Date(Date.now() - 60_000).toISOString(), // 1 min ago
  },
  {
    id: "n2",
    type: "task_failed",
    message: "Task 'Build' failed",
    timestamp: new Date(Date.now() - 300_000).toISOString(), // 5 min ago
  },
  {
    id: "n3",
    type: "cron_failed",
    message: "Cron 'backup' failed",
    timestamp: new Date(Date.now() - 3600_000).toISOString(), // 1 hour ago
  },
];

beforeEach(() => {
  localStorage.clear();
});

describe("NotificationBell", () => {
  it("renders bell button with notification title", () => {
    renderWithI18n(<NotificationBell notifications={[]} />);
    expect(screen.getByText("Notifications")).toBeInTheDocument();
  });

  it("shows badge count for unread notifications", () => {
    renderWithI18n(<NotificationBell notifications={mockNotifications} />);
    // All 3 should be unread since localStorage is cleared
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("opens dropdown on click and shows notifications", () => {
    renderWithI18n(<NotificationBell notifications={mockNotifications} />);

    fireEvent.click(screen.getByText("Notifications"));

    // Should show notification messages in the dropdown
    expect(screen.getByText("Task 'Deploy' completed")).toBeInTheDocument();
    expect(screen.getByText("Task 'Build' failed")).toBeInTheDocument();
    expect(screen.getByText("Cron 'backup' failed")).toBeInTheDocument();
  });

  it("marks all as read when dropdown opens", () => {
    renderWithI18n(<NotificationBell notifications={mockNotifications} />);

    // Badge should show count before click
    expect(screen.getByText("3")).toBeInTheDocument();

    // Open dropdown
    fireEvent.click(screen.getByText("Notifications"));

    // Badge should disappear after opening (all marked as read)
    expect(screen.queryByText("3")).not.toBeInTheDocument();
  });

  it("shows empty state when no notifications", () => {
    renderWithI18n(<NotificationBell notifications={[]} />);

    fireEvent.click(screen.getByText("Notifications"));

    expect(screen.getByText("No notifications")).toBeInTheDocument();
  });

  it("does not show badge when no unread notifications", () => {
    // Set last read to future to mark all as read
    localStorage.setItem("sygen_notifications_last_read", String(Date.now() + 100000));

    renderWithI18n(<NotificationBell notifications={mockNotifications} />);

    // No badge count should be visible
    expect(screen.queryByText("3")).not.toBeInTheDocument();
  });
});
