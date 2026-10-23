import { createChatSessionId, mergeChatSessions } from "./chatSessionHistory";

test("removes duplicate identities inside initial backend or cached history", () => {
  const rows = [
    { id: "session-a", title: "Old name", updatedAt: 100, messages: [] },
    { id: "session-b", title: "Another chat", updatedAt: 150 },
    { id: "session-a", title: "Renamed conversation", updatedAt: 200, messages: [{ text: "Latest answer" }] }
  ];
  const result = mergeChatSessions(rows);
  expect(result.map(session => session.id)).toEqual(["session-a", "session-b"]);
  expect(result[0].title).toBe("Renamed conversation");
  expect(result[0].messages).toHaveLength(1);
});

test("deduplicates overlapping pages and repeats within a page while preserving the latest local reply", () => {
  const current = [{ id: "session-a", updatedAt: 300, messages: [{ text: "New reply" }] }];
  const page = [
    { id: "session-a", updatedAt: 200, messages: [] },
    { id: "session-b", updatedAt: 100 },
    { id: "session-b", updatedAt: 100 }
  ];
  expect(mergeChatSessions(current, page)).toEqual([current[0], page[1]]);
  expect(mergeChatSessions(mergeChatSessions(current, page), page)).toEqual([current[0], page[1]]);
});

test("normalizes legacy and numeric identities before deduplication without mutating source rows", () => {
  const legacy = { sessionId: 42, title: "Legacy chat", updatedAt: 10 };
  expect(mergeChatSessions([null, {}, legacy, { id: "42", updatedAt: 5 }])).toEqual([{ ...legacy, id: "42" }]);
  expect(legacy.id).toBeUndefined();
  expect(mergeChatSessions(undefined, null)).toEqual([]);
});

test("new conversations created within the same millisecond have distinct identities", () => {
  const now = jest.spyOn(Date, "now").mockReturnValue(12345);
  try {
    const ids = Array.from({ length: 100 }, createChatSessionId);
    expect(new Set(ids).size).toBe(100);
    expect(ids.every(id => id.startsWith("session_"))).toBe(true);
  } finally {
    now.mockRestore();
  }
});
