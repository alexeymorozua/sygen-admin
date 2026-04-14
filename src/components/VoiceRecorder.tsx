"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";

interface VoiceRecorderProps {
  onRecordingComplete: (blob: Blob, filename: string) => void;
  disabled?: boolean;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function VoiceRecorder({
  onRecordingComplete,
  disabled = false,
}: VoiceRecorderProps) {
  const { t } = useTranslation();
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    setDuration(0);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Prefer webm/opus, fall back to whatever the browser supports
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/ogg";

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const chunks = chunksRef.current;
        if (chunks.length > 0) {
          const ext = mimeType.includes("webm") ? "webm" : "ogg";
          const blob = new Blob(chunks, { type: mimeType });
          const filename = `voice_${Date.now()}.${ext}`;
          onRecordingComplete(blob, filename);
        }
        cleanup();
      };

      recorder.start();
      setIsRecording(true);
      setDuration(0);

      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    } catch {
      cleanup();
    }
  }, [onRecordingComplete, cleanup]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, []);

  const handleClick = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  if (isRecording) {
    return (
      <div className="flex items-center gap-2" data-testid="voice-recorder-active">
        {/* Recording indicator */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-danger/10 border border-danger/30">
          <span className="w-2 h-2 rounded-full bg-danger animate-pulse" />
          <span className="text-xs text-danger font-medium tabular-nums">
            {formatDuration(duration)}
          </span>
        </div>

        {/* Stop button */}
        <button
          type="button"
          onClick={stopRecording}
          className="p-2.5 bg-danger hover:bg-danger/80 rounded-xl transition-colors shrink-0"
          title={t("chat.stopRecording")}
          aria-label={t("chat.stopRecording")}
          data-testid="voice-stop-btn"
        >
          <Square size={18} className="text-white" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={cn(
        "p-2.5 hover:bg-white/5 rounded-xl transition-colors text-text-secondary hover:text-text-primary disabled:opacity-30 shrink-0"
      )}
      title={t("chat.recordVoice")}
      aria-label={t("chat.recordVoice")}
      data-testid="voice-record-btn"
    >
      <Mic size={18} />
    </button>
  );
}
