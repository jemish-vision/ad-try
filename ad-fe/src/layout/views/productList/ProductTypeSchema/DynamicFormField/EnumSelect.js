import { useEffect, useRef, useState, useCallback } from "react";
import { ErrorMessage } from "formik";
import { useTranslation } from "react-i18next";
import { FieldTitle } from "./ProductCommon";

export default function EnumSelect({ field, fullPath, value, setFieldValue, amazonError, onAmazonErrorClear }) {
    const { t } = useTranslation();
    const amazonErrorKey = fullPath?.split('[')[0];
    const amsError = amazonError?.[amazonErrorKey];
    const hasError = !!amsError;

    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [highlighted, setHighlighted] = useState(-1);

    const containerRef = useRef(null);
    const searchRef = useRef(null);
    const listRef = useRef(null);
    const rowRef = useRef(null);
    const labelRef = useRef(null);
    const parentWrapRef = useRef(null);

    // ── Dynamic width calculation ─────────────────────────────────────────
    const updateWidth = useCallback(() => {
        const row = rowRef.current;
        const label = labelRef.current;
        const wrap = parentWrapRef.current;
        if (!row || !label || !wrap) return;

        const rowWidth = row.getBoundingClientRect().width;
        const labelWidth = label.getBoundingClientRect().width;

        // gap is 16px as per your grid gap: 0 16px
        const computedGap = parseInt(getComputedStyle(row).columnGap || "16", 10);

        const availableWidth = rowWidth;
        wrap.style.width = `${Math.max(0, availableWidth)}px`;
        wrap.style.minWidth = "0";
        wrap.style.flexShrink = "0";
    }, []);

    useEffect(() => {
        updateWidth(); // run on mount

        const ro = new ResizeObserver(() => updateWidth());

        if (rowRef.current) ro.observe(rowRef.current);
        if (labelRef.current) ro.observe(labelRef.current);

        return () => ro.disconnect();
    }, [updateWidth]);

    // ── Rest of your existing logic ───────────────────────────────────────
    const options = (field.enum || []).map((opt, i) => ({
        value: opt,
        label: field.enumNames ? field.enumNames[i] : opt,
    }));

    const filtered = search.trim()
        ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
        : options;

    const selectedLabel = options.find(o => o.value === value)?.label || "";

    // Close on outside click
    useEffect(() => {
        const handler = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setOpen(false);
                setSearch("");
                setHighlighted(-1);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    // Focus search when opened
    useEffect(() => {
        if (open) {
            setTimeout(() => searchRef.current?.focus(), 30);
            setHighlighted(-1);
        }
    }, [open]);

    // Scroll highlighted item into view
    useEffect(() => {
        if (highlighted >= 0 && listRef.current) {
            const item = listRef.current.children[highlighted];
            item?.scrollIntoView({ block: "nearest" });
        }
    }, [highlighted]);

    const handleSelect = (opt) => {
        onAmazonErrorClear?.(amazonErrorKey);
        setFieldValue(fullPath, opt.value);
        setOpen(false);
        setSearch("");
        setHighlighted(-1);
    };

    const handleClear = (e) => {
        e.stopPropagation();
        onAmazonErrorClear?.(amazonErrorKey);
        setFieldValue(fullPath, "");
    };

    const handleKeyDown = (e) => {
        if (!open) {
            if (["Enter", "ArrowDown", " "].includes(e.key)) {
                e.preventDefault();
                setOpen(true);
            }
            return;
        }
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlighted(h => Math.min(h + 1, filtered.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlighted(h => Math.max(h - 1, 0));
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (highlighted >= 0 && filtered[highlighted]) handleSelect(filtered[highlighted]);
        } else if (e.key === "Escape") {
            setOpen(false);
            setSearch("");
        }
    };

    return (
        <div className="pf-field-row" ref={rowRef}>
            <label className="pf-label" ref={labelRef}>
                <FieldTitle
                    title={field.label || field?.key}
                    tooltip={field?.description ?? field.label ?? field?.key}
                />
            </label>

            <div className="pf-enum-parent-wrap" ref={parentWrapRef} style={{ maxWidth: '100%', minWidth: 0 }}>
                <div
                    ref={containerRef}
                    className="pf-enum-wrap"
                    onKeyDown={handleKeyDown}
                    style={{ maxWidth: '100%', minWidth: 0 }}
                >
                    {/* Trigger */}
                    <div
                        tabIndex={0}
                        className={[
                            "pf-enum-trigger",
                            open ? "pf-enum-open" : "",
                            hasError ? "pf-has-error" : "",
                        ].filter(Boolean).join(" ")}
                        onClick={() => setOpen(o => !o)}
                        role="combobox"
                        aria-expanded={open}
                        aria-haspopup="listbox"
                    >
                        <span className="pf-enum-value">
                            {value
                                ? selectedLabel
                                : <span className="pf-enum-placeholder">
                                    {field?.placeholder
                                        ? t("e.g. {{value}}", { value: field.placeholder })
                                        : t("Select {{name}}…", { name: field.label || field.key })}
                                </span>
                            }
                        </span>

                        <span className="pf-enum-actions">
                            {value && (
                                <span
                                    className="pf-enum-clear"
                                    onClick={handleClear}
                                    title={t("Clear selection")}
                                    role="button"
                                    tabIndex={-1}
                                >
                                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                        <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                                    </svg>
                                </span>
                            )}
                            <span className={`pf-enum-chevron${open ? " pf-chevron-up" : ""}`}>
                                <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                                    <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </span>
                        </span>
                    </div>

                    {/* Dropdown */}
                    {open && (
                        <div className="pf-enum-dropdown" role="listbox">

                            {/* Search bar */}
                            <div className="pf-enum-search-wrap">
                                <svg className="pf-enum-search-icon" width="13" height="13" viewBox="0 0 16 16" fill="none">
                                    <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
                                    <path d="M10 10l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                </svg>
                                <input
                                    ref={searchRef}
                                    type="text"
                                    className="pf-enum-search"
                                    placeholder={t("Search…")}
                                    value={search}
                                    onChange={e => { setSearch(e.target.value); setHighlighted(0); }}
                                />
                                {search && (
                                    <button
                                        type="button"
                                        className="pf-enum-search-clear"
                                        onClick={() => { setSearch(""); setHighlighted(-1); searchRef.current?.focus(); }}
                                    >
                                        <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                                            <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                                        </svg>
                                    </button>
                                )}
                            </div>

                            {/* Options list */}
                            <ul ref={listRef} className="pf-enum-list">
                                {filtered.length === 0 ? (
                                    <li className="pf-enum-empty-msg">{t('No results for "{{search}}"', { search })}</li>
                                ) : (
                                    filtered.map((opt, i) => (
                                        <li
                                            key={opt.value}
                                            className={[
                                                "pf-enum-option",
                                                opt.value === value ? "pf-enum-selected" : "",
                                                i === highlighted ? "pf-enum-highlighted" : "",
                                            ].filter(Boolean).join(" ")}
                                            onClick={() => handleSelect(opt)}
                                            onMouseEnter={() => setHighlighted(i)}
                                            role="option"
                                            aria-selected={opt.value === value}
                                        >
                                            <span className="pf-enum-option-label">{opt.label}</span>
                                            {opt.value === value && (
                                                <svg className="pf-enum-check" width="13" height="13" viewBox="0 0 14 14" fill="none">
                                                    <path d="M2 7l4 4 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                                </svg>
                                            )}
                                        </li>
                                    ))
                                )}
                            </ul>

                            {/* Footer count */}
                            <div className="pf-enum-footer">
                                {t("{{filtered}} of {{count}} {{word}}", {
                                    filtered: filtered.length,
                                    count: options.length,
                                    word: options.length !== 1 ? t("options") : t("option"),
                                })}
                            </div>
                        </div>
                    )}
                </div>

                <ErrorMessage name={fullPath} render={(msg) => <div className="pf-error-msg">{msg}</div>} />
                {amsError && <div className="pf-error-msg">{amsError}</div>}
            </div>
        </div>
    );
}