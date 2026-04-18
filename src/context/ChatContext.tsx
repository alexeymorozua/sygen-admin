"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { SygenWebSocket, type WSStatus, type WSChatMessage, type WSStreamContext } from "@/lib/websocket";
import { SygenAPI, type ChatSession, type ChatSessionMessage, type SygenNotification, type UserInfo } from "@/lib/api";
import type { StreamingMessageProps, FileAttachment } from "@/components/StreamingMessage";
import { useServer } from "@/context/ServerContext";
import { useAuth } from "@/context/AuthContext";

type ChatMsg = StreamingMessageProps;

function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ---------------------------------------------------------------------------
// Context interface
// ---------------------------------------------------------------------------

interface ChatContextValue {
  // Connection
  wsStatus: WSStatus;
  agents: string[];
  agentStatus: string | null;
  isStreaming: boolean;

  // Session state
  selectedAgent: string;
  setSelectedAgent: (agent: string) => void;
  sessions: ChatSession[];
  setSessions: React.Dispatch<React.SetStateAction<ChatSession[]>>;
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;
  loadingSessions: boolean;

  // Messages
  messages: ChatMsg[];
  messagesBySession: Record<string, ChatMsg[]>;
  sessionHasMore: Record<string, boolean>;
  loadingOlderBySession: Record<string, boolean>;
  addMessage: (sessionId: string, msg: ChatMsg) => void;
  updateStreamingMessage: (
    sessionId: string,
    msgId: string,
    updater: (msg: ChatMsg) => ChatMsg
  ) => void;

  // Actions
  sendMessage: (text: string) => Promise<void>;
  sendFileMessage: (
    sessionId: string,
    files: { path: string; name: string; size?: number; mime?: string }[],
    prompt: string,
    options?: { caption?: string; isVoice?: boolean }
  ) => void;
  abortStreaming: () => void;
  loadSessions: (agent: string) => Promise<void>;
  loadSessionHistory: (sessionId: string) => Promise<void>;
  loadOlderMessages: (sessionId: string) => Promise<void>;
  removeSessionData: (sessionId: string) => void;

  // Notification bridge
  setNotificationCallback: (cb: ((n: SygenNotification) => void) | null) => void;

  // Refs for external use
  wsRef: React.MutableRefObject<SygenWebSocket | null>;
  streamingIdRef: React.MutableRefObject<string | null>;
  streamingSessionRef: React.MutableRefObject<string | null>;
  historyLoadedRef: React.MutableRefObject<Set<string>>;
}

const ChatContext = createContext<ChatContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { activeServer } = useServer();
  const { user, refreshUser } = useAuth();

  // Stable refs so WS callbacks always see the latest auth state without
  // forcing the whole WebSocket to reconnect on every user/role change.
  const userRef = useRef(user);
  userRef.current = user;
  const refreshUserRef = useRef(refreshUser);
  refreshUserRef.current = refreshUser;

  // Connection state
  const [wsStatus, setWsStatus] = useState<WSStatus>("disconnected");
  const [agents, setAgents] = useState<string[]>([]);
  const [agentStatus, setAgentStatus] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  // Session state
  const [selectedAgent, setSelectedAgent] = useState<string>("main");
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionIdRaw] = useState<string | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [messagesBySession, setMessagesBySession] = useState<Record<string, ChatMsg[]>>({});
  const [sessionHasMore, setSessionHasMore] = useState<Record<string, boolean>>({});
  const [loadingOlderBySession, setLoadingOlderBySession] = useState<Record<string, boolean>>({});

  // Refs
  const wsRef = useRef<SygenWebSocket | null>(null);
  const streamingIdRef = useRef<string | null>(null);
  const streamingSessionRef = useRef<string | null>(null);
  // Tracks placeholder message ids created for streams initiated by *sibling*
  // tabs (same user, different device/window). Keyed by session id so we can
  // route cross-device deltas into the correct chat without colliding with
  // our own streamingIdRef.
  const siblingStreamingRef = useRef<Map<string, string>>(new Map());
  const historyLoadedRef = useRef<Set<string>>(new Set());
  const prevAgentRef = useRef(selectedAgent);
  const notificationCallbackRef = useRef<((n: SygenNotification) => void) | null>(null);

  // Derived — memoize so consumers don't re-render every tick when empty.
  const messages = useMemo(
    () => (activeSessionId ? (messagesBySession[activeSessionId] ?? []) : []),
    [activeSessionId, messagesBySession],
  );

  // ---------------------------------------------------------------------------
  // Core message helpers
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // WebSocket connection (persists across page navigation)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    // Resolve the (session, msgId) pair for an enriched streaming event.
    // If the event belongs to *this* tab's active stream we use the local
    // refs; otherwise we track a per-session placeholder for sibling streams
    // so cross-device live sync writes into the correct chat history.
    const resolveStreamTarget = (
      ctx: WSStreamContext,
    ): { session: string; id: string; own: boolean } | null => {
      const ownId = streamingIdRef.current;
      const ownSession = streamingSessionRef.current;
      const ctxSession = ctx.sessionId;

      if (ctxSession && ownSession && ctxSession === ownSession && ownId) {
        return { session: ownSession, id: ownId, own: true };
      }
      if (!ctxSession) {
        if (ownId && ownSession) {
          return { session: ownSession, id: ownId, own: true };
        }
        return null;
      }
      const existing = siblingStreamingRef.current.get(ctxSession);
      if (existing) {
        return { session: ctxSession, id: existing, own: false };
      }
      return null;
    };

    const ensureSiblingPlaceholder = (
      ctx: WSStreamContext,
    ): { session: string; id: string; own: false } | null => {
      const sessionId = ctx.sessionId;
      if (!sessionId) return null;
      const existing = siblingStreamingRef.current.get(sessionId);
      if (existing) return { session: sessionId, id: existing, own: false };
      const newId = `msg-${uuid()}`;
      siblingStreamingRef.current.set(sessionId, newId);
      addMessage(sessionId, {
        id: newId,
        sender: "agent",
        agentName: ctx.agent,
        content: "",
        timestamp: new Date().toISOString(),
        isStreaming: true,
      });
      return { session: sessionId, id: newId, own: false };
    };

    const ws = new SygenWebSocket(
      {
        onConnected: (agentList: string[], role?: string) => {
          setAgents(agentList);
          if (agentList.length > 0) {
            setSelectedAgent((prev) =>
              agentList.includes(prev) ? prev : agentList[0]
            );
          }
          // Apply role changes without a page reload. The server may have
          // promoted/demoted this user while the previous session was idle.
          if (role && (role === "admin" || role === "operator" || role === "viewer")) {
            const current = userRef.current;
            if (current && current.role !== role) {
              refreshUserRef.current({ ...current, role: role as UserInfo["role"] });
            }
          }
        },
        onDisconnected: () => {
          setIsStreaming(false);
          setAgentStatus(null);
          streamingIdRef.current = null;
          streamingSessionRef.current = null;
          siblingStreamingRef.current.clear();
        },
        onTextDelta: (text, ctx) => {
          const target = resolveStreamTarget(ctx) ?? ensureSiblingPlaceholder(ctx);
          if (!target) return;
          if (target.own) setAgentStatus(null);
          updateStreamingMessage(target.session, target.id, (msg) => ({
            ...msg,
            content: msg.content + text,
          }));
        },
        onToolActivity: (tool, ctx) => {
          const target = resolveStreamTarget(ctx) ?? ensureSiblingPlaceholder(ctx);
          if (!target) return;
          if (target.own) setAgentStatus(`Using tool: ${tool}`);
          updateStreamingMessage(target.session, target.id, (msg) => ({
            ...msg,
            toolActivity: tool,
          }));
        },
        onResult: (text, _files, ctx) => {
          const target = resolveStreamTarget(ctx) ?? ensureSiblingPlaceholder(ctx);
          if (!target) return;
          updateStreamingMessage(target.session, target.id, (msg) => ({
            ...msg,
            content: text,
            isStreaming: false,
            toolActivity: null,
          }));
          if (target.own) {
            setIsStreaming(false);
            setAgentStatus(null);
            streamingIdRef.current = null;
            streamingSessionRef.current = null;
          } else if (ctx.sessionId) {
            siblingStreamingRef.current.delete(ctx.sessionId);
          }
        },
        onError: (message, ctx) => {
          const target = resolveStreamTarget(ctx);
          if (target) {
            updateStreamingMessage(target.session, target.id, (msg) => ({
              ...msg,
              content: msg.content || `Error: ${message}`,
              isStreaming: false,
              toolActivity: null,
            }));
            if (target.own) {
              setIsStreaming(false);
              setAgentStatus(null);
              streamingIdRef.current = null;
              streamingSessionRef.current = null;
            } else if (ctx.sessionId) {
              siblingStreamingRef.current.delete(ctx.sessionId);
            }
          }
        },
        onSystemStatus: (data, ctx) => {
          if (!data) return;
          const ownSession = streamingSessionRef.current;
          if (!ctx.sessionId || ctx.sessionId === ownSession) {
            setAgentStatus(data);
          }
        },
        onChatMessage: (msg: WSChatMessage) => {
          const sessionId = msg.session_id;
          if (!sessionId) return;
          addMessage(sessionId, {
            id: `msg-${uuid()}`,
            sender: msg.role === "user" ? "user" : "agent",
            agentName: msg.agent,
            content: msg.content,
            timestamp: msg.timestamp
              ? new Date(msg.timestamp * 1000).toISOString()
              : new Date().toISOString(),
            kind: msg.kind,
            meta: msg.meta,
          });
        },
        onStatusChange: setWsStatus,
        onNotification: (notification) => {
          notificationCallbackRef.current?.(notification);
        },
      },
      { url: activeServer.url, token: activeServer.token }
    );

    wsRef.current = ws;
    ws.connect();

    return () => ws.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateStreamingMessage, addMessage, activeServer.id, activeServer.url]);

  // ---------------------------------------------------------------------------
  // Session / history loading
  // ---------------------------------------------------------------------------

  const loadSessions = useCallback(async (agent: string) => {
    setLoadingSessions(true);
    try {
      const data = await SygenAPI.getChatSessions(agent);
      setSessions(data);
    } catch {
      setSessions([]);
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  const loadSessionHistory = useCallback(async (sessionId: string) => {
    if (historyLoadedRef.current.has(sessionId)) return;
    historyLoadedRef.current.add(sessionId);
    try {
      const page = await SygenAPI.getChatHistoryPage(sessionId, { limit: 50 });
      setSessionHasMore((prev) => ({ ...prev, [sessionId]: page.has_more }));
      if (page.messages.length > 0) {
        setMessagesBySession((prev) => ({
          ...prev,
          [sessionId]: page.messages.map((m) => ({
            id: m.id,
            sender: m.sender,
            agentName: m.agentName,
            content: m.content,
            timestamp: m.timestamp,
            files: m.files as FileAttachment[] | undefined,
            kind: m.kind,
            meta: m.meta,
          })),
        }));
      }
    } catch {
      historyLoadedRef.current.delete(sessionId);
    }
  }, []);

  const loadOlderMessages = useCallback(async (sessionId: string) => {
    const existing = messagesBySession[sessionId];
    if (!existing || existing.length === 0) return;
    if (!sessionHasMore[sessionId]) return;
    if (loadingOlderBySession[sessionId]) return;

    setLoadingOlderBySession((prev) => ({ ...prev, [sessionId]: true }));
    try {
      const oldestId = existing[0].id;
      const page = await SygenAPI.getChatHistoryPage(sessionId, {
        limit: 50,
        before: oldestId,
      });
      setSessionHasMore((prev) => ({ ...prev, [sessionId]: page.has_more }));
      if (page.messages.length > 0) {
        setMessagesBySession((prev) => {
          const current = prev[sessionId] || [];
          const older: ChatMsg[] = page.messages.map((m) => ({
            id: m.id,
            sender: m.sender,
            agentName: m.agentName,
            content: m.content,
            timestamp: m.timestamp,
            files: m.files as FileAttachment[] | undefined,
            kind: m.kind,
            meta: m.meta,
          }));
          const seen = new Set(current.map((m) => m.id));
          const merged = [...older.filter((m) => !seen.has(m.id)), ...current];
          return { ...prev, [sessionId]: merged };
        });
      }
    } catch {
      // Ignore — next scroll will retry.
    } finally {
      setLoadingOlderBySession((prev) => ({ ...prev, [sessionId]: false }));
    }
  }, [messagesBySession, sessionHasMore, loadingOlderBySession]);

  // Load sessions on agent change
  useEffect(() => {
    if (!selectedAgent || wsStatus !== "connected") return;
    const agentChanged = prevAgentRef.current !== selectedAgent;
    prevAgentRef.current = selectedAgent;

    loadSessions(selectedAgent);
    if (agentChanged) {
      setActiveSessionIdRaw(null);
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
    setActiveSessionIdRaw(null);
  }, [activeServer.id]);

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
        kind: m.kind,
        meta: m.meta,
      }));
      // merge=true so we don't wipe older messages we haven't paginated into memory.
      SygenAPI.saveChatHistory(activeSessionId, saveMsgs, { merge: true }).catch(() => {});
    }, 1000);

    return () => clearTimeout(timer);
  }, [messagesBySession, activeSessionId]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || !wsRef.current || wsStatus !== "connected") return;

      let sessionId = activeSessionId;

      // Create session if needed
      if (!sessionId) {
        try {
          const session = await SygenAPI.createChatSession(
            selectedAgent,
            text.slice(0, 60)
          );
          sessionId = session.id;
          setSessions((prev) => [session, ...prev]);
          setActiveSessionIdRaw(sessionId);
        } catch {
          return;
        }
      }

      // Add user message
      const userMsg: ChatMsg = {
        id: `msg-${uuid()}`,
        sender: "user",
        content: text,
        timestamp: new Date().toISOString(),
      };
      addMessage(sessionId, userMsg);

      // Add placeholder agent message
      const agentMsgId = `msg-${uuid()}`;
      const agentMsg: ChatMsg = {
        id: agentMsgId,
        sender: "agent",
        agentName: selectedAgent,
        content: "",
        timestamp: new Date().toISOString(),
        isStreaming: true,
      };
      addMessage(sessionId, agentMsg);

      streamingIdRef.current = agentMsgId;
      streamingSessionRef.current = sessionId;
      setIsStreaming(true);
      setAgentStatus(null);

      wsRef.current.sendMessage(selectedAgent, text, sessionId);
    },
    [activeSessionId, selectedAgent, wsStatus, addMessage]
  );

  const sendFileMessage = useCallback(
    (
      sessionId: string,
      files: { path: string; name: string; size?: number; mime?: string }[],
      prompt: string,
      options?: { caption?: string; isVoice?: boolean }
    ) => {
      if (files.length === 0) return;
      const caption = options?.caption ?? "";
      const fileMsg: ChatMsg = {
        id: `msg-${uuid()}`,
        sender: "user",
        content: caption,
        timestamp: new Date().toISOString(),
        files,
      };
      addMessage(sessionId, fileMsg);

      // Add placeholder agent message
      const agentMsgId = `msg-${uuid()}`;
      const agentMsg: ChatMsg = {
        id: agentMsgId,
        sender: "agent",
        agentName: selectedAgent,
        content: "",
        timestamp: new Date().toISOString(),
        isStreaming: true,
      };
      addMessage(sessionId, agentMsg);

      streamingIdRef.current = agentMsgId;
      streamingSessionRef.current = sessionId;
      setIsStreaming(true);
      setAgentStatus(null);

      wsRef.current?.sendMessage(selectedAgent, prompt, sessionId);
    },
    [selectedAgent, addMessage]
  );

  const abortStreaming = useCallback(() => {
    wsRef.current?.abort(selectedAgent);
    const id = streamingIdRef.current;
    const session = streamingSessionRef.current;
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
  }, [selectedAgent, updateStreamingMessage]);

  const removeSessionData = useCallback((sessionId: string) => {
    setMessagesBySession((prev) => {
      const next = { ...prev };
      delete next[sessionId];
      return next;
    });
    historyLoadedRef.current.delete(sessionId);
  }, []);

  const setActiveSessionId = useCallback((id: string | null) => {
    setActiveSessionIdRaw(id);
  }, []);

  const setNotificationCallback = useCallback(
    (cb: ((n: SygenNotification) => void) | null) => {
      notificationCallbackRef.current = cb;
    },
    []
  );

  // ---------------------------------------------------------------------------
  // Context value
  // ---------------------------------------------------------------------------

  const value = useMemo(
    () => ({
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
      messagesBySession,
      sessionHasMore,
      loadingOlderBySession,
      addMessage,
      updateStreamingMessage,
      sendMessage,
      sendFileMessage,
      abortStreaming,
      loadSessions,
      loadSessionHistory,
      loadOlderMessages,
      removeSessionData,
      setNotificationCallback,
      wsRef,
      streamingIdRef,
      streamingSessionRef,
      historyLoadedRef,
    }),
    [
      wsStatus,
      agents,
      agentStatus,
      isStreaming,
      selectedAgent,
      sessions,
      activeSessionId,
      loadingSessions,
      messages,
      messagesBySession,
      sessionHasMore,
      loadingOlderBySession,
      addMessage,
      updateStreamingMessage,
      sendMessage,
      sendFileMessage,
      abortStreaming,
      loadSessions,
      loadSessionHistory,
      loadOlderMessages,
      removeSessionData,
      setActiveSessionId,
      setNotificationCallback,
    ]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error("useChat must be used within ChatProvider");
  }
  return ctx;
}
