import { useState } from "react";
import { t } from "i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../../../../components/ui/dialog";
import { Button } from "../../../../components/ui/button";
import { X, Copy, Check, Trash2, ArrowRight } from "lucide-react";

export const GeneratedProductModal = ({ open, onClose, productData, errors, onSubmit }) => {
    const [copied, setCopied] = useState(null);
    const parsed = productData?.generated?.parsedContent;

    const handleCopy = (text, key) => {
        navigator.clipboard.writeText(text).then(() => {
            setCopied(key);
            setTimeout(() => setCopied(null), 1800);
        });
    };

    if (!parsed) return null;

    const FieldCard = ({ title, content, onCopy }) => (
        <div className="bg-white dark:bg-slate-900 rounded-xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm transition-all duration-200">
            <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    {title}
                </span>
                <button
                    type="button"
                    onClick={onCopy}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-250 transition-colors focus:outline-none"
                >
                    {copied === title ? (
                        <>
                            <Check className="h-3.5 w-3.5 text-emerald-500" />
                            <span className="text-emerald-500">{t("Copied")}</span>
                        </>
                    ) : (
                        <>
                            <Copy className="h-3.5 w-3.5" />
                            <span>{t("Copy")}</span>
                        </>
                    )}
                </button>
            </div>
            {content}
        </div>
    );

    const seoKeywords = parsed.backendKeywords ? parsed.backendKeywords.split(/\s+/) : [];

    return (
        <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
            <DialogContent className="sm:max-w-[800px] h-[85vh] flex flex-col p-0 overflow-hidden bg-slate-50 dark:bg-slate-950 border border-slate-250 dark:border-slate-900 rounded-2xl shadow-2xl">
                
                {/* Header */}
                <DialogHeader className="px-6 py-4 flex flex-row items-center justify-between border-b border-slate-200 dark:border-slate-850 shrink-0">
                    <DialogTitle className="text-base font-bold text-slate-800 dark:text-slate-100 space-y-1">
                        <div className="text-lg font-extrabold">{t("Generated Product Data")}</div>
                        <div className="text-xs font-medium text-slate-450 dark:text-slate-500">
                            {t("Review and refine the AI-generated content before publishing.")}
                        </div>
                    </DialogTitle>
                </DialogHeader>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {/* Product Title */}
                    <FieldCard
                        title={t("Product Title")}
                        onCopy={() => handleCopy(parsed.title, t("Product Title"))}
                        content={
                            <div className="p-4 bg-slate-100/50 dark:bg-slate-900/40 border border-slate-200/50 dark:border-slate-800/60 rounded-lg text-sm text-slate-800 dark:text-slate-200 leading-relaxed font-semibold">
                                {parsed.title}
                            </div>
                        }
                    />

                    {/* Key Features */}
                    {parsed.bulletPoints?.length > 0 && (
                        <FieldCard
                            title={t("Key Features")}
                            onCopy={() => handleCopy(parsed.bulletPoints.join("\n"), t("Key Features"))}
                            content={
                                <div className="space-y-3">
                                    {parsed.bulletPoints.map((bp, i) => (
                                        <div key={i} className="flex p-4 border border-slate-150 dark:border-slate-850 rounded-lg bg-slate-50/50 dark:bg-slate-900/20">
                                            <div className="flex items-center justify-center min-w-[24px] h-[24px] rounded-full bg-blue-500/10 dark:bg-blue-500/20 text-[#2374F1] font-bold text-xs mr-3 mt-0.5 shrink-0 select-none">
                                                {i + 1}
                                            </div>
                                            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 leading-relaxed">
                                                {bp}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            }
                        />
                    )}

                    {/* SEO Keywords */}
                    {parsed.backendKeywords && (
                        <FieldCard
                            title={t("SEO Keywords")}
                            onCopy={() => handleCopy(parsed.backendKeywords, t("SEO Keywords"))}
                            content={
                                <div className="flex flex-wrap gap-2">
                                    {seoKeywords.map((kw, idx) => (
                                        kw.trim() && (
                                            <span
                                                key={idx}
                                                className="px-2.5 py-1 text-xs font-bold rounded-lg bg-blue-500/5 dark:bg-blue-500/10 text-[#2374F1] dark:text-[#60a5fa] border border-blue-500/20 dark:border-blue-500/30"
                                            >
                                                {kw}
                                            </span>
                                        )
                                    ))}
                                </div>
                            }
                        />
                    )}

                    {/* Long Description */}
                    {parsed.productDescription && (
                        <FieldCard
                            title={t("Long Description")}
                            onCopy={() => handleCopy(parsed.productDescription, t("Long Description"))}
                            content={
                                <div className="p-4 bg-slate-100/50 dark:bg-slate-900/40 border border-slate-200/50 dark:border-slate-800/60 rounded-lg text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-semibold whitespace-pre-wrap">
                                    {parsed.productDescription}
                                </div>
                            }
                        />
                    )}
                </div>

                {/* Footer Actions */}
                <DialogFooter className="px-6 py-4 flex flex-row justify-end items-center gap-3 border-t border-slate-200 dark:border-slate-850 bg-white dark:bg-slate-950 shrink-0">
                    <Button
                        variant="outline"
                        onClick={onClose}
                        className="h-10 px-4 text-xs font-bold rounded-lg border-red-500 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 border flex items-center gap-1.5 focus:outline-none"
                    >
                        <Trash2 className="h-4 w-4" />
                        <span>{t("Discard")}</span>
                    </Button>
                    
                    <Button
                        onClick={onSubmit}
                        className="h-10 px-6 text-xs font-bold rounded-lg bg-[#2374F2] hover:bg-[#1A9FD4] text-white flex items-center gap-1.5 focus:outline-none shadow-md border-0"
                    >
                        <span>{t("Submit Review")}</span>
                        <ArrowRight className="h-4 w-4" />
                    </Button>
                </DialogFooter>

            </DialogContent>
        </Dialog>
    );
}