import React, { useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  MessageSquare,
  Bot,
  PanelLeft,
  Sparkles,
  Send,
  Plus,
  Search,
  Trash2,
  Edit3,
  MoreVertical,
  Check,
  X,
  TrendingUp,
  ArrowDown,
  Loader2,
  Square
} from "lucide-react";
import { ProfileContext } from "../../../helper/usecontext/useContext";
import { CustomModal } from "../../../helper/modal/CustomModal";
import {
  ApiCustomChatBotStream,
  ApiGetChatSessions,
  ApiSaveChatSession,
  ApiDeleteChatSession,
  ApiRenameChatSession,
  ApiMigrateChatSessions
} from "../../../api-wrapper/customer/ApiCustomer";
import AssistantMessage from "./AssistantMessage";
import Toast from "../../../common/helper/toast/Toast";
import { PAGE_ACTIONS } from "../../../common/constants/permissions";
import { ROLES } from "../../../common/constants/roles";
import { createReportContext, profileNameMap } from "../../../helper/chatbot/reporting/reportDisplay";
import {
  computeLineCheckpoints,
  fmtTime,
  formatSessionDate,
  groupSessionsByDate
} from "../../../helper/chatbot/chatbotStreamHelper";
import useConversationHistory from "./useConversationHistory";
import { createChatSessionId, mergeChatSessions } from "./chatSessionHistory";

const PROMPT_SUGGESTIONS = [
  { label: "Give me yesterday's ACOS", desc: "Single KPI card & yesterday totals" },
  { label: "How did yesterday go?", desc: "Full performance summary across all KPIs" },
  { label: "Why did ACOS increase yesterday?", desc: "Root-cause mover analysis by campaign" },
  { label: "When do my ads work best in the last 7 days?", desc: "24x7 dayparting heatmap · last 7 days" },
  { label: "Where am I wasting ad spend in the last 14 days?", desc: "Non-converting search terms & keywords · last 14 days" },
  { label: "Find growth search terms from the last 30 days", desc: "Converting customer search queries · last 30 days" }
];

export default function AiAssistantPage() {
  const { t } = useTranslation();
  const { loginUser, profileId, profileSendID, profileValue, selectedAdType, profileList, pagePermission } = useContext(ProfileContext);
  const profileNames = profileNameMap(profileList);

  const getActionPermission = (actionType) => {
    let pageActions = null;

    if (Array.isArray(pagePermission)) {
      const p = pagePermission.find(
        (x) => x.pageName === "AI Assistant" || x.pageSlug === "ai-assistant"
      );
      if (p) {
        pageActions = p.allocatedActions || [];
      }
    }

    if (!pageActions) {
      try {
        const cached = localStorage.getItem("permission");
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed)) {
            const p = parsed.find(
              (x) => x.pageName === "AI Assistant" || x.pageSlug === "ai-assistant"
            );
            if (p) {
              pageActions = p.allocatedActions || [];
            }
          }
        }
      } catch (_) {}
    }

    if (pageActions !== null) {
      const match = pageActions.find((a) => a.actionType === actionType);
      return Boolean(match?.status);
    }

    const role = localStorage.getItem("role");
    if (role === ROLES.SUPER_ADMIN) return true;

    return true;
  };

  const canCreate = getActionPermission(PAGE_ACTIONS.CREATE);
  const canUpdate = getActionPermission(PAGE_ACTIONS.UPDATE);
  const canRemove = getActionPermission(PAGE_ACTIONS.REMOVE);

  const resolveActiveProfileIds = () => {
    const raw = profileId || profileSendID || profileValue;
    const list = Array.isArray(raw) ? raw : (raw ? [raw] : []);
    const extracted = list
      .map(item => {
        if (!item) return null;
        if (typeof item === 'string' || typeof item === 'number') return String(item);
        if (typeof item === 'object') {
          const id = item.value || item.profileId || item.id || item._id;
          return id ? String(id) : null;
        }
        return null;
      })
      .filter(Boolean);

    if (extracted.length > 0) {
      return Array.from(new Set(extracted));
    }

    if (Array.isArray(profileList) && profileList.length > 0) {
      const first = profileList[0]?.profileId || profileList[0]?._id || profileList[0]?.id;
      return first ? [String(first)] : [];
    }

    try {
      const stored = JSON.parse(localStorage.getItem('profile') || '{}');
      const storedId = stored?.profile?.profileId || stored?.profile?._id;
      if (storedId) return [String(storedId)];
    } catch (_) {}

    return [];
  };

  const activeProfileIds = resolveActiveProfileIds();
  const primaryProfileId = activeProfileIds[0];
  const activeProfile = profileList?.find(p => String(p.profileId || p._id || p.id) === String(primaryProfileId)) || profileList?.[0];
  const currencyCode = activeProfile?.currencyCode || "INR";
  const profileName = activeProfile?.name || "Tagdo";

  const storageKey = `advertiseiq_ai_assistant_sessions_${primaryProfileId || "default"}`;

  // ── Chat sessions state ──
  const [sessions, setSessions] = useState(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return mergeChatSessions(parsed);
      }
    } catch (_) {}
    return [{
      id: createChatSessionId(),
      title: "New Chat",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      reportContext: null
    }];
  });

  const [activeSessionId, setActiveSessionId] = useState(() => {
    return sessions[0]?.id || createChatSessionId();
  });

  const activeSession = sessions.find(s => s.id === activeSessionId) || sessions[0];
  const messages = activeSession?.messages || [];
  const isFirstMessage = !activeSession || !activeSession.messages || activeSession.messages.length === 0;
  const canSendInCurrentState = isFirstMessage ? canCreate : canUpdate;

  // Search filter
  const [searchQuery, setSearchQuery] = useState("");

  // Theme tracking for charts & renderer
  const [isDark, setIsDark] = useState(() => document.documentElement.getAttribute("data-theme") === "dark");

  useEffect(() => {
    const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    const observer = new MutationObserver(handle);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    window.addEventListener("themeChanged", handle);
    return () => {
      observer.disconnect();
      window.removeEventListener("themeChanged", handle);
    };
  }, []);

  // Input & typing state
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [userScrolledUp, setUserScrolledUp] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [compactLayout, setCompactLayout] = useState(() => window.matchMedia?.("(max-width: 767px)").matches || false);
  const historyToggleRef = useRef(null);
  const historyCloseRef = useRef(null);
  const historyDrawerRef = useRef(null);
  const mobileHistoryOpen = compactLayout && historyOpen;

  const closeHistory = () => {
    setHistoryOpen(false);
    if (compactLayout) historyToggleRef.current?.focus();
  };

  useEffect(() => {
    const media = window.matchMedia?.("(max-width: 767px)");
    if (!media) return undefined;
    const updateLayout = event => {
      setCompactLayout(event.matches);
      setHistoryOpen(false);
    };
    media.addEventListener?.("change", updateLayout);
    return () => media.removeEventListener?.("change", updateLayout);
  }, []);

  useEffect(() => {
    if (!mobileHistoryOpen) return undefined;
    historyCloseRef.current?.focus();
    const handleDrawerKeys = event => {
      if (event.key === "Escape") {
        setHistoryOpen(false);
        historyToggleRef.current?.focus();
      }
      if (event.key === "Tab") {
        const controls = Array.from(historyDrawerRef.current?.querySelectorAll('button:not(:disabled), input:not(:disabled), [tabindex="0"]') || []);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", handleDrawerKeys);
    return () => document.removeEventListener("keydown", handleDrawerKeys);
  }, [mobileHistoryOpen]);

  // Rename session inline state
  const [editingSessionId, setEditingSessionId] = useState(null);
  const [editTitleText, setEditTitleText] = useState("");

  // Context menu state for sessions
  const [openMenuSessionId, setOpenMenuSessionId] = useState(null);

  // Themed delete confirmation modal state
  const [sessionToDelete, setSessionToDelete] = useState(null);

  // Backend pagination and search state
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");

  // Streaming refs
  const chatScrollRef = useRef(null);
  const chatInputRef = useRef(null);
  const userScrolledUpRef = useRef(false);
  const streamTimerRef = useRef(null);
  const streamCheckpointsRef = useRef([]);
  const streamCheckIndexRef = useRef(0);
  const streamTargetTextRef = useRef("");
  const streamPendingReportRef = useRef(null);
  const streamDonePayloadRef = useRef(null);
  const activeBotMsgIdRef = useRef(null);
  const abortControllerRef = useRef(null);

  const { visibleMessages, firstMessageIndex, hasOlderMessages, loadOlderMessages } = useConversationHistory({
    messages,
    scopeKey: `${primaryProfileId || "default"}:${activeSessionId}:${selectedAdType || "all"}`,
    scrollRef: chatScrollRef,
    userScrolledUpRef
  });

  useEffect(() => {
    setUserScrolledUp(false);
  }, [primaryProfileId, activeSessionId, selectedAdType]);

  // Latest state refs to prevent stale closures in async handlers
  const primaryProfileIdRef = useRef(primaryProfileId);
  primaryProfileIdRef.current = primaryProfileId;

  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;

  const activeSessionIdRef = useRef(activeSessionId);
  activeSessionIdRef.current = activeSessionId;

  // Persist session to Backend MongoDB
  const saveSessionToBackend = (targetSession) => {
    if (!targetSession || !primaryProfileIdRef.current) return;
    ApiSaveChatSession({
      sessionId: String(targetSession.id || targetSession.sessionId),
      profileId: String(primaryProfileIdRef.current),
      title: targetSession.title || "New Chat",
      messages: targetSession.messages || [],
      reportContext: targetSession.reportContext || null
    }).catch(() => {});
  };

  // Sync sessions to localStorage cache
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(sessions));
    } catch (_) {}
  }, [sessions, storageKey]);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load sessions from Backend MongoDB (initial load or when search query changes)
  useEffect(() => {
    let isCancelled = false;
    const loadFromBackend = async () => {
      if (!primaryProfileId) return;
      setIsSearching(Boolean(debouncedSearchQuery.trim()));
      try {
        const res = await ApiGetChatSessions({
          profileId: String(primaryProfileId),
          page: 1,
          limit: 20,
          search: debouncedSearchQuery.trim() || undefined
        });
        if (isCancelled) return;

        if (res?.isSuccess && Array.isArray(res.data)) {
          if (res.data.length > 0) {
            const loadedSessions = mergeChatSessions(res.data);
            setSessions(loadedSessions);
            setPage(1);
            setHasMore(Boolean(res.pagination?.hasMore));
            if (!activeSessionIdRef.current || !loadedSessions.some(s => s.id === activeSessionIdRef.current)) {
              if (!debouncedSearchQuery.trim()) {
                setActiveSessionId(loadedSessions[0]?.id);
              }
            }
            if (!debouncedSearchQuery.trim()) {
              try {
                localStorage.setItem(storageKey, JSON.stringify(loadedSessions));
              } catch (_) {}
            }
          } else if (!debouncedSearchQuery.trim()) {
            // Backend is empty and not searching: check if there are local sessions to migrate
            let localSessions = [];
            try {
              const raw = localStorage.getItem(storageKey);
              if (raw) localSessions = JSON.parse(raw);
            } catch (_) {}

            if (Array.isArray(localSessions) && localSessions.length > 0) {
              localSessions = mergeChatSessions(localSessions);
              setSessions(localSessions);
              setActiveSessionId(localSessions[0]?.id);
              ApiMigrateChatSessions({
                profileId: String(primaryProfileId),
                sessions: localSessions
              }).catch(() => {});
            } else {
              const fresh = [{
                id: createChatSessionId(),
                title: "New Chat",
                createdAt: Date.now(),
                updatedAt: Date.now(),
                messages: [],
                reportContext: null
              }];
              setSessions(fresh);
              setActiveSessionId(fresh[0].id);
              saveSessionToBackend(fresh[0]);
            }
          } else {
            // Search returned 0 matching sessions
            setSessions([]);
            setHasMore(false);
          }
        }
      } catch (err) {
        console.error("Failed to load chat sessions from backend", err);
      } finally {
        if (!isCancelled) setIsSearching(false);
      }
    };

    loadFromBackend();

    return () => {
      isCancelled = true;
    };
  }, [primaryProfileId, storageKey, debouncedSearchQuery]);

  // On-scroll infinite pagination for chat history sidebar
  const handleSidebarScroll = async (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 60) {
      if (hasMore && !isLoadingMore && !isSearching && primaryProfileId) {
        const nextPage = page + 1;
        setIsLoadingMore(true);
        try {
          const res = await ApiGetChatSessions({
            profileId: String(primaryProfileId),
            page: nextPage,
            limit: 20,
            search: debouncedSearchQuery.trim() || undefined
          });
          if (res?.isSuccess && Array.isArray(res.data) && res.data.length > 0) {
            setSessions(prev => mergeChatSessions(prev, res.data));
            setPage(nextPage);
            setHasMore(Boolean(res.pagination?.hasMore));
          } else {
            setHasMore(false);
          }
        } catch (err) {
          console.error("Failed to load more chat sessions from backend", err);
        } finally {
          setIsLoadingMore(false);
        }
      }
    }
  };

  // Close session options popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest(".session-menu-trigger") && !e.target.closest(".session-menu-dropdown")) {
        setOpenMenuSessionId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Scroll detection to respect manual scroll up
  const handleScroll = () => {
    if (!chatScrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatScrollRef.current;
    const distanceToBottom = scrollHeight - (scrollTop + clientHeight);
    const isUp = distanceToBottom > 80;
    userScrolledUpRef.current = isUp;
    setUserScrolledUp(isUp);
    if (scrollTop < 60 && hasOlderMessages) loadOlderMessages();
  };

  const scrollToBottom = (behavior = "smooth") => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTo({
        top: chatScrollRef.current.scrollHeight,
        behavior
      });
      userScrolledUpRef.current = false;
      setUserScrolledUp(false);
    }
  };

  // ── Session Management actions ──
  const handleCreateNewChat = () => {
    if (!canCreate) {
      Toast.error(t("You do not have permission to create a new chat."));
      return;
    }
    closeHistory();
    if (searchQuery) setSearchQuery("");
    const newSession = {
      id: createChatSessionId(),
      title: "New Chat",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      reportContext: null
    };
    setSessions(prev => mergeChatSessions([newSession], prev));
    setActiveSessionId(newSession.id);
    setInputText("");
    userScrolledUpRef.current = false;
    setUserScrolledUp(false);
    saveSessionToBackend(newSession);
  };

  const handleSelectSession = (id) => {
    closeHistory();
    setActiveSessionId(id);
    userScrolledUpRef.current = false;
    setUserScrolledUp(false);
    setTimeout(() => scrollToBottom("instant"), 50);
  };

  const handleDeleteSession = (idToDelete) => {
    if (!canRemove) {
      Toast.error(t("You do not have permission to delete chats."));
      return;
    }
    ApiDeleteChatSession({
      sessionId: String(idToDelete),
      profileId: String(primaryProfileIdRef.current || "")
    }).catch(() => {});

    setSessions(prev => {
      const filtered = prev.filter(s => s.id !== idToDelete);
      if (filtered.length === 0) {
        const fresh = {
          id: createChatSessionId(),
          title: "New Chat",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messages: [],
          reportContext: null
        };
        setActiveSessionId(fresh.id);
        saveSessionToBackend(fresh);
        return [fresh];
      }
      if (activeSessionId === idToDelete) {
        setActiveSessionId(filtered[0].id);
      }
      return filtered;
    });
    setOpenMenuSessionId(null);
  };

  const handleStartRename = (session) => {
    if (!canUpdate) {
      Toast.error(t("You do not have permission to rename this chat."));
      return;
    }
    setEditingSessionId(session.id);
    setEditTitleText(session.title);
    setOpenMenuSessionId(null);
  };

  const handleSaveRename = () => {
    if (!canUpdate) {
      Toast.error(t("You do not have permission to rename this chat."));
      setEditingSessionId(null);
      return;
    }
    if (!editingSessionId) return;
    const trimmed = editTitleText.trim();
    if (trimmed) {
      ApiRenameChatSession({
        sessionId: String(editingSessionId),
        title: trimmed
      }).catch(() => {});

      setSessions(prev => prev.map(s => s.id === editingSessionId ? { ...s, title: trimmed, updatedAt: Date.now() } : s));
    }
    setEditingSessionId(null);
  };

  // Helper to update active session messages
  const updateActiveMessages = (updater) => {
    setSessions(prev => prev.map(s => {
      if (s.id === activeSessionId) {
        const newMsgs = typeof updater === "function" ? updater(s.messages) : updater;
        return {
          ...s,
          messages: newMsgs,
          updatedAt: Date.now()
        };
      }
      return s;
    }));
  };

  const setSessionReportContext = (context) => {
    setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, reportContext: context } : s));
  };

  // ── Streaming pacing ──
  const stopStreamTimer = () => {
    if (streamTimerRef.current) {
      clearInterval(streamTimerRef.current);
      streamTimerRef.current = null;
    }
  };

  const startStreamPacing = (botMsgId) => {
    stopStreamTimer();
    streamCheckpointsRef.current = [];
    streamCheckIndexRef.current = 0;
    streamTargetTextRef.current = "";
    streamPendingReportRef.current = null;
    streamDonePayloadRef.current = null;
    activeBotMsgIdRef.current = botMsgId;

    streamTimerRef.current = setInterval(() => {
      const checkpoints = streamCheckpointsRef.current;
      const index = streamCheckIndexRef.current;
      const isDoneReceived = Boolean(streamDonePayloadRef.current);

      if (index < checkpoints.length) {
        const nextText = checkpoints[index];
        streamCheckIndexRef.current += 1;

        updateActiveMessages(prev => prev.map(m => m.id === botMsgId ? {
          ...m,
          text: nextText,
          status: null
        } : m));

        if (!userScrolledUpRef.current && chatScrollRef.current) {
          chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
        }
      } else if (isDoneReceived) {
        stopStreamTimer();
        setIsTyping(false);

        const donePayload = streamDonePayloadRef.current;
        const pendingReport = streamPendingReportRef.current;
        const finalText = streamTargetTextRef.current || donePayload?.replyMessage || "";
        const reportContextToSet = pendingReport
          ? createReportContext(pendingReport)
          : (donePayload?.report ? createReportContext(donePayload.report) : null);

        setSessions(prev => prev.map(s => {
          if (s.id === activeSessionIdRef.current || s.id === botMsgId) {
            const updatedMsgs = s.messages.map(m => m.id === botMsgId ? {
              ...m,
              text: finalText,
              report: pendingReport || donePayload?.report || m.report,
              isReport: Boolean(pendingReport || donePayload?.isReport || m.isReport),
              isStreaming: false,
              status: null
            } : m);
            const updated = {
              ...s,
              messages: updatedMsgs,
              reportContext: reportContextToSet || s.reportContext,
              updatedAt: Date.now()
            };
            saveSessionToBackend(updated);
            return updated;
          }
          return s;
        }));

        if (!userScrolledUpRef.current && chatScrollRef.current) {
          chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
        }
      }
    }, 90);
  };

  // ── Send user message ──
  const handleSendMessage = async (textToSend) => {
    const raw = typeof textToSend === "string" ? textToSend : inputText;
    const trimmed = raw.trim();
    if (!trimmed || isTyping) return;

    const currentSession = sessions.find(s => s.id === activeSessionId);
    const isFirst = !currentSession || !currentSession.messages || currentSession.messages.length === 0;

    if (isFirst && !canCreate) {
      Toast.error(t("You do not have permission to create a new chat."));
      return;
    }
    if (!isFirst && !canUpdate) {
      Toast.error(t("You do not have permission to continue this chat."));
      return;
    }

    setInputText("");
    setIsTyping(true);
    userScrolledUpRef.current = false;
    setUserScrolledUp(false);

    const userMsg = {
      id: "user_" + Date.now(),
      from: "user",
      text: trimmed,
      time: Date.now()
    };

    const botMsgId = "bot_" + Date.now();
    const botPlaceholder = {
      id: botMsgId,
      from: "bot",
      text: "",
      status: "Analyzing your question…",
      report: null,
      isReport: false,
      isStreaming: true,
      time: Date.now()
    };

    // Auto-update session title if it's the first message
    setSessions(prev => prev.map(s => {
      if (s.id === activeSessionId) {
        const isFirst = s.messages.length === 0 || s.title === "New Chat";
        const newTitle = isFirst ? (trimmed.length > 36 ? trimmed.slice(0, 36) + "…" : trimmed) : s.title;
        const updated = {
          ...s,
          title: newTitle,
          messages: [...s.messages, userMsg, botPlaceholder],
          updatedAt: Date.now()
        };
        saveSessionToBackend({
          ...s,
          title: newTitle,
          messages: [...s.messages, userMsg],
          updatedAt: Date.now()
        });
        return updated;
      }
      return s;
    }));

    startStreamPacing(botMsgId);

    const boundedHistory = [...messages, userMsg].slice(-6).map(m => ({
      role: m.from === "bot" ? "assistant" : "user",
      content: m.text ? m.text.replace(/<[^>]*>/g, "").trim() : ""
    }));

    const activeProfileIds = resolveActiveProfileIds();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      await ApiCustomChatBotStream({
        signal: controller.signal,
        data: {
          message: trimmed,
          profileIds: activeProfileIds.length ? activeProfileIds : undefined,
          reportContext: activeSession?.reportContext || undefined,
          history: boundedHistory
        },
        onStatus: (statusText) => {
          updateActiveMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, status: statusText } : m));
          if (!userScrolledUpRef.current && chatScrollRef.current) {
            chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
          }
        },
        onReport: (report) => {
          streamPendingReportRef.current = report;
          if (report) {
            setSessionReportContext(createReportContext(report));
          }
          updateActiveMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, hasReport: true, isReport: true } : m));
        },
        onToken: (token) => {
          streamTargetTextRef.current += token;
          streamCheckpointsRef.current = computeLineCheckpoints(streamTargetTextRef.current);
        },
        onDone: (res) => {
          const fullReply = res?.replyMessage || "";
          if (fullReply && fullReply.length > streamTargetTextRef.current.length) {
            streamTargetTextRef.current = fullReply;
          }
          streamCheckpointsRef.current = computeLineCheckpoints(streamTargetTextRef.current);
          streamDonePayloadRef.current = res;
          if (res?.report) {
            streamPendingReportRef.current = res.report;
            setSessionReportContext(createReportContext(res.report));
          }
        },
        onError: (err) => {
          stopStreamTimer();
          setIsTyping(false);
          const errorText = err?.replyMessage || "<b>Error:</b> Something went wrong while loading the report.";
          setSessions(prev => prev.map(s => {
            if (s.id === activeSessionIdRef.current) {
              const updatedMsgs = s.messages.map(m => m.id === botMsgId ? {
                ...m,
                text: errorText,
                isStreaming: false,
                status: null,
                report: null
              } : m);
              const updated = { ...s, messages: updatedMsgs, updatedAt: Date.now() };
              saveSessionToBackend(updated);
              return updated;
            }
            return s;
          }));
        }
      });
    } catch (err) {
      if (err?.name === "AbortError" || !abortControllerRef.current) {
        return;
      }
      stopStreamTimer();
      setIsTyping(false);
      setSessions(prev => prev.map(s => {
        if (s.id === activeSessionIdRef.current) {
          const updatedMsgs = s.messages.map(m => m.id === botMsgId ? {
            ...m,
            text: "<b>Error:</b> Something went wrong while connecting to the assistant.",
            isStreaming: false,
            status: null,
            report: null
          } : m);
          const updated = { ...s, messages: updatedMsgs, updatedAt: Date.now() };
          saveSessionToBackend(updated);
          return updated;
        }
        return s;
      }));
    } finally {
      abortControllerRef.current = null;
    }
  };

  // ── Stop current generation ──
  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    stopStreamTimer();
    setIsTyping(false);

    const currentBotId = activeBotMsgIdRef.current;
    if (currentBotId) {
      setSessions(prev => prev.map(s => {
        if (s.id === activeSessionIdRef.current) {
          const updatedMsgs = s.messages.map(m => {
            if (m.id === currentBotId) {
              const currentText = m.text || streamTargetTextRef.current || "";
              return {
                ...m,
                text: currentText,
                isStreaming: false,
                status: null,
                report: streamPendingReportRef.current || m.report || null,
              };
            }
            return m;
          });
          const updated = { ...s, messages: updatedMsgs, updatedAt: Date.now() };
          saveSessionToBackend(updated);
          return updated;
        }
        return s;
      }));
    }
  };

  // Follow-up chip click
  const handleFollowUp = (item) => {
    const currentSession = sessions.find(s => s.id === activeSessionId);
    const isFirst = !currentSession || !currentSession.messages || currentSession.messages.length === 0;
    if (isFirst && !canCreate) {
      Toast.error(t("You do not have permission to create a new chat."));
      return;
    }
    if (!isFirst && !canUpdate) {
      Toast.error(t("You do not have permission to continue this chat."));
      return;
    }
    if (isTyping || !item) return;
    const label = typeof item === "string" ? item : (item.label || "Drill down");
    handleSendMessage(label);
  };

  const sessionGroups = groupSessionsByDate(sessions);

  return (
    <div className="ai-assistant-page relative flex w-full h-full bg-[#f8fafc] dark:bg-[#0a0f1d] text-slate-900 dark:text-slate-100 overflow-hidden font-sans transition-colors">
      {mobileHistoryOpen && <button type="button" className="assistant-history-backdrop" aria-label="Close chat history" tabIndex={-1} onClick={closeHistory} />}
      {/* ── 1. Left Sidebar: Chat Sessions Manager ── */}
      <aside ref={historyDrawerRef} id="assistant-chat-history" aria-label="Chat history" role={mobileHistoryOpen ? "dialog" : undefined} aria-modal={mobileHistoryOpen || undefined} className={`ai-assistant-sidebar ${mobileHistoryOpen ? "is-open" : ""} w-64 flex-shrink-0 flex flex-col border-r select-none transition-colors ${
        isDark ? "bg-[#070b16] border-slate-800/80 text-slate-100" : "bg-white border-slate-200 text-slate-900"
      }`}>
        {/* Top Header */}
        <div className={`ai-sidebar-header p-3.5 pb-2 border-b transition-colors ${
          isDark ? "bg-[#070b16] border-slate-800/60" : "bg-white border-slate-200"
        }`}>
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center">
                <Bot size={17} />
              </div>
              <h2 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">AI Assistant</h2>
            </div>

            {canCreate && (
              <button
                type="button"
                onClick={handleCreateNewChat}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-blue-600 hover:bg-blue-500 active:scale-95 text-white shadow-xs transition-all"
              >
                <Plus size={14} strokeWidth={2.5} />
                <span>New Chat</span>
              </button>
            )}
            <button ref={historyCloseRef} type="button" onClick={closeHistory} aria-label="Close history panel" className="assistant-history-toggle rounded-lg p-2 text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">
              <X size={18} />
            </button>
          </div>

          {/* Search bar */}
          <div className="relative w-full">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search chats..."
              className={`w-full pl-8 pr-7 py-1.5 text-xs rounded-xl border text-slate-900 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-blue-500 transition-colors ${
                isDark ? "bg-[#0d1424] border-slate-700/60" : "bg-slate-100 border-slate-200"
              }`}
            />
            {isSearching ? (
              <Loader2 size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-blue-500 animate-spin" />
            ) : searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X size={13} />
              </button>
            ) : null}
          </div>
        </div>

        {/* Sessions list with on-scroll pagination */}
        <div
          onScroll={handleSidebarScroll}
          className="flex-1 overflow-y-auto px-2 py-2 space-y-3 custom-scrollbar"
        >
          {sessions.length === 0 && searchQuery && (
            <div className="text-center py-8 px-4 text-xs text-slate-400">
              No chats found matching "{searchQuery}"
            </div>
          )}
          {[
            { label: "Today", items: sessionGroups.today },
            { label: "Yesterday", items: sessionGroups.yesterday },
            { label: "This Week", items: sessionGroups.thisWeek },
            { label: "Older", items: sessionGroups.older }
          ].map(group => {
            if (group.items.length === 0) return null;
            return (
              <div key={group.label} className="space-y-1">
                <div className="px-2 pt-1 pb-0.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {group.label}
                </div>
                {group.items.map(session => {
                  const isActive = session.id === activeSessionId;
                  const isEditing = editingSessionId === session.id;

                  return (
                    <div
                      key={session.id}
                      onClick={() => !isEditing && handleSelectSession(session.id)}
                      className={`group relative flex items-center justify-between gap-1.5 px-2.5 py-2 rounded-xl text-xs cursor-pointer transition-all ${
                        isActive
                          ? "bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-600/20 dark:text-blue-300 dark:border-blue-500/40 shadow-xs font-semibold"
                          : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white border border-transparent"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <MessageSquare size={14} className={isActive ? "text-blue-400" : "text-slate-400 group-hover:text-slate-200"} />
                        {isEditing ? (
                          <div className="flex items-center gap-1 flex-1 min-w-0" onClick={e => e.stopPropagation()}>
                            <input
                              type="text"
                              value={editTitleText}
                              onChange={e => setEditTitleText(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === "Enter") handleSaveRename();
                                if (e.key === "Escape") setEditingSessionId(null);
                              }}
                              autoFocus
                              className="w-full text-xs bg-slate-900 border border-blue-500 rounded px-1.5 py-0.5 text-white focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={handleSaveRename}
                              className="text-emerald-400 hover:text-emerald-300 p-0.5"
                            >
                              <Check size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingSessionId(null)}
                              className="text-slate-400 hover:text-slate-300 p-0.5"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        ) : (
                          <span className="truncate flex-1 font-medium" title={session.title}>
                            {session.title}
                          </span>
                        )}
                      </div>

                      {!isEditing && (
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-[10px] text-slate-500 dark:text-slate-400">
                            {formatSessionDate(session.updatedAt || session.createdAt)}
                          </span>

                          {(canUpdate || canRemove) && (
                            <div className="relative">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenMenuSessionId(openMenuSessionId === session.id ? null : session.id);
                                }}
                                className="session-menu-trigger opacity-0 group-hover:opacity-100 p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-700/60 transition-opacity"
                              >
                                <MoreVertical size={13} />
                              </button>

                              {/* Dropdown menu */}
                              {openMenuSessionId === session.id && (
                                <div
                                  onClick={e => e.stopPropagation()}
                                  className={`session-menu-dropdown absolute right-0 top-full mt-1 w-28 border rounded-xl shadow-xl py-1 z-50 text-xs ${
                                    isDark ? "bg-[#0d1424] border-slate-700 text-slate-200" : "bg-white border-slate-200 text-slate-800"
                                  }`}
                                >
                                  {canUpdate && (
                                    <button
                                      type="button"
                                      onClick={() => handleStartRename(session)}
                                      className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-left"
                                    >
                                      <Edit3 size={12} className="text-slate-400" />
                                      <span>Rename</span>
                                    </button>
                                  )}
                                  {canRemove && (sessions.length > 1 || (session.messages && session.messages.length > 0)) && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSessionToDelete(session.id);
                                        setOpenMenuSessionId(null);
                                      }}
                                      className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-rose-950/60 text-rose-400 text-left"
                                    >
                                      <Trash2 size={12} />
                                      <span>Delete</span>
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
          {isLoadingMore && (
            <div className="flex items-center justify-center py-2.5 text-xs text-slate-400 gap-1.5">
              <Loader2 size={13} className="animate-spin text-blue-500" />
              <span>Loading more chats...</span>
            </div>
          )}
        </div>

        
      </aside>

      {/* ── 2. Right Main Chat Area ── */}
      <main inert={mobileHistoryOpen ? "" : undefined} className="ai-chat-canvas flex-1 flex flex-col min-w-0 h-full relative bg-[#f8fafc] dark:bg-[#0a0f1d] transition-colors">
        {/* Top Header */}
        <header className={`ai-chat-header h-14 px-5 border-b flex items-center justify-between gap-3 backdrop-blur-md shrink-0 z-20 shadow-2xs transition-colors ${
          isDark ? "bg-[#070b16]/90 border-slate-800/80 text-slate-100" : "bg-white/95 border-slate-200 text-slate-900"
        }`}>
          <div className="flex items-center gap-2.5 min-w-0">
            <button ref={historyToggleRef} type="button" onClick={() => setHistoryOpen(true)} aria-label="Open chat history" aria-expanded={mobileHistoryOpen} aria-controls="assistant-chat-history" className="assistant-history-toggle rounded-lg p-2 text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500">
              <PanelLeft size={18} />
            </button>
            <div className="w-8 h-8 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center shrink-0">
              <MessageSquare size={16} />
            </div>

            {editingSessionId === activeSession?.id ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={editTitleText}
                  onChange={e => setEditTitleText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") handleSaveRename();
                    if (e.key === "Escape") setEditingSessionId(null);
                  }}
                  autoFocus
                  className="text-sm font-semibold bg-slate-900 border border-blue-500 rounded px-2 py-0.5 text-white focus:outline-none"
                />
                <button type="button" onClick={handleSaveRename} className="text-emerald-400 hover:text-emerald-300">
                  <Check size={14} />
                </button>
                <button type="button" onClick={() => setEditingSessionId(null)} className="text-slate-400 hover:text-slate-300">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 min-w-0">
                <h1 className="text-sm font-bold text-slate-900 dark:text-white truncate max-w-md" title={activeSession?.title}>
                  {activeSession?.title || "New Chat"}
                </h1>
                {canUpdate && (
                  <button
                    type="button"
                    onClick={() => handleStartRename(activeSession)}
                    title="Rename chat"
                    className="text-slate-400 hover:text-blue-400 p-1 rounded transition-colors"
                  >
                    <Edit3 size={13} />
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!canCreate && !canUpdate && (
              <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                View Only
              </span>
            )}

            {canRemove && (sessions.length > 1 || (activeSession?.messages && activeSession.messages.length > 0)) && (
              <button
                type="button"
                onClick={() => setSessionToDelete(activeSession?.id)}
                title="Delete conversation"
                className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        </header>

        {/* Messages Stream */}
        <div
          ref={chatScrollRef}
          onScroll={handleScroll}
          className="ai-chat-scroll relative z-0 isolate flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 custom-scrollbar"
        >
          {messages.length === 0 ? (
            /* Empty State: Welcome Hero & Prompts */
            <div className="max-w-2xl mx-auto my-auto pt-8 pb-12 text-center flex flex-col items-center">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/20 mb-4 animate-in fade-in zoom-in duration-300">
                <Sparkles size={28} />
              </div>

              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mb-2 tracking-tight">
                How can I help with your ads today?
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto mb-8">
                Connected to <strong className="text-slate-900 dark:text-slate-200 font-semibold">{profileName}</strong>. Ask questions about yesterday’s ACOS, weekly performance, wasted spend, or dayparting efficiency.
              </p>

              {/* Prompt Suggestions Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full text-left">
                {PROMPT_SUGGESTIONS.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      if (!canCreate) {
                        Toast.error(t("You do not have permission to create a new chat."));
                        return;
                      }
                      handleSendMessage(item.label);
                    }}
                    disabled={!canCreate}
                    className={`p-3 rounded-xl border transition-all text-left group shadow-xs active:scale-[0.99] ${
                      !canCreate ? "opacity-50 cursor-not-allowed" : ""
                    } ${
                      isDark
                        ? "bg-[#0d1424] hover:bg-[#131d36] border-slate-800 hover:border-blue-500/50"
                        : "bg-white hover:bg-blue-50/60 border-slate-200/90 hover:border-blue-400"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-300 transition-colors">
                        {item.label}
                      </span>
                      <TrendingUp size={13} className="text-slate-400 group-hover:text-blue-400 transition-colors shrink-0" />
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">
                      {item.desc}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Rendered Messages */
            <div className="assistant-conversation">
              <div className="text-center">
                {hasOlderMessages ? (
                  <button
                    type="button"
                    onClick={loadOlderMessages}
                    className="rounded-full border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
                  >
                    Load earlier messages
                  </button>
                ) : (
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">Beginning of conversation</span>
                )}
              </div>
              {visibleMessages.map((m, index) => {
                if (m.from === "user") {
                  return (
                    <div key={m.id || firstMessageIndex + index} className="assistant-question">
                      <div className="assistant-question__content">
                        <div className="assistant-question__bubble">
                          {m.text}
                        </div>
                        <span className="assistant-question__time">
                          {fmtTime(m.time)}
                        </span>
                      </div>

                      <div className="w-7 h-7 rounded-full bg-blue-700 text-white font-bold text-xs flex items-center justify-center shrink-0 border border-blue-400/40">
                        {(loginUser?.fullName || loginUser?.name || "U").charAt(0).toUpperCase()}
                      </div>
                    </div>
                  );
                }

                return (
                  <AssistantMessage
                    key={m.id || firstMessageIndex + index}
                    message={m}
                    profileNames={profileNames}
                    currencyCode={currencyCode}
                    isDark={isDark}
                    onFollowUp={canUpdate ? handleFollowUp : undefined}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Bottom Input Area */}
        <div className={`ai-chat-bottom-bar relative z-40 p-3 sm:p-4 border-t backdrop-blur-md shrink-0 transition-colors ${
          isDark ? "bg-[#070b16]/95 border-slate-800/80" : "bg-white/95 border-slate-200"
        }`}>
          {/* Anchor above the composer, outside the report cards' stacking context. */}
          {userScrolledUp && (
            <button
              type="button"
              onClick={() => scrollToBottom("smooth")}
              className="ai-jump-to-latest absolute bottom-full mb-3 left-1/2 -translate-x-1/2 z-10 whitespace-nowrap px-3.5 py-1.5 rounded-full text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-xl flex items-center gap-1.5 transition-colors"
            >
              <ArrowDown size={13} />
              <span>Jump to latest</span>
            </button>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!canSendInCurrentState) {
                Toast.error(
                  isFirstMessage
                    ? t("You do not have permission to create a new chat.")
                    : t("You do not have permission to continue this chat.")
                );
                return;
              }
              handleSendMessage();
            }}
            onMouseDown={e => {
              // The whole bar should focus the input — not just the thin text
              // line. Clicking the padding (or the stretched input) focuses it;
              // clicks on the send/stop button keep their own behavior.
              if (e.target === chatInputRef.current || e.target.closest("button")) return;
              e.preventDefault();
              chatInputRef.current?.focus();
            }}
            className={`ai-input-form max-w-4xl mx-auto relative flex items-center gap-2 border rounded-2xl p-1.5 pl-3.5 shadow-md dark:shadow-xl transition-all ${
              !canSendInCurrentState ? "opacity-75" : ""
            } ${
              isDark
                ? "bg-[#0d1424] border-slate-700/70 focus-within:border-blue-500/80 focus-within:ring-2 focus-within:ring-blue-500/20"
                : "bg-slate-50 border-slate-300/80 focus-within:border-blue-500/80 focus-within:ring-2 focus-within:ring-blue-500/20"
            }`}
          >
            <input
              ref={chatInputRef}
              type="text"
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              placeholder={
                !canSendInCurrentState
                  ? (isFirstMessage
                      ? "You do not have permission to create a new chat (View Only mode)"
                      : "You do not have permission to continue this chat (View Only mode)")
                  : "Ask anything about your advertising performance..."
              }
              disabled={isTyping || !canSendInCurrentState}
              style={{
                border: "none",
                borderWidth: 0,
                outline: "none",
                outlineWidth: 0,
                boxShadow: "none",
                background: "transparent",
                backgroundColor: "transparent"
              }}
              className="flex-1 self-stretch min-w-0 px-1 bg-transparent border-none border-0 outline-none ring-0 shadow-none focus:outline-none focus:ring-0 focus:border-none text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 disabled:opacity-50 disabled:cursor-not-allowed"
            />

            {isTyping ? (
              <button
                type="button"
                onClick={handleStopGeneration}
                className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-rose-400 border border-slate-700/80 flex items-center justify-center transition-all shadow-md shrink-0"
                title="Stop generation"
              >
                <Square size={13} className="fill-current" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!inputText.trim() || !canSendInCurrentState}
                className="w-9 h-9 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center transition-all shadow-md shrink-0"
                title={!canSendInCurrentState ? "View Only mode" : "Send message"}
              >
                <Send size={15} />
              </button>
            )}
          </form>
          <div className="text-center mt-1.5 text-[10px] text-slate-500 dark:text-slate-400">
            AdvertiseIQ AI Assistant provides grounded analytics based on verified Amazon Ads reporting.
          </div>
        </div>
      </main>

      {/* Themed Confirmation Modal for Deleting Conversation */}
      <CustomModal
        show={Boolean(sessionToDelete)}
        onHide={() => setSessionToDelete(null)}
        title={t("Delete Conversation")}
        icon="delete"
        iconVariant="danger"
        message={t("Are you sure you want to delete this conversation?")}
        actions={[
          {
            label: t("Cancel"),
            cancel: true,
            onClick: () => setSessionToDelete(null)
          },
          {
            label: t("Delete"),
            variant: "danger",
            icon: "delete",
            onClick: () => {
              if (sessionToDelete) {
                handleDeleteSession(sessionToDelete);
                setSessionToDelete(null);
              }
            }
          }
        ]}
      />
    </div>
  );
}
