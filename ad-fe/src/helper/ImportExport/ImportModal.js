import React, { useRef, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";

const ImportModal = ({
    open,
    onClose,
    onSubmit,
    accept = ".xlsx,.xls",
    title = "Import Rules",
}) => {
    const { t } = useTranslation();
    const inputRef = useRef();
    const [file, setFile] = useState(null);
    const [error, setError] = useState("");
    const [duplicateAction, setDuplicateAction] = useState("skip");
    const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");

    useEffect(() => {
        const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
        const observer = new MutationObserver(handle);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        return () => observer.disconnect();
    }, []);

    const allowedExtensions = accept.split(",").map(ext => ext.trim().replace(".", "").toLowerCase());

    const handleFileChange = (e) => {
        const selectedFile = e.target.files?.[0];
        if (!selectedFile) return;

        const fileExtension = selectedFile.name.split(".").pop().toLowerCase();

        if (!allowedExtensions.includes(fileExtension)) {
            setError(t("Only {{accept}} files are allowed", { accept }));
            setFile(null);
            e.target.value = null;
            return;
        }

        setError("");
        setFile(selectedFile);
    };

    const handleClose = () => {
        setFile(null);
        setError("");
        setDuplicateAction("skip");
        onClose();
    };

    return (
        <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose(); }}>
            <DialogContent
                className="sm:max-w-[500px] p-6 rounded-xl border"
                style={{
                    backgroundColor: isDark ? "#1e293b" : "#fff",
                    borderColor: isDark ? "#334155" : "#e2e8f0",
                }}
            >
                <DialogHeader className="mb-4">
                    <DialogTitle className="text-lg font-bold" style={{ color: isDark ? "#f8fafc" : "#0f172a" }}>
                        {typeof title === "string" ? t(title) : title}
                    </DialogTitle>
                </DialogHeader>

                {error && (
                    <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 text-sm font-medium">
                        {error}
                    </div>
                )}

                <div
                    className={`border border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors duration-200 ${error
                            ? "border-red-300 dark:border-red-800"
                            : "border-slate-200 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500"
                        }`}
                    style={{
                        background: isDark ? "rgba(255,255,255,0.02)" : "#f8fafc"
                    }}
                    onClick={() => inputRef.current.click()}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto text-slate-400 dark:text-slate-500 mb-2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    <div className="font-semibold text-sm mb-1" style={{ color: isDark ? "#cbd5e1" : "#475569" }}>
                        {file ? file.name : t("Click to upload file")}
                    </div>
                    <div className="text-xs" style={{ color: isDark ? "#64748b" : "#94a3b8" }}>
                        {t("Supported format:")} {accept}
                    </div>
                </div>

                <input
                    ref={inputRef}
                    type="file"
                    className="hidden"
                    accept={accept}
                    onChange={handleFileChange}
                />

                {/* Duplicate handling */}
                <div className="mt-6">
                    <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: isDark ? "#94a3b8" : "#475569" }}>
                        {t("If duplicate rule exists:")}
                    </div>

                    <div className="flex flex-col gap-2.5">
                        <label className="flex items-center gap-3 cursor-pointer select-none">
                            <input
                                type="radio"
                                name="duplicateAction"
                                checked={duplicateAction === "replace"}
                                onChange={() => setDuplicateAction("replace")}
                                className="h-4 w-4 text-[#1A9FD4] dark:text-[#2374F2] focus:ring-0 cursor-pointer accent-[#1A9FD4] dark:accent-[#2374F2]"
                            />
                            <span className="text-sm font-medium" style={{ color: isDark ? "#cbd5e1" : "#334155" }}>
                                {t("Replace existing")}
                            </span>
                        </label>

                        <label className="flex items-center gap-3 cursor-pointer select-none">
                            <input
                                type="radio"
                                name="duplicateAction"
                                checked={duplicateAction === "skip"}
                                onChange={() => setDuplicateAction("skip")}
                                className="h-4 w-4 text-[#1A9FD4] dark:text-[#2374F2] focus:ring-0 cursor-pointer accent-[#1A9FD4] dark:accent-[#2374F2]"
                            />
                            <span className="text-sm font-medium" style={{ color: isDark ? "#cbd5e1" : "#334155" }}>
                                {t("Skip duplicate")}
                            </span>
                        </label>
                    </div>
                </div>

                <div className="mt-6 flex justify-end gap-3 pt-4 border-t" style={{ borderColor: isDark ? "#334155" : "#e2e8f0" }}>
                    <button
                        className="h-9 px-4 rounded-md text-xs font-semibold border transition-colors"
                        style={{
                            borderColor: isDark ? "#475569" : "#cbd5e1",
                            color: isDark ? "#cbd5e1" : "#475569",
                            backgroundColor: "transparent"
                        }}
                        onClick={handleClose}
                    >
                        {t("Cancel")}
                    </button>
                    <button
                        className="h-9 px-4 rounded-md text-xs font-semibold text-white transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{
                            background: "linear-gradient(135deg, #2374F2, #1A9FD4)",
                        }}
                        disabled={!file || !duplicateAction}
                        onClick={() => {
                            onSubmit(file, duplicateAction);
                            handleClose();
                        }}
                    >
                        {t("Import")}
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default ImportModal;
