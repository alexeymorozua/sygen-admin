import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import VoiceRecorder from "@/components/VoiceRecorder";

// Mock i18n
vi.mock("@/lib/i18n", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    locale: "en",
    setLocale: vi.fn(),
  }),
}));

// Mock MediaRecorder
class MockMediaRecorder {
  state = "inactive" as "inactive" | "recording" | "paused";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;

  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    // Simulate data chunk
    if (this.ondataavailable) {
      this.ondataavailable({ data: new Blob(["audio-data"], { type: "audio/webm" }) });
    }
    if (this.onstop) {
      this.onstop();
    }
  }
  static isTypeSupported(type: string) {
    return type === "audio/webm;codecs=opus";
  }
}

const mockGetUserMedia = vi.fn();
const mockTrackStop = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();

  // Mock navigator.mediaDevices
  Object.defineProperty(navigator, "mediaDevices", {
    value: {
      getUserMedia: mockGetUserMedia,
    },
    writable: true,
    configurable: true,
  });

  // Default mock: getUserMedia succeeds
  mockGetUserMedia.mockResolvedValue({
    getTracks: () => [{ stop: mockTrackStop }],
  } as unknown as MediaStream);

  // Mock MediaRecorder globally
  Object.defineProperty(window, "MediaRecorder", {
    value: MockMediaRecorder,
    writable: true,
    configurable: true,
  });
});

describe("VoiceRecorder", () => {
  it("renders mic button when not recording", () => {
    const onComplete = vi.fn();
    render(<VoiceRecorder onRecordingComplete={onComplete} />);

    const btn = screen.getByTestId("voice-record-btn");
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute("aria-label", "chat.recordVoice");
  });

  it("is disabled when disabled prop is true", () => {
    const onComplete = vi.fn();
    render(<VoiceRecorder onRecordingComplete={onComplete} disabled />);

    const btn = screen.getByTestId("voice-record-btn");
    expect(btn).toBeDisabled();
  });

  it("starts recording on click and shows active UI", async () => {
    const onComplete = vi.fn();
    render(<VoiceRecorder onRecordingComplete={onComplete} />);

    fireEvent.click(screen.getByTestId("voice-record-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("voice-recorder-active")).toBeInTheDocument();
    });

    expect(mockGetUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(screen.getByTestId("voice-stop-btn")).toBeInTheDocument();
  });

  it("stops recording and calls onRecordingComplete", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onComplete = vi.fn();
    render(<VoiceRecorder onRecordingComplete={onComplete} />);

    // Start recording
    await act(async () => {
      fireEvent.click(screen.getByTestId("voice-record-btn"));
    });

    expect(screen.getByTestId("voice-stop-btn")).toBeInTheDocument();

    // Advance timer so duration >= 1 second (minimum guard)
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });

    // Stop recording
    await act(async () => {
      fireEvent.click(screen.getByTestId("voice-stop-btn"));
    });

    expect(onComplete).toHaveBeenCalledTimes(1);

    const [blob, filename] = onComplete.mock.calls[0];
    expect(blob).toBeInstanceOf(Blob);
    expect(filename).toMatch(/^voice_\d+\.webm$/);

    vi.useRealTimers();
  });

  it("handles getUserMedia failure gracefully", async () => {
    mockGetUserMedia.mockRejectedValueOnce(new Error("Permission denied"));

    const onComplete = vi.fn();
    render(<VoiceRecorder onRecordingComplete={onComplete} />);

    fireEvent.click(screen.getByTestId("voice-record-btn"));

    // Should stay in non-recording state (mic button still visible)
    await waitFor(() => {
      expect(screen.getByTestId("voice-record-btn")).toBeInTheDocument();
    });

    expect(onComplete).not.toHaveBeenCalled();
  });
});
