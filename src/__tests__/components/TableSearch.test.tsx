import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import TableSearch from "@/components/TableSearch";

// Mock i18n
vi.mock("@/lib/i18n", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    locale: "en",
    setLocale: vi.fn(),
  }),
}));

describe("TableSearch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("renders search input with placeholder", () => {
    render(<TableSearch placeholder="Search tasks..." onSearch={vi.fn()} />);
    expect(screen.getByPlaceholderText("Search tasks...")).toBeInTheDocument();
  });

  it("uses default placeholder from i18n when none provided", () => {
    render(<TableSearch onSearch={vi.fn()} />);
    expect(screen.getByPlaceholderText("common.search")).toBeInTheDocument();
  });

  it("calls onSearch after debounce", () => {
    const onSearch = vi.fn();
    render(<TableSearch onSearch={onSearch} debounceMs={300} />);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "test" } });

    // Should not be called immediately
    expect(onSearch).not.toHaveBeenCalledWith("test");

    // After debounce
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(onSearch).toHaveBeenCalledWith("test");
  });

  it("debounces multiple rapid inputs", () => {
    const onSearch = vi.fn();
    render(<TableSearch onSearch={onSearch} debounceMs={300} />);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "t" } });
    fireEvent.change(input, { target: { value: "te" } });
    fireEvent.change(input, { target: { value: "tes" } });
    fireEvent.change(input, { target: { value: "test" } });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    // Only the final value should be passed
    expect(onSearch).toHaveBeenLastCalledWith("test");
  });

  it("shows clear button when text is entered", () => {
    render(<TableSearch onSearch={vi.fn()} />);

    const input = screen.getByRole("textbox");

    // No clear button initially
    expect(screen.queryByLabelText("Clear search")).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: "query" } });

    // Clear button should appear
    expect(screen.getByLabelText("Clear search")).toBeInTheDocument();
  });

  it("clears input when clear button is clicked", () => {
    const onSearch = vi.fn();
    render(<TableSearch onSearch={onSearch} debounceMs={300} />);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "query" } });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    // Click clear
    fireEvent.click(screen.getByLabelText("Clear search"));

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect((input as HTMLInputElement).value).toBe("");
    expect(onSearch).toHaveBeenLastCalledWith("");
  });
});
