import { act, renderHook } from "@testing-library/react";
import useConversationHistory from "./useConversationHistory";

const history = count => Array.from({ length: count }, (_, id) => ({ id: `message-${id}`, text: `${id}` }));

function setup(count = 65) {
  const container = { scrollTop: 0, scrollHeight: 1200 };
  const scrollRef = { current: container };
  const userScrolledUpRef = { current: false };
  const initialProps = { messages: history(count), scopeKey: "profile-a:session-a", scrollRef, userScrolledUpRef };
  const hook = renderHook(props => useConversationHistory(props), { initialProps });
  return { ...hook, container, initialProps, userScrolledUpRef };
}

test("initially mounts only the latest 20 messages and starts at the latest response", () => {
  const { result, container } = setup();
  expect(result.current.visibleMessages.map(message => message.id)).toEqual(history(65).slice(45).map(message => message.id));
  expect(result.current.hasOlderMessages).toBe(true);
  expect(container.scrollTop).toBe(1200);
});

test("reveals one older page per commit and preserves the reader's scroll anchor", () => {
  const { result, container } = setup();
  container.scrollTop = 12;
  // A browser calculates the larger height after React prepends the next page.
  let reads = 0;
  Object.defineProperty(container, "scrollHeight", { get: () => ++reads === 1 ? 1200 : 2000 });

  act(() => {
    result.current.loadOlderMessages();
    result.current.loadOlderMessages();
  });

  expect(result.current.visibleMessages).toHaveLength(40);
  expect(result.current.visibleMessages[0].id).toBe("message-25");
  expect(container.scrollTop).toBe(812);

  act(() => result.current.loadOlderMessages());
  act(() => result.current.loadOlderMessages());
  expect(result.current.visibleMessages).toHaveLength(65);
  expect(result.current.hasOlderMessages).toBe(false);
});

test("retains revealed history when new messages arrive and respects manual scrolling during streaming", () => {
  const { result, rerender, initialProps, container, userScrolledUpRef } = setup();
  act(() => result.current.loadOlderMessages());
  container.scrollTop = 110;
  userScrolledUpRef.current = true;
  rerender({ ...initialProps, messages: history(67) });
  expect(result.current.visibleMessages).toHaveLength(42);
  expect(result.current.visibleMessages[0].id).toBe("message-25");
  expect(container.scrollTop).toBe(110);

  rerender({ ...initialProps, messages: history(67).map(message => message.id === "message-66" ? { ...message, text: "Streaming response" } : message) });
  expect(container.scrollTop).toBe(110);

  userScrolledUpRef.current = false;
  container.scrollHeight = 1500;
  rerender({ ...initialProps, messages: history(68) });
  expect(container.scrollTop).toBe(1500);
});

test("resets the page on profile or conversation change, including asynchronously arriving history", () => {
  const { result, rerender, initialProps, userScrolledUpRef } = setup();
  act(() => result.current.loadOlderMessages());
  rerender({ ...initialProps, scopeKey: "profile-b:session-a", messages: history(80) });
  expect(result.current.visibleMessages).toHaveLength(20);
  expect(result.current.visibleMessages[0].id).toBe("message-60");
  expect(userScrolledUpRef.current).toBe(false);

  rerender({ ...initialProps, scopeKey: "profile-b:session-b", messages: [] });
  expect(result.current.visibleMessages).toEqual([]);
  rerender({ ...initialProps, scopeKey: "profile-b:session-b", messages: history(50) });
  expect(result.current.visibleMessages).toHaveLength(20);
  expect(result.current.visibleMessages[0].id).toBe("message-30");
});
