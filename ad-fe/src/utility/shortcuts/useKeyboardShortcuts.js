import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { NAVIGATION_SHORTCUTS } from "./shortcutRegistry";
import { switchTheme } from "../../helper/theme/switchTheme";

const CHORD_TIMEOUT_MS = 1200;

export const isInputElement = (target) => {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tagName = target.tagName ? target.tagName.toLowerCase() : "";
  if (tagName === "input" || tagName === "textarea" || tagName === "select") return true;
  if (target.isContentEditable) return true;
  if (
    target.closest("[contenteditable='true']") ||
    target.closest(".ql-editor") ||
    target.closest(".monaco-editor")
  ) {
    return true;
  }
  return false;
};

export const useKeyboardShortcuts = ({ enabled = true } = {}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [activeChord, setActiveChord] = useState(null);

  const chordBufferRef = useRef(null);
  const chordTimerRef = useRef(null);

  const clearChord = useCallback(() => {
    chordBufferRef.current = null;
    setActiveChord(null);
    if (chordTimerRef.current) {
      clearTimeout(chordTimerRef.current);
      chordTimerRef.current = null;
    }
  }, []);

  const triggerThemeToggle = useCallback((event) => {
    try {
      switchTheme(event);
    } catch (err) {
      console.warn("switchTheme failed, falling back to direct toggle:", err);
      const root = document.documentElement;
      const currentTheme = root.getAttribute("data-theme") || localStorage.getItem("theme") || "light";
      const nextTheme = currentTheme === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", nextTheme);
      localStorage.setItem("theme", nextTheme);
      window.dispatchEvent(new Event("themeChanged"));
    }
  }, []);

  const openGuide = useCallback(() => {
    if (!enabled) return;
    clearChord();
    setIsGuideOpen(true);
  }, [enabled, clearChord]);

  const closeGuide = useCallback(() => {
    setIsGuideOpen(false);
    clearChord();
  }, [clearChord]);

  useEffect(() => {
    if (!enabled) {
      setIsGuideOpen(false);
      clearChord();
    }
  }, [enabled, clearChord]);

  // Handle external open event (e.g. from header button)
  useEffect(() => {
    if (!enabled) return undefined;
    const handleExternalOpen = () => openGuide();
    window.addEventListener("openShortcutsGuide", handleExternalOpen);
    return () => window.removeEventListener("openShortcutsGuide", handleExternalOpen);
  }, [enabled, openGuide]);

  useEffect(() => {
    if (!enabled) return undefined;
    const handleKeyDown = (e) => {
      // 1. Guard against firing inside input, textarea, contenteditable, etc.
      if (isInputElement(e.target)) {
        if (e.key === "Escape") {
          // Allow Esc to blur input field
          e.target.blur();
        }
        return;
      }

      // Ignore if Control or Meta (Cmd on Mac) is pressed (allows native Ctrl+C, Cmd+K, etc.)
      if (e.ctrlKey || e.metaKey) {
        return;
      }

      const key = e.key.toLowerCase();

      // 2. Escape closes the guide modal or clears chord
      if (e.key === "Escape") {
        if (isGuideOpen) {
          e.preventDefault();
          closeGuide();
        } else if (chordBufferRef.current) {
          clearChord();
        }
        return;
      }

      // 3. Question mark '?' opens the Shortcuts Guide modal
      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        setIsGuideOpen((prev) => !prev);
        clearChord();
        return;
      }

      // 4. Alt + Key combinations (e.g. Alt + D, Alt + C, Alt + M for theme)
      if (e.altKey && !e.shiftKey) {
        if (key === "m" || e.code === "KeyM") {
          e.preventDefault();
          triggerThemeToggle(e);
          clearChord();
          return;
        }

        const match = NAVIGATION_SHORTCUTS.find(
          (s) =>
            s.altKey === key ||
            (s.altKey === "," ? e.code === "Comma" : e.code === `Key${s.altKey.toUpperCase()}`)
        );
        if (match) {
          e.preventDefault();
          clearChord();
          if (location.pathname !== match.path) {
            navigate(match.path);
          }
          return;
        }
      }

      // 5. Sequence Chords ('g' then '<key>')
      if (!e.altKey && !e.shiftKey) {
        if (!chordBufferRef.current) {
          if (key === "g" || e.code === "KeyG") {
            chordBufferRef.current = "g";
            setActiveChord("G");
            if (chordTimerRef.current) clearTimeout(chordTimerRef.current);
            chordTimerRef.current = setTimeout(() => {
              clearChord();
            }, CHORD_TIMEOUT_MS);
          }
        } else if (chordBufferRef.current === "g") {
          e.preventDefault();
          // Theme toggle chord: G then M
          if (key === "m" || e.code === "KeyM") {
            triggerThemeToggle(e);
            clearChord();
            return;
          }

          const match = NAVIGATION_SHORTCUTS.find(
            (s) =>
              s.chord &&
              s.chord[0] === "g" &&
              (s.chord[1] === key ||
                (s.chord[1] === "," ? e.code === "Comma" : e.code === `Key${s.chord[1].toUpperCase()}`))
          );

          if (match) {
            clearChord();
            if (location.pathname !== match.path) {
              navigate(match.path);
            }
          } else {
            // Unrecognized second key, reset chord buffer
            clearChord();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (chordTimerRef.current) clearTimeout(chordTimerRef.current);
    };
  }, [enabled, navigate, location.pathname, isGuideOpen, closeGuide, openGuide, clearChord, triggerThemeToggle]);

  return {
    isGuideOpen,
    setIsGuideOpen,
    openGuide,
    closeGuide,
    activeChord,
  };
};

export default useKeyboardShortcuts;
