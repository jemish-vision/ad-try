import { useCallback, useLayoutEffect, useRef, useState } from "react";

export const MESSAGE_PAGE_SIZE = 20;

/**
 * Sessions currently arrive with their complete message history. Render the most
 * recent page first, then reveal older messages without moving the reader.
 * This limits chart mounting; it does not change server history storage.
 */
export default function useConversationHistory({ messages, scopeKey, scrollRef, userScrolledUpRef }) {
  const [windowState, setWindowState] = useState({ scopeKey, start: Math.max(0, messages.length - MESSAGE_PAGE_SIZE), count: messages.length });
  const pendingAnchorRef = useRef(null);
  const loadingRef = useRef(false);
  const previousScopeRef = useRef(null);

  const needsReset = windowState.scopeKey !== scopeKey
    || (windowState.count === 0 && messages.length > 0)
    || messages.length < windowState.count;
  const start = needsReset ? Math.max(0, messages.length - MESSAGE_PAGE_SIZE) : windowState.start;
  const hasOlderMessages = start > 0;

  const loadOlderMessages = useCallback(() => {
    const container = scrollRef.current;
    if (!container || !hasOlderMessages || loadingRef.current) return;

    loadingRef.current = true;
    pendingAnchorRef.current = {
      scopeKey,
      height: container.scrollHeight,
      top: container.scrollTop
    };
    userScrolledUpRef.current = true;
    setWindowState({ scopeKey, start: Math.max(0, start - MESSAGE_PAGE_SIZE), count: messages.length });
  }, [hasOlderMessages, messages.length, scopeKey, scrollRef, start, userScrolledUpRef]);

  useLayoutEffect(() => {
    const container = scrollRef.current;
    const scopeChanged = previousScopeRef.current !== scopeKey;
    previousScopeRef.current = scopeKey;

    if (needsReset || windowState.count !== messages.length) {
      setWindowState({ scopeKey, start, count: messages.length });
    }

    const anchor = pendingAnchorRef.current;
    if (container && !scopeChanged && anchor?.scopeKey === scopeKey) {
      container.scrollTop = anchor.top + container.scrollHeight - anchor.height;
    } else if (container && (scopeChanged || !userScrolledUpRef.current)) {
      container.scrollTop = container.scrollHeight;
      userScrolledUpRef.current = false;
    }

    pendingAnchorRef.current = null;
    loadingRef.current = false;
  }, [messages, needsReset, scopeKey, scrollRef, start, userScrolledUpRef, windowState.count]);

  return { visibleMessages: messages.slice(start), firstMessageIndex: start, hasOlderMessages, loadOlderMessages };
}
