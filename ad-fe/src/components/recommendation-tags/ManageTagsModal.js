import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Trash2, Check, X, Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import Toast from "../../common/helper/toast/Toast";
import { TagChip, MAX_TAG_LENGTH } from "./RecommendationTags";
import {
  ApiGetRecommendationTags,
  ApiRenameRecommendationTag,
  ApiDeleteRecommendationTag,
} from "../../api-wrapper/recommendation/ApiRecommendation";

/**
 * Recommendation Configuration → "Manage Tags": rename or delete the account's tags.
 * Deleting removes the tag from every configuration that uses it.
 *
 * @param {boolean} open
 * @param {() => void} onClose
 * @param {() => void} [onChanged] a tag was renamed or deleted (reload the configuration list)
 * @param {boolean} [canRename]
 * @param {boolean} [canDelete]
 */
export default function ManageTagsModal({ open, onClose, onChanged, canRename = true, canDelete = true }) {
  const { t } = useTranslation();
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await ApiGetRecommendationTags({});
    if (res?.isSuccess) setTags(res.data || []);
    else Toast.error(res?.message || t("Something went wrong"));
    setLoading(false);
  }, [t]);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setEditingId(null);
    setConfirmDeleteId(null);
    load();
  }, [open, load]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? tags.filter((tg) => tg.name.toLowerCase().includes(q)) : tags;
  }, [tags, search]);

  const startRename = (tag) => {
    setConfirmDeleteId(null);
    setEditingId(String(tag._id));
    setEditName(tag.name);
  };

  const saveRename = async (tag) => {
    const name = editName.replace(/\s+/g, " ").trim();
    if (!name) return Toast.error(t("Tag name is required"));
    if (name === tag.name) return setEditingId(null);
    setBusyId(String(tag._id));
    const res = await ApiRenameRecommendationTag({ tagId: tag._id, name });
    setBusyId(null);
    if (res?.isSuccess) {
      Toast.success(t("Tag renamed"));
      setTags((prev) =>
        prev.map((tg) => (String(tg._id) === String(tag._id) ? { ...tg, ...res.data } : tg)).sort((a, b) => a.name.localeCompare(b.name))
      );
      setEditingId(null);
      onChanged?.();
    } else {
      Toast.error(t(res?.message || "Something went wrong"));
    }
  };

  const deleteTag = async (tag) => {
    setBusyId(String(tag._id));
    const res = await ApiDeleteRecommendationTag({ tagId: tag._id });
    setBusyId(null);
    if (res?.isSuccess) {
      Toast.success(t("Tag deleted"));
      setTags((prev) => prev.filter((tg) => String(tg._id) !== String(tag._id)));
      setConfirmDeleteId(null);
      onChanged?.();
    } else {
      Toast.error(t(res?.message || "Something went wrong"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-[560px] w-[95vw] premium-modal modal-content p-0 overflow-hidden bg-white dark:bg-slate-900 border-none gap-0" id="manage-recommendation-tags-modal">
        <DialogHeader className="modal-header border-b border-gray-200 dark:border-slate-800 p-4">
          <DialogTitle className="modal-title font-bold text-lg text-slate-900 dark:text-slate-50">{t("Manage Tags")}</DialogTitle>
          <p className="text-xs text-slate-500 dark:text-slate-400 m-0">
            {t("Tags are shared by all profiles of this account. Renaming updates every configuration; deleting removes the tag from them.")}
          </p>
        </DialogHeader>

        <div className="p-4 flex flex-col gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("Search tags")}
              className="h-9 w-full pl-8 pr-3 rounded-md text-[13px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 outline-none focus:border-blue-400"
            />
          </div>

          <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-slate-200 dark:border-white/10 divide-y divide-slate-100 dark:divide-white/[0.06]">
            {loading ? (
              <div className="py-8 text-center text-sm text-slate-400">{t("Loading...")}</div>
            ) : !shown.length ? (
              <div className="py-8 text-center text-sm text-slate-400">
                {search ? t("No matching tags.") : t("No tags yet. Add tags while creating or editing a recommendation.")}
              </div>
            ) : (
              shown.map((tag) => {
                const id = String(tag._id);
                const isEditing = editingId === id;
                const isConfirming = confirmDeleteId === id;
                const busy = busyId === id;
                return (
                  <div key={id} className="px-3 py-2.5" id={`manage-tag-${id}`}>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
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
                            className="h-8 w-full px-2.5 rounded-md text-[13px] bg-white dark:bg-slate-900 border border-blue-400 text-slate-800 dark:text-slate-100 outline-none"
                          />
                        ) : (
                          <div className="flex items-center gap-2 min-w-0">
                            <TagChip tag={tag} />
                            <span className="text-[11.5px] text-slate-400 whitespace-nowrap">
                              {tag.totalRuleCount === 1
                                ? t("Used in 1 configuration")
                                : t("Used in {{count}} configurations", { count: tag.totalRuleCount || 0 })}
                            </span>
                          </div>
                        )}
                      </div>

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
                              <button type="button" onClick={() => startRename(tag)} title={t("Rename")} id={`rename-tag-${id}`}
                                className="h-8 w-8 rounded-md flex items-center justify-center text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-white/5">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {canDelete && (
                              <button type="button" onClick={() => { setEditingId(null); setConfirmDeleteId(id); }} title={t("Delete")} id={`delete-tag-${id}`}
                                className="h-8 w-8 rounded-md flex items-center justify-center text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </>
                        )
                      )}
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
                          <Button type="button" className="h-7 px-2.5 text-xs bg-red-600 hover:bg-red-700 text-white" disabled={busy} onClick={() => deleteTag(tag)}>
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
      </DialogContent>
    </Dialog>
  );
}
