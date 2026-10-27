import {
  getEffectiveAdType,
  isAllSupportedRoute,
  isSdExcludedRoute,
  isShowingAllAdTypes,
} from "./adTypeAll";

describe("adTypeAll guard", () => {
  test("a single ad type is passed through unchanged on any route", () => {
    expect(getEffectiveAdType("/campaigns", "SP")).toBe("SP");
    expect(getEffectiveAdType("/orders", "SB")).toBe("SB");
    expect(getEffectiveAdType("/targeting", "SD")).toBe("SD");
  });

  test("All degrades to SP on routes not yet migrated (allowlist empty)", () => {
    // Until an endpoint is migrated its route is not in ALL_SUPPORTED_ROUTES,
    // so "All" must degrade to SP rather than silently show SP-labelled data.
    expect(getEffectiveAdType("/campaigns", "All")).toBe("SP");
    expect(getEffectiveAdType("/orders", "All")).toBe("SP");
    // detail/drilldown routes are never list routes
    expect(getEffectiveAdType("/targeting/detail/123", "All")).toBe("SP");
  });

  test("isAllSupportedRoute honors the allowlist (and trailing slashes)", () => {
    // With the allowlist empty no route is supported yet.
    expect(isAllSupportedRoute("/campaigns")).toBe(false);
    expect(isAllSupportedRoute("/campaigns/")).toBe(false);
  });

  test("SD-excluded routes are flagged", () => {
    expect(isSdExcludedRoute("/search-term")).toBe(true);
    expect(isSdExcludedRoute("/placement")).toBe(true);
    expect(isSdExcludedRoute("/campaigns")).toBe(false);
  });

  test("isShowingAllAdTypes reflects the effective type", () => {
    expect(isShowingAllAdTypes("/orders", "All")).toBe(false);
    expect(isShowingAllAdTypes("/campaigns", "SP")).toBe(false);
  });
});
