"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import {
  Send,
  Bot,
  Info,
  Square,
  Paperclip,
  Plus,
  Trash2,
  Menu,
  X,
  Wifi,
  WifiOff,
  Loader2,
  FileText,
  FileImage,
  FileAudio,
  File as FileIcon,
  MessageSquare,
  Pencil,
  Check,
} from "lucide-react";
import StreamingMessage from "@/components/StreamingMessage";
import CommandMenu, { type CommandMenuHandle } from "@/components/CommandMenu";
import StatusBadge from "@/components/StatusBadge";
import { Select } from "@/components/Select";
import { ProviderSwitcher } from "@/components/ProviderSwitcher";
import VoiceRecorder from "@/components/VoiceRecorder";
import { useConfirm } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { SygenAPI, type ChatSession } from "@/lib/api";
import { useServer } from "@/context/ServerContext";
import { useChat } from "@/context/ChatContext";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

function getStoredAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("sygen_access_token");
}

function getFileTypeIcon(name: string) {
  if (/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name)) return FileImage;
  if (/\.(mp3|wav|ogg|flac|m4a|aac)$/i.test(name)) return FileAudio;
  if (/\.(pdf|doc|docx|txt|md|csv|xls|xlsx)$/i.test(name)) return FileText;
  return FileIcon;
}

function formatSessionTime(ts: number): string {
  const d = new Date(ts * 1000);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 86400000 && d.getDate() === now.getDate()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (diff < 7 * 86400000) {
    return d.toLocaleDateString([], { weekday: "short" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function ChatPage() {
  const { activeServer } = useServer();
  const { t } = useTranslation();
  const { confirm } = useConfirm();
  const toast = useToast();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const userAvatarUrl = useMemo(
    () => (user?.avatar ? SygenAPI.getAvatarUrl(user.avatar) : undefined),
    [user?.avatar]
  );

  // Global chat state from context (persists across navigation)
  const chat = useChat();
  const {
    wsStatus,
    agents,
    agentStatus,
    isStreaming,
    selectedAgent,
    setSelectedAgent,
    sessions,
    setSessions,
    activeSessionId,
    setActiveSessionId,
    loadingSessions,
    messages,
    sendMessage: chatSendMessage,
    sendFileMessage,
    abortStreaming,
    removeSessionData,
    streamingIdRef,
  } = chat;

  // Handle ?agent= URL param
  useEffect(() => {
    const agent = searchParams.get("agent");
    if (agent) {
      setSelectedAgent(agent);
      window.history.replaceState({}, "", "/chat");
    }
  }, [searchParams, setSelectedAgent]);

  // Track which agents have avatars (to avoid 404 requests)
  const [agentAvatars, setAgentAvatars] = useState<Set<string>>(new Set());
  useEffect(() => {
    SygenAPI.getAgents().then((list) => {
      setAgentAvatars(new Set(list.filter((a) => a.hasAvatar).map((a) => a.name)));
    }).catch(() => {});
  }, []);

  // Local UI state (page-specific, doesn't need to persist)
  const [input, setInput] = useState("");
  const [showInfo, setShowInfo] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<
    { file: File; uploading: boolean; name: string }[]
  >([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatAreaRef = useRef<HTMLDivElement>(null);
  const commandMenuRef = useRef<CommandMenuHandle>(null);
  const isInitialScrollRef = useRef(true);
  const [showCommandMenu, setShowCommandMenu] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  // Reset initial scroll flag when session changes
  useEffect(() => {
    if (activeSessionId) isInitialScrollRef.current = true;
  }, [activeSessionId]);

  // Auto-scroll: instant on initial load / session switch, smooth for new messages
  useEffect(() => {
    if (messages.length === 0) return;
    const behavior = isInitialScrollRef.current ? "instant" : "smooth";
    messagesEndRef.current?.scrollIntoView({ behavior });
    if (isInitialScrollRef.current) isInitialScrollRef.current = false;
  }, [messages]);

  // Auto-resize textarea
  const resizeTextarea = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 150)}px`;
  }, []);

  useEffect(() => {
    resizeTextarea();
  }, [input, resizeTextarea]);

  // File upload
  const uploadFile = useCallback(
    async (file: File): Promise<{ path: string; name: string; prompt: string } | null> => {
      const token = getStoredAccessToken() || activeServer.token;
      const formData = new FormData();
      formData.append("file", file);

      const url = `${activeServer.url}/upload`;
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        if (!res.ok) {
          const errBody = await res.text().catch(() => "");
          console.error(`Upload failed: ${res.status} ${res.statusText}`, errBody, { url, hasToken: !!token });
          return null;
        }
        const data = await res.json();
        return { path: data.path, name: data.name, prompt: data.prompt };
      } catch (err) {
        console.error("Upload fetch error:", err, { url, hasToken: !!token });
        return null;
      }
    },
    [activeServer.url, activeServer.token]
  );

  const ensureSession = useCallback(async (): Promise<string | null> => {
    if (activeSessionId) return activeSessionId;
    try {
      const session = await SygenAPI.createChatSession(selectedAgent);
      setSessions((prev: ChatSession[]) => [session, ...prev]);
      setActiveSessionId(session.id);
      return session.id;
    } catch {
      return null;
    }
  }, [activeSessionId, selectedAgent, setSessions, setActiveSessionId]);

  const handleFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList);
      if (files.length === 0) return;

      const sessionId = await ensureSession();
      if (!sessionId) return;

      const entries = files.map((f) => ({
        file: f,
        uploading: true,
        name: f.name,
      }));
      setPendingFiles((prev) => [...prev, ...entries]);

      for (let i = 0; i < files.length; i++) {
        try {
          // Wait for any in-progress streaming to finish before sending next file
          if (streamingIdRef.current) {
            await new Promise<void>((resolve) => {
              const check = () => {
                if (!streamingIdRef.current) { resolve(); return; }
                setTimeout(check, 200);
              };
              check();
            });
          }

          const result = await uploadFile(files[i]);

          if (result) {
            const isVoice = /^voice_\d+\.(webm|ogg)$/i.test(result.name);
            sendFileMessage(
              sessionId,
              { path: result.path, name: result.name, size: files[i].size, mime: files[i].type },
              result.prompt,
              isVoice
            );
          } else {
            toast.error(t("chat.uploadFailed"));
          }
        } catch (err) {
          console.error("File upload error:", err);
          toast.error(t("chat.uploadFailed"));
        } finally {
          setPendingFiles((prev) =>
            prev.filter((p) => p.file !== files[i])
          );
        }
      }
    },
    [uploadFile, sendFileMessage, ensureSession, streamingIdRef, toast, t]
  );

  // Drag and drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (
      chatAreaRef.current &&
      !chatAreaRef.current.contains(e.relatedTarget as Node)
    ) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles]
  );

  // Voice recording complete — send as file
  const handleVoiceRecording = useCallback(
    (blob: Blob, filename: string) => {
      const file = new File([blob], filename, { type: blob.type });
      handleFiles([file]);
    },
    [handleFiles]
  );

  const handleSend = useCallback(async () => {
    if (!input.trim() || isStreaming) return;
    const text = input.trim();
    setInput("");
    await chatSendMessage(text);
  }, [input, isStreaming, chatSendMessage]);

  const handleAbort = useCallback(() => {
    abortStreaming();
  }, [abortStreaming]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Let CommandMenu handle navigation keys first
      if (commandMenuRef.current?.handleKeyDown(e)) return;

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleNewChat = useCallback(() => {
    setActiveSessionId(null);
    setInput("");
  }, []);

  const handleRenameSession = useCallback(
    async (sessionId: string) => {
      const trimmed = editingTitle.trim();
      if (!trimmed) {
        setEditingSessionId(null);
        return;
      }
      try {
        await SygenAPI.updateChatSession(sessionId, { title: trimmed });
        setSessions((prev) =>
          prev.map((s) => (s.id === sessionId ? { ...s, title: trimmed } : s))
        );
      } catch {
        // Ignore
      }
      setEditingSessionId(null);
    },
    [editingTitle]
  );

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      if (!(await confirm({ message: t('chat.deleteSessionConfirm'), variant: "danger" }))) return;
      try {
        await SygenAPI.deleteChatSession(sessionId);
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        if (activeSessionId === sessionId) {
          setActiveSessionId(null);
        }
        removeSessionData(sessionId);
      } catch {
        // Ignore
      }
    },
    [activeSessionId, t, setSessions, setActiveSessionId, removeSessionData, confirm]
  );

  const statusVariant =
    wsStatus === "connected"
      ? "online"
      : wsStatus === "connecting"
        ? "running"
        : "offline";

  const WsIndicator = () => {
    if (wsStatus === "connected")
      return <Wifi size={14} className="text-green-400" />;
    if (wsStatus === "connecting")
      return <Loader2 size={14} className="text-yellow-400 animate-spin" />;
    return <WifiOff size={14} className="text-red-400" />;
  };

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  const handleProviderChange = useCallback(
    (provider: string | null, model: string | null) => {
      if (!activeSessionId) return;
      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSessionId
            ? { ...s, provider_override: provider, model_override: model }
            : s
        )
      );
    },
    [activeSessionId, setSessions]
  );

  return (
    <div className="flex h-[calc(100vh-5rem)] gap-0 -m-3 sm:-m-4 md:-m-6 lg:-m-8 mt-0 md:mt-0">
      {/* Mobile sidebar overlay */}
      {showSidebar && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setShowSidebar(false)}
        />
      )}

      {/* Sidebar: Agents + Sessions */}
      <div
        className={cn(
          "w-72 bg-bg-sidebar border-r border-border flex-col shrink-0",
          "fixed md:relative inset-y-0 left-0 z-50 md:z-auto",
          "transition-transform duration-200 md:translate-x-0",
          showSidebar ? "translate-x-0 flex" : "-translate-x-full md:flex hidden md:flex"
        )}
      >
        {/* Agent selector header */}
        <div className="p-3 border-b border-border">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
              {t('nav.agents')}
            </h2>
            <button
              type="button"
              onClick={() => setShowSidebar(false)}
              className="p-1 hover:bg-white/10 rounded md:hidden"
            >
              <X size={16} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={selectedAgent}
              onChange={(e) => setSelectedAgent(e.target.value)}
              className="flex-1"
            >
              {agents.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </Select>
            <StatusBadge
              status={statusVariant as "online" | "running" | "offline"}
            />
          </div>
        </div>

        {/* Sessions header */}
        <div className="px-3 py-2 border-b border-border flex items-center justify-between">
          <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
            {t('chat.sessions')}
          </h3>
          <button
            type="button"
            onClick={handleNewChat}
            className="flex items-center gap-1 px-2 py-1 text-xs hover:bg-white/10 rounded-lg transition-colors text-brand-400"
            title={t('chat.newChat')}
          >
            <Plus size={14} />
            <span>{t('chat.newChat')}</span>
          </button>
        </div>

        {/* Sessions list */}
        <div className="flex-1 overflow-y-auto">
          {loadingSessions && (
            <div className="flex items-center justify-center py-6">
              <Loader2 size={18} className="animate-spin text-text-secondary" />
            </div>
          )}
          {!loadingSessions && sessions.length === 0 && (
            <p className="px-3 py-4 text-xs text-text-secondary text-center">
              {t('chat.noSessions')}
            </p>
          )}
          {sessions.map((session) => (
            <div
              key={session.id}
              className={cn(
                "group flex items-center gap-2 px-3 py-2.5 hover:bg-white/5 transition-colors cursor-pointer",
                activeSessionId === session.id &&
                  "bg-accent/30 border-r-2 border-brand-400"
              )}
              onClick={() => {
                setActiveSessionId(session.id);
                setShowSidebar(false);
              }}
            >
              <MessageSquare size={14} className="text-text-secondary shrink-0" />
              <div className="min-w-0 flex-1">
                {editingSessionId === session.id ? (
                  <form
                    onSubmit={(e) => { e.preventDefault(); handleRenameSession(session.id); }}
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1"
                  >
                    <input
                      autoFocus
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onBlur={() => handleRenameSession(session.id)}
                      onKeyDown={(e) => { if (e.key === "Escape") setEditingSessionId(null); }}
                      className="text-sm bg-transparent border-b border-brand-400 outline-none w-full py-0"
                    />
                    <button type="submit" className="p-0.5 text-brand-400 shrink-0">
                      <Check size={12} />
                    </button>
                  </form>
                ) : (
                  <p className="text-sm truncate">{session.title}</p>
                )}
                <p className="text-[10px] text-text-secondary">
                  {formatSessionTime(session.updated_at)}
                </p>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingSessionId(session.id);
                  setEditingTitle(session.title);
                }}
                className="p-1 opacity-0 group-hover:opacity-100 hover:text-brand-400 hover:bg-white/5 rounded transition-all"
                title={t('chat.renameSession')}
              >
                <Pencil size={12} />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteSession(session.id);
                }}
                className="p-1 opacity-0 group-hover:opacity-100 hover:text-red-400 hover:bg-white/5 rounded transition-all"
                title={t('chat.deleteSession')}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Chat Area */}
      <div
        ref={chatAreaRef}
        className="flex-1 flex flex-col min-w-0 relative"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Drag overlay */}
        {isDragging && (
          <div className="absolute inset-0 z-30 bg-accent/10 border-2 border-dashed border-accent rounded-lg flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <Paperclip size={40} className="mx-auto mb-2 text-accent" />
              <p className="text-sm font-medium">{t('chat.dropFiles')}</p>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-border bg-bg-card/50">
          <div className="flex items-center gap-3">
            {/* Mobile menu button */}
            <button
              type="button"
              onClick={() => setShowSidebar(true)}
              className="p-1.5 hover:bg-white/10 rounded md:hidden"
            >
              <Menu size={18} />
            </button>
            <div className="w-8 h-8 rounded-full bg-accent/30 flex items-center justify-center overflow-hidden">
              {agentAvatars.has(selectedAgent) ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={SygenAPI.getAgentAvatarUrl(selectedAgent)}
                  alt={selectedAgent}
                  className="w-8 h-8 rounded-full object-cover"
                />
              ) : (
                <Bot size={16} className="text-brand-400" />
              )}
            </div>
            <div>
              <p className="font-medium text-sm">
                {activeSession ? activeSession.title : selectedAgent}
              </p>
              <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                <WsIndicator />
                <span>
                  {wsStatus === "connected"
                    ? agentStatus || t('chat.connected')
                    : wsStatus === "connecting"
                      ? t('chat.reconnecting')
                      : t('chat.disconnected')}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {activeSessionId && (
              <ProviderSwitcher
                sessionId={activeSessionId}
                currentOverrideProvider={activeSession?.provider_override ?? null}
                currentOverrideModel={activeSession?.model_override ?? null}
                agentDefaultLabel={null}
                onChange={handleProviderChange}
              />
            )}
            <button
              type="button"
              onClick={handleNewChat}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs hover:bg-white/5 rounded-lg transition-colors text-text-secondary"
              title={t('chat.newChat')}
            >
              <Plus size={14} />
              <span className="hidden sm:inline">{t('chat.newChat')}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowInfo(!showInfo)}
              className="p-2 hover:bg-bg-card rounded-lg transition-colors hidden lg:block"
              aria-label="Toggle connection info"
            >
              <Info size={18} className="text-text-secondary" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full text-text-secondary text-sm">
              <p>{t('chat.startChat')} {selectedAgent}</p>
            </div>
          )}
          {messages.map((msg) => (
            <StreamingMessage
              key={msg.id}
              {...msg}
              serverUrl={activeServer.url}
              token={getStoredAccessToken() || activeServer.token}
              agentAvatarUrl={
                msg.sender === "agent" && msg.agentName && agentAvatars.has(msg.agentName)
                  ? `${activeServer.url}/api/agents/${encodeURIComponent(msg.agentName)}/avatar`
                  : undefined
              }
              userAvatarUrl={msg.sender === "user" ? userAvatarUrl : undefined}
            />
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Pending file uploads */}
        {pendingFiles.length > 0 && (
          <div className="px-4 md:px-6 py-2 border-t border-border bg-bg-card/30">
            <div className="flex flex-wrap gap-2">
              {pendingFiles.map((pf, i) => {
                const Icon = getFileTypeIcon(pf.name);
                return (
                  <div
                    key={i}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bg-card border border-border text-xs"
                  >
                    {pf.uploading ? (
                      <Loader2 size={14} className="animate-spin text-brand-400" />
                    ) : (
                      <Icon size={14} className="text-brand-400" />
                    )}
                    <span className="truncate max-w-32">{pf.name}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="p-3 md:p-4 border-t border-border">
          {/* Mobile agent selector */}
          <div className="flex items-center gap-2 mb-2 md:hidden">
            <Select
              value={selectedAgent}
              onChange={(e) => setSelectedAgent(e.target.value)}
              className="flex-1"
            >
              {agents.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </Select>
          </div>

          <div className="relative flex items-end gap-2">
            {/* Command menu popup */}
            <CommandMenu
              ref={commandMenuRef}
              input={input}
              visible={showCommandMenu}
              onSelect={(cmd) => {
                setInput(cmd + " ");
                setShowCommandMenu(false);
                textareaRef.current?.focus();
              }}
              onClose={() => setShowCommandMenu(false)}
            />

            {/* File attach button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={wsStatus !== "connected" || isStreaming}
              className="p-2.5 hover:bg-white/5 rounded-xl transition-colors text-text-secondary hover:text-text-primary disabled:opacity-30 shrink-0"
              title={t('chat.attachFile')}
            >
              <Paperclip size={18} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) handleFiles(e.target.files);
                e.target.value = "";
              }}
            />

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                const val = e.target.value;
                setInput(val);
                // Show command menu when input starts with / and has no spaces
                setShowCommandMenu(val.startsWith("/") && !val.includes(" "));
              }}
              onKeyDown={handleKeyDown}
              placeholder={`${t('chat.message')} ${selectedAgent}...`}
              disabled={wsStatus !== "connected"}
              rows={1}
              className="chat-textarea flex-1 bg-bg-card border border-border rounded-xl px-4 py-2.5 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-accent disabled:opacity-50 resize-none overflow-y-auto max-h-[150px] leading-relaxed"
            />

            {/* Voice / Send / Stop buttons */}
            {isStreaming ? (
              <button
                type="button"
                onClick={handleAbort}
                className="p-2.5 bg-red-500 hover:bg-red-600 rounded-xl transition-colors shrink-0"
                title={t('chat.stopGeneration')}
                aria-label={t('chat.stopGeneration')}
              >
                <Square size={18} />
              </button>
            ) : input.trim() ? (
              <button
                type="button"
                onClick={handleSend}
                disabled={wsStatus !== "connected"}
                className="p-2.5 bg-accent hover:bg-accent-hover text-accent-foreground rounded-xl transition-colors disabled:opacity-30 shrink-0"
                aria-label={t('chat.sendMessage')}
              >
                <Send size={18} />
              </button>
            ) : (
              <VoiceRecorder
                onRecordingComplete={handleVoiceRecording}
                disabled={wsStatus !== "connected"}
              />
            )}
          </div>
        </div>
      </div>

      {/* Agent Info Panel */}
      {showInfo && (
        <div className="w-72 bg-bg-sidebar border-l border-border p-5 hidden lg:block">
          <h3 className="font-semibold mb-4">{t('chat.connectionInfo')}</h3>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-text-secondary mb-1">{t('common.status')}</p>
              <StatusBadge
                status={statusVariant as "online" | "running" | "offline"}
              />
            </div>
            <div>
              <p className="text-sm text-text-secondary mb-1">{t('chat.activeAgent')}</p>
              <p className="text-sm">{selectedAgent}</p>
            </div>
            <div>
              <p className="text-sm text-text-secondary mb-1">{t('chat.sessions')}</p>
              <p className="text-sm">{sessions.length}</p>
            </div>
            <div>
              <p className="text-sm text-text-secondary mb-1">
                {t('chat.availableAgents')}
              </p>
              <p className="text-sm">{agents.join(", ") || "None"}</p>
            </div>
            <div>
              <p className="text-sm text-text-secondary mb-1">{t('chat.messages')}</p>
              <p className="text-sm">{messages.length}</p>
            </div>
            <div>
              <p className="text-sm text-text-secondary mb-1">{t('chat.server')}</p>
              <p className="text-sm truncate">{activeServer.name}</p>
              <p className="text-xs text-text-secondary truncate">
                {activeServer.url}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
