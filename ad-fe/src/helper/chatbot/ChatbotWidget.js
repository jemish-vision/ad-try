import { useContext, useEffect, useRef, useState, forwardRef } from "react";
import { useTranslation } from "react-i18next";
import { ChatCircleDots } from "@phosphor-icons/react";
import { Buffer } from "buffer";
import { X as CloseIcon, Send as SendIcon, Headphones as SupportAgentIcon, History as HistoryIcon, MessageSquare as ChatIcon, Ticket as ConfirmationNumberIcon, RefreshCw as RestartAltIcon, Sparkles as AutoAwesomeIcon, Maximize2, Minimize2, ArrowDown, ExternalLink } from "lucide-react";
import ChatReportRenderer from "./reporting/ChatReportRenderer";
import ChatMessageText from "./reporting/ChatMessageText";
import { createReportContext, profileNameMap } from "./reporting/reportDisplay";
import { useFormik } from "formik";
import * as Yup from "yup";
import { ProfileContext } from "../usecontext/useContext";
import { TypingDots } from "./TypingDots";
import { ApiCreateSupportTicket, ApiCustomChatBotStream, ApiGetUserTickets } from "../../api-wrapper/customer/ApiCustomer";
import { useNavigate, useLocation } from "react-router-dom";
import RaiseSupportTicket from "./RaiseSupportTicket";
import BotLogo from "../../common/logo/logo.png";
import { ROLES } from "../../common/constants";

// Native replacement components for MUI, using Tailwind CSS and standard React elements.
const parseSx = (sx) => {
    if (!sx) return {};
    const clean = {};
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const spacing = (val) => typeof val === "number" ? `${val * 8}px` : val;

    const processStyles = (styles) => {
        Object.keys(styles).forEach((key) => {
            let val = styles[key];
            if (key.startsWith("&") || key.startsWith("@")) {
                return;
            }
            if (key.startsWith("[data-theme=\"dark\"]")) {
                if (isDark && typeof val === "object" && val !== null) {
                    processStyles(val);
                }
                return;
            }
            switch (key) {
                case "p":
                    clean.padding = spacing(val);
                    break;
                case "px":
                    clean.paddingLeft = spacing(val);
                    clean.paddingRight = spacing(val);
                    break;
                case "py":
                    clean.paddingTop = spacing(val);
                    clean.paddingBottom = spacing(val);
                    break;
                case "pt":
                    clean.paddingTop = spacing(val);
                    break;
                case "pb":
                    clean.paddingBottom = spacing(val);
                    break;
                case "pl":
                    clean.paddingLeft = spacing(val);
                    break;
                case "pr":
                    clean.paddingRight = spacing(val);
                    break;
                case "m":
                    clean.margin = spacing(val);
                    break;
                case "mx":
                    clean.marginLeft = spacing(val);
                    clean.marginRight = spacing(val);
                    break;
                case "my":
                    clean.marginTop = spacing(val);
                    clean.marginBottom = spacing(val);
                    break;
                case "mt":
                    clean.marginTop = spacing(val);
                    break;
                case "mb":
                    clean.marginBottom = spacing(val);
                    break;
                case "ml":
                    clean.marginLeft = spacing(val);
                    break;
                case "mr":
                    clean.marginRight = spacing(val);
                    break;
                case "gap":
                    clean.gap = spacing(val);
                    break;
                case "borderRadius":
                    clean.borderRadius = typeof val === "number" ? `${val}px` : val;
                    break;
                default:
                    clean[key] = val;
            }
        });
    };

    processStyles(sx);
    return clean;
};

const Box = forwardRef(({ children, sx, className = "", ...props }, ref) => {
    const Component = props.component || "div";
    const parsed = parseSx(sx);
    const { flex, ...cleanSx } = parsed || {};
    const hasFlex = props.flex !== undefined ? props.flex : flex;
    const { flex: propFlex, ...cleanProps } = props;

    return (
        <Component
            ref={ref}
            className={`${className} ${hasFlex === 1 || hasFlex === "1" ? "flex-1" : ""}`}
            style={{ ...cleanSx }}
            {...cleanProps}
        >
            {children}
        </Component>
    );
});
Box.displayName = "Box";

const IconButton = ({ children, sx, className = "", ...props }) => {
    return (
        <button
            type="button"
            className={`flex items-center justify-center rounded-full transition-all focus:outline-none ${className}`}
            style={{ ...parseSx(sx) }}
            {...props}
        >
            {children}
        </button>
    );
};

const Typography = ({ children, sx, className = "", noWrap, color, fontSize, fontWeight, lineHeight, ...props }) => {
    const Component = props.component || "span";
    const styles = {
        color,
        fontSize: typeof fontSize === "number" ? `${fontSize}px` : fontSize,
        fontWeight,
        lineHeight,
        ...parseSx(sx)
    };
    return (
        <Component
            className={`${className} ${noWrap ? "truncate" : ""}`}
            style={styles}
            {...props}
        >
            {children}
        </Component>
    );
};

const TextField = ({ sx, className = "", error, helperText, fullWidth, InputProps, inputProps, multiline, rows, maxRows, ...props }) => {
    const InputComponent = multiline ? "textarea" : "input";
    return (
        <div className={`flex flex-col ${fullWidth ? "w-full" : ""} ${className}`}>
            <div className="relative flex items-center w-full">
                {InputProps?.startAdornment}
                <InputComponent
                    rows={rows || 1}
                    style={{
                        fontFamily: "var(--font-family, 'Inter', sans-serif)",
                        backgroundColor: "var(--input-bg, rgba(255,255,255,0.85))",
                        backgroundRepeat: "no-repeat",
                        backgroundPosition: "right 12px center",
                        color: "var(--text-primary, #0F172A)",
                        fontSize: "13.5px",
                        borderRadius: "14px",
                        border: "1px solid var(--glass-border-color, rgba(214,228,240,0.70))",
                        padding: multiline ? "10px 14px" : (props.type === "email" ? "9px 38px 9px 14px" : "9px 14px"),
                        width: "100%",
                        outline: "none",
                        resize: "none",
                        transition: "all 0.2s ease",
                    }}
                    className="focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-primary-bg)] focus:ring-opacity-20"
                    {...props}
                    {...inputProps}
                />
                {InputProps?.endAdornment}
            </div>
            {helperText && (
                <span className="text-red-500 text-xs mt-1">{helperText}</span>
            )}
        </div>
    );
};

const Paper = ({ children, sx, className = "", elevation, ...props }) => {
    return (
        <div
            className={`shadow-lg rounded-xl border border-slate-100 dark:border-slate-800 ${className}`}
            style={{ ...parseSx(sx) }}
            {...props}
        >
            {children}
        </div>
    );
};

const Avatar = ({ children, sx, className = "", src, alt, ...props }) => {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const parsed = parseSx(sx);

    // Determine image filter dynamically in dark theme
    let imgFilter = "none";
    if (isDark && src && src.includes("logo")) {
        const bg = parsed.background || "";
        const isWhiteBg = bg === "#ffffff" || bg === "white" || bg === "rgb(255, 255, 255)";
        imgFilter = isWhiteBg ? "none" : "brightness(0) invert(0.92)";
    }

    return (
        <div
            className={`rounded-full flex items-center justify-center overflow-hidden bg-slate-150 dark:bg-slate-800 border border-slate-200 dark:border-slate-750 shrink-0 ${className}`}
            style={{ ...parsed }}
            {...props}
        >
            {src ? (
                <img
                    src={src}
                    alt={alt || "Avatar"}
                    style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                        transform: "scale(0.83)",
                        filter: imgFilter,
                    }}
                />
            ) : (
                children
            )}
        </div>
    );
};

const Button = ({ children, sx, className = "", variant, color, ...props }) => {
    return (
        <button
            type="button"
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors focus:outline-none ${className}`}
            style={{ ...parseSx(sx) }}
            {...props}
        >
            {children}
        </button>
    );
};

const Chip = ({ label, sx, className = "", onClick, onDelete, deleteIcon, clickable, ...props }) => {
    return (
        <span
            onClick={onClick}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 select-none cursor-default transition-all ${onClick ? "cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700" : ""
                } ${className}`}
            style={{ ...sx }}
            {...props}
        >
            {label}
            {onDelete && (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete();
                    }}
                    className="hover:text-red-500 transition-colors"
                >
                    {deleteIcon || <CloseIcon className="h-3.5 w-3.5" />}
                </button>
            )}
        </span>
    );
};

const Skeleton = ({ sx, className = "", variant, width, height, ...props }) => {
    return (
        <div
            className={`animate-pulse bg-slate-200 dark:bg-slate-800 rounded-lg ${className}`}
            style={{ width, height, ...sx }}
            {...props}
        />
    );
};


/* ─── Design tokens ─────────────────────────────────────────── */
const ACCENT = "var(--accent-primary, #2374F2)";
const ACCENT_BG = "var(--accent-primary-bg, rgba(35,116,242,0.06))";
const ACCENT_BORDER = "var(--accent-primary-border, rgba(35,116,242,0.15))";
const GLASS_BG = "var(--glass-bg, rgba(255,255,255,0.97))";
const GLASS_BORDER = "var(--glass-border-color, rgba(214,228,240,0.70))";
const TEXT_PRIMARY = "var(--text-primary, #0F172A)";
const TEXT_SECONDARY = "var(--text-secondary, #475569)";
const INPUT_BG = "var(--input-bg, rgba(255,255,255,0.85))";
const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

/* ─── Ticket flow steps ──────────────────────────────────────── */
const TICKET_STEPS = {
    ASK_MESSAGE: "ASK_MESSAGE",
    MESSAGE_TEXT: "MESSAGE_TEXT",
    ASK_CC: "ASK_CC",
    CC_EMAIL: "CC_EMAIL",
    DONE: "DONE"
};

/* ─── Suggestion quick-replies ───────────────────────────────── */
const SUGGESTIONS = [
    "How did yesterday go?",
    "Why did my ACOS go up?",
    "Where am I wasting money?",
    "Where can I grow?",
    "When do my ads work best?",
    "How do campaigns work?",
];

/* ──────────────────────────────────────────────────────────────
   Soft gradient ambient background (minimal)
   ────────────────────────────────────────────────────────────── */
const ChatbotBg = () => {
    return (
        <>
            {/* top-left soft blue blob */}
            <Box aria-hidden="true" sx={{
                position: "absolute", width: 220, height: 220, borderRadius: "50%",
                background: "radial-gradient(circle, rgba(35,116,242,0.09) 0%, transparent 70%)",
                top: -60, left: -60, pointerEvents: "none", zIndex: 0,
            }} />
            {/* bottom-right soft cyan blob */}
            <Box aria-hidden="true" sx={{
                position: "absolute", width: 180, height: 180, borderRadius: "50%",
                background: "radial-gradient(circle, rgba(60,187,242,0.07) 0%, transparent 70%)",
                bottom: -50, right: -50, pointerEvents: "none", zIndex: 0,
            }} />
        </>
    );
};


/* ──────────────────────────────────────────────────────────────
   Ambient floating orbs — CSS-only blur blobs behind messages
   ────────────────────────────────────────────────────────────── */


/* ──────────────────────────────────────────────────────────────
   Minimal floating dot network — subtle background depth
   ────────────────────────────────────────────────────────────── */


/* ──────────────────────────────────────────────────────────────
   Reusable sx objects
   ────────────────────────────────────────────────────────────── */
const inputSx = {
    "& .MuiOutlinedInput-root": {
        fontFamily: FONT,
        background: INPUT_BG,
        color: TEXT_PRIMARY,
        fontSize: 13.5,
        borderRadius: "10px",
        "& fieldset": { borderColor: GLASS_BORDER },
        "&:hover fieldset": { borderColor: ACCENT_BORDER },
        "&.Mui-focused fieldset": { borderColor: ACCENT, borderWidth: "1.5px" },
    },
    "& .MuiInputLabel-root": { color: TEXT_SECONDARY, fontSize: 13.5, fontFamily: FONT },
    "& .MuiInputLabel-root.Mui-focused": { color: ACCENT },
    "& .MuiOutlinedInput-input": { color: TEXT_PRIMARY, fontFamily: FONT },
    "& .MuiFormHelperText-root": { fontFamily: FONT, fontSize: 11 },
};

/* Clean no-label input used in the Step-1 form */
const formInputSx = {
    "& .MuiOutlinedInput-root": {
        fontFamily: FONT,
        background: INPUT_BG,
        color: TEXT_PRIMARY,
        fontSize: 13.5,
        borderRadius: "10px",
        transition: "box-shadow 0.2s ease",
        "& fieldset": { borderColor: GLASS_BORDER },
        "&:hover fieldset": { borderColor: ACCENT_BORDER },
        "&.Mui-focused fieldset": { borderColor: ACCENT, borderWidth: "1.5px" },
        "&.Mui-focused": { boxShadow: "0 0 0 4px rgba(35,116,242,0.08)" },
    },
    "& .MuiOutlinedInput-input": {
        color: TEXT_PRIMARY, fontFamily: FONT,
        py: "9px",
        "&::placeholder": { color: TEXT_SECONDARY, opacity: 1 },
    },
    "& .MuiInputBase-inputMultiline": {
        padding: "10px 0",
        lineHeight: 1.65,
        "&::placeholder": { color: TEXT_SECONDARY, opacity: 1 },
    },
    "& .MuiFormHelperText-root": {
        fontFamily: FONT, fontSize: 11,
        color: "var(--accent-negative, #ef4444)",
        ml: 0,
    },
};

const primaryBtnSx = {
    background: `linear-gradient(135deg, ${ACCENT} 0%, #3CBBF2 100%)`,
    boxShadow: "0 4px 14px rgba(35,116,242,0.28)",
    borderRadius: "10px",
    fontWeight: 600,
    fontFamily: FONT,
    textTransform: "none",
    transition: "all 0.22s ease",
    "&:hover": {
        background: `linear-gradient(135deg, ${ACCENT} 0%, #3CBBF2 100%)`,
        boxShadow: "0 6px 22px rgba(35,116,242,0.38)",
        transform: "translateY(-1px)",
    },
    "&.Mui-disabled": {
        background: GLASS_BORDER,
        color: TEXT_SECONDARY,
        boxShadow: "none",
    },
};

/* ──────────────────────────────────────────────────────────────
   Timestamp helper
   ────────────────────────────────────────────────────────────── */
const fmtTime = (ts) =>
    ts ? new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";

/* ──────────────────────────────────────────────────────────────
   Line-by-line checkpoint generator
   ────────────────────────────────────────────────────────────── */
const computeLineCheckpoints = (text) => {
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

/* ──────────────────────────────────────────────────────────────
   Main widget
   ────────────────────────────────────────────────────────────── */
const ChatbotWidget = ({ isGlobal }) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    const { loginUser, profileId, profileSendID, profileValue, selectedAdType, profileList } = useContext(ProfileContext);
    const profileNames = profileNameMap(profileList);
    const [isReportExpanded, setIsReportExpanded] = useState(false);
    const [reportContext, setReportContext] = useState(null);

    useEffect(() => {
        // Reset active reporting session context when user switches active profile
        setReportContext(null);
    }, [profileId, selectedAdType]);

    const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");

    useEffect(() => {
        const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
        const observer = new MutationObserver(handle);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        return () => observer.disconnect();
    }, []);

    const [open, setOpen] = useState(false);
    const [step, setStep] = useState(1);
    const [user, setUser] = useState({ name: "", email: "" });
    const [message, setMessage] = useState("");
    const [messages, setMessages] = useState([]);
    const [typing, setTyping] = useState(false);
    const [stopConversation, setStopConversation] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(true);
    const [supportMessage, setSupportMessage] = useState("");
    const [ticketData, setTicketData] = useState({
        needCC: null, ccEmail: "", needAdditionalMessage: null, additionalMessage: ""
    });
    const [inlineInput, setInlineInput] = useState("");
    const [ticketStep, setTicketStep] = useState(null);
    const [tickets, setTickets] = useState([]);
    const [showTickets, setShowTickets] = useState(false);
    const [ticketsLoading, setTicketsLoading] = useState(false);
    const [showRaiseTicketForm, setShowRaiseTicketForm] = useState(false);

    const messagesEndRef = useRef(null);
    const chatScrollRef = useRef(null);
    const userScrolledUpRef = useRef(false);
    const [userScrolledUp, setUserScrolledUp] = useState(false);
    const streamTargetTextRef = useRef("");
    const streamCheckpointsRef = useRef([]);
    const streamRenderedIndexRef = useRef(0);
    const streamTimerRef = useRef(null);
    const streamActiveBotIdRef = useRef(null);
    const streamDonePayloadRef = useRef(null);
    const streamPendingReportRef = useRef(null);
    const role = localStorage.getItem("role");

    /* ── Cleanup streaming timer on unmount ── */
    useEffect(() => {
        return () => {
            if (streamTimerRef.current) {
                clearInterval(streamTimerRef.current);
                streamTimerRef.current = null;
            }
        };
    }, []);

    /* ── Auto-populate if logged in ── */
    useEffect(() => {
        if (!Boolean(messages?.length) && loginUser?.fullName && loginUser?.email) {
            setUser({ name: loginUser.fullName, email: loginUser.email });
            setMessages([{
                from: "bot", text: `Hi <b>${loginUser.fullName}</b>! How can I help you today?`, time: Date.now()
            }]);
            setStep(2);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loginUser]);

    /* ── Auto-scroll with scroll-lock detection ── */
    useEffect(() => {
        if (userScrolledUpRef.current) return;
        const isStreaming = messages.some(m => m.isStreaming);
        if (!isStreaming) {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages, typing]);

    /* ── Fetch tickets ── */
    const fetchTickets = async () => {
        if (!loginUser) return;
        setTicketsLoading(true);
        setShowTickets(true);
        try {
            const res = await ApiGetUserTickets({ userEmail: loginUser.email });
            setTickets(res?.isSuccess && Array.isArray(res.tickets) ? res.tickets : []);
        } catch { setTickets([]); }
        finally { setTicketsLoading(false); }
    };

    /* ── Step 1 form ── */
    const formik = useFormik({
        initialValues: { name: "", email: "" },
        validationSchema: Yup.object({
            name: Yup.string().required("Name is required"),
            email: Yup.string().email("Invalid email address").required("Email is required"),
        }),
        onSubmit: (values) => {
            setUser(values);
            setMessages([{ from: "bot", text: `Hi <b>${values.name}</b>! How can I help you today?`, time: Date.now() }]);
            setStep(2);
        },
    });

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
            .filter(id => id && /^\d+$/.test(id));
        if (extracted.length) return extracted;
        try {
            const cached = JSON.parse(localStorage.getItem("profile") || "{}");
            const fallback = cached?.profile?.profileId || cached?.profileId;
            if (fallback && /^\d+$/.test(String(fallback))) {
                return [String(fallback)];
            }
        } catch (_) {}
        return [];
    };

    /* ── Typewriter Stream Pacing Controller ── */
    const stopStreamTimer = () => {
        if (streamTimerRef.current) {
            clearInterval(streamTimerRef.current);
            streamTimerRef.current = null;
        }
        streamActiveBotIdRef.current = null;
        streamTargetTextRef.current = "";
        streamCheckpointsRef.current = [];
        streamRenderedIndexRef.current = 0;
        streamDonePayloadRef.current = null;
        streamPendingReportRef.current = null;
    };

    const startStreamPacing = (botMsgId) => {
        if (streamTimerRef.current) {
            clearInterval(streamTimerRef.current);
        }
        streamActiveBotIdRef.current = botMsgId;
        streamTargetTextRef.current = "";
        streamCheckpointsRef.current = [];
        streamRenderedIndexRef.current = 0;
        streamDonePayloadRef.current = null;
        streamPendingReportRef.current = null;

        streamTimerRef.current = setInterval(() => {
            const checkpoints = streamCheckpointsRef.current;
            const currentIndex = streamRenderedIndexRef.current;
            const isDone = Boolean(streamDonePayloadRef.current);

            if (currentIndex < checkpoints.length) {
                // Adaptive step size: if there are many queued lines, advance up to 2 lines per tick
                const remaining = checkpoints.length - currentIndex;
                const step = remaining > 16 ? 2 : 1;
                const nextIndex = Math.min(currentIndex + step, checkpoints.length);
                const nextText = checkpoints[nextIndex - 1];
                streamRenderedIndexRef.current = nextIndex;

                setMessages(prev => prev.map(m => {
                    if (m.id !== botMsgId) return m;
                    return {
                        ...m,
                        text: nextText,
                        status: null,
                    };
                }));

                // Auto-scroll to bottom only if user hasn't scrolled up
                if (!userScrolledUpRef.current && chatScrollRef.current) {
                    chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
                }
            } else if (isDone) {
                // All line checkpoints have appeared and the stream response is complete
                if (streamTimerRef.current) {
                    clearInterval(streamTimerRef.current);
                    streamTimerRef.current = null;
                }
                const res = streamDonePayloadRef.current;
                const finalReport = streamPendingReportRef.current || res?.report || null;
                const finalText = streamTargetTextRef.current || res?.replyMessage || "Here is your report.";

                setTyping(false);
                if (finalReport) {
                    setReportContext(createReportContext(finalReport));
                }

                setMessages(prev => prev.map(m => {
                    if (m.id !== botMsgId) return m;
                    return {
                        ...m,
                        text: finalText,
                        report: finalReport,
                        isReport: Boolean(finalReport || res?.isReport),
                        isStreaming: false,
                        status: null,
                    };
                }));

                // Auto-scroll to bottom if user is at bottom
                if (!userScrolledUpRef.current && chatScrollRef.current) {
                    chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
                }

                if (res?.stopConversion) {
                    setSupportMessage(trimmed => trimmed || "");
                    setStopConversation(true);
                    setTicketStep(TICKET_STEPS.ASK_MESSAGE);
                    setMessages(prev => [...prev, {
                        from: "bot", type: "choice",
                        text: "Would you like to add an additional message?",
                        options: ["Yes", "No"], time: Date.now()
                    }]);
                }
            }
        }, 90);
    };

    /* ── Send message with real-time data streaming ── */
    const sendMessage = async (text = message) => {
        const trimmed = text.trim();
        if (!trimmed || typing) return;
        setShowSuggestions(false);
        const userMsg = { from: "user", text: trimmed, time: Date.now() };
        setMessage("");
        setTyping(true);

        // Reset scroll lock so user automatically sees their new question and answer
        userScrolledUpRef.current = false;
        setUserScrolledUp(false);

        const activeProfileIds = resolveActiveProfileIds();
        const boundedHistory = [...messages, userMsg].slice(-6).map(m => ({
            role: m.from === "bot" ? "assistant" : "user",
            content: m.text ? m.text.replace(/<[^>]*>/g, "").trim() : "",
        }));

        const botMsgId = "bot_" + Date.now();
        setMessages(prev => [
            ...prev,
            userMsg,
            {
                id: botMsgId,
                from: "bot",
                text: "",
                status: "Analyzing your question…",
                report: null,
                isReport: false,
                isStreaming: true,
                time: Date.now(),
            }
        ]);

        startStreamPacing(botMsgId);

        try {
            await ApiCustomChatBotStream({
                data: {
                    message: trimmed,
                    profileIds: activeProfileIds.length ? activeProfileIds : undefined,
                    reportContext: reportContext || undefined,
                    history: boundedHistory,
                },
                onStatus: (statusText) => {
                    setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, status: statusText } : m));
                    if (!userScrolledUpRef.current && chatScrollRef.current) {
                        chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
                    }
                },
                onReport: (report) => {
                    streamPendingReportRef.current = report;
                    if (report) {
                        setReportContext(createReportContext(report));
                    }
                    setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, hasReport: true, isReport: true } : m));
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
                    }
                },
                onError: (err) => {
                    stopStreamTimer();
                    setTyping(false);
                    setMessages(prev => prev.map(m => m.id === botMsgId ? {
                        ...m,
                        text: err?.replyMessage || `<b>Error:</b> <span style="color:#ef4444;">Something went wrong!</span>`,
                        isStreaming: false,
                        status: null,
                        report: null,
                    } : m));
                }
            });
        } catch {
            stopStreamTimer();
            setTyping(false);
            setMessages(prev => prev.map(m => m.id === botMsgId ? {
                ...m,
                text: `<b>Error:</b> <span style="color:#ef4444;">Something went wrong!</span>`,
                isStreaming: false,
                status: null,
                report: null,
            } : m));
        }
    };

    /* ── Follow-up handling with real-time data streaming ── */
    const sendFollowUpRequest = async (label, request) => {
        if (typing) return;
        setShowSuggestions(false);
        const userMsg = { from: "user", text: label, time: Date.now() };
        setTyping(true);

        userScrolledUpRef.current = false;
        setUserScrolledUp(false);

        const activeProfileIds = resolveActiveProfileIds();
        const boundedHistory = [...messages, userMsg].slice(-6).map(m => ({
            role: m.from === "bot" ? "assistant" : "user",
            content: m.text ? m.text.replace(/<[^>]*>/g, "").trim() : "",
        }));

        const botMsgId = "bot_" + Date.now();
        setMessages(prev => [
            ...prev,
            userMsg,
            {
                id: botMsgId,
                from: "bot",
                text: "",
                status: "Updating report…",
                report: null,
                isReport: false,
                isStreaming: true,
                time: Date.now(),
            }
        ]);

        startStreamPacing(botMsgId);

        try {
            await ApiCustomChatBotStream({
                data: {
                    message: label,
                    followUpRequest: request,
                    reportContext: reportContext || undefined,
                    profileIds: activeProfileIds.length ? activeProfileIds : undefined,
                    history: boundedHistory,
                },
                onStatus: (statusText) => {
                    setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, status: statusText } : m));
                    if (!userScrolledUpRef.current && chatScrollRef.current) {
                        chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
                    }
                },
                onReport: (report) => {
                    streamPendingReportRef.current = report;
                    if (report) {
                        setReportContext(createReportContext(report));
                    }
                    setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, hasReport: true, isReport: true } : m));
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
                    }
                },
                onError: (err) => {
                    stopStreamTimer();
                    setTyping(false);
                    setMessages(prev => prev.map(m => m.id === botMsgId ? {
                        ...m,
                        text: err?.replyMessage || `<b>Error:</b> <span style="color:#ef4444;">Could not load follow-up report.</span>`,
                        isStreaming: false,
                        status: null,
                        report: null,
                    } : m));
                }
            });
        } catch {
            stopStreamTimer();
            setTyping(false);
            setMessages(prev => prev.map(m => m.id === botMsgId ? {
                ...m,
                text: `<b>Error:</b> <span style="color:#ef4444;">Could not load follow-up report.</span>`,
                isStreaming: false,
                status: null,
                report: null,
            } : m));
        }
    };

        const handleFollowUpClick = (item) => {
        if (!item) return;
        const label = typeof item === "string" ? item : (item.label || "Drill down");
        const request = typeof item === "object" && item.request ? item.request : null;
        if (request) {
            sendFollowUpRequest(label, request);
        } else {
            sendMessage(label);
        }
    };

    const pushMessage = (text, from = "user", type = "text", options = []) =>
        setMessages(prev => [...prev, { from, type, text, options, time: Date.now() }]);

    /* ── Ticket flow ── */
    const handleTicketFlow = (userInput) => {
        switch (ticketStep) {
            case TICKET_STEPS.ASK_MESSAGE:
                pushMessage(userInput);
                setTicketData(d => ({ ...d, needAdditionalMessage: userInput === "Yes" }));
                if (userInput === "Yes") {
                    setTicketStep(TICKET_STEPS.MESSAGE_TEXT);
                    pushMessage("Please type your additional message.", "bot", "textarea");
                } else {
                    setTicketStep(TICKET_STEPS.ASK_CC);
                    pushMessage("Would you like to add a CC email?", "bot", "choice", ["Yes", "No"]);
                }
                break;
            case TICKET_STEPS.MESSAGE_TEXT:
                pushMessage(userInput);
                setTicketData(d => ({ ...d, additionalMessage: userInput }));
                setTicketStep(TICKET_STEPS.ASK_CC);
                pushMessage("Would you like to add a CC email?", "bot", "choice", ["Yes", "No"]);
                break;
            case TICKET_STEPS.ASK_CC:
                pushMessage(userInput);
                setTicketData(d => ({ ...d, needCC: userInput === "Yes" }));
                if (userInput === "Yes") {
                    setTicketStep(TICKET_STEPS.CC_EMAIL);
                    pushMessage("Please enter the CC email address.", "bot", "input:email");
                } else {
                    submitTicket({ needCC: false, ccEmail: "" });
                }
                break;
            case TICKET_STEPS.CC_EMAIL:
                pushMessage(userInput);
                setTicketData(d => ({ ...d, ccEmail: userInput, needCC: true }));
                submitTicket({ needCC: true, ccEmail: userInput });
                break;
            default: break;
        }
    };

    const submitTicket = async (overrideData = {}) => {
        try {
            pushMessage("Creating your ticket…", "bot");
            const finalTicketData = { ...ticketData, ...overrideData };
            const res = await ApiCreateSupportTicket({
                ...finalTicketData,
                additionalMessage: `${supportMessage}\n\n${finalTicketData?.additionalMessage || ""}`,
                userName: user?.name,
                userEmail: user?.email,
            });
            if (res?.isSuccess === false) throw new Error(res?.message || "Ticket creation failed");
            pushMessage("Ticket created! Our support team will contact you soon.", "bot");
            setTicketStep(TICKET_STEPS.DONE);
        } catch {
            pushMessage("Something went wrong creating your ticket. Please try again.", "bot");
            setTicketStep(TICKET_STEPS.DONE);
        }
    };

    const resetChat = () => {
        stopStreamTimer();
        userScrolledUpRef.current = false;
        setUserScrolledUp(false);
        setMessages([]);
        setMessage("");
        setInlineInput("");
        setTyping(false);
        setSupportMessage("");
        setStopConversation(false);
        setTicketStep(null);
        setShowSuggestions(true);
        setReportContext(null);
        setStep(loginUser ? 2 : 1);
        setTicketData({ needCC: null, ccEmail: "", needAdditionalMessage: null, additionalMessage: "" });
        if (loginUser) {
            setMessages([{ from: "bot", text: `Hi <b>${loginUser.fullName}</b>! How can I help you today?`, time: Date.now() }]);
        }
    };

    if (!isGlobal || location.pathname === "/ai-assistant") return null;

    /* ─────────────────────────────────────────────────────────
       RENDER
    ───────────────────────────────────────────────────────── */
    return (
        <>
            {/* ══════════════════════════════════════════════
                FLOATING TRIGGER BUTTON
            ══════════════════════════════════════════════ */}
            {!open && loginUser && role !== ROLES.SUPER_ADMIN && (
                <Box sx={{ position: "fixed", bottom: 30, right: 30, zIndex: 99999 }}>
                    {/* Pulse ring — primary */}
                    <Box sx={{
                        position: "absolute", inset: -8, borderRadius: "50%",
                        background: ACCENT, opacity: 0,
                        animation: "chatPulse 2.6s ease-out infinite",
                        "@keyframes chatPulse": {
                            "0%": { transform: "scale(0.9)", opacity: 0.22 },
                            "70%": { transform: "scale(1.65)", opacity: 0 },
                            "100%": { transform: "scale(1.65)", opacity: 0 },
                        },
                    }} />
                    <IconButton
                        id="help-support"
                        onClick={() => setOpen(true)}
                        title={t("Help & Support")}
                        className="relative z-10 cursor-pointer"
                        sx={{
                            position: "relative",
                            zIndex: 10,
                            width: 58, height: 58,
                            background: `linear-gradient(135deg, ${ACCENT} 0%, #3CBBF2 100%)`,
                            color: "#fff",
                            cursor: "pointer",
                            boxShadow: "0 6px 24px rgba(35,116,242,0.40)",
                            transition: "all 0.28s cubic-bezier(0.4,0,0.2,1)",
                            "&:hover": {
                                background: `linear-gradient(135deg, ${ACCENT} 0%, #3CBBF2 100%)`,
                                transform: "scale(1.12) translateY(-3px)",
                                boxShadow: "0 10px 32px rgba(35,116,242,0.52)",
                            },
                        }}
                    >
                        <ChatCircleDots size={28} weight="fill" />
                    </IconButton>
                </Box>
            )}

            {/* ══════════════════════════════════════════════
                CHAT PANEL
            ══════════════════════════════════════════════ */}
            {open && (
                <Paper
                    id="chat-window"
                    elevation={10}
                    sx={{
                        position: "fixed",
                        bottom: 24,
                        right: 24,
                        width: isReportExpanded ? "min(860px, calc(100vw - 32px))" : "min(420px, calc(100vw - 48px))",
                        height: isReportExpanded ? "min(800px, calc(100vh - 48px))" : "min(640px, calc(100vh - 80px))",
                        transition: "width 0.28s cubic-bezier(0.16,1,0.3,1), height 0.28s cubic-bezier(0.16,1,0.3,1)",
                        zIndex: 1299,
                        display: "flex",
                        flexDirection: "column",
                        borderRadius: "22px",
                        overflow: "hidden",
                        background: GLASS_BG,
                        border: `1px solid ${GLASS_BORDER}`,
                        boxShadow: "0 24px 64px rgba(0,0,0,0.18), 0 6px 24px rgba(35,116,242,0.12)",
                        backdropFilter: "blur(24px)",
                        WebkitBackdropFilter: "blur(24px)",
                        animation: "chatSlideIn 0.38s cubic-bezier(0.16,1,0.3,1) both",
                        '[data-theme="dark"] &': {
                            background: "rgba(13,18,36,0.97)",
                            border: "1px solid rgba(255,255,255,0.08)",
                            boxShadow: "0 32px 80px rgba(0,0,0,0.65), 0 0 0 1px rgba(35,116,242,0.18), 0 0 60px rgba(35,116,242,0.14)",
                        },
                        "@keyframes chatSlideIn": {
                            from: { opacity: 0, transform: "translateY(24px) scale(0.95)" },
                            to: { opacity: 1, transform: "translateY(0) scale(1)" },
                        },
                    }}
                >
                    {/* ══════════════════════════════════════
                        HEADER
                    ══════════════════════════════════════ */}
                    <Box
                        sx={{
                            px: 2.5, py: 2,
                            display: "flex", alignItems: "center",
                            background: `linear-gradient(135deg, ${ACCENT} 0%, #3CBBF2 100%)`,
                            color: "#fff",
                            flexShrink: 0,
                            position: "relative",
                            overflow: "hidden",
                            "&::before": {
                                content: '""', position: "absolute",
                                top: -35, right: -18,
                                width: 100, height: 100, borderRadius: "50%",
                                background: "rgba(255,255,255,0.10)", pointerEvents: "none",
                            },
                            "&::after": {
                                content: '""', position: "absolute",
                                bottom: -28, right: 72,
                                width: 62, height: 62, borderRadius: "50%",
                                background: "rgba(255,255,255,0.07)", pointerEvents: "none",
                            },
                        }}
                    >
                        {/* Shimmer sweep */}
                        <Box sx={{
                            position: "absolute", top: 0, bottom: 0,
                            width: "52%",
                            background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.07), transparent)",
                            pointerEvents: "none", zIndex: 0,
                            animation: "hdrShimmer 4.5s ease-in-out 0.8s infinite",
                            "@keyframes hdrShimmer": {
                                "0%": { left: "-60%" },
                                "100%": { left: "140%" },
                            },
                        }} />

                        {/* Avatar + online dot */}
                        <Box sx={{ position: "relative", mr: 1.5, flexShrink: 0 }}>
                            <Avatar
                                src={BotLogo}
                                sx={{
                                    width: 38, height: 38,
                                    background: "rgba(255,255,255,0.18)",
                                    border: "2px solid rgba(255,255,255,0.40)",
                                    "& img": { objectFit: "contain", transform: "scale(0.83)" },
                                    '[data-theme="dark"] & img': { filter: "brightness(0) invert(0.92)", transform: "scale(0.83)" },
                                }}
                            >
                                <SupportAgentIcon size={18} />
                            </Avatar>
                            {/* Status dot */}
                            <Box sx={{
                                position: "absolute", bottom: 0, right: 0,
                                width: 10, height: 10, borderRadius: "50%",
                                background: "#34d399",
                                border: "2px solid rgba(255,255,255,0.9)",
                                animation: "statusPulse 2.5s ease-in-out infinite",
                                "@keyframes statusPulse": {
                                    "0%,100%": { boxShadow: "0 0 0 0 rgba(52,211,153,0.5)" },
                                    "50%": { boxShadow: "0 0 0 4px rgba(52,211,153,0)" },
                                },
                            }} />
                        </Box>

                        {/* Title + sub-line */}
                        <Box flex={1} sx={{ minWidth: 0 }}>
                            <Typography
                                fontWeight={700} fontSize={14} lineHeight={1.25} noWrap
                                sx={{ fontFamily: FONT, letterSpacing: "-0.01em" }}
                            >
                                {loginUser && showTickets
                                    ? "Your Tickets"
                                    : showRaiseTicketForm
                                        ? "Raise a Support Ticket"
                                        : "Advertise IQ Support"}
                            </Typography>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.2 }}>
                                <AutoAwesomeIcon size={10} style={{ opacity: 0.75 }} />
                                <Typography fontSize={10.5} sx={{ opacity: 0.80, fontFamily: FONT, letterSpacing: "0.01em" }}>
                                    {loginUser && showTickets ? "Ticket history" : "AI-powered · typically replies instantly"}
                                </Typography>
                            </Box>
                        </Box>

                        {/* Action icons */}
                        <Box sx={{ display: "flex", alignItems: "center", gap: "10px", position: "relative", zIndex: 1 }}>
                            {Boolean(user?.name && user?.email) && !showRaiseTicketForm && (
                                <HeaderIconBtn title={t("Raise Ticket")} onClick={() => { setShowTickets(false); setShowRaiseTicketForm(true); }}>
                                    <ConfirmationNumberIcon size={19} />
                                </HeaderIconBtn>
                            )}
                            {loginUser && !showTickets && (
                                <HeaderIconBtn title={t("View Case Log")} onClick={() => { setShowTickets(true); setShowRaiseTicketForm(false); fetchTickets(); }}>
                                    <HistoryIcon size={19} />
                                </HeaderIconBtn>
                            )}
                            {((loginUser && showTickets) || (Boolean(user?.name && user?.email) && showRaiseTicketForm)) && (
                                <HeaderIconBtn title={t("Back to Chat")} onClick={() => { setShowTickets(false); setShowRaiseTicketForm(false); }}>
                                    <ChatIcon size={19} />
                                </HeaderIconBtn>
                            )}
                            <HeaderIconBtn title={t("Open Full Page Assistant")} onClick={() => { setOpen(false); navigate("/ai-assistant"); }}>
                                <ExternalLink size={18} />
                            </HeaderIconBtn>
                            <HeaderIconBtn title={isReportExpanded ? t("Collapse Window") : t("Expand Window")} onClick={() => setIsReportExpanded(prev => !prev)}>
                                {isReportExpanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                            </HeaderIconBtn>
                            <HeaderIconBtn id="chat-close-btn" title={t("Close")} onClick={() => setOpen(false)}>
                                <CloseIcon size={19} />
                            </HeaderIconBtn>
                        </Box>
                    </Box >

                    {/* ══════════════════════════════════════
                        RAISE TICKET FORM
                    ══════════════════════════════════════ */}
                    {
                        showRaiseTicketForm && (
                            <RaiseSupportTicket
                                user={user}
                                onSuccess={() => {
                                    setShowRaiseTicketForm(false);
                                    setMessages(prev => [
                                        ...prev,
                                        { from: "bot", text: "Your ticket has been created successfully!", time: Date.now() }
                                    ]);
                                }}
                            />
                        )
                    }

                    {/* ══════════════════════════════════════
                        TICKET LIST
                    ══════════════════════════════════════ */}
                    {
                        showTickets && (
                            <Box sx={{
                                flex: 1, overflowY: "auto", p: 2,
                                background: ACCENT_BG,
                                ...scrollbarSx,
                            }}>
                                {ticketsLoading ? (
                                    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                                        {[1, 2, 3].map(i => (
                                            <Box key={i} sx={{ background: GLASS_BG, borderRadius: "14px", p: 2, border: `1px solid ${GLASS_BORDER}` }}>
                                                <Skeleton width="60%" height={20} />
                                                <Skeleton width="38%" height={14} sx={{ mt: 0.5 }} />
                                            </Box>
                                        ))}
                                    </Box>
                                ) : tickets.length === 0 ? (
                                    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 1.5 }}>
                                        <Box sx={{
                                            width: 52, height: 52, borderRadius: "50%",
                                            background: ACCENT_BG, border: `1.5px solid ${ACCENT_BORDER}`,
                                            display: "flex", alignItems: "center", justifyContent: "center",
                                        }}>
                                            <HistoryIcon sx={{ fontSize: 26, color: ACCENT }} />
                                        </Box>
                                        <Typography fontSize={13} color={TEXT_SECONDARY} textAlign="center" sx={{ fontFamily: FONT }}>
                                            No previous tickets found.
                                        </Typography>
                                    </Box>
                                ) : (
                                    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                                        {tickets.map((ticket) => {
                                            const statusColor = ticket.status === "open" ? "success" : ticket.status === "pending" ? "warning" : "default";
                                            return (
                                                <Box
                                                    key={ticket._id}
                                                    onClick={() => navigate(`/support-ticket/${Buffer.from(JSON.stringify({ ticketId: ticket._id })).toString("base64")}`)}
                                                    sx={{
                                                        background: GLASS_BG,
                                                        borderRadius: "14px",
                                                        p: 2,
                                                        border: `1px solid ${GLASS_BORDER}`,
                                                        cursor: "pointer",
                                                        transition: "all 0.22s ease",
                                                        "&:hover": {
                                                            transform: "translateY(-2px)",
                                                            boxShadow: "0 8px 28px rgba(35,116,242,0.13)",
                                                            borderColor: ACCENT_BORDER,
                                                        },
                                                    }}
                                                >
                                                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1 }}>
                                                        <Typography fontWeight={600} fontSize={13} color={TEXT_PRIMARY} noWrap sx={{ flex: 1, fontFamily: FONT }}>
                                                            {ticket.subject || "Support Ticket"}
                                                        </Typography>
                                                        <Chip
                                                            size="small"
                                                            label={ticket.status || "pending"}
                                                            color={statusColor}
                                                            sx={{ textTransform: "capitalize", fontSize: 10.5, height: 20, fontFamily: FONT }}
                                                        />
                                                    </Box>
                                                    <Typography fontSize={11} color={TEXT_SECONDARY} sx={{ mt: 0.6, fontFamily: FONT }}>
                                                        {new Date(ticket.createdAt).toLocaleDateString()} at{" "}
                                                        {new Date(ticket.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                                    </Typography>
                                                </Box>
                                            );
                                        })}
                                    </Box>
                                )}
                            </Box>
                        )
                    }

                    {/* ══════════════════════════════════════
                        STEP 1 — User info form
                    ══════════════════════════════════════ */}
                    {
                        !showTickets && !showRaiseTicketForm && step === 1 && (
                            <Box
                                component="form"
                                onSubmit={formik.handleSubmit}
                                sx={{
                                    flex: 1, px: 3, py: 3,
                                    display: "flex", flexDirection: "column",
                                    background: GLASS_BG,
                                    position: "relative", overflow: "hidden",
                                }}
                            >
                                {/* Subtle decorative blob */}
                                <Box sx={{
                                    position: "absolute", top: -60, right: -60,
                                    width: 200, height: 200, borderRadius: "50%",
                                    background: ACCENT_BG, pointerEvents: "none",
                                }} />

                                {/* Branded illustration area */}
                                <Box sx={{ textAlign: "center", mb: 3, mt: 1, position: "relative" }}>
                                    <Box sx={{
                                        width: 72, height: 72, borderRadius: "50%",
                                        background: `linear-gradient(135deg, ${ACCENT_BG}, rgba(60,187,242,0.10))`,
                                        border: `2px solid ${ACCENT_BORDER}`,
                                        display: "flex", alignItems: "center", justifyContent: "center",
                                        margin: "0 auto 14px",
                                        boxShadow: "0 4px 16px rgba(35,116,242,0.10)",
                                        animation: "formIconFloat 3s ease-in-out infinite",
                                        "@keyframes formIconFloat": {
                                            "0%,100%": { transform: "translateY(0)" },
                                            "50%": { transform: "translateY(-5px)" },
                                        },
                                    }}>
                                        <SupportAgentIcon sx={{ fontSize: 34, color: ACCENT }} />
                                    </Box>
                                    <Typography fontWeight={700} fontSize={16} color={TEXT_PRIMARY} sx={{ fontFamily: FONT, letterSpacing: "-0.01em" }}>
                                        Start a conversation
                                    </Typography>
                                    <Typography fontSize={13} color={TEXT_SECONDARY} mt={0.5} sx={{ fontFamily: FONT }}>
                                        Tell us who you are to get personalised help
                                    </Typography>
                                </Box>

                                {/* Name field */}
                                <Box sx={{ mt: 1 }}>
                                    <Typography fontSize={11.5} fontWeight={600} color={TEXT_SECONDARY} mb={0.6} sx={{ fontFamily: FONT, letterSpacing: "0.02em", textTransform: "uppercase" }}>
                                        Name
                                    </Typography>
                                    <TextField
                                        hiddenLabel
                                        placeholder={t("Enter your name")}
                                        name="name"
                                        fullWidth
                                        size="small"
                                        autoComplete="name"
                                        value={formik.values.name}
                                        onChange={formik.handleChange}
                                        onBlur={formik.handleBlur}
                                        error={formik.touched.name && Boolean(formik.errors.name)}
                                        helperText={formik.touched.name && formik.errors.name}
                                        sx={formInputSx}
                                    />
                                </Box>

                                {/* Email field */}
                                <Box sx={{ mt: 2 }}>
                                    <Typography fontSize={11.5} fontWeight={600} color={TEXT_SECONDARY} mb={0.6} sx={{ fontFamily: FONT, letterSpacing: "0.02em", textTransform: "uppercase" }}>
                                        Email
                                    </Typography>
                                    <TextField
                                        hiddenLabel
                                        placeholder={t("Enter your email")}
                                        name="email"
                                        fullWidth
                                        size="small"
                                        autoComplete="email"
                                        value={formik.values.email}
                                        onChange={formik.handleChange}
                                        onBlur={formik.handleBlur}
                                        error={formik.touched.email && Boolean(formik.errors.email)}
                                        helperText={formik.touched.email && formik.errors.email}
                                        sx={formInputSx}
                                    />
                                </Box>

                                <Box sx={{ mt: "auto", pt: 2.5 }}>
                                    <Button
                                        fullWidth
                                        type="submit"
                                        variant="contained"
                                        size="large"
                                        disabled={!formik.isValid || !formik.dirty}
                                        endIcon={<SendIcon fontSize="small" />}
                                        sx={{ ...primaryBtnSx, fontSize: 14, py: 1.3 }}
                                    >
                                        Start Chat
                                    </Button>
                                    <Typography fontSize={11} color={TEXT_SECONDARY} textAlign="center" mt={1.5} sx={{ fontFamily: FONT, opacity: 0.8 }}>
                                        Your info is only used to help us assist you
                                    </Typography>
                                </Box>
                            </Box>
                        )
                    }

                    {/* ══════════════════════════════════════
                        STEP 2 — Chat interface
                    ══════════════════════════════════════ */}
                    {
                        !showTickets && !showRaiseTicketForm && step === 2 && (
                            <>
                                {/* ── Messages area ── */}
                                <Box
                                    ref={chatScrollRef}
                                    onScroll={(e) => {
                                        const el = e.currentTarget;
                                        const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 60;
                                        userScrolledUpRef.current = !isNearBottom;
                                        if (userScrolledUp !== !isNearBottom) {
                                            setUserScrolledUp(!isNearBottom);
                                        }
                                    }}
                                    sx={{
                                        flex: 1,
                                        overflowY: "auto",
                                        overflowX: "hidden",
                                        minHeight: 0,
                                        px: 2, py: 2,
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: 0.5,
                                        background: ACCENT_BG,
                                        position: "relative",
                                        minWidth: 0,
                                        ...scrollbarSx,
                                        '[data-theme="dark"] &': {
                                            background: "rgba(7,10,20,0.82)",
                                        },
                                        /* spring pop — used by every message bubble */
                                        "@keyframes msgPop": {
                                            "0%": { opacity: 0, transform: "scale(0.82) translateY(10px)" },
                                            "55%": { transform: "scale(1.04) translateY(-3px)" },
                                            "80%": { transform: "scale(0.98) translateY(1px)" },
                                            "100%": { opacity: 1, transform: "scale(1)    translateY(0)" },
                                        },
                                        "@keyframes msgSlideLeft": {
                                            "0%": { opacity: 0, transform: "translateX(-10px) scale(0.95)" },
                                            "100%": { opacity: 1, transform: "translateX(0)     scale(1)" },
                                        },
                                    }}
                                >
                                    {/* Soft gradient blobs */}
                                    <ChatbotBg />
                                    {/* Blurred brand logo watermark */}
                                    <Box
                                        component="img"
                                        src={BotLogo}
                                        aria-hidden="true"
                                        sx={{
                                            position: "absolute",
                                            top: "50%", left: "50%",
                                            transform: "translate(-50%, -50%)",
                                            width: "62%",
                                            opacity: 0.05,
                                            filter: "brightness(0)",
                                            pointerEvents: "none",
                                            userSelect: "none",
                                            zIndex: 0,
                                            '[data-theme="dark"] &': {
                                                opacity: 0.08,
                                                filter: "brightness(0) invert(1)",
                                            },
                                        }}
                                    />

                                    {/* Subtle Amazon Ads metrics — empty state only */}
                                    {messages.length <= 1 && (
                                        <Box sx={{
                                            position: "absolute",
                                            bottom: 14,
                                            left: 0, right: 0,
                                            display: "flex",
                                            justifyContent: "center",
                                            gap: 1,
                                            zIndex: 0,
                                            pointerEvents: "none",
                                        }}>
                                            {[
                                                { label: "SP · SB · SD", d: 0.4 },
                                                { label: "Performance reports", d: 0.65 },
                                                { label: "Insights in chat", d: 0.9 },
                                            ].map(({ label, d }) => (
                                                <Box key={label} sx={{
                                                    fontSize: 10,
                                                    fontFamily: FONT,
                                                    px: 1.2, py: 0.35,
                                                    borderRadius: "8px",
                                                    background: ACCENT_BG,
                                                    border: `1px solid ${ACCENT_BORDER}`,
                                                    color: TEXT_SECONDARY,
                                                    letterSpacing: "0.02em",
                                                    opacity: 0,
                                                    animation: `adsMetricFade 0.55s ease ${d}s forwards`,
                                                    "@keyframes adsMetricFade": {
                                                        from: { opacity: 0, transform: "translateY(5px)" },
                                                        to: { opacity: 0.65, transform: "translateY(0)" },
                                                    },
                                                }}>
                                                    {label}
                                                </Box>
                                            ))}
                                        </Box>
                                    )}

                                    {messages.map((msg, i) => {
                                        const isUser = msg.from === "user";
                                        const isLast = messages.length - 1 === i;
                                        const prevSame = i > 0 && messages[i - 1].from === msg.from;

                                        return (
                                            <Box
                                                key={i}
                                                sx={{
                                                    mb: 0.5,
                                                    position: "relative", zIndex: 1,
                                                    animation: isUser
                                                        ? "msgPop 0.34s cubic-bezier(0.34,1.56,0.64,1) both"
                                                        : "msgSlideLeft 0.32s cubic-bezier(0.22,1,0.36,1) both",
                                                }}
                                            >
                                                <Box sx={{
                                                    display: "flex",
                                                    alignItems: "flex-end",
                                                    flexDirection: isUser ? "row-reverse" : "row",
                                                    gap: 1,
                                                }}>
                                                    {/* Avatar — only show if first of group */}
                                                    <Avatar
                                                        src={!isUser ? BotLogo : undefined}
                                                        sx={{
                                                            width: 28, height: 28, flexShrink: 0,
                                                            visibility: prevSame ? "hidden" : "visible",
                                                            background: isUser
                                                                ? `linear-gradient(135deg, ${ACCENT}, #3CBBF2)`
                                                                : ACCENT_BG,
                                                            border: isUser ? "none" : `1.5px solid ${ACCENT_BORDER}`,
                                                            fontSize: 12, fontWeight: 700,
                                                            color: isUser ? "#fff" : ACCENT,
                                                            "& img": { objectFit: "contain", transform: "scale(0.80)" },
                                                            '[data-theme="dark"] &': {
                                                                background: isUser ? `linear-gradient(135deg, ${ACCENT}, #3CBBF2)` : "#ffffff",
                                                                border: isUser ? "none" : "1.5px solid rgba(255, 255, 255, 0.9)",
                                                            },
                                                            '[data-theme="dark"] & img': {
                                                                filter: isUser ? "none" : "none", // Keep original dark logo on white background
                                                            }
                                                        }}
                                                    >
                                                        {isUser ? user?.name?.charAt(0)?.toUpperCase() : "A"}
                                                    </Avatar>

                                                    {/* Bubble */}
                                                    <Box
                                                        sx={{
                                                            px: 1.8, py: 1.1,
                                                            borderRadius: isUser
                                                                ? "18px 18px 5px 18px"
                                                                : "18px 18px 18px 5px",
                                                            maxWidth: msg.report ? "calc(100% - 36px)" : "74%",
                                                            width: msg.report ? "calc(100% - 36px)" : "auto",
                                                            minWidth: 0,
                                                            position: "relative",
                                                            overflow: msg.report ? "visible" : "hidden",
                                                            zIndex: 1,
                                                            background: isUser
                                                                ? `linear-gradient(135deg, ${ACCENT} 0%, #3CBBF2 100%)`
                                                                : GLASS_BG,
                                                            color: isUser ? "#fff" : TEXT_PRIMARY,
                                                            border: isUser ? "none" : `1px solid ${GLASS_BORDER}`,
                                                            boxShadow: isUser
                                                                ? "0 4px 16px rgba(35,116,242,0.28)"
                                                                : "0 2px 8px rgba(0,0,0,0.06)",
                                                            fontSize: 13.5, lineHeight: 1.58,
                                                            fontFamily: FONT,
                                                            transition: "box-shadow 0.2s ease",
                                                            "&:hover": {
                                                                boxShadow: isUser
                                                                    ? "0 6px 22px rgba(35,116,242,0.38)"
                                                                    : "0 4px 14px rgba(0,0,0,0.10)",
                                                            },
                                                            /* dark mode — give bot bubbles clear depth */
                                                            ...(!isUser && {
                                                                '[data-theme="dark"] &': {
                                                                    background: "rgba(22,30,56,0.97)",
                                                                    border: "1px solid rgba(255,255,255,0.10)",
                                                                    boxShadow: "0 2px 14px rgba(0,0,0,0.32)",
                                                                },
                                                            }),
                                                            /* shimmer sweep on bot bubbles */
                                                            ...(!isUser && !msg.report && {
                                                                "&::after": {
                                                                    content: '""',
                                                                    position: "absolute",
                                                                    top: 0, bottom: 0, left: "-60%",
                                                                    width: "40%",
                                                                    background: "linear-gradient(90deg, transparent, rgba(35,116,242,0.04), transparent)",
                                                                    animation: "bubbleShimmer 3.5s ease-in-out infinite",
                                                                },
                                                                "@keyframes bubbleShimmer": {
                                                                    "0%": { left: "-60%" },
                                                                    "100%": { left: "140%" },
                                                                },
                                                            }),
                                                            "& b": { fontWeight: 700 },
                                                            "& a": { color: isUser ? "rgba(255,255,255,0.9)" : ACCENT, textDecoration: "underline" },
                                                        }}
                                                    >
                                                        {/* Initial status indicator while waiting for text */}
                                                        {msg.isStreaming && !msg.text && (
                                                            <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, py: 0.5, px: 0.5 }}>
                                                                <Box
                                                                    sx={{
                                                                        width: 8, height: 8, borderRadius: "50%",
                                                                        background: ACCENT,
                                                                        boxShadow: `0 0 10px ${ACCENT}`,
                                                                        animation: "streamPulse 1.2s ease-in-out infinite",
                                                                        "@keyframes streamPulse": {
                                                                            "0%, 100%": { opacity: 0.35, transform: "scale(0.85)" },
                                                                            "50%": { opacity: 1, transform: "scale(1.25)" },
                                                                        }
                                                                    }}
                                                                />
                                                                <Typography sx={{ fontSize: 13, color: TEXT_SECONDARY, fontStyle: "italic", fontFamily: FONT }}>
                                                                    {msg.status || "Analyzing data stream…"}
                                                                </Typography>
                                                            </Box>
                                                        )}
                                                        {/* Streamed text rendered at top */}
                                                        {msg.text && (
                                                            <Box sx={{ position: "relative" }}>
                                                                <ChatMessageText text={msg.text} isReport={Boolean(msg.report || msg.hasReport)} />
                                                                {msg.isStreaming && (
                                                                    <span
                                                                        style={{
                                                                            display: "inline-block",
                                                                            width: 6,
                                                                            height: 14,
                                                                            backgroundColor: ACCENT,
                                                                            marginLeft: 4,
                                                                            verticalAlign: "middle",
                                                                            borderRadius: 1,
                                                                            animation: "blinkCursor 0.8s infinite",
                                                                        }}
                                                                    />
                                                                )}
                                                            </Box>
                                                        )}
                                                        {/* Compact report-ready badge while text is still streaming */}
                                                        {msg.isStreaming && (msg.hasReport || msg.report) && (
                                                            <Box sx={{
                                                                display: "inline-flex",
                                                                alignItems: "center",
                                                                gap: 1,
                                                                mt: 1.2,
                                                                py: 0.5,
                                                                px: 1.25,
                                                                borderRadius: "10px",
                                                                background: isDark ? "rgba(35,116,242,0.12)" : "rgba(35,116,242,0.08)",
                                                                border: `1px solid ${ACCENT_BORDER}`,
                                                            }}>
                                                                <Box sx={{
                                                                    width: 6, height: 6, borderRadius: "50%",
                                                                    background: ACCENT,
                                                                    boxShadow: `0 0 6px ${ACCENT}`,
                                                                    animation: "streamPulse 1.2s ease-in-out infinite",
                                                                }} />
                                                                <Typography sx={{ fontSize: 11.5, color: TEXT_SECONDARY, fontFamily: FONT, fontWeight: 500 }}>
                                                                    Performance data ready · Finalizing insights…
                                                                </Typography>
                                                            </Box>
                                                        )}
                                                        {/* Rich report rendered cleanly BELOW text once streaming finishes */}
                                                        {!msg.isStreaming && msg.report && (
                                                            <ChatReportRenderer
                                                                report={msg.report}
                                                                isExpanded={isReportExpanded}
                                                                onToggleExpand={() => setIsReportExpanded(prev => !prev)}
                                                                onFollowUp={(item) => handleFollowUpClick(item)}
                                                                isDark={isDark}
                                                                profileNames={profileNames}
                                                            />
                                                        )}
                                                    </Box>
                                                </Box>

                                                {/* Timestamp */}
                                                {msg.time && (
                                                    <Typography
                                                        sx={{
                                                            fontSize: 10, color: TEXT_SECONDARY, opacity: 0.65,
                                                            mt: 0.4, fontFamily: FONT,
                                                            textAlign: isUser ? "right" : "left",
                                                            px: isUser ? 0 : 4.5,
                                                        }}
                                                    >
                                                        {fmtTime(msg.time)}
                                                    </Typography>
                                                )}

                                                {/* Inline controls — last bot message */}
                                                {isLast && msg.from === "bot" && (
                                                    <>
                                                        {msg.type === "choice" && (
                                                            <div className="flex flex-wrap items-center gap-2.5 mt-3 ml-[36px]">
                                                                {msg.options.map(opt => (
                                                                    <button
                                                                        key={opt}
                                                                        type="button"
                                                                        onClick={() => handleTicketFlow(opt)}
                                                                        className="px-5 py-1.5 text-xs font-semibold rounded-full transition-all duration-200 shadow-sm hover:shadow active:scale-95 cursor-pointer border"
                                                                        style={{
                                                                            borderColor: ACCENT,
                                                                            background: isDark ? "rgba(60,187,242,0.18)" : "rgba(60,187,242,0.10)",
                                                                            color: ACCENT,
                                                                            fontFamily: FONT,
                                                                        }}
                                                                    >
                                                                        {opt}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        )}
                                                        {msg.type === "input:email" && (
                                                            <InlineInputBox>
                                                                <TextField
                                                                    fullWidth size="small" type="email"
                                                                    placeholder={t("Enter email address")}
                                                                    value={inlineInput}
                                                                    onChange={e => setInlineInput(e.target.value)}
                                                                    onKeyDown={e => { if (e.key === "Enter" && inlineInput.trim()) { handleTicketFlow(inlineInput.trim()); setInlineInput(""); } }}
                                                                    sx={inputSx}
                                                                />
                                                                <InlineSubmitBtn disabled={!inlineInput.trim()} onClick={() => { handleTicketFlow(inlineInput.trim()); setInlineInput(""); }} />
                                                            </InlineInputBox>
                                                        )}
                                                        {msg.type === "textarea" && (
                                                            <InlineInputBox>
                                                                <TextField
                                                                    fullWidth multiline minRows={3} size="small"
                                                                    placeholder={t("Type your message…")}
                                                                    value={inlineInput}
                                                                    onChange={e => setInlineInput(e.target.value)}
                                                                    sx={inputSx}
                                                                />
                                                                <InlineSubmitBtn disabled={!inlineInput.trim()} onClick={() => { handleTicketFlow(inlineInput.trim()); setInlineInput(""); }} />
                                                            </InlineInputBox>
                                                        )}
                                                    </>
                                                )}
                                            </Box>
                                        );
                                    })}

                                    {/* Typing indicator */}
                                    {typing && !messages.some(m => m.isStreaming) && (
                                        <Box sx={{ display: "flex", alignItems: "flex-end", gap: 1, position: "relative", zIndex: 1 }}>
                                            <Avatar
                                                src={BotLogo}
                                                sx={{
                                                    width: 28, height: 28,
                                                    background: ACCENT_BG,
                                                    border: `1.5px solid ${ACCENT_BORDER}`,
                                                    "& img": { objectFit: "contain", transform: "scale(0.80)" },
                                                    '[data-theme="dark"] &': {
                                                        background: "#ffffff",
                                                        border: "1.5px solid rgba(255, 255, 255, 0.9)",
                                                    },
                                                    '[data-theme="dark"] & img': {
                                                        filter: "none"
                                                    }
                                                }}
                                            />
                                            <TypingDots />
                                        </Box>
                                    )}

                                    {/* Suggestion chips — only after first greeting */}
                                    {showSuggestions && messages.length === 1 && !typing && (
                                        <Box sx={{ mt: 1.5, position: "relative", zIndex: 1 }}>
                                            <Typography fontSize={11} color={TEXT_SECONDARY} sx={{ fontFamily: FONT, mb: 0.8, ml: 4.5, opacity: 0.8 }}>
                                                Quick questions:
                                            </Typography>
                                            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.8, ml: 4.5 }}>
                                                {SUGGESTIONS.map((s, idx) => (
                                                    <Chip
                                                        key={s}
                                                        label={s}
                                                        size="small"
                                                        clickable
                                                        onClick={() => sendMessage(s)}
                                                        sx={{
                                                            alignSelf: "flex-start",
                                                            fontFamily: FONT,
                                                            fontSize: 12,
                                                            height: 28,
                                                            background: GLASS_BG,
                                                            color: ACCENT,
                                                            border: `1px solid ${ACCENT_BORDER}`,
                                                            transition: "all 0.2s ease",
                                                            "&:hover": {
                                                                background: ACCENT_BG,
                                                                borderColor: ACCENT,
                                                                transform: "translateX(3px)",
                                                            },
                                                            cursor: "pointer",
                                                            animation: `chipSlideIn 0.38s ease ${idx * 0.13 + 0.1}s both`,
                                                            "@keyframes chipSlideIn": {
                                                                from: { opacity: 0, transform: "translateX(-12px)" },
                                                                to: { opacity: 1, transform: "translateX(0)" },
                                                            },
                                                        }}
                                                    />
                                                ))}
                                            </Box>
                                        </Box>
                                    )}

                                    {/* New chat button after ticket done */}
                                    {ticketStep === TICKET_STEPS.DONE && (
                                        <Box sx={{ mt: 2.5, display: "flex", justifyContent: "center", position: "relative", zIndex: 1 }}>
                                            <Button
                                                variant="outlined"
                                                startIcon={<RestartAltIcon />}
                                                onClick={resetChat}
                                                sx={{
                                                    borderRadius: "20px",
                                                    borderColor: ACCENT_BORDER,
                                                    color: ACCENT,
                                                    fontSize: 12.5, px: 3,
                                                    fontFamily: FONT, textTransform: "none",
                                                    "&:hover": { background: ACCENT_BG, borderColor: ACCENT },
                                                }}
                                            >
                                                Start New Chat
                                            </Button>
                                        </Box>
                                    )}

                                    {/* Floating Jump-to-latest button when scrolled up */}
                                    {userScrolledUp && messages.length > 0 && (
                                        <Box
                                            onClick={() => {
                                                userScrolledUpRef.current = false;
                                                setUserScrolledUp(false);
                                                if (chatScrollRef.current) {
                                                    chatScrollRef.current.scrollTo({
                                                        top: chatScrollRef.current.scrollHeight,
                                                        behavior: "smooth"
                                                    });
                                                }
                                            }}
                                            sx={{
                                                position: "sticky",
                                                bottom: 8,
                                                alignSelf: "center",
                                                zIndex: 30,
                                                display: "inline-flex",
                                                alignItems: "center",
                                                gap: 0.75,
                                                py: 0.5,
                                                px: 1.5,
                                                borderRadius: "20px",
                                                background: isDark ? "rgba(15,23,42,0.94)" : "rgba(255,255,255,0.96)",
                                                color: ACCENT,
                                                border: `1px solid ${ACCENT_BORDER}`,
                                                boxShadow: "0 4px 14px rgba(0,0,0,0.18)",
                                                cursor: "pointer",
                                                transition: "all 0.2s ease",
                                                backdropFilter: "blur(6px)",
                                                "&:hover": {
                                                    background: ACCENT_BG,
                                                    transform: "translateY(-1px)",
                                                    boxShadow: "0 6px 18px rgba(35,116,242,0.25)",
                                                },
                                            }}
                                        >
                                            <ArrowDown size={14} color={ACCENT} />
                                            <Typography sx={{ fontSize: 11.5, fontWeight: 600, color: ACCENT, fontFamily: FONT }}>
                                                Jump to latest
                                            </Typography>
                                        </Box>
                                    )}

                                    <div ref={messagesEndRef} />
                                </Box>

                                {/* ── Input bar ── */}
                                <Box sx={{
                                    height: "1px",
                                    background: `linear-gradient(90deg, transparent, ${ACCENT_BORDER}, transparent)`,
                                    '[data-theme="dark"] &': {
                                        background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.10), transparent)",
                                    },
                                }} />
                                <Box sx={{
                                    px: 1.5, pt: 1.2, pb: 1,
                                    background: GLASS_BG,
                                    flexShrink: 0,
                                    '[data-theme="dark"] &': {
                                        background: "rgba(10,14,26,0.98)",
                                        borderTop: "1px solid rgba(255,255,255,0.07)",
                                    },
                                }}>
                                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                        <TextField
                                            fullWidth
                                            placeholder={stopConversation ? "Chat ended — raise a ticket above" : "Message Advertise IQ…"}
                                            disabled={typing || stopConversation}
                                            value={message}
                                            onChange={e => setMessage(e.target.value)}
                                            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                                            size="small"
                                            multiline
                                            maxRows={4}
                                            sx={{
                                                "& .MuiOutlinedInput-root": {
                                                    fontFamily: FONT,
                                                    borderRadius: "14px",
                                                    background: INPUT_BG,
                                                    color: TEXT_PRIMARY,
                                                    fontSize: 13.5,
                                                    alignItems: "flex-end",
                                                    transition: "box-shadow 0.22s ease",
                                                    "& fieldset": { borderColor: GLASS_BORDER },
                                                    "&:hover fieldset": { borderColor: ACCENT_BORDER },
                                                    "&.Mui-focused fieldset": { borderColor: ACCENT, borderWidth: "1.5px" },
                                                    "&.Mui-focused": { boxShadow: "0 0 0 4px rgba(35,116,242,0.10)" },
                                                },
                                                "& .MuiOutlinedInput-input": {
                                                    color: TEXT_PRIMARY, fontFamily: FONT,
                                                    py: "9px",
                                                    "&::placeholder": { color: TEXT_SECONDARY, opacity: 1 },
                                                },
                                                "& .MuiInputBase-inputMultiline": {
                                                    padding: "10px 14px",
                                                    lineHeight: 1.65,
                                                    "&::placeholder": { color: TEXT_SECONDARY, opacity: 1 },
                                                },
                                            }}
                                        />
                                        <IconButton
                                            onClick={() => sendMessage()}
                                            disabled={typing || stopConversation || !message.trim()}
                                            sx={{
                                                width: 42, height: 42, flexShrink: 0,
                                                alignSelf: "flex-end", mb: "1px",
                                                background: `linear-gradient(135deg, ${ACCENT} 0%, #3CBBF2 100%)`,
                                                color: "#fff",
                                                transition: "all 0.22s ease",
                                                "&:hover": {
                                                    background: `linear-gradient(135deg, ${ACCENT} 0%, #3CBBF2 100%)`,
                                                    boxShadow: "0 4px 16px rgba(35,116,242,0.40)",
                                                    transform: "scale(1.08)",
                                                },
                                                "&:active": {
                                                    transform: "scale(0.93)",
                                                    boxShadow: "none",
                                                },
                                                "&.Mui-disabled": {
                                                    background: GLASS_BORDER,
                                                    color: TEXT_SECONDARY,
                                                },
                                            }}
                                        >
                                            <SendIcon sx={{ fontSize: 18 }} />
                                        </IconButton>
                                    </Box>
                                    {/* Hint */}
                                    <Typography fontSize={10} color={TEXT_SECONDARY} sx={{ fontFamily: FONT, opacity: 0.55, mt: 0.6, ml: 0.5 }}>
                                        Press Enter to send · Shift+Enter for new line
                                    </Typography>
                                </Box>
                            </>
                        )
                    }
                </Paper >
            )}
        </>
    );
};

/* ──────────────────────────────────────────────────────────────
   Small helper components (defined after the main export)
   ────────────────────────────────────────────────────────────── */

/* Header icon button wrapper */
const HeaderIconBtn = ({ children, ...props }) => (
    <IconButton
        size="small"
        {...props}
        sx={{
            color: "#fff", opacity: 0.82,
            borderRadius: "8px",
            transition: "all 0.18s",
            "&:hover": { opacity: 1, background: "rgba(255,255,255,0.18)" },
        }}
    >
        {children}
    </IconButton>
);

/* Wrapper for inline input controls (email / textarea) */
const InlineInputBox = ({ children }) => (
    <div className="flex flex-col gap-2.5 mt-2.5 ml-[36px] max-w-[78%]">
        {children}
    </div>
);

/* Inline submit button */
const InlineSubmitBtn = ({ disabled, onClick }) => (
    <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={`self-start px-5 py-1.5 text-xs font-semibold rounded-full transition-all duration-200 shadow-sm ${disabled
            ? "bg-slate-300 dark:bg-slate-700 text-slate-500 dark:text-slate-400 cursor-not-allowed opacity-60 shadow-none"
            : "text-white bg-blue-600 hover:bg-blue-700 active:scale-95 cursor-pointer shadow-blue-500/20"
            }`}
        style={{
            background: disabled ? undefined : `linear-gradient(135deg, ${ACCENT} 0%, #3CBBF2 100%)`,
            fontFamily: FONT,
        }}
    >
        Submit
    </button>
);

/* Thin scrollbar reused on multiple panels */
const scrollbarSx = {
    "&::-webkit-scrollbar": { width: 4 },
    "&::-webkit-scrollbar-track": { background: "transparent" },
    "&::-webkit-scrollbar-thumb": { background: ACCENT_BORDER, borderRadius: 4 },
};

export default ChatbotWidget;
