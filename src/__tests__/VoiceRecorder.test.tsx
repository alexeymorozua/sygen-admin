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

// Mock Toast — component uses useToast() to surface HTTPS/unsupported warnings,
// but those paths aren't exercised in these tests.
vi.mock("@/components/Toast", () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
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
  pause() {
    if (this.state === "recording") this.state = "paused";
  }
  resume() {
    if (this.state === "paused") this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    // Simulate data chunk. Component rejects blobs ≤ 1024 bytes, so pad.
    if (this.ondataavailable) {
      this.ondataavailable({
        data: new Blob(["x".repeat(2048)], { type: "audio/webm" }),
      });
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

  it("cancel button discards recording without calling onRecordingComplete", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onComplete = vi.fn();
    render(<VoiceRecorder onRecordingComplete={onComplete} />);

    await act(async () => {
      fireEvent.click(screen.getByTestId("voice-record-btn"));
    });

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("voice-cancel-btn"));
    });

    // onComplete must NOT fire — user threw the recording away.
    expect(onComplete).not.toHaveBeenCalled();

    // And we're back to the idle mic button.
    expect(screen.getByTestId("voice-record-btn")).toBeInTheDocument();

    vi.useRealTimers();
  });

  it("pause toggles to resume icon and freezes the duration", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onComplete = vi.fn();
    render(<VoiceRecorder onRecordingComplete={onComplete} />);

    await act(async () => {
      fireEvent.click(screen.getByTestId("voice-record-btn"));
    });

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    const pauseBtn = screen.getByTestId("voice-pause-btn");
    expect(pauseBtn).toHaveAttribute("aria-label", "chat.pauseRecording");

    await act(async () => {
      fireEvent.click(pauseBtn);
    });

    // After pause, button aria-label flips to resume
    expect(screen.getByTestId("voice-pause-btn")).toHaveAttribute(
      "aria-label",
      "chat.resumeRecording",
    );

    // Duration must not advance while paused
    const beforePause = screen.getByTestId("voice-recorder-active").textContent;
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    const afterPause = screen.getByTestId("voice-recorder-active").textContent;
    expect(afterPause).toBe(beforePause);

    // Resume and stop — recording should still flush via onstop
    await act(async () => {
      fireEvent.click(screen.getByTestId("voice-pause-btn"));
    });
    expect(screen.getByTestId("voice-pause-btn")).toHaveAttribute(
      "aria-label",
      "chat.pauseRecording",
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId("voice-stop-btn"));
    });

    expect(onComplete).toHaveBeenCalledTimes(1);

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
