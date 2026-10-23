import * as React from "react"
import { HexColorPicker, HexColorInput } from "react-colorful"
import { useTranslation } from "react-i18next"
import { cn } from "../../lib/utils"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./popover"

const PRESET_COLORS = [
  { labelKey: "Blue", value: "#3b82f6" },
  { labelKey: "Indigo", value: "#6366f1" },
  { labelKey: "Purple", value: "#8b5cf6" },
  { labelKey: "Pink", value: "#ec4899" },
  { labelKey: "Red", value: "#ef4444" },
  { labelKey: "Orange", value: "#f97316" },
  { labelKey: "Amber", value: "#f59e0b" },
  { labelKey: "Emerald", value: "#10b981" },
  { labelKey: "Teal", value: "#14b8a6" },
  { labelKey: "Cyan", value: "#06b6d4" },
  { labelKey: "Slate", value: "#64748b" },
  { labelKey: "Dark", value: "#1e293b" },
];

const getContrastColor = (hex) => {
  if (!hex || hex.length < 7) return "#fff";
  const r = parseInt(hex.slice(1, 3), 16) || 0;
  const g = parseInt(hex.slice(3, 5), 16) || 0;
  const b = parseInt(hex.slice(5, 7), 16) || 0;
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 180 ? "#000" : "#fff";
};

export function ColorPicker({ value = "#3b82f6", onChange, disabled = false, className }) {
  const { t } = useTranslation();
  const currentColor = value || "#3b82f6";

  const handleColorChange = (newColor) => {
    if (onChange) {
      onChange(newColor);
    }
  };

  return (
    <Popover modal={true}>
      <PopoverTrigger
        type="button"
        disabled={disabled}
        className={cn(
          "w-full h-[40px] px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e293b] text-sm flex items-center justify-between transition-all duration-200 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-blue-500/20 hover:border-slate-300 dark:hover:border-slate-600",
          className
        )}
      >
        <div className="flex items-center gap-2.5">
          <span
            className="w-5 h-5 rounded-md border border-black/10 dark:border-white/10 shadow-xs shrink-0 transition-transform"
            style={{ backgroundColor: currentColor }}
          />
          <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-200">
            {currentColor.toUpperCase()}
          </span>
        </div>
        <i className="fa-solid fa-palette text-slate-400 dark:text-slate-500 text-xs" />
      </PopoverTrigger>
      <PopoverContent
        className="w-[230px] p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl z-[9999]"
        align="start"
      >
        <div className="flex flex-col gap-3" onPointerDown={(e) => e.stopPropagation()}>
          <div>
            <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wider">
              {t("Presets")}
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {PRESET_COLORS.map((preset) => {
                const isSelected = preset.value.toLowerCase() === currentColor.toLowerCase();
                return (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => handleColorChange(preset.value)}
                    className={cn(
                      "w-7 h-7 rounded-lg border border-black/10 dark:border-white/10 flex items-center justify-center transition-transform hover:scale-110 cursor-pointer",
                      isSelected && "ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-slate-900 scale-105"
                    )}
                    style={{ backgroundColor: preset.value }}
                    title={t(preset.labelKey)}
                  >
                    {isSelected && (
                      <i
                        className="fa-solid fa-check text-[10px]"
                        style={{ color: getContrastColor(preset.value) }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-t border-slate-100 dark:border-slate-800 pt-2">
            <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wider">
              {t("Custom")}
            </div>
            <div className="custom-color-picker-wrapper overflow-hidden rounded-lg mb-2.5 border border-slate-200 dark:border-slate-700">
              <HexColorPicker
                color={currentColor}
                onChange={handleColorChange}
                style={{ width: "100%", height: "130px" }}
              />
            </div>
            <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/80 rounded-md border border-slate-200 dark:border-slate-700 px-2 py-1">
              <span className="text-slate-400 font-mono text-xs font-bold">#</span>
              <HexColorInput
                color={currentColor}
                onChange={handleColorChange}
                className="w-full bg-transparent text-xs font-mono font-semibold text-slate-700 dark:text-slate-200 focus:outline-none uppercase"
              />
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default ColorPicker;