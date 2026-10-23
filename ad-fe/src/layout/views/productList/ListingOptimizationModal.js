import React, { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import Toast from "../../../common/helper/toast/Toast";
import { ApiAnalyzeListingWithAI, ApiApplyListingOptimization } from "../../../api-wrapper/productList/ApiListingOptimization";
import "./ListingOptimizationModal.css";
import "./IllustratorLoader.css";
import { AppTooltip } from "../../../components/ui/AppTooltip";

/* ─── tiny helpers ──────────────────────────────────────────── */
const ScoreRing = ({ score }) => {
    const r = 44;
    const circ = 2 * Math.PI * r;
    const offset = circ - (score / 100) * circ;
    const color = score >= 75 ? "#10b981" : score >= 50 ? "#f59e0b" : "#ef4444";
    return (
        <svg width="110" height="110" className="lom-ring">
            <circle cx="55" cy="55" r={r} fill="none" stroke="#e2e8f0" strokeWidth="8" />
            <circle
                cx="55" cy="55" r={r} fill="none"
                stroke={color} strokeWidth="8"
                strokeDasharray={circ} strokeDashoffset={offset}
                strokeLinecap="round"
                transform="rotate(-90 55 55)"
                style={{ transition: "stroke-dashoffset 1s ease" }}
            />
            <text x="55" y="50" textAnchor="middle" dominantBaseline="middle"
                fill={color} fontSize="20" fontWeight="700">{score}</text>
            <text x="55" y="67" textAnchor="middle" dominantBaseline="middle"
                fill="#94a3b8" fontSize="10">/ 100</text>
        </svg>
    );
};

const MiniBar = ({ label, score, icon }) => {
    const color = score >= 75 ? "#10b981" : score >= 50 ? "#f59e0b" : "#ef4444";
    return (
        <div className="lom-minibar">
            <span className="lom-minibar-label">{icon} {label}</span>
            <div className="lom-minibar-track">
                <div className="lom-minibar-fill" style={{ width: `${score}%`, background: color }} />
            </div>
            <span className="lom-minibar-score" style={{ color }}>{score}</span>
        </div>
    );
};

const SeverityBadge = ({ level }) => {
    const { t } = useTranslation();
    const map = {
        critical: { bg: "var(--lom-danger-bg)", color: "var(--lom-danger-text)", border: "var(--lom-danger-border)", label: t("Critical") },
        medium: { bg: "var(--lom-warning-bg)", color: "var(--lom-warning-text)", border: "var(--lom-warning-border)", label: t("Medium") },
        low: { bg: "var(--lom-success-bg)", color: "var(--lom-success-text)", border: "var(--lom-success-border)", label: t("Low") },
    };
    const s = map[level] || map.low;
    return (
        <span className="lom-severity" style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
            {s.label}
        </span>
    );
};

const MetricCard = ({ label, score, icon }) => {
    let scoreColor = "text-emerald-500 bg-emerald-500/10";
    let progressBg = "bg-emerald-500";
    if (score < 40) {
        scoreColor = "text-rose-500 bg-rose-500/10";
        progressBg = "bg-rose-500";
    } else if (score < 80) {
        scoreColor = "text-amber-500 bg-amber-500/10";
        progressBg = "bg-amber-500";
    }

    return (
        <div className="p-4 bg-white dark:bg-slate-900/40 border border-slate-200/60 dark:border-white/5 rounded-xl flex flex-col justify-between hover:shadow-sm transition-all duration-300 text-left">
            <div className="flex items-center justify-between mb-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400`}>
                    <i className={icon} />
                </div>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${scoreColor}`}>{score}</span>
            </div>
            <div>
                <div className="text-xs font-bold text-slate-800 dark:text-white mb-1.5">{label}</div>
                <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className={`h-full ${progressBg} rounded-full`} style={{ width: `${score}%` }} />
                </div>
            </div>
        </div>
    );
};

const DiagnosticCard = ({ label, score, icon, issues = [], tips = [] }) => {
    const { t } = useTranslation();
    return (
        <div className="p-4 bg-white dark:bg-slate-900/40 border border-slate-200/60 dark:border-white/5 rounded-xl flex flex-col justify-between hover:shadow-sm transition-all duration-300">
            <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/5 mb-3">
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center text-xs">
                            <i className={icon} />
                        </div>
                        <span className="text-xs font-bold text-slate-800 dark:text-white">{label}</span>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        score === 100 ? 'bg-emerald-500/10 text-emerald-500' :
                        score >= 85 ? 'bg-blue-500/10 text-blue-500' :
                        score >= 40 ? 'bg-amber-500/10 text-amber-500' :
                        'bg-rose-500/10 text-rose-500'
                    }`}>
                        {score}/100
                    </span>
                </div>
                <div className="flex flex-col gap-2.5">
                    {issues.length > 0 ? (
                        issues.map((iss, idx) => (
                            <div key={idx} className="flex items-start gap-2 text-left">
                                <i className={`fas fa-exclamation-circle text-[10px] mt-0.5 shrink-0 ${
                                    iss.level?.toLowerCase() === 'critical' ? 'text-rose-500' : 'text-amber-500'
                                }`} />
                                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium leading-normal">{iss.text}</span>
                            </div>
                        ))
                    ) : (
                        <div className="flex items-center gap-2 text-emerald-500 text-[11px] font-semibold py-1 text-left">
                            <i className="fas fa-check-circle text-xs shrink-0" /> {t("Optimized & guidelines compliant.")}
                        </div>
                    )}
                    {tips && tips.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-slate-100 dark:border-white/5 flex flex-col gap-1.5">
                            <div className="text-[9px] font-bold uppercase tracking-wider text-purple-500 text-left">{t("Optimization tips")}</div>
                            {tips.map((tip, idx) => (
                                <div key={idx} className="flex items-center gap-1.5 text-left">
                                    <i className="fas fa-lightbulb text-[9px] text-purple-500 shrink-0" />
                                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">{tip}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const DiffField = ({ label, tooltip, original, suggested, accepted, onToggle, onChange, maxLen }) => {
    const { t } = useTranslation();
    const [showCurrent, setShowCurrent] = useState(false);

    return (
        <div className={`p-5 bg-white dark:bg-slate-900/40 border rounded-2xl transition-all duration-300 ${
            accepted 
                ? 'border-[var(--accent-primary)] shadow-sm shadow-[var(--accent-glow)]' 
                : 'border-slate-200 dark:border-white/5'
        }`}>
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/5 mb-4">
                <span className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                    {label}
                    {tooltip && (
                        <AppTooltip text={tooltip} placement="top" arrow>
                            <i className="fa fa-info-circle text-slate-400 cursor-help text-xs"></i>
                        </AppTooltip>
                    )}
                </span>
                <button
                    className={`text-xs font-bold px-3 py-1.5 rounded-xl transition-all duration-200 flex items-center gap-1.5 ${
                        accepted
                            ? 'bg-[var(--accent-primary)] text-white shadow-xs'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                    onClick={onToggle}
                >
                    {accepted ? <><i className="fas fa-check-circle" /> {t("Accepted")}</> : <><i className="far fa-circle" /> {t("Accept Suggestion")}</>}
                </button>
            </div>

            {/* Content Field */}
            <div className="flex flex-col gap-3">
                <div className="relative text-left">
                    <div className="text-[10px] font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase mb-1.5">{t("Optimization Workspace")}</div>
                    <textarea
                        value={suggested}
                        onChange={(e) => onChange(e.target.value)}
                        rows={label?.props?.children?.includes?.("Title") || (typeof label === "string" && label.includes("Title")) ? 3 : label === "Description" ? 8 : 4}
                        maxLength={maxLen}
                        className="w-full p-3.5 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-white/5 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-200 focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)] outline-none resize-none transition-colors"
                    />
                    {maxLen && (
                        <div className="absolute right-3.5 bottom-3.5 text-[10px] font-bold text-slate-400 dark:text-slate-500 bg-white/80 dark:bg-slate-900/80 px-1.5 py-0.5 rounded">
                            {suggested?.length || 0} / {maxLen}
                        </div>
                    )}
                </div>

                {/* Original View Drawer */}
                <div className="border-t border-slate-100 dark:border-white/5 pt-2 text-left">
                    <button
                        onClick={() => setShowCurrent(!showCurrent)}
                        className="text-[10px] font-bold text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-350 flex items-center gap-1 transition-colors"
                    >
                        <i className={`fas ${showCurrent ? 'fa-chevron-down' : 'fa-chevron-right'} text-[8px]`} />
                        {showCurrent ? t('Hide Original Version') : t('Compare with Original Version')}
                    </button>
                    {showCurrent && (
                        <div className="mt-2.5 p-3.5 bg-slate-50/50 dark:bg-slate-950/20 border border-slate-200/40 dark:border-white/5 rounded-xl text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
                            {original || <em className="text-slate-400 dark:text-slate-600">{t("Not set")}</em>}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const BulletDiffField = ({ bullets, originalBullets, accepted, selectedBullets, onToggle, onToggleBullet, onSelectAll, onDeselectAll, onChange }) => {
    const { t } = useTranslation();
    const selectedCount = selectedBullets.filter(s => s).length;
    const totalCount = bullets.length;
    const [showOriginals, setShowOriginals] = useState({});

    const toggleOriginal = (idx) => {
        setShowOriginals(prev => ({ ...prev, [idx]: !prev[idx] }));
    };

    return (
        <div className={`p-5 bg-white dark:bg-slate-900/40 border rounded-2xl transition-all duration-300 ${
            accepted 
                ? 'border-[var(--accent-primary)] shadow-sm shadow-[var(--accent-glow)]' 
                : 'border-slate-200 dark:border-white/5'
        }`}>
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 dark:border-white/5 mb-4 gap-3">
                <span className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                    <i className="fas fa-list-ul"></i> {t("Bullet Points")}
                    {selectedCount > 0 && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50/50 dark:bg-indigo-950/40 text-indigo-650 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/20">
                            {t("{{selected}} / {{total}} Selected", { selected: selectedCount, total: totalCount })}
                        </span>
                    )}
                </span>
                <div className="flex items-center gap-2 self-end sm:self-auto">
                    {selectedCount < totalCount && (
                        <button
                            className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                            onClick={onSelectAll}
                        >
                            {t("Select All")}
                        </button>
                    )}
                    {selectedCount > 0 && (
                        <button
                            className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                            onClick={onDeselectAll}
                        >
                            {t("Deselect All")}
                        </button>
                    )}
                    <button
                        className={`text-xs font-bold px-3 py-1.5 rounded-xl transition-all duration-200 flex items-center gap-1.5 ${
                            accepted
                                ? 'bg-[var(--accent-primary)] text-white shadow-xs'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-250 dark:hover:bg-slate-700'
                        }`}
                        onClick={onToggle}
                    >
                        {accepted ? <><i className="fas fa-check-circle" /> {t("Accepted")}</> : <><i className="far fa-circle" /> {t("Accept Suggestion")}</>}
                    </button>
                </div>
            </div>

            {/* List of Bullets */}
            <div className="flex flex-col gap-4">
                {bullets.map((b, i) => (
                    <div key={i} className="flex gap-3.5 p-3.5 bg-slate-50/50 dark:bg-slate-900/20 border border-slate-200/40 dark:border-white/5 rounded-xl items-start">
                        {/* Checkbox */}
                        <div className="pt-1.5">
                            <input
                                type="checkbox"
                                checked={selectedBullets && selectedBullets[i]}
                                onChange={() => onToggleBullet(i)}
                                className="w-4 h-4 rounded border-slate-350 text-[var(--accent-primary)] focus:ring-[var(--accent-primary)] cursor-pointer"
                                id={`bullet-${i}`}
                            />
                        </div>
                        {/* Workspace / Editor */}
                        <div className="flex-1 flex flex-col gap-2 text-left">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">{t("Bullet Point #{{number}}", { number: i + 1 })}</span>
                                <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500">{b?.length || 0} / 500</span>
                            </div>
                            <textarea
                                value={b}
                                onChange={(e) => onChange(i, e.target.value)}
                                rows={3}
                                maxLength={500}
                                className="w-full p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-lg text-xs text-slate-850 dark:text-slate-200 focus:border-[var(--accent-primary)] outline-none resize-none transition-colors"
                            />
                            {/* Original Value View */}
                            <div className="pt-1">
                                <button 
                                    onClick={() => toggleOriginal(i)}
                                    className="text-[9px] font-bold text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 flex items-center gap-1 transition-colors"
                                >
                                    <i className={`fas ${showOriginals[i] ? 'fa-chevron-down' : 'fa-chevron-right'} text-[7px]`} />
                                    {showOriginals[i] ? t('Hide Original Bullet') : t('Compare with Original Bullet')}
                                </button>
                                {showOriginals[i] && (
                                    <div className="mt-2 p-3 bg-white dark:bg-slate-950/20 border border-slate-200/40 dark:border-white/5 rounded-lg text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
                                        {originalBullets?.[i] || <em className="text-slate-400 dark:text-slate-650">{t("Not set")}</em>}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const KeywordsChipsField = ({ label, tooltip, original, suggestedKeywordsArray, selectedKeywords, onToggleKeyword, onSelectAllKeywords, onDeselectAllKeywords, accepted, onToggle, maxLen }) => {
    const { t } = useTranslation();
    const selectedCount = selectedKeywords.filter(s => s).length;
    const totalCount = suggestedKeywordsArray.length;
    const [showCurrent, setShowCurrent] = useState(false);

    return (
        <div className={`p-5 bg-white dark:bg-slate-900/40 border rounded-2xl transition-all duration-300 ${
            accepted 
                ? 'border-[var(--accent-primary)] shadow-sm shadow-[var(--accent-glow)]' 
                : 'border-slate-200 dark:border-white/5'
        }`}>
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 dark:border-white/5 mb-4 gap-3">
                <span className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                    {label}
                    {tooltip && (
                        <AppTooltip text={tooltip} placement="top" arrow>
                            <i className="fa fa-info-circle text-slate-400 cursor-help text-xs"></i>
                        </AppTooltip>
                    )}
                    {selectedCount > 0 && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-650 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/20">
                            {t("{{selected}} / {{total}} Selected", { selected: selectedCount, total: totalCount })}
                        </span>
                    )}
                </span>
                <div className="flex items-center gap-2 self-end sm:self-auto">
                    {selectedCount < totalCount && totalCount > 0 && (
                        <button
                            className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                            onClick={onSelectAllKeywords}
                        >
                            {t("Select All")}
                        </button>
                    )}
                    {selectedCount > 0 && (
                        <button
                            className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                            onClick={onDeselectAllKeywords}
                        >
                            {t("Deselect All")}
                        </button>
                    )}
                    <button
                        className={`text-xs font-bold px-3 py-1.5 rounded-xl transition-all duration-200 flex items-center gap-1.5 ${
                            accepted
                                ? 'bg-[var(--accent-primary)] text-white shadow-xs'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-250 dark:hover:bg-slate-700'
                        }`}
                        onClick={onToggle}
                    >
                        {accepted ? <><i className="fas fa-check-circle" /> {t("Accepted")}</> : <><i className="far fa-circle" /> {t("Accept Suggestion")}</>}
                    </button>
                </div>
            </div>

            {/* Keywords Selector Area */}
            <div className="flex flex-col gap-3">
                <div className="text-[10px] font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase mb-1 text-left font-semibold">{t("Select keywords to sync")}</div>
                <div className="flex flex-wrap gap-2 p-3.5 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-white/5 rounded-xl min-h-[80px]">
                    {suggestedKeywordsArray.map((chip, idx) => (
                        <div key={idx} className="relative">
                            <input
                                type="checkbox"
                                id={`keyword-${idx}`}
                                checked={selectedKeywords[idx]}
                                onChange={() => onToggleKeyword(idx)}
                                className="sr-only peer"
                            />
                            <label
                                htmlFor={`keyword-${idx}`}
                                className="inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer transition-all duration-200 select-none peer-checked:bg-[var(--accent-primary)] peer-checked:text-white peer-checked:border-[var(--accent-primary)] bg-white dark:bg-slate-900 border-slate-200 dark:border-white/10 text-slate-705 dark:text-slate-300 hover:border-slate-350 dark:hover:border-white/20"
                            >
                                {chip}
                            </label>
                        </div>
                    ))}
                    {suggestedKeywordsArray.length === 0 && <em className="text-slate-400">{t("No keyword suggestions generated")}</em>}
                </div>

                {/* Original View Drawer */}
                <div className="border-t border-slate-100 dark:border-white/5 pt-2 text-left">
                    <button
                        onClick={() => setShowCurrent(!showCurrent)}
                        className="text-[10px] font-bold text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-350 flex items-center gap-1 transition-colors"
                    >
                        <i className={`fas ${showCurrent ? 'fa-chevron-down' : 'fa-chevron-right'} text-[8px]`} />
                        {showCurrent ? t('Hide Original Version') : t('Compare with Original Version')}
                    </button>
                    {showCurrent && (
                        <div className="mt-2.5 p-3.5 bg-slate-50/50 dark:bg-slate-950/20 border border-slate-200/40 dark:border-white/5 rounded-xl text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
                            {original && original.length > 0 ? original.join(', ') : <em className="text-slate-400 dark:text-slate-600">{t("Not set")}</em>}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const AnalysisSkeleton = ({ product, analyzeContent = true, analyzeImage = false }) => {
    const { t } = useTranslation();
    let statusText = t("Scanning title, bullets, and images...");
    if (analyzeContent && !analyzeImage) {
        statusText = t("Scanning title, bullets, description, and keywords...");
    } else if (!analyzeContent && analyzeImage) {
        statusText = t("Analyzing product images...");
    }

    return (
        <div className="lom-skeleton-wrap">
            <div className="lom-skeleton-container">
                <div className="lom-skeleton-scanner" />
                <div className="lom-sk-header">
                    <div className="lom-sk-img-wrap">
                        {product?.imageURL ? (
                            <img src={product.imageURL} alt="scanning" className="lom-sk-real-img" />
                        ) : (
                            <div className="lom-sk-img" />
                        )}
                    </div>
                    <div className="lom-sk-title">
                        <div className="lom-sk-real-title">{product?.itemName || t("Analyzing Product List...")}</div>
                        <div className="lom-sk-line-sm" />
                    </div>
                </div>
                <div className="lom-sk-body">
                    <div className="lom-sk-row w-full" />
                    <div className="lom-sk-row w-90" />
                    <div className="lom-sk-row w-80" />
                    <div className="lom-sk-row w-full" />
                    <div className="lom-sk-row w-70" />
                </div>
            </div>
            <div className="lom-ai-text">{t("AI is analyzing your listing...")}</div>
            <div className="lom-ai-status">{statusText}</div>
        </div>
    );
};

const getSteps = (t) => [
    <><i className="fas fa-chart-bar mr-2"></i>{t("Analysis")}</>,
    <><i className="fas fa-edit mr-2"></i>{t("Review & Edit")}</>,
    <><i className="fas fa-cloud-upload-alt mr-2"></i>{t("Apply to Amazon")}</>
];

export default function ListingOptimizationModal({ show, onClose, product, profileId, onSuccess }) {
    const { t } = useTranslation();
    const STEPS = getSteps(t);
    const [step, setStep] = useState(0);
    const [loading, setLoading] = useState(false);
    const [applying, setApplying] = useState(false);
    const [result, setResult] = useState(null);
    const [fromCache, setFromCache] = useState(false);

    // Toggles for what to analyze
    const [analyzeContent, setAnalyzeContent] = useState(true);
    const [analyzeImage, setAnalyzeImage] = useState(false);

    // Editable fields
    const [editTitle, setEditTitle] = useState("");
    const [editBullets, setEditBullets] = useState(["", "", "", "", ""]);
    const [editDescription, setEditDescription] = useState("");
    const [editKeywordsArray, setEditKeywordsArray] = useState([]); // Store as array

    // Accept toggles for whole sections
    const [acceptTitle, setAcceptTitle] = useState(false);
    const [acceptBullets, setAcceptBullets] = useState(false);
    const [acceptDescription, setAcceptDescription] = useState(false);
    const [acceptKeywords, setAcceptKeywords] = useState(false);
    const [activeReviewTab, setActiveReviewTab] = useState("title");

    // Individual selections for bullets (array of booleans)
    const [selectedBullets, setSelectedBullets] = useState([false, false, false, false, false]);

    // Individual selections for keywords (array of booleans)
    const [selectedKeywords, setSelectedKeywords] = useState([]);

    const [relatedSkus, setRelatedSkus] = useState([]);
    const [showNotices, setShowNotices] = useState(false);

    const resetAll = () => {
        setStep(0); setResult(null); setLoading(false); setFromCache(false);
        setAcceptTitle(false); setAcceptBullets(false);
        setAcceptDescription(false); setAcceptKeywords(false);
        setActiveReviewTab("title");
        setSelectedBullets([false, false, false, false, false]);
        setSelectedKeywords([]);
        setEditKeywordsArray([]);
        setRelatedSkus([]);
        setShowNotices(false);
        setAnalyzeContent(true);
        setAnalyzeImage(false);
    };

    const handleClose = () => { resetAll(); onClose(); };

    const runAnalysis = useCallback(async (force = false) => {
        setLoading(true);
        try {
            const res = await ApiAnalyzeListingWithAI({
                profileId,
                sku: product?.sku,
                forceRefresh: force,
                analyzeContent,
                analyzeImage
            });
            if (res?.isSuccess) {
                const d = res.data;
                setResult(d);
                setFromCache(!!res.fromCache);
                setRelatedSkus(d?.relatedSkus || []);
                setEditTitle(d?.titleAnalysis?.optimized || "");
                setEditBullets(d?.bulletAnalysis?.optimized || ["", "", "", "", ""]);
                setEditDescription(d?.descriptionAnalysis?.optimized || "");

                // Handle keywords as array split by space
                const keywordsStr = d?.backendKeywordsAnalysis?.optimized || "";
                const keywordsArray = keywordsStr ? keywordsStr.split(',').map(k => k.trim()).filter(k => k) : [];
                setEditKeywordsArray(keywordsArray);

                // Initialize selected arrays
                const bulletCount = (d?.bulletAnalysis?.optimized || ["", "", "", "", ""]).length;
                setSelectedBullets(new Array(bulletCount).fill(false));

                setSelectedKeywords(new Array(keywordsArray.length).fill(false));

                setStep(1);
            } else {
                Toast.error(res?.message || t("AI analysis failed. Please try again."));
            }
        } catch {
            Toast.error(t("Something went wrong during analysis."));
        } finally {
            setLoading(false);
        }
    }, [product, profileId, analyzeContent, analyzeImage]);

    // Toggle individual bullet selection
    const toggleBullet = (index) => {
        const newSelected = [...selectedBullets];
        newSelected[index] = !newSelected[index];
        setSelectedBullets(newSelected);

        // If any bullet is selected, auto-accept the bullet section flag
        if (newSelected.some(v => v) && !acceptBullets) {
            setAcceptBullets(true);
        } else if (!newSelected.some(v => v) && acceptBullets) {
            setAcceptBullets(false);
        }
    };

    // Select all bullets
    const selectAllBullets = () => {
        const newSelected = new Array(selectedBullets.length).fill(true);
        setSelectedBullets(newSelected);
        if (!acceptBullets) {
            setAcceptBullets(true);
        }
    };

    // Deselect all bullets
    const deselectAllBullets = () => {
        const newSelected = new Array(selectedBullets.length).fill(false);
        setSelectedBullets(newSelected);
        if (acceptBullets) {
            setAcceptBullets(false);
        }
    };

    // Toggle individual keyword selection
    const toggleKeyword = (index, value) => {
        if (index === 'update') {
            // Handle array update from textarea
            setEditKeywordsArray(value);
            setSelectedKeywords(new Array(value.length).fill(false));
            return;
        }

        const newSelected = [...selectedKeywords];
        newSelected[index] = !newSelected[index];
        setSelectedKeywords(newSelected);

        // If any keyword is selected, auto-accept the keyword section flag
        if (newSelected.some(v => v) && !acceptKeywords) {
            setAcceptKeywords(true);
        } else if (!newSelected.some(v => v) && acceptKeywords) {
            setAcceptKeywords(false);
        }
    };

    // Select all keywords
    const selectAllKeywords = () => {
        const newSelected = new Array(selectedKeywords.length).fill(true);
        setSelectedKeywords(newSelected);
        if (!acceptKeywords) {
            setAcceptKeywords(true);
        }
    };

    // Deselect all keywords
    const deselectAllKeywords = () => {
        const newSelected = new Array(selectedKeywords.length).fill(false);
        setSelectedKeywords(newSelected);
        if (acceptKeywords) {
            setAcceptKeywords(false);
        }
    };

    // Get selected bullet points for API
    const getSelectedBullets = () => {
        return editBullets.filter((_, idx) => selectedBullets[idx]);
    };

    // Get selected keywords for API (as space-separated string)
    const getSelectedKeywords = () => {
        return editKeywordsArray.filter((_, idx) => selectedKeywords[idx]).join(', ');
    };

    const applyToAmazon = async () => {
        const payload = {};

        if (acceptTitle) payload.title = editTitle;

        if (acceptBullets && selectedBullets.some(v => v)) {
            payload.bulletPoints = getSelectedBullets();
        }

        if (acceptDescription) payload.description = editDescription;

        if (acceptKeywords && selectedKeywords.some(v => v)) {
            payload.backendKeywords = getSelectedKeywords();
        }

        if (!Object.keys(payload).length) {
            Toast.error(t("Please select at least one suggestion before applying."));
            return;
        }

        setApplying(true);
        try {
            const res = await ApiApplyListingOptimization({
                profileId,
                sku: product?.sku,
                applyToAllSkus: true,
                ...payload,
            });
            if (res?.isSuccess) {
                Toast.success(res.message || t("Listing updated on Amazon successfully!"));
                if (onSuccess) onSuccess();
                handleClose();
            } else {
                Toast.error(res?.message || t("Failed to apply changes to Amazon."));
            }
        } catch {
            Toast.error(t("Something went wrong while applying."));
        } finally {
            setApplying(false);
        }
    };

    // Check if any item is selected for update
    const hasAnySelected = acceptTitle ||
        (acceptBullets && selectedBullets.some(v => v)) ||
        acceptDescription ||
        (acceptKeywords && selectedKeywords.some(v => v));

    // Tooltip message for apply button
    const getApplyTooltip = () => {
        const selectedItems = [];
        if (acceptTitle) selectedItems.push(t("Title"));
        if (acceptBullets && selectedBullets.some(v => v)) {
            const count = selectedBullets.filter(v => v).length;
            selectedItems.push(t("Bullet Points ({{count}} selected)", { count }));
        }
        if (acceptDescription) selectedItems.push(t("Description"));
        if (acceptKeywords && selectedKeywords.some(v => v)) {
            const count = selectedKeywords.filter(v => v).length;
            selectedItems.push(t("Keywords ({{count}} selected)", { count }));
        }

        if (selectedItems.length === 0) {
            return t("Please select at least one item to update");
        }

        return t("Only selected items will be updated on Amazon: {{items}}", { items: selectedItems.join(", ") });
    };

    const getSeverity = (score) => score < 40 ? 'critical' : score < 70 ? 'medium' : 'low';
    const showImageAnalysis = result && result.analyzeImage !== false && result.imageAnalysis?.tips?.[0] !== "Image analysis was skipped.";
    const issues = result ? [
        ...(result.titleAnalysis?.issues || []).map(i => ({ text: i, level: getSeverity(result.titleAnalysis?.score), section: "Title" })),
        ...(result.bulletAnalysis?.issues || []).map(i => ({ text: i, level: getSeverity(result.bulletAnalysis?.score), section: "Bullets" })),
        ...(result.descriptionAnalysis?.issues || []).map(i => ({ text: i, level: getSeverity(result.descriptionAnalysis?.score), section: "Description" })),
        ...(result.backendKeywordsAnalysis?.issues || []).map(i => ({ text: i, level: getSeverity(result.backendKeywordsAnalysis?.score), section: "Keywords" })),
        ...(showImageAnalysis ? (result.imageAnalysis?.issues || []) : []).map(i => ({ text: i, level: "low", section: "Image" })),
    ] : [];

    // Get original keywords array for display
    const getOriginalKeywordsArray = () => {
        const originalStr = result?.backendKeywordsAnalysis?.current || "";
        return originalStr ? originalStr.split(',').map(k => k.trim()).filter(k => k) : [];
    };

    return (
        <Dialog open={show} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-[1000px] premium-modal modal-content p-0 flex flex-col max-h-[90vh] overflow-hidden gap-0 bg-white dark:bg-[#0f172a] border-slate-200 dark:border-white/10 shadow-2xl">
            <DialogHeader className="modal-header border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/50 flex flex-row items-center justify-between p-4 px-6 shrink-0 m-0">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[var(--accent-primary)]/10 dark:bg-[var(--accent-primary)]/20 flex items-center justify-center text-[var(--accent-primary)]">
                        <i className="fas fa-brain text-lg" />
                    </div>
                    <div>
                        <DialogTitle className="text-lg font-bold text-slate-900 dark:text-white m-0">
                            {t("AI Listing Optimizer")}
                        </DialogTitle>
                        <p className="text-sm text-slate-500 dark:text-slate-400 m-0">
                            {product?.itemName?.substring(0, 55) || t("Product")}{product?.itemName?.length > 55 ? "…" : ""}
                        </p>
                    </div>
                </div>
            </DialogHeader>

            <div className="lom-stepper">
                {STEPS.map((s, i) => (
                    <React.Fragment key={i}>
                        <div className={`lom-step ${i < step ? "done" : i === step ? "active" : ""}`}>
                            <div className="lom-step-circle">
                                {i < step ? "✓" : i + 1}
                            </div>
                            <span>{s}</span>
                        </div>
                        {i < STEPS.length - 1 && <div className={`lom-step-line ${i < step ? "done" : ""}`} />}
                    </React.Fragment>
                ))}
            </div>

            <div className="lom-body">

                {step === 0 && !loading && (
                    <div className="lom-launch-v2 p-2 flex flex-col md:flex-row gap-6">
                        {/* Left Side: Product Focus Details */}
                        <div className="flex-1 flex flex-col justify-between bg-slate-50/50 dark:bg-slate-900/30 border border-slate-200/50 dark:border-white/5 rounded-2xl p-5">
                            <div>
                                <div className="text-[10px] font-bold tracking-widest text-slate-400 dark:text-slate-500 uppercase mb-4 text-left">{t("Target Listing")}</div>
                                {product && (
                                    <div className="flex flex-col gap-4">
                                        <div className="relative w-full aspect-video rounded-xl bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-white/5 overflow-hidden flex items-center justify-center p-4 group">
                                            {product.imageURL ? (
                                                <img src={product.imageURL} alt="product" className="max-h-full max-w-full object-contain transition-transform duration-300 group-hover:scale-105" />
                                            ) : (
                                                <i className="fas fa-box text-5xl text-slate-300 dark:text-slate-700" />
                                            )}
                                            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-3">
                                                <span className="text-white text-xs font-medium">{t("ASIN:")} {product.asin}</span>
                                            </div>
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-bold text-slate-800 dark:text-white line-clamp-2 leading-snug mb-2 text-left">{product.itemName}</h4>
                                            <div className="flex flex-wrap gap-2 mt-2">
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/20">{t("SKU:")} {product.sku}</span>
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/20">{t("ASIN:")} {product.asin}</span>
                                                {product.classificationRank > 0 && (
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/20">{t("BSR:")} #{product.classificationRank?.toLocaleString()}</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="mt-6 pt-4 border-t border-slate-200/50 dark:border-white/5 flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-orange-50 dark:bg-orange-950/30 text-orange-500 flex items-center justify-center text-sm shrink-0">
                                    <i className="fas fa-magic" />
                                </div>
                                <p className="text-xs text-slate-500 dark:text-slate-400 m-0 leading-normal text-left">
                                    {t("AI will run composite scans across copywriting quality, backend indexing, and guidelines.")}
                                </p>
                            </div>
                        </div>

                        {/* Right Side: Engine Config & Action */}
                        <div className="flex-1 flex flex-col justify-between gap-6">
                            <div>
                                <div className="text-[10px] font-bold tracking-widest text-slate-400 dark:text-slate-500 uppercase mb-4 text-left">{t("Choose Optimization Modules")}</div>
                                <div className="flex flex-col gap-4">
                                    {/* Option 1: Listing Content */}
                                    <div 
                                        onClick={() => setAnalyzeContent(!analyzeContent)}
                                        className={`group cursor-pointer flex items-center justify-between gap-4 p-4 rounded-xl border transition-all duration-300 ${
                                            analyzeContent 
                                                ? 'bg-[var(--accent-primary-bg)] border-[var(--accent-primary)] shadow-sm' 
                                                : 'bg-white dark:bg-slate-900/40 border-slate-200 dark:border-white/5 hover:border-slate-300 dark:hover:border-white/10'
                                        }`}
                                    >
                                        <div className="flex items-start gap-4 flex-1">
                                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-base shrink-0 transition-colors ${
                                                analyzeContent 
                                                    ? 'bg-[var(--accent-primary)] text-white' 
                                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 group-hover:bg-slate-200 dark:group-hover:bg-slate-700'
                                            }`}>
                                                <i className="fas fa-file-alt" />
                                            </div>
                                            <div className="flex-1 text-left">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-bold text-slate-800 dark:text-white">{t("Copywriting & SEO")}</span>
                                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-900/20">Gemini 2.5</span>
                                                </div>
                                                <p className="text-xs text-slate-500 dark:text-slate-400 m-0 mt-1 leading-normal">
                                                    {t("Audit Title, Bullet Points, Product Description, and backend Keywords for indexing.")}
                                                </p>
                                            </div>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer shrink-0 pointer-events-none">
                                            <input 
                                                type="checkbox" 
                                                className="sr-only peer" 
                                                checked={analyzeContent}
                                                readOnly
                                            />
                                            <div className="w-9 h-5 bg-slate-200 dark:bg-slate-700 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-slate-600 peer-checked:bg-[var(--accent-primary)]"></div>
                                        </label>
                                    </div>

                                    {/* Option 2: Image Quality */}
                                    <div 
                                        onClick={() => setAnalyzeImage(!analyzeImage)}
                                        className={`group cursor-pointer flex items-center justify-between gap-4 p-4 rounded-xl border transition-all duration-300 ${
                                            analyzeImage 
                                                ? 'bg-[var(--accent-primary-bg)] border-[var(--accent-primary)] shadow-sm' 
                                                : 'bg-white dark:bg-slate-900/40 border-slate-200 dark:border-white/5 hover:border-slate-300 dark:hover:border-white/10'
                                        }`}
                                    >
                                        <div className="flex items-start gap-4 flex-1">
                                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-base shrink-0 transition-colors ${
                                                analyzeImage 
                                                    ? 'bg-[var(--accent-primary)] text-white' 
                                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 group-hover:bg-slate-200 dark:group-hover:bg-slate-700'
                                            }`}>
                                                <i className="fas fa-image" />
                                            </div>
                                            <div className="flex-1 text-left">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-bold text-slate-800 dark:text-white">{t("Image Compliance")}</span>
                                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/20">GPT-4o-mini</span>
                                                </div>
                                                <p className="text-xs text-slate-500 dark:text-slate-400 m-0 mt-1 leading-normal">
                                                    {t("Evaluate main product image against strict Amazon guidelines (pure background, text-free).")}
                                                </p>
                                            </div>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer shrink-0 pointer-events-none">
                                            <input 
                                                type="checkbox" 
                                                className="sr-only peer" 
                                                checked={analyzeImage}
                                                readOnly
                                            />
                                            <div className="w-9 h-5 bg-slate-200 dark:bg-slate-700 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-slate-600 peer-checked:bg-[var(--accent-primary)]"></div>
                                        </label>
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col gap-3">
                                <button 
                                    className={`w-full py-3 px-6 rounded-xl font-bold text-sm transition-all duration-300 flex items-center justify-center gap-2 text-white ${
                                        (analyzeContent || analyzeImage)
                                            ? 'bg-[var(--accent-primary)] hover:opacity-90 active:scale-[0.98] shadow-md shadow-[var(--accent-glow)]'
                                            : 'bg-slate-300 dark:bg-slate-700 cursor-not-allowed opacity-50'
                                    }`}
                                    disabled={!analyzeContent && !analyzeImage}
                                    onClick={() => (analyzeContent || analyzeImage) && runAnalysis(false)}
                                >
                                    <i className="fas fa-bolt" /> {t("Launch AI Optimization")}
                                </button>
                                {!analyzeContent && !analyzeImage && (
                                    <div className="text-xs text-rose-500 font-medium text-center">
                                        {t("Please select at least one optimization module to start.")}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {loading && <AnalysisSkeleton product={product} analyzeContent={analyzeContent} analyzeImage={analyzeImage} />}

                {step === 1 && result && !loading && (
                    <div className="lom-results-v2 p-2 flex flex-col lg:flex-row gap-6">
                        {/* Left Column: Health Score Overview & Price Positioning */}
                        <div className="w-full lg:w-[300px] flex flex-col gap-6 shrink-0">
                            {/* Health Card */}
                            <div className="flex flex-col items-center justify-center p-6 bg-slate-50/50 dark:bg-slate-900/30 border border-slate-200/50 dark:border-white/5 rounded-2xl shadow-xs">
                                <div className="text-[10px] font-bold tracking-widest text-slate-400 dark:text-slate-500 uppercase mb-4 text-center">{t("Audit Summary")}</div>
                                <ScoreRing score={result.score} />

                                <div className="mt-4 flex flex-col items-center gap-2">
                                    <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                                        result.score < 40 ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' :
                                        result.score < 80 ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' :
                                        'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                                    }`}>
                                        {result.score < 40 ? t('Critical Audit') :
                                         result.score < 80 ? t('Needs Optimization') : t('Optimized Listing')}
                                    </span>

                                    {fromCache && (
                                        <div className="text-[10px] px-2.5 py-0.5 rounded-full bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 border border-purple-100 dark:border-purple-900/20 flex items-center gap-1 font-semibold">
                                            <i className="fas fa-history"></i> {t("Cached Result")}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Price Positioning Card */}
                            {result?.priceAnalysis?.reasoning && (
                                <div className="bg-slate-50/50 dark:bg-slate-900/30 border border-slate-200/50 dark:border-white/5 rounded-2xl p-5 text-left flex flex-col gap-3">
                                    <div className="flex items-center gap-2">
                                        <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center text-xs">
                                            <i className="fas fa-wallet" />
                                        </div>
                                        <span className="text-xs font-bold text-slate-800 dark:text-white">{t("Price Positioning")}</span>
                                    </div>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 m-0 leading-relaxed">{result.priceAnalysis.reasoning}</p>
                                    {result.priceAnalysis.suggestion && (
                                        <div className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-500">
                                            <i className="fas fa-lightbulb" /> {t("Suggestion:")} {result.priceAnalysis.suggestion}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Right Column: Diagnostic Checks Grid */}
                        <div className="flex-1 flex flex-col gap-4 text-left">
                            <div className="text-[10px] font-bold tracking-widest text-slate-400 dark:text-slate-500 uppercase mb-1">{t("Diagnostic Checks")}</div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <DiagnosticCard
                                    label={t("Product Title")}
                                    score={result.titleAnalysis?.score || 0}
                                    icon="fas fa-pen"
                                    issues={issues.filter(iss => iss.section?.toLowerCase() === 'title')}
                                />
                                <DiagnosticCard
                                    label={t("Bullet Points")}
                                    score={result.bulletAnalysis?.score || 0}
                                    icon="fas fa-list-ul"
                                    issues={issues.filter(iss => iss.section?.toLowerCase() === 'bullets')}
                                />
                                <DiagnosticCard
                                    label={t("Description")}
                                    score={result.descriptionAnalysis?.score || 0}
                                    icon="fas fa-file-alt"
                                    issues={issues.filter(iss => iss.section?.toLowerCase() === 'description')}
                                />
                                <DiagnosticCard
                                    label={t("Search Terms")}
                                    score={result.backendKeywordsAnalysis?.score || 0}
                                    icon="fas fa-key"
                                    issues={issues.filter(iss => iss.section?.toLowerCase() === 'keywords')}
                                />
                                {showImageAnalysis && (
                                    <DiagnosticCard
                                        label={t("Gallery Image")}
                                        score={result.imageAnalysis?.score || 0}
                                        icon="fas fa-image"
                                        issues={issues.filter(iss => iss.section?.toLowerCase() === 'image')}
                                        tips={result.imageAnalysis?.tips}
                                    />
                                )}
                                <DiagnosticCard
                                    label={t("Positioning & Price")}
                                    score={result.priceAnalysis?.score || 0}
                                    icon="fas fa-tag"
                                    issues={issues.filter(iss => iss.section?.toLowerCase() === 'pricing' || iss.section?.toLowerCase() === 'price')}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {step === 2 && result && (
                    <div className="lom-review-v2 p-2">
                        {!showNotices ? (
                            <div className="flex flex-col md:flex-row gap-6">
                                {/* Left Side Tabs Selector */}
                                <div className="w-full md:w-[200px] flex flex-row md:flex-col gap-2 shrink-0 overflow-x-auto md:overflow-x-visible pb-2 md:pb-0">
                                    <button 
                                        onClick={() => setActiveReviewTab("title")}
                                        className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-xs font-bold transition-all text-left whitespace-nowrap md:w-full ${
                                            activeReviewTab === "title"
                                                ? 'bg-[var(--accent-primary)] text-white shadow-sm'
                                                : 'bg-white dark:bg-slate-900/40 border border-slate-200/50 dark:border-white/5 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                                        }`}
                                    >
                                        <i className="fas fa-pen text-xs shrink-0" />
                                        <span className="flex-1">{t("Title")}</span>
                                        {acceptTitle && <i className="fas fa-check-circle text-[10px] text-emerald-500 bg-white rounded-full shrink-0" />}
                                    </button>

                                    <button 
                                        onClick={() => setActiveReviewTab("bullets")}
                                        className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-xs font-bold transition-all text-left whitespace-nowrap md:w-full ${
                                            activeReviewTab === "bullets"
                                                ? 'bg-[var(--accent-primary)] text-white shadow-sm'
                                                : 'bg-white dark:bg-slate-900/40 border border-slate-200/50 dark:border-white/5 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                                        }`}
                                    >
                                        <i className="fas fa-list-ul text-xs shrink-0" />
                                        <span className="flex-1">{t("Bullet Points")}</span>
                                        {acceptBullets && <i className="fas fa-check-circle text-[10px] text-emerald-500 bg-white rounded-full shrink-0" />}
                                    </button>

                                    <button 
                                        onClick={() => setActiveReviewTab("description")}
                                        className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-xs font-bold transition-all text-left whitespace-nowrap md:w-full ${
                                            activeReviewTab === "description"
                                                ? 'bg-[var(--accent-primary)] text-white shadow-sm'
                                                : 'bg-white dark:bg-slate-900/40 border border-slate-200/50 dark:border-white/5 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                                        }`}
                                    >
                                        <i className="fas fa-file-alt text-xs shrink-0" />
                                        <span className="flex-1">{t("Description")}</span>
                                        {acceptDescription && <i className="fas fa-check-circle text-[10px] text-emerald-500 bg-white rounded-full shrink-0" />}
                                    </button>

                                    <button 
                                        onClick={() => setActiveReviewTab("keywords")}
                                        className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-xs font-bold transition-all text-left whitespace-nowrap md:w-full ${
                                            activeReviewTab === "keywords"
                                                ? 'bg-[var(--accent-primary)] text-white shadow-sm'
                                                : 'bg-white dark:bg-slate-900/40 border border-slate-200/50 dark:border-white/5 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                                        }`}
                                    >
                                        <i className="fas fa-key text-xs shrink-0" />
                                        <span className="flex-1">{t("Search Terms")}</span>
                                        {acceptKeywords && <i className="fas fa-check-circle text-[10px] text-emerald-500 bg-white rounded-full shrink-0" />}
                                    </button>
                                </div>

                                {/* Right Side Tab Content Panel */}
                                <div className="flex-1">
                                    {activeReviewTab === "title" && (
                                        <DiffField
                                            label={<><i className="fas fa-tag mr-2"></i>{t("Product Title")}</>}
                                            original={product?.itemName}
                                            suggested={editTitle}
                                            accepted={acceptTitle}
                                            onToggle={() => setAcceptTitle(v => !v)}
                                            onChange={setEditTitle}
                                            maxLen={200}
                                        />
                                    )}

                                    {activeReviewTab === "bullets" && (
                                        <BulletDiffField
                                            bullets={editBullets}
                                            originalBullets={result?.bulletAnalysis?.current || []}
                                            accepted={acceptBullets}
                                            selectedBullets={selectedBullets}
                                            onToggle={() => setAcceptBullets(v => !v)}
                                            onToggleBullet={toggleBullet}
                                            onSelectAll={selectAllBullets}
                                            onDeselectAll={deselectAllBullets}
                                            onChange={(i, val) => {
                                                const next = [...editBullets];
                                                next[i] = val;
                                                setEditBullets(next);
                                            }}
                                        />
                                    )}

                                    {activeReviewTab === "description" && (
                                        <DiffField
                                            label={<><i className="fas fa-file-alt mr-2"></i>{t("Product Description")}</>}
                                            original={result?.descriptionAnalysis?.current || ""}
                                            suggested={editDescription}
                                            accepted={acceptDescription}
                                            onToggle={() => setAcceptDescription(v => !v)}
                                            onChange={setEditDescription}
                                            maxLen={2000}
                                        />
                                    )}

                                    {activeReviewTab === "keywords" && (
                                        <KeywordsChipsField
                                            label={<><i className="fas fa-key mr-2"></i>{t("Backend Keywords")}</>}
                                            tooltip={t("Hidden search tags given to Amazon. Select individual keywords to update. Keywords are comma-separated.")}
                                            original={getOriginalKeywordsArray()}
                                            suggestedKeywordsArray={editKeywordsArray}
                                            selectedKeywords={selectedKeywords}
                                            onToggleKeyword={toggleKeyword}
                                            onSelectAllKeywords={selectAllKeywords}
                                            onDeselectAllKeywords={deselectAllKeywords}
                                            accepted={acceptKeywords}
                                            onToggle={() => setAcceptKeywords(!acceptKeywords)}
                                            maxLen={249}
                                        />
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="lom-confirmation-view p-2 flex flex-col gap-6 text-left">
                                <div className="flex items-center gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
                                    <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center text-lg shrink-0">
                                        <i className="fas fa-triangle-exclamation" />
                                    </div>
                                    <div>
                                        <div className="text-sm font-bold text-slate-800 dark:text-white">{t("Pre-Flight Review Required")}</div>
                                        <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">{t("Please review how Amazon processes catalog modifications before confirming deployment.")}</div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Catalog Sync Time */}
                                    <div className="p-4 bg-white dark:bg-slate-900/40 border border-slate-200/60 dark:border-white/5 rounded-xl flex items-start gap-3.5 hover:shadow-xs transition-shadow">
                                        <div className="w-9 h-9 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center text-sm shrink-0">
                                            <i className="far fa-clock" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="text-xs font-bold text-slate-800 dark:text-white flex items-center justify-between gap-2">
                                                <span>{t("Catalog Sync Duration")}</span>
                                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-550 shrink-0">15m – 24h</span>
                                            </div>
                                            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium m-0 mt-1 leading-relaxed">
                                                {t("Amazon's system takes time to index new updates. Live pages usually reflect changes after a few hours.")}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Multi SKU Sync */}
                                    <div className="p-4 bg-white dark:bg-slate-900/40 border border-slate-200/60 dark:border-white/5 rounded-xl flex items-start gap-3.5 hover:shadow-xs transition-shadow">
                                        <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center text-sm shrink-0">
                                            <i className="fas fa-arrows-spin" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="text-xs font-bold text-slate-800 dark:text-white flex items-center justify-between gap-2">
                                                <span>{t("Multi-SKU Automation")}</span>
                                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 shrink-0">{t("Auto-Fixed")}</span>
                                            </div>
                                            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium m-0 mt-1 leading-relaxed">
                                                {t("Advertise IQ automatically propagates optimization updates to FBA, FBM, and duplicate SKUs to avoid suppression.")}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Brand Ownership */}
                                    <div className="p-4 bg-white dark:bg-slate-900/40 border border-slate-200/60 dark:border-white/5 rounded-xl flex items-start gap-3.5 hover:shadow-xs transition-shadow">
                                        <div className="w-9 h-9 rounded-lg bg-rose-500/10 text-rose-500 flex items-center justify-center text-sm shrink-0">
                                            <i className="fas fa-shield-halved" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="text-xs font-bold text-slate-800 dark:text-white flex items-center justify-between gap-2">
                                                <span>{t("Brand Registry Authority")}</span>
                                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-600 shrink-0">{t("Constraint")}</span>
                                            </div>
                                            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium m-0 mt-1 leading-relaxed">
                                                {t("You must be the brand owner of the listing. Catalog override constraints might ignore unauthorized edits.")}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Parent ASIN */}
                                    <div className="p-4 bg-white dark:bg-slate-900/40 border border-slate-200/60 dark:border-white/5 rounded-xl flex items-start gap-3.5 hover:shadow-xs transition-shadow">
                                        <div className="w-9 h-9 rounded-lg bg-purple-500/10 text-purple-500 flex items-center justify-center text-sm shrink-0">
                                            <i className="fas fa-sitemap" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="text-xs font-bold text-slate-800 dark:text-white flex items-center justify-between gap-2">
                                                <span>{t("Parent ASIN Hierarchy")}</span>
                                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-650 shrink-0">{t("Note")}</span>
                                            </div>
                                            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium m-0 mt-1 leading-relaxed">
                                                {t("If child listings inherit titles, you may have to run optimization directly on the Parent ASIN listing.")}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                        <div className="lom-multi-sku-section mt-4 px-2">
                            {relatedSkus.length > 0 && (
                                <div className="flex items-start gap-3.5 p-4 bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-left">
                                    <div className="w-8 h-8 rounded-lg bg-emerald-500 text-white flex items-center justify-center text-xs shrink-0">
                                        <i className="fas fa-shuffle" />
                                    </div>
                                    <div>
                                        <strong className="text-xs font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                                            {t("Variation Family Sync Active")}
                                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-500">{t("ASIN:")} {product?.asin}</span>
                                        </strong>
                                        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium m-0 mt-1 leading-relaxed">
                                            {t("We detected {{count}} sibling SKU(s) matching this variation group. To maintain integrity and prevent suppression, Advertise IQ will automatically deploy these changes across the entire family.", { count: relatedSkus.length })}
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <div className="lom-footer">
                <button className="lom-btn-secondary" onClick={handleClose}>{t("Cancel")}</button>
                {step === 0 && !loading && (
                    <div style={{ flex: 1 }} />
                )}
                {step === 1 && (
                    <>
                        <button className="lom-btn-secondary" onClick={() => runAnalysis(true)}>
                            <><i className="fas fa-sync-alt me-2"></i> {t("Re-analyze")}</>
                        </button>
                        <button className="lom-btn-primary" onClick={() => setStep(2)}>
                            {t("Review Suggestions →")}
                        </button>
                    </>
                )}
                {step === 2 && (
                    <>
                        <button className="lom-btn-secondary" onClick={() => showNotices ? setShowNotices(false) : setStep(1)}>
                            {showNotices ? t("← Edit Suggestions") : t("← Back to Score")}
                        </button>
                        <AppTooltip text={getApplyTooltip()} placement="top" arrow disableHoverListener={hasAnySelected}>
                            <span>
                                <button
                                    className="lom-btn-primary lom-btn-apply"
                                    onClick={() => !showNotices ? setShowNotices(true) : applyToAmazon()}
                                    disabled={applying || (!showNotices && !hasAnySelected)}
                                >
                                    {applying ? (
                                        <><span className="lom-spinner" /> {t("Applying...")}</>
                                    ) : showNotices ? (
                                        <><i className="fas fa-check-circle me-2"></i> {t("Confirm & Apply to Amazon")}</>
                                    ) : (
                                        <><i className="fas fa-cloud-upload-alt me-2"></i> {t("Apply to Amazon")}</>
                                    )}
                                </button>
                            </span>
                        </AppTooltip>
                    </>
                )}
            </div>
        </DialogContent>
        </Dialog>
    )
};