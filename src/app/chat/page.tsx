"use client";

import { useEffect, useState, useRef, useCallback } from "react";

function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return uuid();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}
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
} from "lucide-react";
import StreamingMessage from "@/components/StreamingMessage";
import type { StreamingMessageProps, FileAttachment } from "@/components/StreamingMessage";
import CommandMenu, { type CommandMenuHandle } from "@/components/CommandMenu";
import StatusBadge from "@/components/StatusBadge";
import VoiceRecorder from "@/components/VoiceRecorder";
import { SygenWebSocket, type WSStatus } from "@/lib/websocket";
import { SygenAPI, type ChatSession, type ChatSessionMessage } from "@/lib/api";
import { useServer } from "@/context/ServerContext";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type ChatMsg = StreamingMessageProps;

function getStoredAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("sygen_access_token");
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
  const [agents, setAgents] = useState<string[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>("main");
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messagesBySession, setMessagesBySession] = useState<
    Record<string, ChatMsg[]>
  >({});
  const [input, setInput] = useState("");
  const [showInfo, setShowInfo] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [wsStatus, setWsStatus] = useState<WSStatus>("disconnected");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<
    { file: File; uploading: boolean; name: string }[]
  >([]);
  const [agentStatus, setAgentStatus] = useState<string | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<SygenWebSocket | null>(null);
  const streamingIdRef = useRef<string | null>(null);
  const streamingSessionRef = useRef<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatAreaRef = useRef<HTMLDivElement>(null);
  const commandMenuRef = useRef<CommandMenuHandle>(null);
  const historyLoadedRef = useRef<Set<string>>(new Set());
  const [showCommandMenu, setShowCommandMenu] = useState(false);

  const messages = activeSessionId ? (messagesBySession[activeSessionId] || []) : [];

  // Load sessions for the selected agent
  const loadSessions = useCallback(
    async (agent: string) => {
      setLoadingSessions(true);
      try {
        const data = await SygenAPI.getChatSessions(agent);
        setSessions(data);
      } catch {
        setSessions([]);
      } finally {
        setLoadingSessions(false);
      }
    },
    []
  );

  // Load session history from server
  const loadSessionHistory = useCallback(
    async (sessionId: string) => {
      if (historyLoadedRef.current.has(sessionId)) return;
      historyLoadedRef.current.add(sessionId);
      try {
        const data = await SygenAPI.getChatHistory(sessionId);
        if (data.length > 0) {
          setMessagesBySession((prev) => ({
            ...prev,
            [sessionId]: data.map((m) => ({
              id: m.id,
              sender: m.sender,
              agentName: m.agentName,
              content: m.content,
              timestamp: m.timestamp,
              files: m.files as FileAttachment[] | undefined,
            })),
          }));
        }
      } catch {
        // Ignore — no history yet
      }
    },
    []
  );

  // Save messages to server (debounced)
  useEffect(() => {
    if (!activeSessionId || !messagesBySession[activeSessionId]) return;
    const msgs = messagesBySession[activeSessionId];
    if (msgs.some((m) => m.isStreaming)) return;
    if (msgs.length === 0) return;

    const timer = setTimeout(() => {
      const saveMsgs: ChatSessionMessage[] = msgs.map((m) => ({
        id: m.id,
        sender: m.sender as "user" | "agent",
        agentName: m.agentName,
        content: m.content,
        timestamp: m.timestamp,
        files: m.files,
      }));

      SygenAPI.saveChatHistory(activeSessionId, saveMsgs).catch(() => {});
    }, 1000);

    return () => clearTimeout(timer);
  }, [messagesBySession, activeSessionId]);

  // Load sessions when agent changes
  const prevAgentRef = useRef(selectedAgent);
  useEffect(() => {
    if (!selectedAgent || wsStatus !== "connected") return;
    const agentChanged = prevAgentRef.current !== selectedAgent;
    prevAgentRef.current = selectedAgent;

    loadSessions(selectedAgent);
    // Only reset state when agent actually changes, not on WS reconnect
    if (agentChanged) {
      setActiveSessionId(null);
      setMessagesBySession({});
      historyLoadedRef.current = new Set();
    }
  }, [selectedAgent, loadSessions, wsStatus]);

  // Load history when session is selected
  useEffect(() => {
    if (activeSessionId) {
      loadSessionHistory(activeSessionId);
    }
  }, [activeSessionId, loadSessionHistory]);

  // Reset when server changes
  useEffect(() => {
    historyLoadedRef.current = new Set();
    setMessagesBySession({});
    setSessions([]);
    setActiveSessionId(null);
  }, [activeServer.id]);

  const addMessage = useCallback((sessionId: string, msg: ChatMsg) => {
    setMessagesBySession((prev) => ({
      ...prev,
      [sessionId]: [...(prev[sessionId] || []), msg],
    }));
  }, []);

  const updateStreamingMessage = useCallback(
    (sessionId: string, msgId: string, updater: (msg: ChatMsg) => ChatMsg) => {
      setMessagesBySession((prev) => {
        const sessionMsgs = prev[sessionId] || [];
        return {
          ...prev,
          [sessionId]: sessionMsgs.map((m) => (m.id === msgId ? updater(m) : m)),
        };
      });
    },
    []
  );

  // WS connection
  useEffect(() => {
    const ws = new SygenWebSocket(
      {
        onConnected: (agentList: string[]) => {
          setAgents(agentList);
          if (agentList.length > 0) {
            setSelectedAgent((prev) =>
              agentList.includes(prev) ? prev : agentList[0]
            );
          }
        },
        onDisconnected: () => {
          setIsStreaming(false);
          setAgentStatus(null);
          streamingIdRef.current = null;
          streamingSessionRef.current = null;
        },
        onTextDelta: (text) => {
          const id = streamingIdRef.current;
          const session = streamingSessionRef.current;
          if (!id || !session) return;
          setAgentStatus(null);
          updateStreamingMessage(session, id, (msg) => ({
            ...msg,
            content: msg.content + text,
          }));
        },
        onToolActivity: (tool) => {
          const id = streamingIdRef.current;
          const session = streamingSessionRef.current;
          if (!id || !session) return;
          setAgentStatus(`Using tool: ${tool}`);
          updateStreamingMessage(session, id, (msg) => ({
            ...msg,
            toolActivity: tool,
          }));
        },
        onResult: (text) => {
          const id = streamingIdRef.current;
          const session = streamingSessionRef.current;
          if (!id || !session) return;
          updateStreamingMessage(session, id, (msg) => ({
            ...msg,
            content: text,
            isStreaming: false,
            toolActivity: null,
          }));
          setIsStreaming(false);
          setAgentStatus(null);
          streamingIdRef.current = null;
          streamingSessionRef.current = null;
        },
        onError: (message) => {
          const id = streamingIdRef.current;
          const session = streamingSessionRef.current;
          if (id && session) {
            updateStreamingMessage(session, id, (msg) => ({
              ...msg,
              content: msg.content || `Error: ${message}`,
              isStreaming: false,
              toolActivity: null,
            }));
          }
          setIsStreaming(false);
          setAgentStatus(null);
          streamingIdRef.current = null;
          streamingSessionRef.current = null;
        },
        onSystemStatus: (data) => {
          if (data) {
            setAgentStatus(data);
          }
        },
        onStatusChange: setWsStatus,
      },
      { url: activeServer.url, token: activeServer.token }
    );

    wsRef.current = ws;
    ws.connect();

    return () => ws.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateStreamingMessage, activeServer.id, activeServer.url]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
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

      try {
        const res = await fetch(`${activeServer.url}/upload`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        if (!res.ok) return null;
        const data = await res.json();
        return { path: data.path, name: data.name, prompt: data.prompt };
      } catch {
        return null;
      }
    },
    [activeServer.url, activeServer.token]
  );

  // Create new session and send message
  const ensureSession = useCallback(async (): Promise<string | null> => {
    if (activeSessionId) return activeSessionId;
    try {
      const session = await SygenAPI.createChatSession(selectedAgent);
      setSessions((prev) => [session, ...prev]);
      setActiveSessionId(session.id);
      return session.id;
    } catch {
      return null;
    }
  }, [activeSessionId, selectedAgent]);

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
        const result = await uploadFile(files[i]);

        if (result) {
          const fileMsg: ChatMsg = {
            id: `msg-${uuid()}`,
            sender: "user",
            content: `\u{1F4CE} ${result.name}`,
            timestamp: new Date().toISOString(),
            files: [
              {
                path: result.path,
                name: result.name,
                size: files[i].size,
                mime: files[i].type,
              },
            ],
          };
          addMessage(sessionId, fileMsg);

          const agentMsgId = `msg-${uuid()}`;
          const agentMsg: ChatMsg = {
            id: agentMsgId,
            sender: "agent",
            agentName: selectedAgent,
            content: "",
            timestamp: new Date().toISOString(),
            isStreaming: true,
            toolActivity: null,
          };
          addMessage(sessionId, agentMsg);

          streamingIdRef.current = agentMsgId;
          streamingSessionRef.current = sessionId;
          setIsStreaming(true);
          wsRef.current?.sendMessage(selectedAgent, result.prompt);
        }

        setPendingFiles((prev) =>
          prev.filter((p) => p.file !== files[i])
        );
      }
    },
    [uploadFile, addMessage, selectedAgent, ensureSession]
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
    if (!input.trim() || !selectedAgent || isStreaming) return;

    const sessionId = await ensureSession();
    if (!sessionId) return;

    const userMsg: ChatMsg = {
      id: `msg-${uuid()}`,
      sender: "user",
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };
    addMessage(sessionId, userMsg);

    const agentMsgId = `msg-${uuid()}`;
    const agentMsg: ChatMsg = {
      id: agentMsgId,
      sender: "agent",
      agentName: selectedAgent,
      content: "",
      timestamp: new Date().toISOString(),
      isStreaming: true,
      toolActivity: null,
    };
    addMessage(sessionId, agentMsg);

    streamingIdRef.current = agentMsgId;
    streamingSessionRef.current = sessionId;
    setIsStreaming(true);
    setAgentStatus(t('chat.thinking'));
    wsRef.current?.sendMessage(selectedAgent, input.trim());
    setInput("");
  }, [input, selectedAgent, isStreaming, addMessage, ensureSession, t]);

  const handleAbort = useCallback(() => {
    wsRef.current?.abort(selectedAgent);
    const id = streamingIdRef.current;
    const session = streamingSessionRef.current || activeSessionId;
    if (id && session) {
      updateStreamingMessage(session, id, (msg) => ({
        ...msg,
        isStreaming: false,
        toolActivity: null,
      }));
    }
    setIsStreaming(false);
    setAgentStatus(null);
    streamingIdRef.current = null;
    streamingSessionRef.current = null;
  }, [selectedAgent, updateStreamingMessage, activeSessionId]);

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

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      if (!confirm(t('chat.deleteSessionConfirm'))) return;
      try {
        await SygenAPI.deleteChatSession(sessionId);
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        if (activeSessionId === sessionId) {
          setActiveSessionId(null);
        }
        setMessagesBySession((prev) => {
          const next = { ...prev };
          delete next[sessionId];
          return next;
        });
        historyLoadedRef.current.delete(sessionId);
      } catch {
        // Ignore
      }
    },
    [activeSessionId, t]
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

  return (
    <div className="flex h-[calc(100vh-5rem)] gap-0 -m-6 lg:-m-8 mt-0 lg:mt-0">
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
            <select
              value={selectedAgent}
              onChange={(e) => setSelectedAgent(e.target.value)}
              className="flex-1 bg-bg-card border border-border rounded-lg px-2 py-1.5 text-sm"
            >
              {agents.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
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
                <p className="text-sm truncate">{session.title}</p>
                <p className="text-[10px] text-text-secondary">
                  {formatSessionTime(session.updated_at)}
                </p>
              </div>
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
            <div className="w-8 h-8 rounded-full bg-accent/30 flex items-center justify-center">
              <Bot size={16} className="text-brand-400" />
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
          <div className="flex items-center gap-1">
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
            <select
              value={selectedAgent}
              onChange={(e) => setSelectedAgent(e.target.value)}
              className="flex-1 bg-bg-card border border-border rounded-lg px-2 py-1.5 text-sm"
            >
              {agents.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
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
              className="flex-1 bg-bg-card border border-border rounded-xl px-4 py-2.5 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-accent disabled:opacity-50 resize-none overflow-y-auto max-h-[150px] leading-relaxed"
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
                className="p-2.5 bg-accent hover:bg-accent-hover rounded-xl transition-colors disabled:opacity-30 shrink-0"
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
              <p className="text-xs text-text-secondary mb-1">{t('common.status')}</p>
              <StatusBadge
                status={statusVariant as "online" | "running" | "offline"}
              />
            </div>
            <div>
              <p className="text-xs text-text-secondary mb-1">{t('chat.activeAgent')}</p>
              <p className="text-sm">{selectedAgent}</p>
            </div>
            <div>
              <p className="text-xs text-text-secondary mb-1">{t('chat.sessions')}</p>
              <p className="text-sm">{sessions.length}</p>
            </div>
            <div>
              <p className="text-xs text-text-secondary mb-1">
                {t('chat.availableAgents')}
              </p>
              <p className="text-sm">{agents.join(", ") || "None"}</p>
            </div>
            <div>
              <p className="text-xs text-text-secondary mb-1">{t('chat.messages')}</p>
              <p className="text-sm">{messages.length}</p>
            </div>
            <div>
              <p className="text-xs text-text-secondary mb-1">{t('chat.server')}</p>
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
