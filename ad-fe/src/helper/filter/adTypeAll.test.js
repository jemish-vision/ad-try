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

  test("All degrades to SP on routes not yet migrated", () => {
    // Until an endpoint is migrated its route is not in ALL_SUPPORTED_ROUTES,
    // so "All" must degrade to SP rather than silently show SP-labelled data.
    expect(getEffectiveAdType("/campaigns", "All")).toBe("SP");
    expect(getEffectiveAdType("/orders", "All")).toBe("SP");
    // detail/drilldown routes are never list routes
    expect(getEffectiveAdType("/targeting/detail/123", "All")).toBe("SP");
    // sibling routes that only share a prefix must not be treated as supported
    expect(getEffectiveAdType("/search-term-rule", "All")).toBe("SP");
    expect(getEffectiveAdType("/search-term-history", "All")).toBe("SP");
  });

  test("All is sent on migrated routes", () => {
    // Migrated screens pass "All" through.
    expect(getEffectiveAdType("/search-term", "All")).toBe("All");
    expect(getEffectiveAdType("/search-term/", "All")).toBe("All");
    expect(getEffectiveAdType("/placement", "All")).toBe("All");
    expect(getEffectiveAdType("/products", "All")).toBe("All");
    expect(getEffectiveAdType("/history", "All")).toBe("All");
    expect(getEffectiveAdType("/targeting", "All")).toBe("All");
    // the targeting-history drilldown and campaign-scoped targeting are not All-ready
    expect(getEffectiveAdType("/targeting/history/abc", "All")).toBe("SP");
    expect(getEffectiveAdType("/targeting/123", "All")).toBe("SP");
    expect(getEffectiveAdType("/targeting/detail/123", "All")).toBe("SP");
  });

  test("isAllSupportedRoute honors the allowlist (and trailing slashes)", () => {
    expect(isAllSupportedRoute("/search-term")).toBe(true);
    expect(isAllSupportedRoute("/search-term/")).toBe(true);
    expect(isAllSupportedRoute("/placement")).toBe(true);
    expect(isAllSupportedRoute("/campaigns")).toBe(false);
    expect(isAllSupportedRoute("/campaigns/")).toBe(false);
    // prefix-sharing siblings are not matched
    expect(isAllSupportedRoute("/search-term-rule")).toBe(false);
    expect(isAllSupportedRoute("/placement-rule")).toBe(false);
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
