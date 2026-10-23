import moment from "moment";
import { useContext, useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "../../../components/ui/dialog";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Switch } from "../../../components/ui/switch";
import { Send, Image as ImageIcon, X, Sparkles, Loader2, Compass, AlertCircle, TrendingUp } from "lucide-react";
import { ShadcnDateRangePicker as DateRangePicker } from "../../../components/ui/date-range-picker";
import { ProfileContext } from "../../../helper/usecontext/useContext";
import { Toast } from "../../../helper/links/Link";
import { ApiAIAnalysis } from "../../../api-wrapper/campaign/ApiCampaign";
import { ApiFileUpload } from "../../../api-wrapper/productList/ApiProductList";

const getLast7Days = () => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 7);
    return [start, end];
};

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

const SUGGESTIONS = [
    { label: "Analyze target keywords performance", prompt: "Please analyze the top performing and waste keywords for this campaign." },
    { label: "Find negative keyword candidates", prompt: "Identify search terms that have high spend but zero sales to add as negative keywords." },
    { label: "Suggest budget optimizations", prompt: "How can I optimize this campaign's budget to maximize ROAS?" }
];

export default function AIAnalysisModal({
    showModal,
    hideModal,
    campaign,
    predefinedRanges,
    date
}) {
    const { t } = useTranslation();
    const { profileId } = useContext(ProfileContext);
    const [isDark, setIsDark] = useState(
        document.documentElement.getAttribute("data-theme") === "dark" ||
        document.documentElement.getAttribute("data-theme") === "black"
    );

    useEffect(() => {
        const handle = () => {
            const theme = document.documentElement.getAttribute("data-theme");
            setIsDark(theme === "dark" || theme === "black");
        };
        const observer = new MutationObserver(handle);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        return () => observer.disconnect();
    }, []);

    const [aiModel, setAiModel] = useState("chatgpt");
    const [dateRange, setDateRange] = useState(getLast7Days());
    const [loading, setLoading] = useState(false);
    const [analysisDone, setAnalysisDone] = useState(false);
    const [findNegative, setFindNegative] = useState(false);

    const [messages, setMessages] = useState([]);
    const [inputMessage, setInputMessage] = useState("");
    const [imageFile, setImageFile] = useState(null);

    const validField = aiModel === "chatgpt" ? "content" : "parts";
    const validModel = aiModel === "chatgpt" ? "assistant" : "model";

    const chatRef = useRef(null);

    // Auto-scroll to bottom
    useEffect(() => {
        if (chatRef.current) {
            chatRef.current.scrollTop = chatRef.current.scrollHeight;
        }
    }, [messages]);

    const close = () => {
        setMessages([]);
        setAnalysisDone(false);
        hideModal();
    };

    const pushMessage = async (role, text, imageUrl = null, imageFile) => {
        const content = [];

        if (text) {
            content.push({
                ...(aiModel === "chatgpt" && { type: "text" }),
                text: text
            });
        }

        if (imageUrl) {
            content.push({
                ...(aiModel === "chatgpt" && { type: "image_url" }),
                ...(aiModel === "chatgpt" ? {
                    image_url: { url: imageUrl }
                } : {
                    inline_data: {
                        mime_type: "image/jpeg",
                        data: await fileToBase64(imageFile),
                    }
                }),
            });
        }

        setMessages(prev => [...prev, { role, [validField]: content }]);
        if (role === "user") {
            handleAnalyze([...messages, { role, [validField]: content }]);
        }
    };

    const handleAnalyze = async (msg) => {
        if (!dateRange) return Toast.error(t("Select date range"));

        const startDate = moment(dateRange?.[0]).format("YYYY-MM-DD");
        const endDate = moment(dateRange?.[1]).format("YYYY-MM-DD");

        setLoading(true);
        try {
            const res = await ApiAIAnalysis({
                campaignId: campaign?.campaignId,
                profileId: profileId?.value,
                startDate,
                endDate,
                aiModel,
                findNegative,
                messages: JSON.stringify((msg ?? messages).slice(-3))
            });

            if (res?.isSuccess) {
                pushMessage(validModel, res?.result?.campaignAnalysis?.parsedContent?.html);
                setAnalysisDone(true);
            }
        } catch (err) {
            pushMessage(validModel, "❌ Analysis Failed: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSend = () => {
        if (!inputMessage.trim() && !imageFile) return;
        pushMessage("user", inputMessage, imageFile?.url || null, imageFile?.file);
        setInputMessage("");

        setImageFile(null);
    };

    const runSuggestion = (promptText) => {
        pushMessage("user", promptText, null, null);
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const maxSize = 10 * 1024 * 1024;
        if (file.size > maxSize) {
            Toast.error(t("Maximum file size allowed is 10MB."));
            e.target.value = "";
            return;
        }

        const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/tiff"];
        if (!allowedTypes.includes(file.type)) {
            Toast.error(t("Only jpg, jpeg, gif, png, tiff formats are allowed."));
            e.target.value = "";
            return;
        }

        try {
            const formData = new FormData();
            formData.append("profileId", profileId?.value);
            formData.append("image", file);

            const res = await ApiFileUpload(formData);

            if (res?.isSuccess && res?.data?.image) {
                setImageFile({
                    file,
                    url: res.data.image
                });
            } else {
                Toast.error(res?.message ?? "Invalid file type! Only Images or Excel files allowed.");
            }
        } catch (err) {
            Toast.error(err.message ?? "Invalid file type! Only Images or Excel files allowed.");
        }
    };

    return (
        <Dialog open={showModal} onOpenChange={(isOpen) => { if (!isOpen) close(); }}>
            <DialogContent hideCloseButton={true} staticBackdrop={false} className="sm:max-w-[900px] h-[90vh] flex flex-col p-0 overflow-hidden bg-transparent border-0 shadow-none">

                <div style={{
                    display: "flex", flexDirection: "column", height: "100%", maxHeight: "100vh",
                    background: isDark ? "#0c1222" : "#fff",
                    borderRadius: "20px",
                    border: isDark ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(0,0,0,0.08)",
                    boxShadow: isDark ? "0 25px 50px -12px rgba(0, 0, 0, 0.5)" : "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
                    overflow: "hidden", position: "relative"
                }}>
                    {/* Glow Line Indicator */}
                    <div
                        className="absolute top-0 left-0 right-0 h-[1.5px] pointer-events-none"
                        style={{
                            background: "linear-gradient(90deg, transparent 0%, #1a9fd4 30%, #2374f2 70%, transparent 100%)",
                            opacity: 0.8
                        }}
                    />

                    {/* Header */}
                    <div style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        background: isDark ? "#111827" : "#fff",
                        borderBottom: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid #e5e7eb",
                        padding: "12px 22px"
                    }}>
                        <div className="flex items-center gap-3">
                            <div className="p-1.5 rounded-lg bg-sky-500/10 text-[#1A9FD4] shrink-0 animate-pulse">
                                <Sparkles className="h-4.5 w-4.5" />
                            </div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: isDark ? "#F9FAFB" : "#111827", margin: 0 }}>
                                {t("AI Analysis for")}  <span className="text-[#1A9FD4]">{campaign?.name}</span>
                            </div>
                        </div>
                        <Button variant="ghost" onClick={close} className="p-1.5 h-auto rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors">
                            <X className="h-5 w-5" />
                        </Button>
                    </div>

                    <div className="flex-1 flex flex-col overflow-hidden p-6 gap-5">

                        {/* Toolbar Panel */}
                        <div className="flex flex-wrap justify-between items-center gap-4 p-4 border border-slate-150 dark:border-slate-900 rounded-2xl bg-slate-50 dark:bg-slate-900/40 text-sm">

                            {/* Segmented Model Select */}
                            <div className="flex items-center gap-3">
                                <span className="font-bold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">{t("Model")}:</span>
                                <div className="flex bg-slate-200/60 dark:bg-slate-950 p-0.5 rounded-lg border border-slate-200 dark:border-slate-900">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        disabled={Boolean(messages?.length)}
                                        onClick={() => setAiModel("chatgpt")}
                                        className={`px-3 py-1.5 h-auto text-xs font-semibold rounded-md transition-all ${aiModel === "chatgpt"
                                            ? "bg-white dark:bg-slate-800 text-slate-850 dark:text-white shadow-sm hover:bg-white dark:hover:bg-slate-800"
                                            : "text-slate-500 dark:text-slate-400 hover:text-slate-700 hover:bg-transparent"
                                            }`}
                                    >
                                        {t("ChatGPT")}
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        disabled={Boolean(messages?.length)}
                                        onClick={() => setAiModel("gemini")}
                                        className={`px-3 py-1.5 h-auto text-xs font-semibold rounded-md transition-all ${aiModel === "gemini"
                                            ? "bg-white dark:bg-slate-800 text-slate-850 dark:text-white shadow-sm hover:bg-white dark:hover:bg-slate-800"
                                            : "text-slate-500 dark:text-slate-400 hover:text-slate-700 hover:bg-transparent"
                                            }`}
                                    >
                                        {t("Google AI")}
                                    </Button>
                                </div>
                            </div>

                            {/* Switch for Negative Keyword Find */}
                            <div className="flex items-center gap-2.5">
                                <span className="font-bold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">{t("Negative Scan")}:</span>
                                <div className="flex items-center gap-2">
                                    <Switch
                                        checked={findNegative}
                                        onCheckedChange={setFindNegative}
                                        id="find-negative-switch"
                                    />
                                    <label htmlFor="find-negative-switch" className="text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer">
                                        {findNegative ? t("Enabled") : t("Disabled")}
                                    </label>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">{t("Range")}:</span>
                                <DateRangePicker
                                    className="w-full sm:w-[260px]"
                                    ranges={predefinedRanges}
                                    value={dateRange}
                                    onChange={setDateRange}
                                    format="yyyy-MM-dd"
                                    disabled={Boolean(messages?.length)}
                                    cleanable={false}
                                />
                            </div>
                        </div>

                        {/* Chat and Analysis Panel */}
                        <div
                            className="flex-1 overflow-y-auto p-5 rounded-2xl relative space-y-5"
                            ref={chatRef}
                            style={{ background: isDark ? "rgba(255,255,255,0.01)" : "#fafafa", border: isDark ? "1px solid rgba(255,255,255,0.02)" : "1px solid rgba(0,0,0,0.02)" }}
                        >
                            {/* Empty Chat State - Premium Prompt Screen */}
                            {messages.length === 0 && (
                                <div className="h-full flex flex-col justify-center items-center max-w-xl mx-auto text-center space-y-6 py-6">
                                    <div className="p-4 rounded-full bg-sky-500/10 text-[#1A9FD4] shrink-0 animate-bounce">
                                        <Sparkles className="h-8 w-8" />
                                    </div>
                                    <div className="space-y-2">
                                        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                                            {t("Campaign AI Intelligence")}
                                        </h3>
                                        <p className="text-xs font-medium text-slate-400 dark:text-slate-500">
                                            {t("Select one of the quick suggestions below or write your own message to start analyzing campaign data, budgets, or keywords.")}
                                        </p>
                                    </div>
                                    <div className="w-full space-y-2">
                                        {SUGGESTIONS.map((s, idx) => (
                                            <Button
                                                key={idx}
                                                type="button"
                                                variant="outline"
                                                onClick={() => runSuggestion(s.prompt)}
                                                className="w-full p-3 h-auto rounded-xl border-slate-200/60 dark:border-slate-900 bg-white dark:bg-slate-900 hover:border-[#1A9FD4] dark:hover:border-[#2374F2] text-slate-700 dark:text-slate-300 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-white dark:hover:bg-slate-900 font-semibold text-xs text-left transition-all hover:-translate-y-0.5 hover:shadow-sm focus:outline-none flex items-center justify-between"
                                            >
                                                <span>{t(s.label)}</span>
                                                <Compass className="h-4 w-4 text-[#1A9FD4]" />
                                            </Button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {messages.map((msg, i) => (
                                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                                    <div
                                        className={`p-3.5 rounded-2xl shadow-sm max-w-[80%] leading-relaxed text-sm ${msg.role === "user"
                                            ? "bg-[#1A9FD4] text-white rounded-tr-none font-medium"
                                            : "bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border border-slate-200/60 dark:border-slate-900 rounded-tl-none font-medium shadow-inner"
                                            }`}
                                    >
                                        {msg?.[validField]?.map((c, idx) => (
                                            <div key={idx} className="space-y-2">
                                                {(c.type === "text" || c.text) && (
                                                    <div
                                                        className="word-break-all whitespace-pre-wrap leading-relaxed"
                                                        dangerouslySetInnerHTML={{ __html: c.text }}
                                                    />
                                                )}

                                                {(c.type === "image_url" || c.image_url) && (
                                                    <img
                                                        src={c.image_url.url}
                                                        alt="uploaded"
                                                        className="max-w-[200px] rounded-lg border border-slate-250 dark:border-slate-700 shadow-sm"
                                                    />
                                                )}

                                                {/* Gemini AI Images */}
                                                {(c?.inline_data?.mime_type && c?.inline_data?.data) && (
                                                    <img
                                                        src={`data:${c.inline_data.mime_type};base64,${c.inline_data.data}`}
                                                        alt="uploaded"
                                                        className="max-w-[200px] rounded-lg border border-slate-250 dark:border-slate-700 shadow-sm"
                                                    />
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}

                            {/* LOADER BUBBLE */}
                            {loading && (
                                <div className="flex justify-start">
                                    <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-white dark:bg-slate-900 text-slate-500 border border-slate-200/60 dark:border-slate-900 rounded-tl-none shadow-sm text-sm font-semibold">
                                        <Loader2 className="h-4 w-4 animate-spin text-[#1A9FD4]" />
                                        <span>{t("Analyzing statistics, keyword metrics, and building insights...")}</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Image Preview Area */}
                        {imageFile && (
                            <div className="relative w-28 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 group">
                                <img
                                    src={URL.createObjectURL(imageFile?.file)}
                                    alt="preview"
                                    className="w-full display-block object-cover h-20"
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => setImageFile(null)}
                                    className="absolute top-1 right-1 h-auto w-auto bg-white hover:bg-slate-100 text-slate-650 rounded-full p-0.5 shadow-md focus:outline-none transition-colors"
                                >
                                    <X className="h-4.5 w-4.5 text-red-500" />
                                </Button>
                            </div>
                        )}

                        {/* Chat Input Box */}
                        <div className="p-3 flex gap-3 items-center border border-slate-200 dark:border-slate-900 rounded-2xl bg-slate-50 dark:bg-slate-900/40">
                            <Button
                                type="button"
                                variant="outline"
                                className="h-11 w-11 rounded-xl shrink-0 p-0 border-slate-200 dark:border-slate-800 hover:bg-white dark:hover:bg-slate-900 text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 shadow-sm"
                                onClick={() => document.getElementById("ai-analysis-file-input").click()}
                            >
                                <ImageIcon className="h-5 w-5" />
                            </Button>
                            <Input
                                id="ai-analysis-file-input"
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleFileUpload}
                            />

                            <Input
                                type="text"
                                placeholder={t("Type a message or select a suggestion above...")}
                                className="flex-1 h-11 px-4 rounded-xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus-visible:ring-[#1A9FD4] focus-visible:border-transparent transition-colors text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 shadow-sm"
                                value={inputMessage}
                                onChange={(e) => setInputMessage(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSend();
                                    }
                                }}
                            />

                            <Button
                                type="button"
                                onClick={handleSend}
                                className="h-11 w-11 p-0 rounded-xl bg-[#1A9FD4] hover:bg-[#158cb8] flex items-center justify-center text-white shadow-md border-0 focus:outline-none shrink-0"
                            >
                                <Send className="h-4.5 w-4.5" />
                            </Button>
                        </div>
                    </div>

                </div>
            </DialogContent>
        </Dialog>
    );
}
