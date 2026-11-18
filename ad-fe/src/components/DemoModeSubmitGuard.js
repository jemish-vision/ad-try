import { useContext, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { ProfileContext } from "../helper/usecontext/useContext";
import { Toast } from "../helper/links/Link";

/**
 * DemoModeSubmitGuard
 * -------------------
 * Global guard that disables every "submit"-type action button across the
 * application while Demo (mock data) Mode is ON.
 *
 * A button is treated as a submit action when ANY of these is true:
 *   - it has an explicit `type="submit"` attribute (or is <input type="submit">)
 *   - it has the `data-demo-block` attribute
 *   - its visible label starts with Submit / Save / Update / Apply Changes /
 *     Confirm / Run Now (e.g. "Submit", "Save", "Save Changes",
 *     "Update and Save", "Submit Campaign")
 *
 * Opt-out: add `data-demo-allow` to a button (or any ancestor) to keep it
 * clickable in Demo Mode. Purely UI-preference saves (filters / columns /
 * views) and Cancel / Close buttons are always allowed.
 *
 * Two layers of protection:
 *   1. Visual  - matching buttons get `disabled`, reduced opacity and a tooltip.
 *   2. Runtime - a capture-phase click listener blocks any matching button that
 *                slipped through (e.g. re-enabled by a React re-render) and
 *                shows a toast instead of running the action.
 */

const MESSAGE = "This action is disabled in Demo Mode";
const PUBLIC_PATHS = ["/login", "/registration", "/forgot-password", "/reset-password", "/accept-invitation", "/maintenance-mode"];

const BLOCK_LABEL = /(^(submit|save|update|apply|confirm|run now|enable|pause|archive|delete|create|add|launch)\b|add negative|negative)/i;
const ALLOW_LABEL = /(cancel|close|filter|column|view|layout|preference|mock data|demo|export|download|refresh|reset|back|next|previous)/i;

const MARK = "data-demo-disabled";

const getLabel = (el) =>
  String(el.getAttribute("aria-label") || el.innerText || el.value || el.textContent || "")
    .replace(/\s+/g, " ")
    .replace(/\(\d+\)/g, "")
    .trim();

const isSubmitAction = (el) => {
  if (!el || el.closest("[data-demo-allow]")) return false;
  if (el.hasAttribute("data-demo-block")) return true;

  const label = getLabel(el);
  if (label && ALLOW_LABEL.test(label)) return false;

  const explicitType = (el.getAttribute("type") || "").toLowerCase();
  if (explicitType === "submit") return true;

  return Boolean(label) && BLOCK_LABEL.test(label);
};

const SELECTOR = 'button, input[type="submit"], [role="button"]';

const isDemoActive = (loginUser) => {
  if (!localStorage.getItem("sellerToken")) return false;
  if (localStorage.getItem("isMockUser") === "false") return false;
  if (typeof loginUser?.isMockUser === "boolean") return loginUser.isMockUser;
  if (localStorage.getItem("isMockUser") === "true") return true;
  return false;
};

const disableEl = (el) => {
  if (el.hasAttribute(MARK)) return;
  // Remember whether it was already disabled so we can restore it faithfully.
  el.setAttribute(MARK, el.disabled ? "pre" : "1");
  if ("disabled" in el) el.disabled = true;
  el.setAttribute("aria-disabled", "true");
  el.dataset.demoPrevTitle = el.getAttribute("title") || "";
  el.setAttribute("title", MESSAGE);
  el.style.opacity = "0.5";
  el.style.cursor = "not-allowed";
};

const restoreEl = (el) => {
  const mark = el.getAttribute(MARK);
  if (!mark) return;
  if (mark === "1" && "disabled" in el) el.disabled = false;
  el.removeAttribute("aria-disabled");
  const prevTitle = el.dataset.demoPrevTitle;
  if (prevTitle) el.setAttribute("title", prevTitle);
  else el.removeAttribute("title");
  delete el.dataset.demoPrevTitle;
  el.style.opacity = "";
  el.style.cursor = "";
  el.removeAttribute(MARK);
};

const DemoModeSubmitGuard = () => {
  const { loginUser } = useContext(ProfileContext) || {};
  const location = useLocation();
  const [active, setActive] = useState(() => isDemoActive(loginUser));
  const lastToastRef = useRef(0);

  const onPublicPage = PUBLIC_PATHS.some((p) => location.pathname.startsWith(p));
  const enabled = active && !onPublicPage;

  // Keep `active` in sync with context + localStorage (toggle happens in-tab).
  useEffect(() => {
    const check = () => setActive(isDemoActive(loginUser));
    check();
    const id = setInterval(check, 1000);
    window.addEventListener("storage", check);
    window.addEventListener("profileChanged", check);
    return () => {
      clearInterval(id);
      window.removeEventListener("storage", check);
      window.removeEventListener("profileChanged", check);
    };
  }, [loginUser]);

  // Layer 1: visually disable matching buttons (including ones rendered later).
  useEffect(() => {
    if (!enabled) {
      document.querySelectorAll(`[${MARK}]`).forEach(restoreEl);
      return undefined;
    }

    const scan = () => {
      document.querySelectorAll(SELECTOR).forEach((el) => {
        if (isSubmitAction(el)) disableEl(el);
        else if (el.hasAttribute(MARK)) restoreEl(el);
      });
    };

    let frame = null;
    const scheduleScan = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        scan();
      });
    };

    scan();
    const observer = new MutationObserver(scheduleScan);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["disabled", "type"],
    });

    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
      document.querySelectorAll(`[${MARK}]`).forEach(restoreEl);
    };
  }, [enabled]);

  // Layer 2: hard-block clicks / Enter-key submits on matching buttons.
  useEffect(() => {
    if (!enabled) return undefined;

    const block = (e) => {
      const el = e.target?.closest?.(SELECTOR);
      if (!el || !isSubmitAction(el)) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation?.();
      const now = Date.now();
      if (now - lastToastRef.current > 1500) {
        lastToastRef.current = now;
        Toast.error(MESSAGE);
      }
    };

    // Implicit form submission (Enter key) dispatches a click on the form's
    // default submit button, so the click listener covers it as well.
    document.addEventListener("click", block, true);
    return () => document.removeEventListener("click", block, true);
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div
      id="demo-mode-badge-indicator"
      className="fixed bottom-4 left-6 z-[9999] pointer-events-auto select-none"
    >
      <div
        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500 text-white shadow-lg text-xs font-semibold tracking-wide border border-amber-400"
        title="Demo Mode: Sample static data is shown. Real Amazon changes, bulk actions, and Amazon API calls are disabled."
      >
        <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
        <span>Demo Mode – Sample Data</span>
      </div>
    </div>
  );
};

export default DemoModeSubmitGuard;
