import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import StatusBadge from "@/components/StatusBadge";
import { I18nProvider } from "@/lib/i18n";

function renderWithI18n(ui: React.ReactElement) {
  return render(<I18nProvider>{ui}</I18nProvider>);
}

describe("StatusBadge", () => {
  const statuses = [
    { status: "active" as const, expectedClass: "bg-green-500/20", text: "Active" },
    { status: "online" as const, expectedClass: "bg-green-500/20", text: "Online" },
    { status: "running" as const, expectedClass: "bg-brand-500/20", text: "Running" },
    { status: "paused" as const, expectedClass: "bg-yellow-500/20", text: "Paused" },
    { status: "completed" as const, expectedClass: "bg-green-500/20", text: "Completed" },
    { status: "error" as const, expectedClass: "bg-red-500/20", text: "Error" },
    { status: "failed" as const, expectedClass: "bg-red-500/20", text: "Failed" },
    { status: "cancelled" as const, expectedClass: "bg-gray-500/20", text: "Cancelled" },
    { status: "offline" as const, expectedClass: "bg-gray-500/20", text: "Offline" },
  ];

  statuses.forEach(({ status, expectedClass, text }) => {
    it(`renders correct color and text for "${status}"`, () => {
      renderWithI18n(<StatusBadge status={status} />);
      const badge = screen.getByText(text);
      expect(badge.closest("span")).toHaveClass(expectedClass);
    });
  });

  it("capitalizes the first letter of status text", () => {
    renderWithI18n(<StatusBadge status="running" />);
    expect(screen.getByText("Running")).toBeInTheDocument();
  });

  it("renders a dot indicator", () => {
    const { container } = renderWithI18n(<StatusBadge status="active" />);
    const dot = container.querySelector(".w-1\\.5");
    expect(dot).toBeInTheDocument();
    expect(dot).toHaveClass("bg-green-400");
  });

  it("running dot has pulse animation", () => {
    const { container } = renderWithI18n(<StatusBadge status="running" />);
    const dot = container.querySelector(".w-1\\.5");
    expect(dot).toHaveClass("animate-pulse");
  });
});
