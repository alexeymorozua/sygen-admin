"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Send, FileText, FileAudio, FileImage, File as FileIcon } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

function isImageFile(name: string): boolean {
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name);
}

function isAudioFile(name: string): boolean {
  return /\.(mp3|wav|ogg|flac|m4a|aac|webm|opus)$/i.test(name);
}

function getFileIcon(name: string) {
  if (isImageFile(name)) return FileImage;
  if (isAudioFile(name)) return FileAudio;
  if (/\.(pdf|doc|docx|txt|md|csv|xls|xlsx)$/i.test(name)) return FileText;
  return FileIcon;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

interface Props {
  files: File[];
  onCancel: () => void;
  onSend: (caption: string) => void;
  onAddFiles?: (files: File[]) => void;
  sending?: boolean;
}

export default function AttachmentPreviewModal({ files, onCancel, onSend, onAddFiles, sending }: Props) {
  const { t } = useTranslation();
  const [caption, setCaption] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const previewUrls = useMemo(
    () => files.map((f) => (isImageFile(f.name) ? URL.createObjectURL(f) : null)),
    [files],
  );

  useEffect(() => {
    return () => {
      previewUrls.forEach((url) => url && URL.revokeObjectURL(url));
    };
  }, [previewUrls]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !sending) onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel, sending]);

  const active = files[activeIndex];
  const activeUrl = previewUrls[activeIndex];
  const ActiveIcon = active ? getFileIcon(active.name) : FileIcon;

  const handleSend = () => {
    if (sending) return;
    onSend(caption.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    if (!onAddFiles || sending) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    const pasted: File[] = [];
    for (const item of items) {
      if (item.kind === "file") {
        const f = item.getAsFile();
        if (f) pasted.push(f);
      }
    }
    if (pasted.length > 0) {
      e.preventDefault();
      e.stopPropagation();
      onAddFiles(pasted);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!onAddFiles || sending) return;
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (e.target === e.currentTarget) setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (!onAddFiles || sending) return;
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length > 0) onAddFiles(dropped);
  };

  if (!active) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-3 sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget && !sending) onCancel();
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onPaste={handlePaste}
    >
      <div
        className={`bg-bg-primary border rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden transition-colors ${
          isDragging ? "border-accent" : "border-border"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
          <div className="text-sm text-text-secondary">
            {files.length === 1
              ? t("chat.attachFile")
              : `${activeIndex + 1} / ${files.length}`}
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={sending}
            className="p-1.5 hover:bg-bg-card rounded-lg transition-colors disabled:opacity-40"
            aria-label={t("common.cancel")}
          >
            <X size={18} className="text-text-secondary" />
          </button>
        </div>

        {/* Preview area */}
        <div className="flex-1 min-h-0 flex items-center justify-center p-4 bg-black/30">
          {activeUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={activeUrl}
              alt={active.name}
              className="max-w-full max-h-[50vh] object-contain rounded-lg"
            />
          ) : (
            <div className="flex flex-col items-center gap-3 text-text-primary py-8">
              <ActiveIcon size={56} className="text-brand-400" />
              <div className="text-center">
                <p className="text-sm font-medium break-all max-w-xs">{active.name}</p>
                <p className="text-xs text-text-secondary mt-1">{formatSize(active.size)}</p>
              </div>
            </div>
          )}
        </div>

        {/* Thumbnail row (if multiple) */}
        {files.length > 1 && (
          <div className="px-3 py-2 border-t border-border flex gap-2 overflow-x-auto">
            {files.map((f, i) => {
              const Icon = getFileIcon(f.name);
              const url = previewUrls[i];
              const isActive = i === activeIndex;
              return (
                <button
                  key={`${f.name}-${i}`}
                  type="button"
                  onClick={() => setActiveIndex(i)}
                  className={`shrink-0 w-12 h-12 rounded-lg overflow-hidden border-2 transition-colors ${
                    isActive ? "border-accent" : "border-transparent hover:border-border"
                  }`}
                >
                  {url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={url} alt={f.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-bg-card">
                      <Icon size={18} className="text-brand-400" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Caption + send */}
        <div className="p-3 border-t border-border">
          <div className="flex items-end gap-2">
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={t("chat.addCaption")}
              disabled={sending}
              rows={1}
              className="chat-textarea flex-1 bg-bg-card border border-border rounded-xl px-4 py-2.5 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-accent resize-none max-h-32 overflow-y-auto leading-relaxed disabled:opacity-50"
              autoFocus
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={sending}
              className="p-2.5 bg-accent hover:bg-accent-hover text-accent-foreground rounded-xl transition-colors disabled:opacity-40 shrink-0"
              aria-label={t("chat.sendMessage")}
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
