"use client";

import { useEffect, useState, useRef, useCallback } from "react";
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
} from "lucide-react";
import StreamingMessage from "@/components/StreamingMessage";
import type { StreamingMessageProps, FileAttachment } from "@/components/StreamingMessage";
import StatusBadge from "@/components/StatusBadge";
import { SygenWebSocket, type WSStatus } from "@/lib/websocket";
import { useServer } from "@/context/ServerContext";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  loadHistory,
  saveHistory,
  clearHistory,
  clearAllHistory,
  getMessageCount,
} from "@/lib/chatHistory";

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

export default function ChatPage() {
  const { activeServer } = useServer();
  const { t } = useTranslation();
  const [agents, setAgents] = useState<string[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>("main");
  const [messagesByAgent, setMessagesByAgent] = useState<
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
  const [messageCounts, setMessageCounts] = useState<Record<string, number>>(
    {}
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<SygenWebSocket | null>(null);
  const streamingIdRef = useRef<string | null>(null);
  const streamingAgentRef = useRef<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatAreaRef = useRef<HTMLDivElement>(null);
  const historyLoadedRef = useRef<Set<string>>(new Set());

  const messages = messagesByAgent[selectedAgent] || [];

  // Load history for an agent from localStorage
  const loadAgentHistory = useCallback(
    (agent: string) => {
      if (historyLoadedRef.current.has(agent)) return;
      historyLoadedRef.current.add(agent);
      const saved = loadHistory(activeServer.id, agent);
      if (saved.length > 0) {
        setMessagesByAgent((prev) => ({
          ...prev,
          [agent]: saved,
        }));
      }
    },
    [activeServer.id]
  );

  // Save history whenever messages change (debounced by effect)
  useEffect(() => {
    if (!selectedAgent || !messagesByAgent[selectedAgent]) return;
    const msgs = messagesByAgent[selectedAgent];
    // Don't save if still streaming
    if (msgs.some((m) => m.isStreaming)) return;
    saveHistory(activeServer.id, selectedAgent, msgs);
    // Update counts
    setMessageCounts((prev) => ({
      ...prev,
      [selectedAgent]: msgs.length,
    }));
  }, [messagesByAgent, selectedAgent, activeServer.id]);

  // Load counts for all agents
  useEffect(() => {
    if (agents.length === 0) return;
    const counts: Record<string, number> = {};
    agents.forEach((a) => {
      counts[a] = getMessageCount(activeServer.id, a);
    });
    setMessageCounts(counts);
  }, [agents, activeServer.id]);

  // Load history when agent is selected
  useEffect(() => {
    if (selectedAgent) {
      loadAgentHistory(selectedAgent);
    }
  }, [selectedAgent, loadAgentHistory]);

  // Reset loaded history tracker when server changes
  useEffect(() => {
    historyLoadedRef.current = new Set();
    setMessagesByAgent({});
  }, [activeServer.id]);

  const addMessage = useCallback((agent: string, msg: ChatMsg) => {
    setMessagesByAgent((prev) => ({
      ...prev,
      [agent]: [...(prev[agent] || []), msg],
    }));
  }, []);

  const updateStreamingMessage = useCallback(
    (agent: string, msgId: string, updater: (msg: ChatMsg) => ChatMsg) => {
      setMessagesByAgent((prev) => {
        const agentMsgs = prev[agent] || [];
        return {
          ...prev,
          [agent]: agentMsgs.map((m) => (m.id === msgId ? updater(m) : m)),
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
          streamingAgentRef.current = null;
        },
        onTextDelta: (text) => {
          const id = streamingIdRef.current;
          const agent = streamingAgentRef.current;
          if (!id || !agent) return;
          setAgentStatus(null);
          updateStreamingMessage(agent, id, (msg) => ({
            ...msg,
            content: msg.content + text,
          }));
        },
        onToolActivity: (tool) => {
          const id = streamingIdRef.current;
          const agent = streamingAgentRef.current;
          if (!id || !agent) return;
          setAgentStatus(`Using tool: ${tool}`);
          updateStreamingMessage(agent, id, (msg) => ({
            ...msg,
            toolActivity: tool,
          }));
        },
        onResult: (text) => {
          const id = streamingIdRef.current;
          const agent = streamingAgentRef.current;
          if (!id || !agent) return;
          updateStreamingMessage(agent, id, (msg) => ({
            ...msg,
            content: text,
            isStreaming: false,
            toolActivity: null,
          }));
          setIsStreaming(false);
          setAgentStatus(null);
          streamingIdRef.current = null;
          streamingAgentRef.current = null;
        },
        onError: (message) => {
          const id = streamingIdRef.current;
          const agent = streamingAgentRef.current;
          if (id && agent) {
            updateStreamingMessage(agent, id, (msg) => ({
              ...msg,
              content: msg.content || `Error: ${message}`,
              isStreaming: false,
              toolActivity: null,
            }));
          }
          setIsStreaming(false);
          setAgentStatus(null);
          streamingIdRef.current = null;
          streamingAgentRef.current = null;
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

  const handleFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList);
      if (files.length === 0) return;

      // Add to pending with uploading state
      const entries = files.map((f) => ({
        file: f,
        uploading: true,
        name: f.name,
      }));
      setPendingFiles((prev) => [...prev, ...entries]);

      // Upload each file
      for (let i = 0; i < files.length; i++) {
        const result = await uploadFile(files[i]);

        if (result) {
          // Add user message showing the file
          const fileMsg: ChatMsg = {
            id: `msg-${crypto.randomUUID()}`,
            sender: "user",
            content: `📎 ${result.name}`,
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
          addMessage(selectedAgent, fileMsg);

          // Send the prompt to the agent via WS
          const agentMsgId = `msg-${crypto.randomUUID()}`;
          const agentMsg: ChatMsg = {
            id: agentMsgId,
            sender: "agent",
            agentName: selectedAgent,
            content: "",
            timestamp: new Date().toISOString(),
            isStreaming: true,
            toolActivity: null,
          };
          addMessage(selectedAgent, agentMsg);

          streamingIdRef.current = agentMsgId;
          streamingAgentRef.current = selectedAgent;
          setIsStreaming(true);
          wsRef.current?.sendMessage(selectedAgent, result.prompt);
        }

        // Remove from pending
        setPendingFiles((prev) =>
          prev.filter((p) => p.file !== files[i])
        );
      }
    },
    [uploadFile, addMessage, selectedAgent]
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

  const handleSend = useCallback(() => {
    if (!input.trim() || !selectedAgent || isStreaming) return;

    const userMsg: ChatMsg = {
      id: `msg-${crypto.randomUUID()}`,
      sender: "user",
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };
    addMessage(selectedAgent, userMsg);

    const agentMsgId = `msg-${crypto.randomUUID()}`;
    const agentMsg: ChatMsg = {
      id: agentMsgId,
      sender: "agent",
      agentName: selectedAgent,
      content: "",
      timestamp: new Date().toISOString(),
      isStreaming: true,
      toolActivity: null,
    };
    addMessage(selectedAgent, agentMsg);

    streamingIdRef.current = agentMsgId;
    streamingAgentRef.current = selectedAgent;
    setIsStreaming(true);
    setAgentStatus(t('chat.thinking'));
    wsRef.current?.sendMessage(selectedAgent, input.trim());
    setInput("");
  }, [input, selectedAgent, isStreaming, addMessage]);

  const handleAbort = useCallback(() => {
    wsRef.current?.abort(selectedAgent);
    const id = streamingIdRef.current;
    const agent = streamingAgentRef.current || selectedAgent;
    if (id) {
      updateStreamingMessage(agent, id, (msg) => ({
        ...msg,
        isStreaming: false,
        toolActivity: null,
      }));
    }
    setIsStreaming(false);
    setAgentStatus(null);
    streamingIdRef.current = null;
    streamingAgentRef.current = null;
  }, [selectedAgent, updateStreamingMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleNewChat = useCallback(() => {
    if (
      messages.length > 0 &&
      !confirm(`${t('chat.clearHistoryConfirm')} "${selectedAgent}"?`)
    )
      return;
    clearHistory(activeServer.id, selectedAgent);
    setMessagesByAgent((prev) => ({ ...prev, [selectedAgent]: [] }));
    setMessageCounts((prev) => ({ ...prev, [selectedAgent]: 0 }));
  }, [messages.length, selectedAgent, activeServer.id]);

  const handleClearAll = useCallback(() => {
    if (!confirm(t('chat.clearAllConfirm')))
      return;
    clearAllHistory(activeServer.id);
    setMessagesByAgent({});
    historyLoadedRef.current = new Set();
    setMessageCounts({});
  }, [activeServer.id]);

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

  return (
    <div className="flex h-[calc(100vh-5rem)] gap-0 -m-6 lg:-m-8 mt-0 lg:mt-0">
      {/* Mobile sidebar overlay */}
      {showSidebar && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setShowSidebar(false)}
        />
      )}

      {/* Agent List */}
      <div
        className={cn(
          "w-64 bg-bg-sidebar border-r border-border flex-col shrink-0",
          "fixed md:relative inset-y-0 left-0 z-50 md:z-auto",
          "transition-transform duration-200 md:translate-x-0",
          showSidebar ? "translate-x-0 flex" : "-translate-x-full md:flex hidden md:flex"
        )}
      >
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
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
          <div className="mt-2 flex items-center justify-between">
            <StatusBadge
              status={statusVariant as "online" | "running" | "offline"}
            />
            <button
              type="button"
              onClick={handleClearAll}
              className="p-1.5 text-text-secondary hover:text-red-400 hover:bg-white/5 rounded transition-colors"
              title={t('chat.clearAll')}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {agents.map((agent) => (
            <button
              key={agent}
              onClick={() => {
                setSelectedAgent(agent);
                setShowSidebar(false);
              }}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors",
                selectedAgent === agent &&
                  "bg-accent/30 border-r-2 border-blue-400"
              )}
            >
              <div className="w-8 h-8 rounded-full bg-bg-card border border-border flex items-center justify-center">
                <Bot size={14} className="text-blue-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{agent}</p>
              </div>
              {(messageCounts[agent] || 0) > 0 && (
                <span className="text-[10px] bg-white/10 text-text-secondary px-1.5 py-0.5 rounded-full">
                  {messageCounts[agent]}
                </span>
              )}
            </button>
          ))}
          {agents.length === 0 && (
            <p className="px-4 py-3 text-sm text-text-secondary">
              {wsStatus === "connected"
                ? t('chat.noAgents')
                : t('chat.connecting')}
            </p>
          )}
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
              <Bot size={16} className="text-blue-400" />
            </div>
            <div>
              <p className="font-medium text-sm">{selectedAgent}</p>
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
                      <Loader2 size={14} className="animate-spin text-blue-400" />
                    ) : (
                      <Icon size={14} className="text-blue-400" />
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

          <div className="flex items-end gap-2">
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
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`${t('chat.message')} ${selectedAgent}...`}
              disabled={wsStatus !== "connected"}
              rows={1}
              className="flex-1 bg-bg-card border border-border rounded-xl px-4 py-2.5 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-accent disabled:opacity-50 resize-none overflow-y-auto max-h-[150px] leading-relaxed"
            />

            {/* Send / Stop button */}
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
            ) : (
              <button
                type="button"
                onClick={handleSend}
                disabled={!input.trim() || wsStatus !== "connected"}
                className="p-2.5 bg-accent hover:bg-accent-hover rounded-xl transition-colors disabled:opacity-30 shrink-0"
                aria-label={t('chat.sendMessage')}
              >
                <Send size={18} />
              </button>
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
