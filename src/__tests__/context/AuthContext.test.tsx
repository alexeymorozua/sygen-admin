import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "@/context/AuthContext";

// Track router calls
const mockReplace = vi.fn();
const mockPush = vi.fn();
let mockPathname = "/";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => mockPathname,
}));

// Mock SygenAPI
const mockIsAuthenticated = vi.fn().mockReturnValue(false);
const mockAutoLogin = vi.fn().mockResolvedValue(false);
const mockLogin = vi.fn().mockResolvedValue({
  access_token: "t",
  refresh_token: "r",
  user: { username: "test", role: "admin", display_name: "Test", allowed_agents: [] },
});
const mockLogout = vi.fn().mockResolvedValue(undefined);
const mockGetMe = vi.fn().mockResolvedValue({
  username: "test", role: "admin", allowed_agents: [],
});

let mockStoredUser: { username: string; role: string; allowed_agents: string[] } | null = null;

vi.mock("@/lib/api", () => ({
  SygenAPI: {
    isAuthenticated: (...args: unknown[]) => mockIsAuthenticated(...args),
    autoLogin: (...args: unknown[]) => mockAutoLogin(...args),
    login: (...args: unknown[]) => mockLogin(...args),
    logout: (...args: unknown[]) => mockLogout(...args),
    getMe: (...args: unknown[]) => mockGetMe(...args),
  },
  getStoredUser: () => mockStoredUser,
  migrateLegacyLocalStorage: () => {},
}));

function TestConsumer() {
  const { isAuthenticated, isLoading, login, logout, hasRole, user } = useAuth();
  return (
    <div>
      <span data-testid="auth">{String(isAuthenticated)}</span>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="role">{user?.role || "none"}</span>
      <button onClick={() => login({ username: "test", password: "pass" })}>Login</button>
      <button onClick={() => logout()}>Logout</button>
    </div>
  );
}

beforeEach(() => {
  mockReplace.mockClear();
  mockPush.mockClear();
  mockIsAuthenticated.mockReturnValue(false);
  mockAutoLogin.mockResolvedValue(false);
  mockLogin.mockResolvedValue({
    access_token: "t",
    refresh_token: "r",
    user: { username: "test", role: "admin", display_name: "Test", allowed_agents: [] },
  });
  mockLogout.mockResolvedValue(undefined);
  mockPathname = "/";
});

describe("AuthProvider", () => {
  it("provides isAuthenticated = false by default", async () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("false");
    });

    expect(screen.getByTestId("auth")).toHaveTextContent("false");
  });

  it("provides isAuthenticated = true when auto-login succeeds", async () => {
    mockIsAuthenticated.mockReturnValue(true);
    mockAutoLogin.mockResolvedValue(true);

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("false");
    });

    expect(screen.getByTestId("auth")).toHaveTextContent("true");
  });

  it("login calls API and sets authenticated", async () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("false");
    });

    await act(async () => {
      screen.getByText("Login").click();
    });

    expect(mockLogin).toHaveBeenCalledWith({ username: "test", password: "pass" });
    expect(screen.getByTestId("auth")).toHaveTextContent("true");
    expect(screen.getByTestId("role")).toHaveTextContent("admin");
    expect(mockReplace).toHaveBeenCalledWith("/");
  });

  it("logout clears state and redirects", async () => {
    mockIsAuthenticated.mockReturnValue(true);
    mockAutoLogin.mockResolvedValue(true);

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("auth")).toHaveTextContent("true");
    });

    await act(async () => {
      screen.getByText("Logout").click();
    });

    expect(mockLogout).toHaveBeenCalled();
    expect(screen.getByTestId("auth")).toHaveTextContent("false");
    expect(mockReplace).toHaveBeenCalledWith("/login");
  });

  it("redirects to /login when not authenticated on protected path", async () => {
    mockPathname = "/agents";

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("false");
    });

    expect(mockReplace).toHaveBeenCalledWith("/login");
  });

  it("does not redirect on /login path", async () => {
    mockPathname = "/login";

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("false");
    });

    expect(mockReplace).not.toHaveBeenCalledWith("/login");
  });
});
