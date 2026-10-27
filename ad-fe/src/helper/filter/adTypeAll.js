// "All" ad-type (SP + SB + SD combined) support.
//
// The ad type is sent to the backend as one global header. Not every screen has
// been migrated to handle "All" yet, so this module gates where "All" is
// actually sent: on an unsupported screen the effective ad type degrades to SP
// (and the UI shows a note). This guarantees no screen ever silently shows
// SP-only data while the user believes they are seeing "All".
//
// Grow ALL_SUPPORTED_ROUTES as each phase lands.

export const AD_TYPE_ALL = "All";

// Exact list routes whose backend renders merged SP+SB+SD data. A route is added
// here ONLY once its endpoint is migrated, so selecting "All" never degrades to a
// silent SP view on a screen that can't combine types yet. Detail/drilldown routes
// (e.g. /targeting/detail/:id) are intentionally excluded — they act on a single
// entity whose own ad type governs.
//   Phase 1 targets (added as each endpoint lands):
//   "/campaigns", "/targeting", "/search-term", "/placement", "/products", "/history"
export const ALL_SUPPORTED_ROUTES = ["/search-term", "/placement", "/products", "/history"];

// Views where SD contributes no data (keywords, search terms, placements), so
// "All" there means SP + SB only, with a "no SD data" note.
export const SD_EXCLUDED_ROUTES = ["/search-term", "/placement"];

function normalizePath(pathname) {
  const path = String(pathname || "");
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

export function isAllSupportedRoute(pathname) {
  return ALL_SUPPORTED_ROUTES.includes(normalizePath(pathname));
}

export function isSdExcludedRoute(pathname) {
  return SD_EXCLUDED_ROUTES.includes(normalizePath(pathname));
}

// The ad type to actually send for the current screen: "All" only where it is
// supported, otherwise SP.
export function getEffectiveAdType(pathname, selectedAdType) {
  const selected = selectedAdType || (typeof localStorage !== "undefined" && localStorage.getItem("adType")) || "SP";
  if (selected === AD_TYPE_ALL) {
    return isAllSupportedRoute(pathname) ? AD_TYPE_ALL : "SP";
  }
  return selected;
}

// Whether the current screen is actively showing the combined "All" view.
export function isShowingAllAdTypes(pathname, selectedAdType) {
  return getEffectiveAdType(pathname, selectedAdType) === AD_TYPE_ALL;
}
