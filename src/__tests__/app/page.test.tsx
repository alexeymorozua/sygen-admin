import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import DashboardPage from "@/app/page";
import { I18nProvider } from "@/lib/i18n";
import type { DashboardSummary } from "@/lib/api";

function renderWithI18n(ui: React.ReactElement) {
  return render(<I18nProvider>{ui}</I18nProvider>);
}

// Mock ServerContext
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

// Mock API
const mockGetDashboardSummary = vi.fn();

vi.mock("@/lib/api", () => ({
  SygenAPI: {
    getDashboardSummary: () => mockGetDashboardSummary(),
  },
}));

vi.mock("@/lib/servers", () => ({
  checkServerHealth: vi.fn().mockResolvedValue({ online: true, latency: 50 }),
}));

// Mock utils
vi.mock("@/lib/utils", () => ({
  formatDate: (d: string) => d,
  formatDateTime: (d: string) => d,
  cn: (...classes: (string | false | undefined | null)[]) => classes.filter(Boolean).join(" "),
}));

const mockSummary: DashboardSummary = {
  system: {
    cpu_percent: 34,
    ram_percent: 62,
    disk_percent: 45,
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
  ],
};

beforeEach(() => {
  mockGetDashboardSummary.mockResolvedValue(mockSummary);
  mockServers = [
    { id: "default", name: "Default", url: "http://localhost:8080", token: "t", color: "#e94560", isDefault: true },
  ];
});

describe("DashboardPage", () => {
  it("renders counter cards from dashboard summary", async () => {
    renderWithI18n(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("Dashboard")).toBeInTheDocument();
    });

    // Agents card: agents_online / agents_total
    expect(screen.getByText("1/2")).toBeInTheDocument();
    expect(screen.getByText("1 online")).toBeInTheDocument();

    // Active tasks card
    expect(screen.getByText("Active Tasks")).toBeInTheDocument();
    expect(screen.getByText("2 running")).toBeInTheDocument();

    // Cron card
    expect(screen.getByText("Cron Jobs")).toBeInTheDocument();
    expect(screen.getByText("3 active")).toBeInTheDocument();

    // Failed last 24h card
    expect(screen.getByText("Failed (24h)")).toBeInTheDocument();
  });

  it("renders recent activity with localized title and subtitle", async () => {
    renderWithI18n(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("Task 'Refresh cache' completed")).toBeInTheDocument();
    });

    // Subtitles include actor + relative time
    expect(screen.getByText("main · 2 minutes ago")).toBeInTheDocument();
    expect(screen.getByText("Cron 'Daily digest' fired")).toBeInTheDocument();
    expect(screen.getByText("main · 5 minutes ago")).toBeInTheDocument();

    // Raw event type must NOT leak into the DOM
    expect(screen.queryByText(/task_completed/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/cron_fired/i)).not.toBeInTheDocument();
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

  it("shows loading state initially", () => {
    mockGetDashboardSummary.mockReturnValue(new Promise(() => {}));

    const { container } = renderWithI18n(<DashboardPage />);

    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("shows error state on API failure", async () => {
    mockGetDashboardSummary.mockRejectedValue(new Error("Network error"));

    renderWithI18n(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });

    expect(screen.getByText("Retry")).toBeInTheDocument();
  });

  it("renders system health metrics from system payload", async () => {
    renderWithI18n(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("System Health")).toBeInTheDocument();
    });

    expect(screen.getByText("34%")).toBeInTheDocument();
    expect(screen.getByText("62%")).toBeInTheDocument();
    expect(screen.getByText("45%")).toBeInTheDocument();
    // uptime_human is rendered as-is from backend
    expect(screen.getByText("14d 7h 23m")).toBeInTheDocument();
  });

  it("does not show connected servers section when only one server", async () => {
    renderWithI18n(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("Dashboard")).toBeInTheDocument();
    });

    expect(screen.queryByText("Connected Servers")).not.toBeInTheDocument();
  });
});
