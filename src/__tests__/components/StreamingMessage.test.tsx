import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import StreamingMessage from "@/components/StreamingMessage";

// Mock react-markdown
vi.mock("react-markdown", () => ({
  default: ({ children }: { children: string }) => {
    const React = require("react");
    return React.createElement("div", { "data-testid": "markdown" }, children);
  },
}));

// Mock rehype-sanitize
vi.mock("rehype-sanitize", () => ({
  default: {},
}));

describe("StreamingMessage", () => {
  const baseProps = {
    id: "msg-1",
    sender: "agent" as const,
    agentName: "Prism",
    content: "Hello **world**",
    timestamp: new Date().toISOString(),
  };

  it("renders markdown content for agent messages", () => {
    render(<StreamingMessage {...baseProps} />);
    expect(screen.getByTestId("markdown")).toHaveTextContent("Hello **world**");
  });

  it("renders plain text for user messages", () => {
    render(
      <StreamingMessage
        {...baseProps}
        sender="user"
        content="My message"
      />
    );
    expect(screen.getByText("My message")).toBeInTheDocument();
    expect(screen.queryByTestId("markdown")).not.toBeInTheDocument();
  });

  it("shows bouncing dots when streaming with no content yet", () => {
    const { container } = render(
      <StreamingMessage {...baseProps} content="" isStreaming={true} />
    );
    const dots = container.querySelectorAll(".animate-bounce.bg-brand-400");
    expect(dots.length).toBe(3);
  });

  it("hides bouncing dots once content arrives", () => {
    const { container } = render(
      <StreamingMessage {...baseProps} content="Hi" isStreaming={true} />
    );
    const dots = container.querySelectorAll(".animate-bounce.bg-brand-400");
    expect(dots.length).toBe(0);
  });

  it("hides bouncing dots when not streaming", () => {
    const { container } = render(
      <StreamingMessage {...baseProps} content="" isStreaming={false} />
    );
    const dots = container.querySelectorAll(".animate-bounce.bg-brand-400");
    expect(dots.length).toBe(0);
  });

  it("shows agent name for agent messages", () => {
    render(<StreamingMessage {...baseProps} />);
    expect(screen.getByText("Prism")).toBeInTheDocument();
  });

  it("does not show agent name for user messages", () => {
    render(<StreamingMessage {...baseProps} sender="user" />);
    expect(screen.queryByText("Prism")).not.toBeInTheDocument();
  });

  it("shows tool activity indicator", () => {
    render(<StreamingMessage {...baseProps} toolActivity="web_search" />);
    expect(screen.getByText("web_search")).toBeInTheDocument();
  });

  it("does not show tool activity for user messages", () => {
    render(
      <StreamingMessage
        {...baseProps}
        sender="user"
        toolActivity="web_search"
      />
    );
    expect(screen.queryByText("web_search")).not.toBeInTheDocument();
  });

  it("renders kind label for task_result with task_name", () => {
    render(
      <StreamingMessage
        {...baseProps}
        kind="task_result"
        meta={{ task_id: "t-1", task_name: "myjob" }}
      />
    );
    expect(screen.getByText(/Результат задачи: myjob/)).toBeInTheDocument();
  });

  it("renders kind label for interagent with from_agent", () => {
    render(
      <StreamingMessage
        {...baseProps}
        kind="interagent"
        meta={{ from_agent: "sonic" }}
      />
    );
    expect(screen.getByText(/Ответ от агента: sonic/)).toBeInTheDocument();
  });

  it("renders kind label for task_question", () => {
    render(
      <StreamingMessage
        {...baseProps}
        kind="task_question"
        meta={{ task_id: "t-7" }}
      />
    );
    expect(screen.getByText(/Вопрос от задачи/)).toBeInTheDocument();
  });

  it("does not render a kind label when kind is text or undefined", () => {
    render(<StreamingMessage {...baseProps} kind="text" />);
    expect(screen.queryByText(/Результат задачи/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Вопрос от задачи/)).not.toBeInTheDocument();
  });

  it("falls back to the raw kind string when kind is unknown", () => {
    render(<StreamingMessage {...baseProps} kind="future_kind_v2" />);
    // Unknown kind renders as-is (no mapping) but still shows a labelled card.
    expect(screen.getByText("future_kind_v2")).toBeInTheDocument();
  });

  it("renders kind label for task_result even without meta", () => {
    render(<StreamingMessage {...baseProps} kind="task_result" />);
    // No task_name → base label only, no colon suffix.
    expect(screen.getByText("Результат задачи")).toBeInTheDocument();
  });
});
