import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import AudioPlayer from "@/components/AudioPlayer";

vi.mock("@/lib/i18n", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/lib/api", () => ({
  SygenAPI: {
    transcribeAudio: vi.fn(),
  },
}));

describe("AudioPlayer", () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  let capturedBlobs: Blob[] = [];

  beforeEach(() => {
    capturedBlobs = [];
    URL.createObjectURL = vi.fn((obj: Blob | MediaSource) => {
      if (obj instanceof Blob) capturedBlobs.push(obj);
      return "blob:mock-url";
    });
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    vi.restoreAllMocks();
  });

  it("normalizes video/mp4 server blob to audio/mp4 for .m4a src", async () => {
    // Server returns video/mp4 Content-Type for MP4/AAC voice files.
    // iOS Safari <audio> refuses to decode video/mp4 — client must rewrap.
    const serverBlob = new Blob(["fake-audio-data"], { type: "video/mp4" });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => serverBlob,
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AudioPlayer
        src="https://localhost:3443/files?path=/x/voice_1776465685156.m4a"
        token=""
      />
    );

    await waitFor(() => expect(capturedBlobs.length).toBeGreaterThan(0));
    expect(capturedBlobs[0].type).toBe("audio/mp4");
  });

  it("normalizes octet-stream blob to audio/mpeg for .mp3 src", async () => {
    const serverBlob = new Blob(["fake"], { type: "application/octet-stream" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, blob: async () => serverBlob })
    );

    render(
      <AudioPlayer
        src="https://localhost:3443/files?path=/x/voice_123.mp3"
        token=""
      />
    );

    await waitFor(() => expect(capturedBlobs.length).toBeGreaterThan(0));
    expect(capturedBlobs[0].type).toBe("audio/mpeg");
  });

  it("renders loading state while blob fetch is pending", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    render(
      <AudioPlayer
        src="https://localhost:3443/files?path=/x/voice_1.m4a"
        token=""
      />
    );
    expect(screen.getByTestId("audio-player")).toBeInTheDocument();
    // No play button yet — just the spinner placeholder
    expect(screen.queryByTestId("audio-play-btn")).not.toBeInTheDocument();
  });

  it("renders play button once the blob loads", async () => {
    const serverBlob = new Blob(["fake"], { type: "audio/mp4" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, blob: async () => serverBlob })
    );
    render(
      <AudioPlayer
        src="https://localhost:3443/files?path=/x/voice_1.m4a"
        token=""
      />
    );
    await waitFor(() =>
      expect(screen.getByTestId("audio-play-btn")).toBeInTheDocument()
    );
  });
});
