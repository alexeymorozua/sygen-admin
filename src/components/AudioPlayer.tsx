"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Play, Pause, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";

interface AudioPlayerProps {
  src: string;
  className?: string;
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function AudioPlayer({ src, className }: AudioPlayerProps) {
  const { t } = useTranslation();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [hasError, setHasError] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const audio = new Audio(src);
    audioRef.current = audio;
    setHasError(false);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);

    const onLoadedMetadata = () => setDuration(audio.duration);
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    const onDurationChange = () => setDuration(audio.duration);
    const onError = () => {
      setHasError(true);
      setIsPlaying(false);
    };

    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("error", onError);

    return () => {
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("error", onError);
      audio.pause();
      audio.src = "";
    };
  }, [src]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().catch(() => {});
      setIsPlaying(true);
    }
  }, [isPlaying]);

  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const audio = audioRef.current;
      const bar = progressRef.current;
      if (!audio || !bar || !duration) return;

      const rect = bar.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      audio.currentTime = ratio * duration;
      setCurrentTime(audio.currentTime);
    },
    [duration]
  );

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (hasError) {
    return (
      <div
        className={cn(
          "flex items-center gap-2.5 min-w-[200px] max-w-[280px]",
          className
        )}
        data-testid="audio-player"
      >
        <div className="w-8 h-8 rounded-full bg-danger/20 flex items-center justify-center shrink-0">
          <AlertCircle size={14} className="text-danger" />
        </div>
        <span className="text-xs text-text-secondary">{t("common.error")}</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2.5 min-w-[200px] max-w-[280px]",
        className
      )}
      data-testid="audio-player"
    >
      {/* Play/Pause button */}
      <button
        type="button"
        onClick={togglePlay}
        className="w-8 h-8 rounded-full bg-brand-500 hover:bg-brand-400 flex items-center justify-center shrink-0 transition-colors"
        aria-label={isPlaying ? t("chat.pauseAudio") : t("chat.playAudio")}
        data-testid="audio-play-btn"
      >
        {isPlaying ? (
          <Pause size={14} className="text-white" />
        ) : (
          <Play size={14} className="text-white ml-0.5" />
        )}
      </button>

      {/* Progress bar + time */}
      <div className="flex-1 min-w-0">
        <div
          ref={progressRef}
          className="h-1.5 bg-white/10 rounded-full cursor-pointer relative group"
          onClick={handleProgressClick}
          data-testid="audio-progress"
        >
          <div
            className="absolute inset-y-0 left-0 bg-brand-400 rounded-full transition-[width] duration-100"
            style={{ width: `${progress}%` }}
          />
          {/* Thumb */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-brand-400 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
            style={{ left: `calc(${progress}% - 6px)` }}
          />
        </div>
        <div className="flex justify-between mt-0.5">
          <span className="text-[10px] text-text-secondary tabular-nums">
            {formatTime(currentTime)}
          </span>
          <span className="text-[10px] text-text-secondary tabular-nums">
            {formatTime(duration)}
          </span>
        </div>
      </div>
    </div>
  );
}
