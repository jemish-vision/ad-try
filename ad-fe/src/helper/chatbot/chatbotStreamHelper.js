// Shared streaming and session utilities for AdvertiseIQ Chatbot
export const fmtTime = (ts) =>
  ts ? new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";

export const formatSessionDate = (ts) => {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  const isThisYear = d.getFullYear() === now.getFullYear();
  if (isThisYear) {
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: "2-digit" });
};

/* ── Progressive line-by-line streaming checkpoints ── */
export const computeLineCheckpoints = (text) => {
  if (!text || typeof text !== "string") return [];
  const normalized = text.replace(/\r\n/g, "\n");
  const rawLines = normalized.split("\n");
  const checkpoints = [];
  let currentAccum = "";
  let inTable = false;
  let tableBuffer = "";

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const isTableLine = line.trim().startsWith("|");

    if (isTableLine) {
      inTable = true;
      tableBuffer += (tableBuffer ? "\n" : "") + line;
      continue;
    } else if (inTable) {
      inTable = false;
      currentAccum += (currentAccum ? "\n" : "") + tableBuffer;
      tableBuffer = "";
      checkpoints.push(currentAccum);
    }

    const prefix = currentAccum.length > 0 ? "\n" : "";
    currentAccum += prefix + line;

    // Skip adding a separate checkpoint for blank lines between paragraphs
    if (!line.trim() && i < rawLines.length - 1) {
      continue;
    }

    // If line is very long (> 120 chars) and contains multiple sentences, break by sentence
    if (line.length > 120) {
      const sentenceParts = line.split(/(?<=[.!?])\s+/);
      if (sentenceParts.length > 1) {
        let sentenceAccum = currentAccum.slice(0, currentAccum.length - line.length);
        for (let s = 0; s < sentenceParts.length; s++) {
          sentenceAccum += (s > 0 ? " " : "") + sentenceParts[s];
          checkpoints.push(sentenceAccum);
        }
        continue;
      }
    }

    checkpoints.push(currentAccum);
  }

  if (inTable && tableBuffer) {
    currentAccum += (currentAccum ? "\n" : "") + tableBuffer;
    checkpoints.push(currentAccum);
  }

  if (!checkpoints.length || checkpoints[checkpoints.length - 1] !== normalized) {
    checkpoints.push(normalized);
  }

  return checkpoints;
};

/* ── Group chat sessions into temporal sections: Today, Yesterday, This Week, Older ── */
export const groupSessionsByDate = (sessions = []) => {
  const groups = {
    today: [],
    yesterday: [],
    thisWeek: [],
    older: [],
  };

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86400000;
  const startOfThisWeek = startOfToday - 6 * 86400000;

  for (const session of sessions) {
    const time = session.updatedAt || session.createdAt || Date.now();
    if (time >= startOfToday) {
      groups.today.push(session);
    } else if (time >= startOfYesterday) {
      groups.yesterday.push(session);
    } else if (time >= startOfThisWeek) {
      groups.thisWeek.push(session);
    } else {
      groups.older.push(session);
    }
  }

  return groups;
};
