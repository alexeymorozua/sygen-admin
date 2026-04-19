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
  loadSessionHistory: (
    sessionId: string,
    opts?: { force?: boolean; replace?: boolean },
  ) => Promise<void>;
  loadOlderMessages: (sessionId: string) => Promise<void>;
  removeSessionData: (sessionId: string) => void;

  // Notification bridge
  setNotificationCallback: (cb: ((n: SygenNotification) => void) | null) => void;
  setChatMessageCallback: (cb: ((msg: WSChatMessage) => void) | null) => void;
  setChatNoticeCallback: (
    cb: ((msg: string, type: "info" | "warning" | "error") => void) | null,
  ) => void;

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
  const chatMessageCallbackRef = useRef<((msg: WSChatMessage) => void) | null>(null);
  const chatNoticeCallbackRef = useRef<
    ((msg: string, type: "info" | "warning" | "error") => void) | null
  >(null);
  // Timestamp (ms) of the most recent streaming event for the *own* active
  // stream. Updated by text_delta / tool_activity / system_status / result
  // handlers. The watchdog effect uses it to detect a server-stuck stream
  // after WS reconnect when the server never sends `result` for a stream
  // whose underlying agent task already finished.
  const lastStreamEventRef = useRef<number>(0);
  // Mirror activeSessionId into a ref so refs-driven callbacks (watchdog,
  // reconnect refetch) can read the current value without re-creating.
  const activeSessionIdRef = useRef<string | null>(null);
  // Tracks whether we've ever observed a connected WS. Used to distinguish
  // the initial handshake from a reconnect — only reconnects need a history
  // refetch, because initial load already runs via loadSessionHistory().
  const wasConnectedRef = useRef(false);

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
        sibling: true,
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
          // Sibling streams cannot resume without the server re-publishing
          // them, so wipe their placeholders. For *own* streams we deliberately
          // keep `isStreaming=true` + the placeholder intact: the WS auto-
          // reconnects within seconds, and the accompanying reconnect-refetch
          // effect will replace local state with the authoritative server
          // history once it lands. If the reconnect never comes the 120s
          // watchdog cleans up. Dropping isStreaming here would hide the Stop
          // button mid-stream every time the WS hiccups, which is confusing
          // and makes the user think their message was lost.
          setAgentStatus(null);
          siblingStreamingRef.current.clear();
        },
        onTextDelta: (text, ctx) => {
          const target = resolveStreamTarget(ctx) ?? ensureSiblingPlaceholder(ctx);
          if (!target) return;
          if (target.own) {
            setAgentStatus(null);
            lastStreamEventRef.current = Date.now();
          }
          updateStreamingMessage(target.session, target.id, (msg) => ({
            ...msg,
            content: msg.content + text,
          }));
        },
        onToolActivity: (tool, ctx) => {
          const target = resolveStreamTarget(ctx) ?? ensureSiblingPlaceholder(ctx);
          if (!target) return;
          if (target.own) {
            setAgentStatus(`Using tool: ${tool}`);
            lastStreamEventRef.current = Date.now();
          }
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
            lastStreamEventRef.current = Date.now();
          } else if (ctx.sessionId) {
            siblingStreamingRef.current.delete(ctx.sessionId);
          }
          // Notification path: admin↔admin stream delivers text_delta+result,
          // not chat_message. Synthesize a local chat_message envelope so
          // useDesktopNotifications fires on agent replies. Only fire on the
          // final text + when we actually have a session id.
          if (chatMessageCallbackRef.current && text && ctx.sessionId && ctx.agent) {
            chatMessageCallbackRef.current({
              type: "chat_message",
              role: "agent",
              kind: "text",
              agent: ctx.agent,
              session_id: ctx.sessionId,
              content: text,
              timestamp: Math.floor(Date.now() / 1000),
            });
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
            lastStreamEventRef.current = Date.now();
          }
        },
        onChatMessage: (msg: WSChatMessage) => {
          const sessionId = msg.session_id;
          if (!sessionId) return;
          // A chat_message from the server is always a cross-device mirror for
          // admin↔agent chats: the initiating tab already added its own local
          // copy before sending. Mark it as sibling so our debounced save
          // doesn't re-persist it with a different id (which would duplicate
          // the message on next reload — the originator saves with its own id).
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
            sibling: true,
          });
          chatMessageCallbackRef.current?.(msg);
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

  const loadSessionHistory = useCallback(async (
    sessionId: string,
    opts?: { force?: boolean; replace?: boolean },
  ) => {
    // The cached-once guard is there to avoid re-fetching on every mount of
    // <ChatPage/>, not to block explicit refreshes. ``force: true`` bypasses
    // it for three cases:
    //   1. User pressed the Refresh button — they expect a fresh pull.
    //   2. PWA resumed from the background on iOS — WS was killed by the OS
    //      while suspended and any messages sent from other devices during
    //      that window are only in the persisted history now.
    //   3. WS reconnect after mid-stream disconnect — server is authoritative.
    // ``replace: true`` additionally drops local `isStreaming=true` placeholders
    // before merging: after a WS reconnect those placeholders (user msg, empty
    // agent bubble) are stale — the server already saved the real pair under
    // its own ids, and keeping ours would duplicate the conversation visually.
    if (!opts?.force && historyLoadedRef.current.has(sessionId)) return;
    historyLoadedRef.current.add(sessionId);
    try {
      const page = await SygenAPI.getChatHistoryPage(sessionId, { limit: 50 });
      setSessionHasMore((prev) => ({ ...prev, [sessionId]: page.has_more }));
      const restMsgs: ChatMsg[] = page.messages.map((m) => ({
        id: m.id,
        sender: m.sender,
        agentName: m.agentName,
        content: m.content,
        timestamp: m.timestamp,
        files: m.files as FileAttachment[] | undefined,
        kind: m.kind,
        meta: m.meta,
      }));
      if (page.messages.length === 0 && !opts?.replace) {
        // Nothing to merge and caller didn't ask for a replace-sweep.
        return;
      }
      // Merge instead of overwrite: a WS message that arrived between the
      // REST request and its resolve must not be discarded. Dedupe by id,
      // then sort by timestamp so order is stable regardless of which side
      // landed first.
      setMessagesBySession((prev) => {
        const liveMsgs = prev[sessionId] || [];
        // On replace, purge placeholder/streaming messages — server state is
        // authoritative after a reconnect, and any partial local draft was
        // generated with a client-only id that the server never saw.
        const baseLive = opts?.replace
          ? liveMsgs.filter((m) => !m.isStreaming)
          : liveMsgs;
        const seen = new Set(restMsgs.map((m) => m.id));
        const extras = baseLive.filter((m) => !seen.has(m.id));
        const merged = [...restMsgs, ...extras];
        merged.sort((a, b) => {
          const ta = Date.parse(a.timestamp || "") || 0;
          const tb = Date.parse(b.timestamp || "") || 0;
          return ta - tb;
        });
        // Safety net for legacy history files: 1.3.41 briefly persisted the
        // same turn under two different ids when the client autosave raced
        // against the server's first persist. Collapse those leftovers on a
        // replace-sweep only (reconnect / visibility refetch), with a tight
        // 5 s window so legitimate repeats like "ok" / "да" are never merged.
        // Fresh history written by 1.3.42 shares ids across both paths and
        // won't trigger this branch at all.
        if (!opts?.replace) {
          return { ...prev, [sessionId]: merged };
        }
        const deduped: ChatMsg[] = [];
        for (const msg of merged) {
          const ts = Date.parse(msg.timestamp || "") || 0;
          const twin = deduped.find(
            (d) =>
              d.sender === msg.sender &&
              (d.content || "") === (msg.content || "") &&
              Math.abs((Date.parse(d.timestamp || "") || 0) - ts) < 5_000,
          );
          if (!twin) deduped.push(msg);
        }
        return { ...prev, [sessionId]: deduped };
      });
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
    activeSessionIdRef.current = activeSessionId;
    if (activeSessionId) {
      loadSessionHistory(activeSessionId);
    }
  }, [activeSessionId, loadSessionHistory]);

  // Refetch active session history when the WS transitions back to connected
  // after a previous successful connect. The server-side persistence layer
  // saves user + agent messages even when the stream drops mid-flight (core
  // 1.3.41+), so the authoritative way to recover from a killed stream is to
  // replace local state with whatever the server persisted. This also clears
  // stale `isStreaming=true` placeholders so the Stop button / "..." bubble
  // disappear once the real reply lands.
  useEffect(() => {
    if (wsStatus !== "connected") return;
    const isReconnect = wasConnectedRef.current;
    wasConnectedRef.current = true;
    if (!isReconnect) return;
    const sid = activeSessionIdRef.current;
    if (!sid) return;
    loadSessionHistory(sid, { force: true, replace: true }).then(() => {
      // After the replace-sweep the placeholder for our own in-flight stream
      // is gone (it was a client-only id never seen by the server). Any
      // post-reconnect text_delta for this session will fall through to the
      // sibling path and get a fresh placeholder, which is the correct
      // behavior — the server treats reconnected clients as new consumers of
      // already-persisted messages, not as resumed stream owners. So drop
      // our own refs and clear isStreaming to take down the Stop button.
      streamingIdRef.current = null;
      streamingSessionRef.current = null;
      lastStreamEventRef.current = 0;
      setIsStreaming(false);
      setAgentStatus(null);
    });
    chatNoticeCallbackRef.current?.(
      "Connection restored, refreshing history",
      "info",
    );
  }, [wsStatus, loadSessionHistory]);

  // Watchdog: if an own stream has not received any streaming event for
  // 120 s while `isStreaming=true`, assume the server-side stream was lost
  // and force-recover. Clears the placeholder, resets isStreaming, and pulls
  // fresh history from the server so the user can send the next message.
  useEffect(() => {
    if (!isStreaming) return;
    // Arm the timestamp lazily: consumers that start a stream without going
    // through sendMessage (e.g. sendFileMessage) still get a fresh anchor.
    if (lastStreamEventRef.current === 0) {
      lastStreamEventRef.current = Date.now();
    }
    const interval = setInterval(() => {
      const elapsed = Date.now() - lastStreamEventRef.current;
      if (elapsed <= 120_000) return;
      const sid = streamingSessionRef.current;
      const id = streamingIdRef.current;
      if (sid && id) {
        updateStreamingMessage(sid, id, (msg) => ({
          ...msg,
          isStreaming: false,
          toolActivity: null,
        }));
      }
      streamingIdRef.current = null;
      streamingSessionRef.current = null;
      setIsStreaming(false);
      setAgentStatus(null);
      lastStreamEventRef.current = 0;
      chatNoticeCallbackRef.current?.(
        "Connection lost, refreshing history",
        "warning",
      );
      const active = activeSessionIdRef.current;
      if (active) {
        loadSessionHistory(active, { force: true, replace: true });
      }
    }, 5_000);
    return () => clearInterval(interval);
  }, [isStreaming, updateStreamingMessage, loadSessionHistory]);

  // Reset when server changes
  useEffect(() => {
    historyLoadedRef.current = new Set();
    setMessagesBySession({});
    setSessions([]);
    setActiveSessionIdRaw(null);
  }, [activeServer.id]);

  // Re-sync when the tab becomes visible again. iOS Safari suspends
  // backgrounded PWAs aggressively: the WebSocket is killed and any
  // chat_message/text_delta events pushed from sibling devices during that
  // window never reach us. The SygenWebSocket auto-reconnect handles the
  // live channel going forward, but we still need to catch up on messages
  // that were written to history while we slept. Force a history reload
  // for the active session (merge-by-id dedupes against anything already
  // in memory so reopen mid-stream doesn't double-render).
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const sid = activeSessionId;
      if (sid) loadSessionHistory(sid, { force: true });
    };
    document.addEventListener("visibilitychange", onVisible);
    // pageshow with persisted=true fires on iOS when PWA is restored from
    // bfcache — visibilitychange doesn't always fire in that path.
    const onPageShow = (ev: PageTransitionEvent) => {
      if (ev.persisted) onVisible();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [activeSessionId, loadSessionHistory]);

  // Save messages to server (debounced)
  useEffect(() => {
    if (!activeSessionId || !messagesBySession[activeSessionId]) return;
    const msgs = messagesBySession[activeSessionId];
    if (msgs.some((m) => m.isStreaming)) return;
    if (msgs.length === 0) return;

    const timer = setTimeout(() => {
      // Skip sibling-mirror messages: they were originated by another device
      // which will save them under its own id. If we saved our copy too, the
      // merge-by-id endpoint would treat them as distinct and persist both,
      // causing visible duplicates after reload.
      const persistable = msgs.filter((m) => !m.sibling);
      if (persistable.length === 0) return;
      const saveMsgs: ChatSessionMessage[] = persistable.map((m) => ({
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

      // Generate ids up-front so the server persists under the same id we
      // store locally — prevents duplicates on reload.
      const userMsgId = `msg-${uuid()}`;
      const agentMsgId = `msg-${uuid()}`;

      const userMsg: ChatMsg = {
        id: userMsgId,
        sender: "user",
        content: text,
        timestamp: new Date().toISOString(),
      };
      addMessage(sessionId, userMsg);

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
      lastStreamEventRef.current = Date.now();
      setIsStreaming(true);
      setAgentStatus(null);

      wsRef.current.sendMessage(selectedAgent, text, sessionId, {
        userMsgId,
        assistantMsgId: agentMsgId,
      });
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
      const userMsgId = `msg-${uuid()}`;
      const agentMsgId = `msg-${uuid()}`;
      const fileMsg: ChatMsg = {
        id: userMsgId,
        sender: "user",
        content: caption,
        timestamp: new Date().toISOString(),
        files,
      };
      addMessage(sessionId, fileMsg);

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
      lastStreamEventRef.current = Date.now();
      setIsStreaming(true);
      setAgentStatus(null);

      wsRef.current?.sendMessage(selectedAgent, prompt, sessionId, {
        userMsgId,
        assistantMsgId: agentMsgId,
      });
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
    lastStreamEventRef.current = 0;
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

  const setChatMessageCallback = useCallback(
    (cb: ((msg: WSChatMessage) => void) | null) => {
      chatMessageCallbackRef.current = cb;
    },
    []
  );

  const setChatNoticeCallback = useCallback(
    (cb: ((msg: string, type: "info" | "warning" | "error") => void) | null) => {
      chatNoticeCallbackRef.current = cb;
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
      setChatMessageCallback,
      setChatNoticeCallback,
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
      setChatMessageCallback,
      setChatNoticeCallback,
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
