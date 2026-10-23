import React, { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Check, CaretDown, CaretUp } from "@phosphor-icons/react";
import { AppTooltip } from "./ui/AppTooltip";

const languages = [
  { code: "en", country: "en", label: "ENGLISH", flagUrl: "https://flagcdn.com/w40/gb.png" },
  { code: "es", country: "es", label: "ESPAÑOL", flagUrl: "https://flagcdn.com/w40/es.png" },
  { code: "fr", country: "fr", label: "FRANÇAIS", flagUrl: "https://flagcdn.com/w40/fr.png" },
  { code: "it", country: "it", label: "ITALIANO", flagUrl: "https://flagcdn.com/w40/it.png" },
  { code: "de", country: "de", label: "DEUTSCH", flagUrl: "https://flagcdn.com/w40/de.png" },
  { code: "pt", country: "pt", label: "PORTUGUÊS", flagUrl: "https://flagcdn.com/w40/pt.png" },
  { code: "ja", country: "jp", label: "日本語", flagUrl: "https://flagcdn.com/w40/jp.png" },
  { code: "zh", country: "cn", label: "中文", flagUrl: "https://flagcdn.com/w40/cn.png" },
  { code: "hi", country: "in", label: "हिन्दी", flagUrl: "https://flagcdn.com/w40/in.png" }
];

export default function LanguageSelector({ className = "" }) {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    const savedLng = localStorage.getItem("i18nextLng");
    if (savedLng && i18n && i18n.language !== savedLng) {
      i18n.changeLanguage(savedLng);
    }
    const handleLanguageChange = () => setTick((t) => t + 1);
    if (i18n) {
      i18n.on("languageChanged", handleLanguageChange);
    }
    return () => {
      if (i18n) {
        i18n.off("languageChanged", handleLanguageChange);
      }
    };
  }, [i18n]);

  const currentCode = (i18n?.language || localStorage.getItem("i18nextLng") || "en").slice(0, 2).toLowerCase();
  const currentLang = languages.find((l) => l.code === currentCode) || languages[0];

  const handleSelect = (code) => {
    i18n.changeLanguage(code);
    localStorage.setItem("i18nextLng", code);
    setIsOpen(false);
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className={`relative inline-block text-left shrink-0 ${className}`} ref={dropdownRef}>
      <AppTooltip text="Select Language" side="bottom">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center justify-between gap-2 px-3 py-1.5 min-w-[90px] h-9 bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-slate-700/80 rounded-md shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer focus:outline-none"
          aria-expanded={isOpen}
        >
          <div className="flex items-center gap-2">
            <img
              src={currentLang.flagUrl}
              alt={currentLang.label}
              className="w-5 h-3.5 object-cover rounded-[2px] shadow-sm shrink-0 border border-slate-200 dark:border-slate-700"
            />
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              {currentLang.country.toUpperCase()}
            </span>
          </div>
          {isOpen ? (
            <CaretUp size={12} weight="bold" className="text-slate-500 dark:text-slate-400 shrink-0" />
          ) : (
            <CaretDown size={12} weight="bold" className="text-slate-500 dark:text-slate-400 shrink-0" />
          )}
        </button>
      </AppTooltip>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-[#1e293b] rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700/80 p-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="flex flex-col gap-0.5">
            {languages.map((lang) => {
              const isSelected = currentCode === lang.code;
              return (
                <button
                  key={lang.code}
                  onClick={() => handleSelect(lang.code)}
                  className={`flex items-center justify-between w-full px-3.5 py-2.5 rounded-xl transition-colors duration-150 text-left cursor-pointer ${isSelected
                    ? "bg-slate-100 dark:bg-slate-800"
                    : "hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    }`}
                >
                  <div className="flex items-center gap-3.5 flex-1 min-w-0">
                    <img
                      src={lang.flagUrl}
                      alt={lang.label}
                      className="w-6 h-4 object-cover rounded-[2px] shadow-sm shrink-0 border border-slate-200 dark:border-slate-700"
                    />
                    <span className="tracking-wider text-sm font-extrabold text-slate-800 dark:text-slate-100 uppercase truncate">
                      {lang.label}
                    </span>
                  </div>

                  {isSelected && (
                    <Check size={18} weight="bold" className="text-emerald-600 dark:text-emerald-400 shrink-0 ml-2" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
