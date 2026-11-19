import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Tag as TagIcon, X, Plus, Check } from "lucide-react";
import Toast from "../../common/helper/toast/Toast";
import { ApiCreateRecommendationTag } from "../../api-wrapper/recommendation/ApiRecommendation";

export const MAX_TAG_LENGTH = 40;
const FALLBACK_COLOR = "#2563EB";

/** One tag pill. Color comes from the API (stable per tag name). */
export function TagChip({ tag, onRemove, size = "sm", title }) {
  const color = tag?.color || FALLBACK_COLOR;
  const pad = size === "xs" ? "px-1.5 py-px text-[10.5px]" : "px-2 py-0.5 text-[11.5px]";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold border max-w-[180px] ${pad}`}
      style={{ color, borderColor: `${color}55`, background: `${color}14` }}
      title={title || tag?.name}
    >
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
export function TagList({ tags, max = 3, size = "sm", className = "" }) {
  const list = Array.isArray(tags) ? tags : [];
  if (!list.length) return null;
  const shown = list.slice(0, max);
  const hidden = list.length - shown.length;
  return (
    <div className={`flex flex-wrap items-center gap-1 ${className}`}>
      {shown.map((tag) => (
        <TagChip key={tag._id} tag={tag} size={size} />
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
 * Pick tags for a recommendation configuration. Type to search; Enter or "Create …" adds a new tag
 * (saved immediately for the account). Used only in the Recommendation Configuration form.
 *
 * @param {Array<{_id,name,color}>} value selected tags
 * @param {Array<{_id,name,color}>} options all tags of the account
 * @param {(tags) => void} onChange
 * @param {(tag) => void} [onTagCreated] new tag created (add it to the options list)
 */
export function TagSelector({ value = [], options = [], onChange, onTagCreated, placeholder, id }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
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
  const clean = query.replace(/\s+/g, " ").trim().slice(0, MAX_TAG_LENGTH);
  const filtered = useMemo(() => {
    const q = clean.toLowerCase();
    return options.filter((o) => !q || o.name.toLowerCase().includes(q));
  }, [options, clean]);
  const exactMatch = options.find((o) => o.name.toLowerCase() === clean.toLowerCase());

  const toggle = (tag) => {
    if (selectedIds.has(String(tag._id))) onChange(value.filter((v) => String(v._id) !== String(tag._id)));
    else onChange([...value, tag]);
    setQuery("");
    inputRef.current?.focus();
  };

  const create = async () => {
    if (!clean || creating) return;
    if (exactMatch) {
      if (!selectedIds.has(String(exactMatch._id))) toggle(exactMatch);
      else setQuery("");
      return;
    }
    setCreating(true);
    const res = await ApiCreateRecommendationTag({ name: clean });
    setCreating(false);
    if (res?.isSuccess && res.data?._id) {
      onTagCreated?.(res.data);
      onChange([...value, res.data]);
      setQuery("");
      inputRef.current?.focus();
    } else {
      Toast.error(res?.message || t("Could not create tag"));
    }
  };

  return (
    <div ref={rootRef} className="relative w-full" id={id}>
      <div
        className="min-h-[38px] w-full flex flex-wrap items-center gap-1.5 px-2 py-1.5 rounded-md border border-input bg-background cursor-text focus-within:ring-1 focus-within:ring-ring"
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
              e.preventDefault();
              create();
            } else if (e.key === "Backspace" && !query && value.length) {
              onChange(value.slice(0, -1));
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder={value.length ? "" : placeholder || t("Add tags…")}
          className="flex-1 min-w-[120px] bg-transparent outline-none border-0 text-[13px] text-slate-800 dark:text-slate-100 placeholder:text-slate-400 py-0.5"
          style={{ border: "none", boxShadow: "none", background: "transparent", outline: "none", height: "auto", padding: "2px 0" }}
        />
      </div>

      {open && (
        <div className="absolute z-[60] mt-1 w-full max-h-[220px] overflow-y-auto rounded-md border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 shadow-lg py-1">
          {clean && !exactMatch && (
            <button
              type="button"
              onClick={create}
              disabled={creating}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-[13px] text-blue-600 dark:text-blue-400 hover:bg-slate-50 dark:hover:bg-white/5"
            >
              <Plus className="w-3.5 h-3.5" />
              {creating ? t("Creating…") : t("Create tag \"{{name}}\"", { name: clean })}
            </button>
          )}
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
          {!filtered.length && !clean && (
            <div className="px-3 py-2 text-[12px] text-slate-400">{t("No tags yet. Type a name and press Enter to create one.")}</div>
          )}
        </div>
      )}
    </div>
  );
}
