import { describe, it, expect, vi, beforeEach } from "vitest";

let SygenAPI: typeof import("@/lib/api").SygenAPI;

function mockFetch(response: unknown, options?: { ok?: boolean; status?: number }) {
  const ok = options?.ok ?? true;
  const status = options?.status ?? (ok ? 200 : 400);
  return vi.fn().mockResolvedValue({
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    json: () => Promise.resolve(response),
  });
}

beforeEach(async () => {
  vi.stubEnv("NEXT_PUBLIC_USE_MOCK", "false");
  vi.stubEnv("NEXT_PUBLIC_SYGEN_API_URL", "http://test-api:8080");
  // NEXT_PUBLIC_SYGEN_API_TOKEN removed — token login uses server-side proxy
  vi.resetModules();
  const mod = await import("@/lib/api");
  SygenAPI = mod.SygenAPI;
});

describe("Chat Sessions API", () => {
  describe("getChatSessions", () => {
    it("fetches sessions for a specific agent", async () => {
      const sessions = [
        { id: "s1", agent: "main", title: "Chat 1", created_at: 1000, updated_at: 2000 },
      ];
      const fetchSpy = mockFetch({ data: sessions });
      vi.stubGlobal("fetch", fetchSpy);

      const result = await SygenAPI.getChatSessions("main");

      expect(fetchSpy).toHaveBeenCalledWith(
        "http://test-api:8080/api/chat/sessions?agent=main",
        expect.anything()
      );
      expect(result).toEqual(sessions);
    });

    it("fetches all sessions when no agent specified", async () => {
      const fetchSpy = mockFetch({ data: [] });
      vi.stubGlobal("fetch", fetchSpy);

      await SygenAPI.getChatSessions();

      expect(fetchSpy).toHaveBeenCalledWith(
        "http://test-api:8080/api/chat/sessions",
        expect.anything()
      );
    });
  });

  describe("createChatSession", () => {
    it("creates a new session", async () => {
      const session = {
        id: "new-id",
        agent: "main",
        title: "Test",
        created_at: 1000,
        updated_at: 1000,
      };
      const fetchSpy = mockFetch({ data: session });
      vi.stubGlobal("fetch", fetchSpy);

      const result = await SygenAPI.createChatSession("main", "Test");

      expect(fetchSpy).toHaveBeenCalledWith(
        "http://test-api:8080/api/chat/sessions",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ agent: "main", title: "Test" }),
        })
      );
      expect(result).toEqual(session);
    });
  });

  describe("deleteChatSession", () => {
    it("deletes a session", async () => {
      const fetchSpy = mockFetch({ data: { deleted: "s1" } });
      vi.stubGlobal("fetch", fetchSpy);

      await SygenAPI.deleteChatSession("s1");

      expect(fetchSpy).toHaveBeenCalledWith(
        "http://test-api:8080/api/chat/sessions/s1",
        expect.objectContaining({ method: "DELETE" })
      );
    });
  });

  describe("getChatHistory", () => {
    it("fetches messages for a session", async () => {
      const messages = [
        { id: "m1", sender: "user", content: "Hello", timestamp: "2024-01-01" },
      ];
      const fetchSpy = mockFetch({ data: messages });
      vi.stubGlobal("fetch", fetchSpy);

      const result = await SygenAPI.getChatHistory("s1");

      expect(fetchSpy).toHaveBeenCalledWith(
        "http://test-api:8080/api/chat/sessions/s1/messages",
        expect.anything()
      );
      expect(result).toEqual(messages);
    });
  });

  describe("saveChatHistory", () => {
    it("saves messages to a session", async () => {
      const messages = [
        { id: "m1", sender: "user" as const, content: "Hello", timestamp: "2024-01-01" },
      ];
      const fetchSpy = mockFetch({ data: { saved: 1 } });
      vi.stubGlobal("fetch", fetchSpy);

      await SygenAPI.saveChatHistory("s1", messages);

      expect(fetchSpy).toHaveBeenCalledWith(
        "http://test-api:8080/api/chat/sessions/s1/messages",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ messages }),
        })
      );
    });
  });
});
