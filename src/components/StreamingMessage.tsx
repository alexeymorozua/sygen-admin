"use client";

import { useState } from "react";
import {
  Bot,
  User,
  Wrench,
  Copy,
  Check,
  Download,
  FileText,
  FileAudio,
  FileImage,
  File as FileIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";

export interface FileAttachment {
  path: string;
  name: string;
  size?: number;
  mime?: string;
}

export interface StreamingMessageProps {
  id: string;
  sender: "user" | "agent";
  agentName?: string;
  content: string;
  timestamp: string;
  isStreaming?: boolean;
  toolActivity?: string | null;
  files?: FileAttachment[];
}

// Parse <file:/path/to/file> markers from text
function parseFileMarkers(text: string): {
  cleanText: string;
  files: { path: string; name: string }[];
} {
  const regex = /<file:([^>]+)>/g;
  const files: { path: string; name: string }[] = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    const path = match[1];
    const name = path.split("/").pop() || path;
    files.push({ path, name });
  }
  const cleanText = text.replace(regex, "").trim();
  return { cleanText, files };
}

function isImageFile(name: string): boolean {
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name);
}

function isAudioFile(name: string): boolean {
  return /\.(mp3|wav|ogg|flac|m4a|aac)$/i.test(name);
}

function getFileIcon(name: string) {
  if (isImageFile(name)) return FileImage;
  if (isAudioFile(name)) return FileAudio;
  if (/\.(pdf|doc|docx|txt|md|csv|xls|xlsx)$/i.test(name)) return FileText;
  return FileIcon;
}

function formatTime(timestamp: string): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function FilePreview({
  file,
  serverUrl,
  token,
}: {
  file: { path: string; name: string };
  serverUrl: string;
  token: string;
}) {
  const fileUrl = `${serverUrl}/files?path=${encodeURIComponent(file.path)}`;
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
  const Icon = getFileIcon(file.name);

  const handleDownload = async () => {
    try {
      const res = await fetch(fileUrl, { headers });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // fallback
      window.open(fileUrl, "_blank");
    }
  };

  if (isImageFile(file.name)) {
    return (
      <div className="mt-2 rounded-lg overflow-hidden border border-border max-w-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={fileUrl}
          alt={file.name}
          className="max-w-full max-h-64 object-contain bg-black/20"
          loading="lazy"
        />
        <div className="flex items-center justify-between px-3 py-1.5 bg-bg-card/80 text-xs">
          <span className="truncate text-text-secondary">{file.name}</span>
          <button
            type="button"
            onClick={handleDownload}
            className="ml-2 p-1 hover:bg-white/10 rounded transition-colors"
            title="Download"
          >
            <Download size={12} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-bg-card/50 max-w-sm">
      <Icon size={18} className="text-blue-400 shrink-0" />
      <span className="text-sm truncate flex-1">{file.name}</span>
      <button
        type="button"
        onClick={handleDownload}
        className="p-1.5 hover:bg-white/10 rounded transition-colors"
        title="Download"
      >
        <Download size={14} />
      </button>
    </div>
  );
}

interface MessageProps extends StreamingMessageProps {
  serverUrl?: string;
  token?: string;
}

export default function StreamingMessage({
  sender,
  agentName,
  content,
  timestamp,
  isStreaming,
  toolActivity,
  files: attachedFiles,
  serverUrl = "",
  token = "",
}: MessageProps) {
  const [copied, setCopied] = useState(false);
  const isUser = sender === "user";

  // Parse <file:...> from agent content
  const { cleanText, files: parsedFiles } = isUser
    ? { cleanText: content, files: [] }
    : parseFileMarkers(content);

  // Merge attached files + parsed file markers
  const allFiles = [
    ...(attachedFiles || []),
    ...parsedFiles.filter(
      (pf) => !attachedFiles?.some((af) => af.path === pf.path)
    ),
  ];

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <div className={cn("flex gap-3 mb-4 group", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
          isUser ? "bg-accent" : "bg-bg-card border border-border"
        )}
      >
        {isUser ? (
          <User size={16} />
        ) : (
          <Bot size={16} className="text-blue-400" />
        )}
      </div>
      <div className={cn("max-w-[75%] min-w-0", isUser && "text-right")}>
        {/* Tool activity indicator */}
        {toolActivity && !isUser && (
          <div className="flex items-center gap-1.5 mb-1.5 text-xs text-yellow-400">
            <Wrench size={12} className="animate-spin" />
            <span>{toolActivity}</span>
          </div>
        )}

        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 text-sm leading-relaxed relative",
            isUser
              ? "bg-accent text-text-primary rounded-br-md"
              : "bg-bg-card border border-border text-text-primary rounded-bl-md"
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap break-words">{content}</p>
          ) : (
            <div className="prose prose-invert prose-sm max-w-none break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_pre]:bg-black/30 [&_pre]:rounded-lg [&_pre]:p-3 [&_code]:text-blue-300 [&_a]:text-blue-400">
              <ReactMarkdown rehypePlugins={[rehypeSanitize]}>
                {cleanText}
              </ReactMarkdown>
              {isStreaming && (
                <span className="inline-block w-1.5 h-4 ml-0.5 bg-blue-400 animate-pulse rounded-sm align-middle" />
              )}
            </div>
          )}

          {/* Copy button — agent messages only */}
          {!isUser && !isStreaming && cleanText && (
            <button
              type="button"
              onClick={handleCopy}
              className="absolute top-2 right-2 p-1 rounded hover:bg-white/10 transition-colors opacity-0 group-hover:opacity-100"
              title="Copy to clipboard"
            >
              {copied ? (
                <Check size={14} className="text-green-400" />
              ) : (
                <Copy size={14} className="text-text-secondary" />
              )}
            </button>
          )}
        </div>

        {/* File attachments */}
        {allFiles.length > 0 && serverUrl && (
          <div className={cn("mt-1", isUser && "flex flex-col items-end")}>
            {allFiles.map((f, i) => (
              <FilePreview
                key={`${f.path}-${i}`}
                file={f}
                serverUrl={serverUrl}
                token={token}
              />
            ))}
          </div>
        )}

        {/* Timestamp + agent name */}
        <div
          className={cn(
            "flex items-center gap-2 mt-1 text-[11px] text-text-secondary",
            isUser && "justify-end"
          )}
        >
          {agentName && !isUser && (
            <span className="font-medium text-blue-400">{agentName}</span>
          )}
          <span>{formatTime(timestamp)}</span>
        </div>
      </div>
    </div>
  );
}
