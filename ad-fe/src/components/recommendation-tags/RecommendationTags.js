import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Tag as TagIcon, X, Check } from "lucide-react";

export const MAX_TAG_LENGTH = 40;
const FALLBACK_COLOR = "#2563EB";

/**
 * Hook to reactively track whether dark mode is currently active.
 */
export function useIsDark() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof document === "undefined") return false;
    return document.documentElement.getAttribute("data-theme") === "dark";
  });

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const update = () => {
      setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    };
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

const PRESET_PALETTES = {
  // Blue (#2563EB)
  "#2563EB": {
    dark: { text: "#93C5FD", bg: "rgba(37, 99, 235, 0.22)", border: "rgba(147, 197, 253, 0.35)", dot: "#60A5FA" },
    light: { text: "#1D4ED8", bg: "rgba(37, 99, 235, 0.09)", border: "rgba(37, 99, 235, 0.28)", dot: "#2563EB" },
  },
  // Cyan (#0891B2)
  "#0891B2": {
    dark: { text: "#67E8F9", bg: "rgba(8, 145, 178, 0.22)", border: "rgba(103, 232, 249, 0.35)", dot: "#22D3EE" },
    light: { text: "#0E7490", bg: "rgba(8, 145, 178, 0.09)", border: "rgba(8, 145, 178, 0.28)", dot: "#0891B2" },
  },
  // Emerald (#059669)
  "#059669": {
    dark: { text: "#6EE7B7", bg: "rgba(5, 150, 105, 0.22)", border: "rgba(110, 231, 183, 0.35)", dot: "#34D399" },
    light: { text: "#047857", bg: "rgba(5, 150, 105, 0.09)", border: "rgba(5, 150, 105, 0.28)", dot: "#059669" },
  },
  // Lime (#65A30D)
  "#65A30D": {
    dark: { text: "#BEF264", bg: "rgba(101, 163, 13, 0.22)", border: "rgba(190, 242, 100, 0.35)", dot: "#A3E635" },
    light: { text: "#4D7C0F", bg: "rgba(101, 163, 13, 0.10)", border: "rgba(101, 163, 13, 0.30)", dot: "#65A30D" },
  },
  // Amber (#D97706)
  "#D97706": {
    dark: { text: "#FCD34D", bg: "rgba(217, 119, 6, 0.22)", border: "rgba(252, 211, 77, 0.35)", dot: "#FBBF24" },
    light: { text: "#B45309", bg: "rgba(217, 119, 6, 0.09)", border: "rgba(217, 119, 6, 0.28)", dot: "#D97706" },
  },
  // Red (#DC2626)
  "#DC2626": {
    dark: { text: "#FCA5A5", bg: "rgba(220, 38, 38, 0.22)", border: "rgba(252, 165, 165, 0.35)", dot: "#F87171" },
    light: { text: "#B91C1C", bg: "rgba(220, 38, 38, 0.09)", border: "rgba(220, 38, 38, 0.28)", dot: "#DC2626" },
  },
  // Pink (#DB2777)
  "#DB2777": {
    dark: { text: "#F9A8D4", bg: "rgba(219, 39, 119, 0.22)", border: "rgba(249, 168, 212, 0.35)", dot: "#F472B6" },
    light: { text: "#BE185D", bg: "rgba(219, 39, 119, 0.09)", border: "rgba(219, 39, 119, 0.28)", dot: "#DB2777" },
  },
  // Violet (#7C3AED)
  "#7C3AED": {
    dark: { text: "#DDD6FE", bg: "rgba(124, 58, 237, 0.24)", border: "rgba(221, 214, 254, 0.38)", dot: "#A78BFA" },
    light: { text: "#6D28D9", bg: "rgba(124, 58, 237, 0.09)", border: "rgba(124, 58, 237, 0.28)", dot: "#7C3AED" },
  },
  // Indigo (#4F46E5)
  "#4F46E5": {
    dark: { text: "#C7D2FE", bg: "rgba(79, 70, 229, 0.24)", border: "rgba(199, 210, 254, 0.38)", dot: "#818CF8" },
    light: { text: "#3730A3", bg: "rgba(79, 70, 229, 0.09)", border: "rgba(79, 70, 229, 0.28)", dot: "#4F46E5" },
  },
  // Teal (#0D9488)
  "#0D9488": {
    dark: { text: "#5EEAD4", bg: "rgba(13, 148, 136, 0.22)", border: "rgba(94, 234, 212, 0.35)", dot: "#2DD4BF" },
    light: { text: "#0F766E", bg: "rgba(13, 148, 136, 0.09)", border: "rgba(13, 148, 136, 0.28)", dot: "#0D9488" },
  },
};

function hexToRgb(hex) {
  if (!hex || typeof hex !== "string") return { r: 37, g: 99, b: 235 };
  let clean = hex.replace("#", "").trim();
  if (clean.length === 3) {
    clean = clean.split("").map((c) => c + c).join("");
  }
  const num = parseInt(clean, 16);
  if (isNaN(num)) return { r: 37, g: 99, b: 235 };
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

/**
 * Returns theme-aware, WCAG-compliant styling for a given tag color hex.
 */
export function getTagStyles(rawColor, isDark = false) {
  const norm = (rawColor || FALLBACK_COLOR).toUpperCase();
  const preset = PRESET_PALETTES[norm];
  if (preset) {
    return isDark ? preset.dark : preset.light;
  }

  // Algorithmic fallback for custom colors:
  const { r, g, b } = hexToRgb(norm);
  if (isDark) {
    const lr = Math.min(255, Math.round(r + (255 - r) * 0.65));
    const lg = Math.min(255, Math.round(g + (255 - g) * 0.65));
    const lb = Math.min(255, Math.round(b + (255 - b) * 0.65));
    const text = `rgb(${lr}, ${lg}, ${lb})`;
    return {
      text,
      bg: `rgba(${r}, ${g}, ${b}, 0.22)`,
      border: `rgba(${lr}, ${lg}, ${lb}, 0.35)`,
      dot: text,
    };
  }

  const dr = Math.round(r * 0.72);
  const dg = Math.round(g * 0.72);
  const db = Math.round(b * 0.72);
  const text = `rgb(${dr}, ${dg}, ${db})`;
  return {
    text,
    bg: `rgba(${r}, ${g}, ${b}, 0.09)`,
    border: `rgba(${r}, ${g}, ${b}, 0.28)`,
    dot: norm,
  };
}

/** One tag pill. Color adapts cleanly to light and dark themes. */
export function TagChip({ tag, onRemove, size = "sm", title, isDark: customIsDark }) {
  const hookIsDark = useIsDark();
  const isDark = typeof customIsDark === "boolean" ? customIsDark : hookIsDark;
  const styles = getTagStyles(tag?.color, isDark);
  const pad = size === "xs" ? "px-2 py-0.5 text-[10.5px]" : "px-2.5 py-0.5 text-[11.5px]";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold border max-w-[180px] shadow-sm transition-colors ${pad}`}
      style={{
        color: styles.text,
        borderColor: styles.border,
        backgroundColor: styles.bg,
      }}
      title={title || tag?.name}
    >
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ backgroundColor: styles.dot }}
        aria-hidden="true"
      />
      <span className="truncate">{tag?.name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(tag);
          }}
          className="shrink-0 rounded-full hover:bg-black/10 dark:hover:bg-white/10 p-px"
          aria-label="remove tag"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}

/** Read-only tags, showing the first `max` and "+N" for the rest (full list on hover). */
export function TagList({ tags, max = 3, size = "sm", className = "", isDark }) {
  const list = Array.isArray(tags) ? tags : [];
  if (!list.length) return null;
  const shown = list.slice(0, max);
  const hidden = list.length - shown.length;
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {shown.map((tag) => (
        <TagChip key={tag._id} tag={tag} size={size} isDark={isDark} />
      ))}
      {hidden > 0 && (
        <span
          className="px-1.5 py-px rounded-full text-[10.5px] font-semibold bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300"
          title={list.slice(max).map((t) => t.name).join(", ")}
        >
          +{hidden}
        </span>
      )}
    </div>
  );
}

/**
 * Pick tags for a recommendation configuration: search and select EXISTING organization tags only.
 * Tags are created, renamed and deleted in Recommendation → Tag Management.
 *
 * @param {Array<{_id,name,color}>} value selected tags
 * @param {Array<{_id,name,color}>} options all tags of the organization
 * @param {(tags) => void} onChange
 */
export function TagSelector({ value = [], options = [], onChange, placeholder, id }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const selectedIds = useMemo(() => new Set(value.map((v) => String(v._id))), [value]);
  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => options.filter((o) => !q || o.name.toLowerCase().includes(q)), [options, q]);

  const toggle = (tag) => {
    if (selectedIds.has(String(tag._id))) onChange(value.filter((v) => String(v._id) !== String(tag._id)));
    else onChange([...value, tag]);
    setQuery("");
    inputRef.current?.focus();
  };

  return (
    <div ref={rootRef} className="relative w-full" id={id}>
      <div
        className="tag-selector-wrapper min-h-[38px] w-full flex flex-wrap items-center gap-1.5 px-2 py-1.5 rounded-md border border-input bg-background cursor-text focus-within:ring-1 focus-within:ring-ring"
        onClick={() => {
          setOpen(true);
          inputRef.current?.focus();
        }}
      >
        <TagIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        {value.map((tag) => (
          <TagChip key={tag._id} tag={tag} onRemove={(tg) => onChange(value.filter((v) => String(v._id) !== String(tg._id)))} />
        ))}
        <input
          ref={inputRef}
          value={query}
          maxLength={MAX_TAG_LENGTH}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              // Enter picks the only / first match; it never creates a tag.
              e.preventDefault();
              const first = filtered.find((o) => !selectedIds.has(String(o._id)));
              if (q && first) toggle(first);
            } else if (e.key === "Backspace" && !query && value.length) {
              onChange(value.slice(0, -1));
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder={value.length ? "" : placeholder || t("Select tags")}
          className="tag-selector-input flex-1 min-w-[120px] bg-transparent outline-none border-0 text-[13px] text-slate-800 dark:text-slate-100 placeholder:text-slate-400 py-0.5"
          style={{ border: "none", boxShadow: "none", background: "transparent", outline: "none", height: "auto", padding: "2px 0" }}
        />
      </div>

      {open && (
        <div className="absolute z-[60] mt-1 w-full max-h-[220px] overflow-y-auto rounded-md border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 shadow-lg py-1">
          {filtered.map((tag) => {
            const selected = selectedIds.has(String(tag._id));
            return (
              <button
                key={tag._id}
                type="button"
                onClick={() => toggle(tag)}
                className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-white/5"
              >
                <TagChip tag={tag} />
                {selected && <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />}
              </button>
            );
          })}
          {!filtered.length && (
            <div className="px-3 py-2 text-[12px] text-slate-400">
              {options.length
                ? t("No matching tags.")
                : t("No tags yet. Create tags in the Tag Management tab.")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
