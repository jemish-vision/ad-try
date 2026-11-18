import React from "react";
import { useTranslation } from "react-i18next";

export const ShortcutKeycap = ({ children, className = "" }) => {
  return (
    <kbd
      className={`inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 text-[11px] font-mono font-semibold rounded-md border transition-colors shadow-2xs select-none ${
        "bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700"
      } ${className}`}
    >
      {children}
    </kbd>
  );
};

export const ChordBadge = ({ keys = [], separator, className = "" }) => {
  const { t } = useTranslation();
  const sep = separator !== undefined ? separator : t("then");
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      {keys.map((k, index) => (
        <React.Fragment key={index}>
          <ShortcutKeycap>{k}</ShortcutKeycap>
          {index < keys.length - 1 && (
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium lowercase">
              {sep}
            </span>
          )}
        </React.Fragment>
      ))}
    </span>
  );
};

export default ShortcutKeycap;
