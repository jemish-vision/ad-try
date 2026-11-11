import { flushSync } from "react-dom";
import { THEME_ANIMATIONS_ENABLED } from "./themeConfig";

let activeTransition;
let activeOrigin;
let pendingTheme;
let revision = 0;
let restoreFrame;

export function switchTheme(event, setTheme) {
  const root = document.documentElement;
  const currentTheme = pendingTheme || root.getAttribute("data-theme") || localStorage.getItem("theme") ||
    (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const nextTheme = currentTheme === "light" ? "dark" : "light";
  const animate = THEME_ANIMATIONS_ENABLED && Boolean(document.startViewTransition) &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const currentRevision = ++revision;
  pendingTheme = nextTheme;
  activeTransition?.skipTransition();
  activeOrigin?.remove();
  cancelAnimationFrame(restoreFrame);

  // Prevent per-element color transitions from lagging behind the theme or
  // being captured halfway through by the view transition snapshots.
  root.classList.add("theme-switching");
  const updateTheme = () => {
    if (currentRevision !== revision) return;
    const commit = () => {
      setTheme(nextTheme);
      localStorage.setItem("theme", nextTheme);
      root.setAttribute("data-theme", nextTheme);
      window.dispatchEvent(new Event("themeChanged"));
    };
    // Only native snapshots need a synchronous React commit. Direct switching
    // lets event listeners and mutation observers batch their React updates.
    if (animate) flushSync(commit);
    else commit();
  };
  const restore = () => {
    if (currentRevision !== revision) return;
    pendingTheme = undefined;
    activeTransition = undefined;
    // Keep transitions suppressed through the first paint of the new theme.
    restoreFrame = requestAnimationFrame(() => {
      restoreFrame = requestAnimationFrame(() => {
        root.classList.remove("theme-switching");
        // Restoring transition durations can start transitions for inherited
        // properties (notably scrollbar-color). Settle them before this paint;
        // leave unrelated keyframe animations, such as loaders, running.
        for (const animation of document.getAnimations?.() || []) {
          if (animation.constructor.name === "CSSTransition") animation.cancel();
        }
      });
    });
  };

  if (!animate) {
    updateTheme();
    restore();
    return;
  }

  const x = event?.clientX !== undefined ? `${event.clientX}px` : "50%";
  const y = event?.clientY !== undefined ? `${event.clientY}px` : "50%";
  root.style.setProperty("--vt-x", x);
  root.style.setProperty("--vt-y", y);
  const origin = document.createElement("div");
  origin.className = "ad-click-origin";
  origin.style.setProperty("--vt-x", x);
  origin.style.setProperty("--vt-y", y);
  for (const className of ["ad-click-ring", "ad-click-ring", "ad-click-ring", "ad-click-spark", "ad-smile-arc"]) {
    const element = document.createElement("div");
    element.className = className;
    origin.appendChild(element);
  }
  activeOrigin = origin;
  document.body.appendChild(origin);
  setTimeout(() => origin.remove(), 1000);

  activeTransition = document.startViewTransition(updateTheme);
  // ready rejects when a rapid toggle skips a transition. finished still settles.
  activeTransition.ready.catch(() => {});
  activeTransition.finished.then(restore, restore);
}
