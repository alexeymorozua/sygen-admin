import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import AudioPlayer from "@/components/AudioPlayer";

vi.mock("@/lib/i18n", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const signFilePathMock = vi.fn();

vi.mock("@/lib/api", () => ({
  SygenAPI: {
    transcribeAudio: vi.fn(),
    signFilePath: (path: string, ttl?: number) =>
      signFilePathMock(path, ttl),
  },
}));

describe("AudioPlayer", () => {
  beforeEach(() => {
    signFilePathMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses signed URL from SygenAPI.signFilePath as <audio> src", async () => {
    const signedUrl =
      "https://api/files?path=%2Fx%2Fvoice_1.m4a&exp=123&sig=abc";
    signFilePathMock.mockResolvedValue(signedUrl);

    const { container } = render(<AudioPlayer filePath="/x/voice_1.m4a" />);

    await waitFor(() =>
      expect(container.querySelector("audio")).toBeInTheDocument()
    );
    const audio = container.querySelector("audio")!;
    expect(audio.getAttribute("src")).toBe(signedUrl);
    expect(signFilePathMock).toHaveBeenCalledWith("/x/voice_1.m4a", 300);
  });

  it("renders loading placeholder before signed URL resolves", () => {
    signFilePathMock.mockReturnValue(new Promise(() => {}));
    render(<AudioPlayer filePath="/x/voice_1.m4a" />);
    expect(screen.getByTestId("audio-player")).toBeInTheDocument();
    expect(screen.queryByTestId("audio-play-btn")).not.toBeInTheDocument();
  });

  it("shows error UI when sign-url request fails", async () => {
    signFilePathMock.mockRejectedValue(new Error("500"));
    render(<AudioPlayer filePath="/x/voice_1.m4a" />);
    await waitFor(() =>
      expect(screen.getByTestId("audio-player")).toBeInTheDocument()
    );
    expect(screen.queryByTestId("audio-play-btn")).not.toBeInTheDocument();
  });

  it("shows play button once signed URL resolves", async () => {
    signFilePathMock.mockResolvedValue("https://api/files?sig=xyz");
    render(<AudioPlayer filePath="/x/voice_1.m4a" />);
    await waitFor(() =>
      expect(screen.getByTestId("audio-play-btn")).toBeInTheDocument()
    );
  });
});
