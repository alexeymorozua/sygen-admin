"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import { useToast } from "@/components/Toast";

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
  const toast = useToast();
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const durationRef = useRef(0);

  const isSupported =
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined";

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
    durationRef.current = 0;
    setDuration(0);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  const startRecording = useCallback(async () => {
    if (!isSupported) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Prefer webm/opus, fall back to whatever the browser supports
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : MediaRecorder.isTypeSupported("audio/ogg")
            ? "audio/ogg"
            : "";

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onerror = () => {
        setIsRecording(false);
        cleanup();
      };

      recorder.onstop = () => {
        const chunks = chunksRef.current;
        const recordedDuration = durationRef.current;
        if (chunks.length > 0 && recordedDuration >= 1) {
          const actualMime = recorder.mimeType || mimeType || "audio/webm";
          const ext = actualMime.includes("webm") ? "webm" : "ogg";
          const blob = new Blob(chunks, { type: actualMime });
          const filename = `voice_${Date.now()}.${ext}`;
          onRecordingComplete(blob, filename);
        }
        cleanup();
      };

      recorder.start();
      setIsRecording(true);
      setDuration(0);
      durationRef.current = 0;

      timerRef.current = setInterval(() => {
        durationRef.current += 1;
        setDuration((prev) => prev + 1);
      }, 1000);
    } catch {
      setIsRecording(false);
      cleanup();
    }
  }, [isSupported, onRecordingComplete, cleanup]);

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

  const handleUnsupported = useCallback(() => {
    const isInsecure = typeof window !== "undefined" && window.location.protocol === "http:" && window.location.hostname !== "localhost";
    toast.warning(isInsecure ? t("chat.voiceRequiresHttps") : t("chat.voiceNotSupported"));
  }, [toast, t]);

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
      onClick={isSupported ? handleClick : handleUnsupported}
      disabled={disabled}
      className={cn(
        "p-2.5 hover:bg-white/5 rounded-xl transition-colors text-text-secondary hover:text-text-primary disabled:opacity-30 shrink-0",
        !isSupported && "opacity-50"
      )}
      title={t("chat.recordVoice")}
      aria-label={t("chat.recordVoice")}
      data-testid="voice-record-btn"
    >
      <Mic size={18} />
    </button>
  );
}
