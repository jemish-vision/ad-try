import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Trash2, Check, X, Search, Plus, Tag as TagIcon, RefreshCw } from "lucide-react";
import { Button } from "../../../components/ui/button";
import Toast from "../../../common/helper/toast/Toast";
import { PermissionCheck } from "../../../helper/permission/PermissionCheck";
import { SYSTEM_PAGES, PAGE_ACTIONS } from "src/common/constants";
import { TagChip, MAX_TAG_LENGTH } from "../../../components/recommendation-tags/RecommendationTags";
import {
  ApiGetRecommendationTags,
  ApiCreateRecommendationTag,
  ApiRenameRecommendationTag,
  ApiDeleteRecommendationTag,
} from "../../../api-wrapper/recommendation/ApiRecommendation";

const cleanName = (v) => String(v || "").replace(/\s+/g, " ").trim().slice(0, MAX_TAG_LENGTH);
const byName = (a, b) => a.name.localeCompare(b.name);

/**
 * Recommendation → Tag Management tab. Organization-wide tags: create, rename, delete.
 * Configurations only pick from these tags.
 */
export default function TagManagement() {
  const { t } = useTranslation();
  const canCreate = PermissionCheck(SYSTEM_PAGES.RECOMMENDATION, PAGE_ACTIONS.CREATE);
  const canRename = PermissionCheck(SYSTEM_PAGES.RECOMMENDATION, PAGE_ACTIONS.UPDATE);
  const canDelete = PermissionCheck(SYSTEM_PAGES.RECOMMENDATION, PAGE_ACTIONS.REMOVE);

  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await ApiGetRecommendationTags({});
    if (res?.isSuccess) setTags((res.data || []).sort(byName));
    else Toast.error(t(res?.message || "Something went wrong"));
    setLoading(false);
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? tags.filter((tg) => tg.name.toLowerCase().includes(q)) : tags;
  }, [tags, search]);

  const nameTaken = (name, exceptId = null) =>
    tags.some((tg) => tg.name.toLowerCase() === name.toLowerCase() && String(tg._id) !== String(exceptId));

  const create = async () => {
    const name = cleanName(newName);
    if (!name) return Toast.error(t("Tag name is required"));
    if (nameTaken(name)) return Toast.error(t("A tag with this name already exists"));
    setCreating(true);
    const res = await ApiCreateRecommendationTag({ name });
    setCreating(false);
    if (res?.isSuccess) {
      Toast.success(t("Tag created"));
      setTags((prev) => [...prev, res.data].sort(byName));
      setNewName("");
    } else {
      Toast.error(t(res?.message || "Something went wrong"));
    }
  };

  const saveRename = async (tag) => {
    const name = cleanName(editName);
    if (!name) return Toast.error(t("Tag name is required"));
    if (name === tag.name) return setEditingId(null);
    if (nameTaken(name, tag._id)) return Toast.error(t("A tag with this name already exists"));
    setBusyId(String(tag._id));
    const res = await ApiRenameRecommendationTag({ tagId: tag._id, name });
    setBusyId(null);
    if (res?.isSuccess) {
      Toast.success(t("Tag renamed"));
      setTags((prev) => prev.map((tg) => (String(tg._id) === String(tag._id) ? { ...tg, ...res.data } : tg)).sort(byName));
      setEditingId(null);
    } else {
      Toast.error(t(res?.message || "Something went wrong"));
    }
  };

  const remove = async (tag) => {
    setBusyId(String(tag._id));
    const res = await ApiDeleteRecommendationTag({ tagId: tag._id });
    setBusyId(null);
    if (res?.isSuccess) {
      Toast.success(t("Tag deleted"));
      setTags((prev) => prev.filter((tg) => String(tg._id) !== String(tag._id)));
      setConfirmDeleteId(null);
    } else {
      Toast.error(t(res?.message || "Something went wrong"));
    }
  };

  const inputCls = "h-9 rounded-md text-[13px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 outline-none focus:border-blue-400";

  return (
    <div className="glass-grid-container overflow-hidden" style={{ padding: "24px 32px" }} id="recommendation-tag-management">
      {/* Header */}
      <div className="flex justify-between items-start flex-wrap gap-3 mb-4">
        <div>
          <h2 className="m-0 flex items-center gap-2" style={{ fontSize: 22, fontWeight: 800, color: "var(--text-heading, var(--text-primary))", letterSpacing: "-0.5px" }}>
            <TagIcon className="w-5 h-5" /> {t("Tag Management")}
          </h2>
          <p className="m-0 mt-1 text-[13px]" style={{ color: "var(--text-secondary)" }}>
            {t("Tags are shared across your organization. Assign them to recommendations in the Recommendation Configuration tab.")}
          </p>
        </div>
        <button
          type="button"
          className="customize-button m-0 gap-1.5 flex items-center"
          style={{ height: 36 }}
          onClick={load}
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          <span>{t("Refresh")}</span>
        </button>
      </div>

      {/* Create */}
      {canCreate && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <input
            id="new-tag-name"
            value={newName}
            maxLength={MAX_TAG_LENGTH}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            placeholder={t("New tag name")}
            className={`${inputCls} px-3 w-[320px] max-w-full`}
          />
          <Button
            id="create-tag-btn"
            type="button"
            disabled={creating || !cleanName(newName)}
            onClick={create}
            className="h-9 px-4 rounded-md font-semibold text-white flex items-center gap-1.5"
            style={{ background: "linear-gradient(135deg, #2374F2, #1A9FD4)", fontSize: 12 }}
          >
            <Plus className="w-4 h-4" /> {creating ? t("Creating…") : t("Create Tag")}
          </Button>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-3 max-w-[420px]">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("Search tags")} className={`${inputCls} w-full pl-8 pr-3`} />
      </div>

      {/* List */}
      <div className="rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden">
        <div className="grid grid-cols-12 px-4 py-2.5 text-[12px] font-semibold bg-slate-50 dark:bg-white/[0.04] text-slate-500 dark:text-slate-400">
          <div className="col-span-6">{t("Tag")}</div>
          <div className="col-span-4">{t("Used in")}</div>
          <div className="col-span-2 text-right">{t("Action")}</div>
        </div>
        {loading && !tags.length ? (
          <div className="py-10 text-center text-sm text-slate-400">{t("Loading...")}</div>
        ) : !shown.length ? (
          <div className="py-10 text-center text-sm text-slate-400">
            {search ? t("No matching tags.") : t("No tags yet. Create your first tag above.")}
          </div>
        ) : (
          shown.map((tag) => {
            const id = String(tag._id);
            const isEditing = editingId === id;
            const isConfirming = confirmDeleteId === id;
            const busy = busyId === id;
            return (
              <div key={id} className="px-4 py-2.5 border-t border-slate-100 dark:border-white/[0.06]" id={`tag-row-${id}`}>
                <div className="grid grid-cols-12 items-center gap-2">
                  <div className="col-span-6 min-w-0">
                    {isEditing ? (
                      <input
                        autoFocus
                        value={editName}
                        maxLength={MAX_TAG_LENGTH}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveRename(tag);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        className={`${inputCls} h-8 w-full px-2.5 border-blue-400`}
                      />
                    ) : (
                      <TagChip tag={tag} />
                    )}
                  </div>
                  <div className="col-span-4 text-[12.5px] text-slate-500 dark:text-slate-400">
                    {tag.totalRuleCount === 1
                      ? t("1 configuration")
                      : t("{{count}} configurations", { count: tag.totalRuleCount || 0 })}
                  </div>
                  <div className="col-span-2 flex justify-end gap-1">
                    {isEditing ? (
                      <>
                        <button type="button" disabled={busy} onClick={() => saveRename(tag)} title={t("Save")}
                          className="h-8 w-8 rounded-md flex items-center justify-center text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30">
                          <Check className="w-4 h-4" />
                        </button>
                        <button type="button" disabled={busy} onClick={() => setEditingId(null)} title={t("Cancel")}
                          className="h-8 w-8 rounded-md flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5">
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      !isConfirming && (
                        <>
                          {canRename && (
                            <button type="button" id={`rename-tag-${id}`} title={t("Rename")}
                              onClick={() => { setConfirmDeleteId(null); setEditingId(id); setEditName(tag.name); }}
                              className="h-8 w-8 rounded-md flex items-center justify-center text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-white/5">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canDelete && (
                            <button type="button" id={`delete-tag-${id}`} title={t("Delete")}
                              onClick={() => { setEditingId(null); setConfirmDeleteId(id); }}
                              className="h-8 w-8 rounded-md flex items-center justify-center text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </>
                      )
                    )}
                  </div>
                </div>

                {isConfirming && (
                  <div className="mt-2 flex items-center justify-between gap-3 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 px-3 py-2">
                    <span className="text-[12px] text-red-700 dark:text-red-300">
                      {tag.totalRuleCount
                        ? t("Delete \"{{name}}\"? It will be removed from {{count}} configuration(s).", { name: tag.name, count: tag.totalRuleCount })
                        : t("Delete \"{{name}}\"?", { name: tag.name })}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button type="button" variant="outline" className="h-7 px-2.5 text-xs" disabled={busy} onClick={() => setConfirmDeleteId(null)}>
                        {t("Cancel")}
                      </Button>
                      <Button type="button" className="h-7 px-2.5 text-xs text-white" style={{ background: "#DC2626" }} disabled={busy} onClick={() => remove(tag)}>
                        {busy ? t("Deleting...") : t("Delete")}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
