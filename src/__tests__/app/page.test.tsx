import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import DashboardPage from "@/app/page";
import { I18nProvider } from "@/lib/i18n";
import type { ActivityRecentEvent, DashboardSummary } from "@/lib/api";

function renderWithI18n(ui: React.ReactElement) {
  return render(<I18nProvider>{ui}</I18nProvider>);
}

let mockServers = [
  { id: "default", name: "Default", url: "http://localhost:8080", token: "t", color: "#e94560", isDefault: true },
];
const mockActiveServer = mockServers[0];
const mockSwitchServer = vi.fn();

vi.mock("@/context/ServerContext", () => ({
  useServer: () => ({
    servers: mockServers,
    activeServer: mockActiveServer,
    switchServer: mockSwitchServer,
    refreshKey: 0,
  }),
}));

const mockGetDashboardSummary = vi.fn();
const mockGetActivityRecent = vi.fn();
const mockAckDashboardErrors = vi.fn();

vi.mock("@/lib/api", () => ({
  SygenAPI: {
    getDashboardSummary: () => mockGetDashboardSummary(),
    getActivityRecent: (limit?: number, severity?: string) =>
      mockGetActivityRecent(limit, severity),
    ackDashboardErrors: () => mockAckDashboardErrors(),
  },
}));

vi.mock("@/lib/servers", () => ({
  checkServerHealth: vi.fn().mockResolvedValue({ online: true, latency: 50 }),
}));

vi.mock("@/lib/utils", () => ({
  formatDate: (d: string) => d,
  formatDateTime: (d: string) => d,
  cn: (...classes: (string | false | undefined | null)[]) => classes.filter(Boolean).join(" "),
}));

const mockSummary: DashboardSummary = {
  system: {
    cpu_percent: 34,
    ram_percent: 62,
    disk_percent: 90,
    uptime_seconds: 1234567,
    uptime_human: "14d 7h 23m",
  },
  counters: {
    agents_total: 2,
    agents_online: 1,
    active_tasks: 2,
    running_crons: 3,
    failed_last_24h: 0,
  },
  recent_activity: [
    {
      id: "evt1",
      type: "task_completed",
      title: "Task 'Refresh cache' completed",
      subtitle: "main · 2 minutes ago",
      agent_name: "main",
      timestamp: "2026-04-19T10:00:00Z",
      severity: "success",
    },
    {
      id: "evt2",
      type: "cron_fired",
      title: "Cron 'Daily digest' fired",
      subtitle: "main · 5 minutes ago",
      agent_name: "main",
      timestamp: "2026-04-19T09:57:00Z",
      severity: "info",
    },
    {
      id: "evt3",
      type: "task_failed",
      title: "Task 'Sync inbox' failed",
      subtitle: "nexus · 8 minutes ago",
      agent_name: "nexus",
      timestamp: "2026-04-19T09:54:00Z",
      severity: "error",
    },
    {
      id: "evt4",
      type: "webhook_throttled",
      title: "Webhook 'github push' throttled",
      subtitle: "main · 10 minutes ago",
      agent_name: "main",
      timestamp: "2026-04-19T09:50:00Z",
      severity: "warning",
    },
  ],
};

beforeEach(() => {
  mockGetDashboardSummary.mockReset();
  mockGetActivityRecent.mockReset();
  mockAckDashboardErrors.mockReset();
  mockGetDashboardSummary.mockResolvedValue(mockSummary);
  mockGetActivityRecent.mockResolvedValue([]);
  mockAckDashboardErrors.mockResolvedValue({ ack_at: Date.now() / 1000 });
  mockServers = [
    { id: "default", name: "Default", url: "http://localhost:8080", token: "t", color: "#e94560", isDefault: true },
  ];
  // jsdom lacks scrollIntoView; the dashboard uses it to reveal the activity
  // card after the error-counter tile is clicked.
  Element.prototype.scrollIntoView = vi.fn();
});

describe("DashboardPage", () => {
  it("renders counter tiles with values, labels and lucide icons", async () => {
    renderWithI18n(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("Dashboard")).toBeInTheDocument();
    });

    const agentsTile = screen.getByTestId("counter-Agents");
    expect(within(agentsTile).getByText("1/2")).toBeInTheDocument();
    expect(within(agentsTile).getByText(/1 online/)).toBeInTheDocument();
    expect(screen.getByTestId("counter-Agents-icon").tagName.toLowerCase()).toBe("svg");

    const tasksTile = screen.getByTestId("counter-Active Tasks");
    expect(within(tasksTile).getByText("2")).toBeInTheDocument();
    expect(screen.getByTestId("counter-Active Tasks-icon").tagName.toLowerCase()).toBe("svg");

    const cronTile = screen.getByTestId("counter-Cron Jobs");
    expect(within(cronTile).getByText("3")).toBeInTheDocument();

    const failedTile = screen.getByTestId("counter-Failed (24h)");
    expect(within(failedTile).getByText("0")).toBeInTheDocument();
  });

  it("renders system metrics: threshold colors the %, resource tone colors the bar", async () => {
    renderWithI18n(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("System Health")).toBeInTheDocument();
    });

    // CPU 34% → ok threshold, cpu tone
    const cpu = screen.getByTestId("metric-cpu");
    expect(cpu.dataset.level).toBe("ok");
    expect(cpu.dataset.tone).toBe("cpu");
    expect(within(cpu).getByText("34%").className).toContain("text-success");
    expect(screen.getByTestId("metric-cpu-bar").className).toContain("bg-sky-500");

    // RAM 62% → warn threshold, ram tone
    const ram = screen.getByTestId("metric-ram");
    expect(ram.dataset.level).toBe("warn");
    expect(ram.dataset.tone).toBe("ram");
    expect(within(ram).getByText("62%").className).toContain("text-warning");
    expect(screen.getByTestId("metric-ram-bar").className).toContain("bg-purple-500");

    // Disk 90% → critical threshold, disk tone
    const disk = screen.getByTestId("metric-disk");
    expect(disk.dataset.level).toBe("critical");
    expect(disk.dataset.tone).toBe("disk");
    expect(within(disk).getByText("90%").className).toContain("text-danger");
    expect(screen.getByTestId("metric-disk-bar").className).toContain("bg-teal-500");

    expect(screen.getByText("14d 7h 23m")).toBeInTheDocument();
  });

  it("renders activity items with severity-driven left accent border", async () => {
    renderWithI18n(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("Task 'Refresh cache' completed")).toBeInTheDocument();
    });

    const success = screen.getByTestId("activity-evt1");
    expect(success.dataset.severity).toBe("success");
    expect(success.className).toContain("border-l-success");

    const info = screen.getByTestId("activity-evt2");
    expect(info.dataset.severity).toBe("info");
    expect(info.className).toContain("border-l-brand-400");

    const error = screen.getByTestId("activity-evt3");
    expect(error.dataset.severity).toBe("error");
    expect(error.className).toContain("border-l-danger");

    const warn = screen.getByTestId("activity-evt4");
    expect(warn.dataset.severity).toBe("warning");
    expect(warn.className).toContain("border-l-warning");

    // Title and actor split out of subtitle, relative time on the right
    expect(within(success).getByText("Task 'Refresh cache' completed")).toBeInTheDocument();
    expect(within(success).getByText("main")).toBeInTheDocument();
    expect(within(success).getByText("2026-04-19T10:00:00Z")).toBeInTheDocument();

    // Raw event types must not leak into the DOM
    expect(screen.queryByText(/task_completed/)).not.toBeInTheDocument();
    expect(screen.queryByText(/cron_fired/)).not.toBeInTheDocument();
  });

  it("shows empty state when recent_activity is empty", async () => {
    mockGetDashboardSummary.mockResolvedValue({
      ...mockSummary,
      recent_activity: [],
    });

    renderWithI18n(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("No recent activity")).toBeInTheDocument();
    });
  });

  it("renders skeleton placeholders while loading", () => {
    mockGetDashboardSummary.mockReturnValue(new Promise(() => {}));

    renderWithI18n(<DashboardPage />);

    const skeleton = screen.getByTestId("dashboard-skeleton");
    expect(skeleton).toBeInTheDocument();
    expect(skeleton.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("shows error state on API failure", async () => {
    mockGetDashboardSummary.mockRejectedValue(new Error("Network error"));

    renderWithI18n(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });

    expect(screen.getByText("Retry")).toBeInTheDocument();
  });

  it("does not show connected servers section when only one server", async () => {
    renderWithI18n(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("Dashboard")).toBeInTheDocument();
    });

    expect(screen.queryByText("Connected Servers")).not.toBeInTheDocument();
  });

  describe("errors filter + ack flow", () => {
    const summaryWithErrors: DashboardSummary = {
      ...mockSummary,
      counters: { ...mockSummary.counters, failed_last_24h: 3 },
    };

    const backendErrorFeed: ActivityRecentEvent[] = [
      {
        id: "err-a",
        type: "task_failed",
        title: "Task 'A' failed",
        subtitle: "main · 1 minute ago",
        agent_name: "main",
        timestamp: "2026-04-19T09:59:00Z",
        severity: "error",
      },
      {
        id: "err-b",
        type: "task_failed",
        title: "Task 'B' failed",
        subtitle: "nexus · 2 minutes ago",
        agent_name: "nexus",
        timestamp: "2026-04-19T09:58:00Z",
        severity: "error",
      },
      {
        id: "err-c",
        type: "cron_failed",
        title: "Cron 'C' failed",
        subtitle: "sonic · 3 minutes ago",
        agent_name: "sonic",
        timestamp: "2026-04-19T09:57:00Z",
        severity: "error",
      },
    ];

    it("fetches errors feed from backend when Failed (24h) tile is clicked", async () => {
      mockGetDashboardSummary.mockResolvedValue(summaryWithErrors);
      mockGetActivityRecent.mockResolvedValue(backendErrorFeed);

      renderWithI18n(<DashboardPage />);

      const failedTile = await screen.findByTestId("counter-Failed (24h)");
      expect(within(failedTile).getByText("3")).toBeInTheDocument();

      fireEvent.click(failedTile);

      await waitFor(() => {
        expect(mockGetActivityRecent).toHaveBeenCalledWith(50, "error");
      });

      // All three backend-provided errors are rendered, even if the summary's
      // top-10 slice never included them.
      expect(await screen.findByTestId("activity-err-a")).toBeInTheDocument();
      expect(screen.getByTestId("activity-err-b")).toBeInTheDocument();
      expect(screen.getByTestId("activity-err-c")).toBeInTheDocument();
    });

    it("clicking 'Clear' posts to ack endpoint and re-fetches summary + errors feed", async () => {
      mockGetDashboardSummary.mockResolvedValue(summaryWithErrors);
      mockGetActivityRecent.mockResolvedValue(backendErrorFeed);

      renderWithI18n(<DashboardPage />);

      fireEvent.click(await screen.findByTestId("counter-Failed (24h)"));

      const clearBtn = await screen.findByTestId("activity-clear-errors");
      expect(clearBtn).not.toBeDisabled();

      const summaryCallsBefore = mockGetDashboardSummary.mock.calls.length;
      const errorsCallsBefore = mockGetActivityRecent.mock.calls.length;

      await act(async () => {
        fireEvent.click(clearBtn);
      });

      await waitFor(() => {
        expect(mockAckDashboardErrors).toHaveBeenCalledTimes(1);
      });
      // Both the summary and the errors-feed are re-fetched after ack so the
      // counter tile and the filtered activity list stay in sync.
      expect(mockGetDashboardSummary.mock.calls.length).toBeGreaterThan(summaryCallsBefore);
      expect(mockGetActivityRecent.mock.calls.length).toBeGreaterThan(errorsCallsBefore);
    });

    it("Clear button becomes disabled once the counter drops to 0 after ack", async () => {
      mockGetDashboardSummary.mockResolvedValueOnce(summaryWithErrors);
      mockGetActivityRecent.mockResolvedValueOnce(backendErrorFeed);
      // After ack, every subsequent summary fetch reports 0.
      mockGetDashboardSummary.mockResolvedValue({
        ...summaryWithErrors,
        counters: { ...summaryWithErrors.counters, failed_last_24h: 0 },
      });
      mockGetActivityRecent.mockResolvedValue([]);

      renderWithI18n(<DashboardPage />);

      fireEvent.click(await screen.findByTestId("counter-Failed (24h)"));
      const clearBtn = await screen.findByTestId("activity-clear-errors");
      expect(clearBtn).not.toBeDisabled();

      await act(async () => {
        fireEvent.click(clearBtn);
      });

      await waitFor(() => {
        expect(clearBtn).toBeDisabled();
      });
    });
  });
});
