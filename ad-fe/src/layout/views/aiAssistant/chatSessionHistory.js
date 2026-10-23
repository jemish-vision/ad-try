/* global globalThis */

let fallbackSessionSequence = 0;

export function createChatSessionId() {
  const uniquePart = globalThis.crypto?.randomUUID?.();
  if (uniquePart) return `session_${uniquePart}`;
  fallbackSessionSequence += 1;
  return `session_${Date.now()}_${fallbackSessionSequence}`;
}

/** Keep one conversation per identity, including duplicates within an API page. */
export function mergeChatSessions(...sessionLists) {
  const conversations = new Map();

  for (const sessions of sessionLists) {
    if (!Array.isArray(sessions)) continue;
    for (const session of sessions) {
      const rawId = session?.id || session?.sessionId;
      if (!rawId) continue;
      const id = String(rawId);
      const candidate = { ...session, id };
      const existing = conversations.get(id);
      const candidateTime = new Date(candidate.updatedAt || candidate.createdAt || 0).getTime() || 0;
      const existingTime = existing ? new Date(existing.updatedAt || existing.createdAt || 0).getTime() || 0 : -1;

      // Offset pages may overlap when a conversation was renamed or received a
      // reply. Keep its newest copy without moving or duplicating the row.
      if (!existing || candidateTime > existingTime) conversations.set(id, candidate);
    }
  }

  return Array.from(conversations.values());
}
