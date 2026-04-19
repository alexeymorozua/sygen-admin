"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, Square, Pause, Play, X } from "lucide-react";
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
  const [isPaused, setIsPaused] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const [duration, setDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const durationRef = useRef(0);
  // Cancel bypasses onstop's submit path — the user wanted this recording gone.
  const cancelledRef = useRef(false);

  const isSupported =
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined";

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    timerRef.current = setInterval(() => {
      durationRef.current += 1;
      setDuration((prev) => prev + 1);
    }, 1000);
  }, [stopTimer]);

  const cleanup = useCallback(() => {
    stopTimer();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    durationRef.current = 0;
    setDuration(0);
    setIsPaused(false);
    cancelledRef.current = false;
  }, [stopTimer]);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  const startRecording = useCallback(async () => {
    if (!isSupported) return;

    setIsActivating(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Prefer MP4/AAC first — iOS Safari plays MP4 natively, Chrome/Edge/
      // Firefox also do. Ogg/Opus plays fine in Chrome/Firefox but NOT on
      // iOS Safari, which is why previous recordings showed "Error" on
      // iPhone. Whisper accepts all of these.
      const mimeType = MediaRecorder.isTypeSupported("audio/mp4;codecs=mp4a.40.2")
        ? "audio/mp4;codecs=mp4a.40.2"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
            ? "audio/webm;codecs=opus"
            : MediaRecorder.isTypeSupported("audio/webm")
              ? "audio/webm"
              : MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")
                ? "audio/ogg;codecs=opus"
                : "";

      setIsActivating(false);

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      cancelledRef.current = false;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onerror = () => {
        setIsRecording(false);
        setIsPaused(false);
        cleanup();
      };

      recorder.onstop = () => {
        const chunks = chunksRef.current;
        const recordedDuration = durationRef.current;
        const wasCancelled = cancelledRef.current;
        if (!wasCancelled && chunks.length > 0 && recordedDuration >= 1) {
          const actualMime = recorder.mimeType || mimeType || "audio/webm";
          const ext = actualMime.includes("mp4")
            ? "m4a"
            : actualMime.includes("ogg")
              ? "ogg"
              : "webm";
          const blob = new Blob(chunks, { type: actualMime });
          if (blob.size > 1024) {
            const filename = `voice_${Date.now()}.${ext}`;
            onRecordingComplete(blob, filename);
          }
        }
        cleanup();
      };

      recorder.start();
      setIsRecording(true);
      setIsPaused(false);
      setDuration(0);
      durationRef.current = 0;

      startTimer();
    } catch {
      setIsActivating(false);
      setIsRecording(false);
      setIsPaused(false);
      cleanup();
    }
  }, [isSupported, onRecordingComplete, cleanup, startTimer]);

  const stopRecording = useCallback(() => {
    const rec = mediaRecorderRef.current;
    if (rec && (rec.state === "recording" || rec.state === "paused")) {
      rec.stop();
    }
    setIsRecording(false);
    setIsPaused(false);
  }, []);

  const cancelRecording = useCallback(() => {
    cancelledRef.current = true;
    const rec = mediaRecorderRef.current;
    if (rec && (rec.state === "recording" || rec.state === "paused")) {
      rec.stop();
    } else {
      cleanup();
    }
    setIsRecording(false);
    setIsPaused(false);
  }, [cleanup]);

  const togglePause = useCallback(() => {
    const rec = mediaRecorderRef.current;
    if (!rec) return;
    if (rec.state === "recording") {
      rec.pause();
      stopTimer();
      setIsPaused(true);
    } else if (rec.state === "paused") {
      rec.resume();
      startTimer();
      setIsPaused(false);
    }
  }, [startTimer, stopTimer]);

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
      <div className="flex items-center gap-1.5" data-testid="voice-recorder-active">
        <div
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-xl border",
            isPaused
              ? "bg-text-secondary/10 border-text-secondary/30"
              : "bg-danger/10 border-danger/30",
          )}
        >
          <span
            className={cn(
              "w-2 h-2 rounded-full",
              isPaused ? "bg-text-secondary" : "bg-danger animate-pulse",
            )}
          />
          <span
            className={cn(
              "text-xs font-medium tabular-nums",
              isPaused ? "text-text-secondary" : "text-danger",
            )}
          >
            {formatDuration(duration)}
          </span>
        </div>

        <button
          type="button"
          onClick={cancelRecording}
          className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl transition-colors text-text-secondary hover:text-text-primary shrink-0"
          title={t("chat.cancelRecording")}
          aria-label={t("chat.cancelRecording")}
          data-testid="voice-cancel-btn"
        >
          <X size={18} />
        </button>

        <button
          type="button"
          onClick={togglePause}
          className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl transition-colors text-text-primary shrink-0"
          title={isPaused ? t("chat.resumeRecording") : t("chat.pauseRecording")}
          aria-label={isPaused ? t("chat.resumeRecording") : t("chat.pauseRecording")}
          aria-pressed={isPaused}
          data-testid="voice-pause-btn"
        >
          {isPaused ? <Play size={18} /> : <Pause size={18} />}
        </button>

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
      disabled={disabled || isActivating}
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
