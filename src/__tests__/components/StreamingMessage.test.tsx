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

  it("shows cursor when streaming", () => {
    const { container } = render(
      <StreamingMessage {...baseProps} isStreaming={true} />
    );
    const cursor = container.querySelector(".animate-pulse.bg-blue-400");
    expect(cursor).toBeInTheDocument();
  });

  it("hides cursor when not streaming", () => {
    const { container } = render(
      <StreamingMessage {...baseProps} isStreaming={false} />
    );
    const cursor = container.querySelector(".animate-pulse.bg-blue-400");
    expect(cursor).not.toBeInTheDocument();
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
});
