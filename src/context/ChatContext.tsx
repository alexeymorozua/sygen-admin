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
import { SygenWebSocket, type WSStatus } from "@/lib/websocket";
import { SygenAPI, type ChatSession, type ChatSessionMessage, type SygenNotification } from "@/lib/api";
import type { StreamingMessageProps, FileAttachment } from "@/components/StreamingMessage";
import { useServer } from "@/context/ServerContext";

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
    file: { path: string; name: string; size?: number; mime?: string },
    prompt: string,
    isVoice?: boolean
  ) => void;
  abortStreaming: () => void;
  loadSessions: (agent: string) => Promise<void>;
  loadSessionHistory: (sessionId: string) => Promise<void>;
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

  // Refs
  const wsRef = useRef<SygenWebSocket | null>(null);
  const streamingIdRef = useRef<string | null>(null);
  const streamingSessionRef = useRef<string | null>(null);
  const historyLoadedRef = useRef<Set<string>>(new Set());
  const prevAgentRef = useRef(selectedAgent);
  const notificationCallbackRef = useRef<((n: SygenNotification) => void) | null>(null);

  // Derived
  const messages = activeSessionId ? (messagesBySession[activeSessionId] || []) : [];

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
          if (data) setAgentStatus(data);
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
  }, [updateStreamingMessage, activeServer.id, activeServer.url]);

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
      // Ignore
    }
  }, []);

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
      }));
      SygenAPI.saveChatHistory(activeSessionId, saveMsgs).catch(() => {});
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

      wsRef.current.sendMessage(selectedAgent, text);
    },
    [activeSessionId, selectedAgent, wsStatus, addMessage]
  );

  const sendFileMessage = useCallback(
    (
      sessionId: string,
      file: { path: string; name: string; size?: number; mime?: string },
      prompt: string,
      isVoice = false
    ) => {
      const fileMsg: ChatMsg = {
        id: `msg-${uuid()}`,
        sender: "user",
        content: isVoice ? "" : `\u{1F4CE} ${file.name}`,
        timestamp: new Date().toISOString(),
        files: [file],
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

      wsRef.current?.sendMessage(selectedAgent, prompt);
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
      addMessage,
      updateStreamingMessage,
      sendMessage,
      sendFileMessage,
      abortStreaming,
      loadSessions,
      loadSessionHistory,
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
      addMessage,
      updateStreamingMessage,
      sendMessage,
      sendFileMessage,
      abortStreaming,
      loadSessions,
      loadSessionHistory,
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
