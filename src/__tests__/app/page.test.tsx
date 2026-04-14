import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import DashboardPage from "@/app/page";
import { I18nProvider } from "@/lib/i18n";

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
const mockGetAgents = vi.fn();
const mockGetActivity = vi.fn();
const mockGetSystemStatus = vi.fn();
const mockGetCronJobs = vi.fn();
const mockGetWebhooks = vi.fn();
const mockGetTasks = vi.fn();

vi.mock("@/lib/api", () => ({
  SygenAPI: {
    getAgents: () => mockGetAgents(),
    getActivity: () => mockGetActivity(),
    getSystemStatus: () => mockGetSystemStatus(),
    getCronJobs: () => mockGetCronJobs(),
    getWebhooks: () => mockGetWebhooks(),
    getTasks: () => mockGetTasks(),
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

const mockAgents = [
  { id: "main", name: "main", displayName: "Main", model: "claude-4", provider: "anthropic", status: "online", sessions: 2, lastActive: "", description: "", allowedUsers: [] },
  { id: "prism", name: "prism", displayName: "Prism", model: "claude-4", provider: "anthropic", status: "offline", sessions: 0, lastActive: "", description: "", allowedUsers: [] },
];

const mockHealth = {
  cpu: 34,
  ram: 62,
  disk: 45,
  uptime: "14d 7h 23m",
  agents: 2,
  sessions: 5,
  cronJobs: 3,
  tasksTotal: 10,
  tasksActive: 2,
};

const mockCrons = [
  { id: "c1", name: "Job1", status: "active", schedule: "* * * * *" },
  { id: "c2", name: "Job2", status: "paused", schedule: "0 * * * *" },
];

const mockWebhooksData = [
  { id: "w1", name: "WH1", status: "active" },
];

const mockTasksData = [
  { id: "t1", name: "Task1", status: "running" },
  { id: "t2", name: "Task2", status: "completed" },
];

beforeEach(() => {
  mockGetAgents.mockResolvedValue(mockAgents);
  mockGetActivity.mockResolvedValue([]);
  mockGetSystemStatus.mockResolvedValue(mockHealth);
  mockGetCronJobs.mockResolvedValue(mockCrons);
  mockGetWebhooks.mockResolvedValue(mockWebhooksData);
  mockGetTasks.mockResolvedValue(mockTasksData);
  mockServers = [
    { id: "default", name: "Default", url: "http://localhost:8080", token: "t", color: "#e94560", isDefault: true },
  ];
});

describe("DashboardPage", () => {
  it("renders status cards with correct data", async () => {
    renderWithI18n(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("Dashboard")).toBeInTheDocument();
    });

    // Agents card: 1 online / 2 total
    expect(screen.getByText("1/2")).toBeInTheDocument();
    expect(screen.getByText("1 online")).toBeInTheDocument();

    // Tasks card
    expect(screen.getByText("Active Tasks")).toBeInTheDocument();

    // Cron card
    expect(screen.getByText("Cron Jobs")).toBeInTheDocument();

    // Webhooks card
    expect(screen.getByText("Webhooks")).toBeInTheDocument();
  });

  it("shows loading state initially", () => {
    // Make API calls never resolve
    mockGetAgents.mockReturnValue(new Promise(() => {}));
    mockGetActivity.mockReturnValue(new Promise(() => {}));
    mockGetSystemStatus.mockReturnValue(new Promise(() => {}));
    mockGetCronJobs.mockReturnValue(new Promise(() => {}));
    mockGetWebhooks.mockReturnValue(new Promise(() => {}));
    mockGetTasks.mockReturnValue(new Promise(() => {}));

    const { container } = renderWithI18n(<DashboardPage />);

    // LoadingSpinner has animate-spin class
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("shows error state on API failure", async () => {
    mockGetAgents.mockRejectedValue(new Error("Network error"));

    renderWithI18n(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });

    expect(screen.getByText("Retry")).toBeInTheDocument();
  });

  it("shows system health metrics", async () => {
    renderWithI18n(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("System Health")).toBeInTheDocument();
    });

    expect(screen.getByText("34%")).toBeInTheDocument();
    expect(screen.getByText("62%")).toBeInTheDocument();
    expect(screen.getByText("45%")).toBeInTheDocument();
    expect(screen.getByText("14d 7h 23m")).toBeInTheDocument();
  });

  it("does not show connected servers section when only one server", async () => {
    renderWithI18n(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("Dashboard")).toBeInTheDocument();
    });

    expect(screen.queryByText("Connected Servers")).not.toBeInTheDocument(); // EN default
  });
});
