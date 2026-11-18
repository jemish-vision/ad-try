import React, { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  NAVIGATION_SHORTCUTS,
  GENERAL_SHORTCUTS,
  SHORTCUT_CATEGORIES,
} from "../../utility/shortcuts/shortcutRegistry";
import { ShortcutKeycap, ChordBadge } from "./ShortcutKeycap";
import { MagnifyingGlass, X } from "@phosphor-icons/react";

export const KeyboardShortcutsModal = ({ open, onOpenChange }) => {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");

  const filteredNavigation = useMemo(() => {
    if (!search.trim()) return NAVIGATION_SHORTCUTS;
    const q = search.toLowerCase();
    return NAVIGATION_SHORTCUTS.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.path.toLowerCase().includes(q) ||
        s.chordDisplay.join("").toLowerCase().includes(q) ||
        s.altDisplay.toLowerCase().includes(q)
    );
  }, [search]);

  const filteredGeneral = useMemo(() => {
    if (!search.trim()) return GENERAL_SHORTCUTS;
    const q = search.toLowerCase();
    return GENERAL_SHORTCUTS.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.keyDisplay.join("").toLowerCase().includes(q)
    );
  }, [search]);

  const categories = [
    { key: SHORTCUT_CATEGORIES.OPTIMIZE, label: t("Optimize") },
    { key: SHORTCUT_CATEGORIES.OPERATIONS, label: t("Operations") },
    { key: SHORTCUT_CATEGORIES.MANAGEMENT, label: t("Management") },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] p-0 gap-0 overflow-hidden bg-white dark:bg-[#121a2d] border border-slate-200 dark:border-slate-800 shadow-2xl rounded-2xl">
        {/* Header */}
        <DialogHeader className="p-6 pb-4 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-900/50">
          <div className="flex items-center justify-between w-full mb-4">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center text-lg shadow-2xs border border-blue-500/20 shrink-0">
                <i className="fa-solid fa-keyboard" />
              </div>
              <div className="text-left space-y-1">
                <DialogTitle className="text-base font-bold text-slate-900 dark:text-white leading-tight">
                  {t("Keyboard Shortcuts")}
                </DialogTitle>
                <p className="text-xs text-slate-500 dark:text-slate-400 m-0 leading-normal">
                  {t("Press any combination to quickly jump between workspaces")}
                </p>
              </div>
            </div>
          </div>

          {/* Search Box */}
          <div className="relative">
            <MagnifyingGlass
              size={15}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("Filter shortcuts by name, route, or key...")}
              className="w-full pl-9 pr-8 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800/60 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </DialogHeader>

        {/* Scrollable Content */}
        <div className="p-5 overflow-y-auto max-h-[calc(85vh-160px)] space-y-5">
          {/* Workspaces by Category */}
          {categories.map((cat) => {
            const items = filteredNavigation.filter((s) => s.category === cat.key);
            if (!items.length) return null;

            return (
              <div key={cat.key} className="space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-1">
                  {cat.label}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/40 dark:bg-slate-900/30 hover:border-blue-500/30 dark:hover:border-blue-500/30 hover:bg-blue-50/30 dark:hover:bg-blue-950/20 transition-all"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 pr-2">
                        <div className="w-7 h-7 rounded-lg bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center text-xs shadow-2xs border border-slate-200/80 dark:border-slate-700/70 shrink-0">
                          <i className={item.icon} />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                            {t(item.name)}
                          </div>
                          <div className="text-[10.5px] text-slate-400 dark:text-slate-500 truncate">
                            {item.path}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <ChordBadge keys={item.chordDisplay} />
                        <span className="text-[10px] text-slate-400 dark:text-slate-500">/</span>
                        <ShortcutKeycap>{item.altDisplay}</ShortcutKeycap>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {/* General Shortcuts */}
          {filteredGeneral.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-1">
                {t("General & Utility")}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {filteredGeneral.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/40 dark:bg-slate-900/30"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                      <div className="w-7 h-7 rounded-lg bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center text-xs shadow-2xs border border-slate-200/80 dark:border-slate-700/70 shrink-0">
                        <i className={item.icon} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                          {t(item.name)}
                        </div>
                        <div className="text-[10.5px] text-slate-400 dark:text-slate-500 truncate">
                          {t(item.description)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {item.chordDisplay ? (
                        <>
                          <ChordBadge keys={item.chordDisplay} />
                          <span className="text-[10px] text-slate-400 dark:text-slate-500">/</span>
                          <ShortcutKeycap>{item.keyDisplay.join(" + ")}</ShortcutKeycap>
                        </>
                      ) : (
                        item.keyDisplay.map((k, i) => (
                          <ShortcutKeycap key={i}>{k}</ShortcutKeycap>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {filteredNavigation.length === 0 && filteredGeneral.length === 0 && (
            <div className="py-12 text-center text-slate-400 text-xs">
              {t("No shortcuts found matching your search.")}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 px-5 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-900/40 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5">
            <i className="fa-solid fa-lightbulb text-amber-500 text-xs" />
            <span>
              {t("Tip: Press")} <ShortcutKeycap>?</ShortcutKeycap> {t("anytime from any page to open this cheat sheet.")}
            </span>
          </div>
          <div>
            <ShortcutKeycap>Esc</ShortcutKeycap> {t("to dismiss")}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default KeyboardShortcutsModal;
