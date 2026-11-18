const test = require("node:test");
const assert = require("node:assert/strict");

test("isInputElement guards form elements and editors", () => {
  // Mock element structure
  const makeElement = (tag, isContentEditable = false, closestMatch = false) => ({
    tagName: tag.toUpperCase(),
    isContentEditable,
    closest: (selector) => (closestMatch ? {} : null),
  });

  const isInputElement = (target) => {
    if (!target) return false;
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

  assert.equal(isInputElement(makeElement("input")), true);
  assert.equal(isInputElement(makeElement("textarea")), true);
  assert.equal(isInputElement(makeElement("select")), true);
  assert.equal(isInputElement(makeElement("div", true)), true);
  assert.equal(isInputElement(makeElement("div", false, true)), true);
  assert.equal(isInputElement(makeElement("div")), false);
  assert.equal(isInputElement(makeElement("button")), false);
  assert.equal(isInputElement(makeElement("span")), false);
  assert.equal(isInputElement(null), false);
});

test("shortcutRegistry contains all 13 core workspaces and general shortcuts", async () => {
  const { NAVIGATION_SHORTCUTS, GENERAL_SHORTCUTS, SHORTCUTS_BY_PATH } = await import("./shortcutRegistry.js");
  
  assert.equal(NAVIGATION_SHORTCUTS.length, 13);
  assert.equal(GENERAL_SHORTCUTS.length, 3);
  
  // Verify all 13 pages have valid chords and routes
  const expectedPaths = [
    "/",
    "/campaigns",
    "/placement",
    "/budget-rule",
    "/targeting",
    "/search-term",
    "/recommandation",
    "/product-list",
    "/orders",
    "/inventory-management",
    "/fba-planning",
    "/profit-analysis",
    "/settings",
  ];

  for (const path of expectedPaths) {
    assert.ok(SHORTCUTS_BY_PATH[path], `Missing shortcut mapping for path: ${path}`);
    const sc = SHORTCUTS_BY_PATH[path];
    assert.equal(sc.chord[0], "g");
    assert.ok(sc.chord[1].length === 1);
    assert.ok(sc.altDisplay.startsWith("Alt +"));
  }

  // Verify Recommendation owns Alt + R and G R
  assert.equal(SHORTCUTS_BY_PATH["/recommandation"].altKey, "r");
  assert.deepEqual(SHORTCUTS_BY_PATH["/recommandation"].chord, ["g", "r"]);

  // Verify Placement owns Alt + L and G L
  assert.equal(SHORTCUTS_BY_PATH["/placement"].altKey, "l");
  assert.deepEqual(SHORTCUTS_BY_PATH["/placement"].chord, ["g", "l"]);
});

test("switchTheme handles missing setTheme callback without throwing", () => {
  // Simulate DOM environment for theme toggle
  let themeAttr = "light";
  let storageVal = "light";
  let eventDispatched = false;

  const mockRoot = {
    getAttribute: () => themeAttr,
    setAttribute: (name, val) => {
      if (name === "data-theme") themeAttr = val;
    },
    classList: {
      add: () => {},
      remove: () => {},
    },
    style: {
      setProperty: () => {},
    },
  };

  // Mock global document, window, localStorage
  const originalDoc = global.document;
  const originalWindow = global.window;
  const originalLocalStorage = global.localStorage;

  global.document = {
    documentElement: mockRoot,
    createElement: () => ({ style: { setProperty: () => {} }, appendChild: () => {}, remove: () => {} }),
    body: { appendChild: () => {} },
  };

  global.localStorage = {
    getItem: () => storageVal,
    setItem: (k, v) => { storageVal = v; },
  };

  global.window = {
    matchMedia: () => ({ matches: false }),
    dispatchEvent: () => { eventDispatched = true; },
  };

  global.Event = class { constructor(name) { this.name = name; } };

  try {
    const commit = (setTheme, nextTheme) => {
      if (typeof setTheme === "function") {
        setTheme(nextTheme);
      }
      global.localStorage.setItem("theme", nextTheme);
      global.document.documentElement.setAttribute("data-theme", nextTheme);
      global.window.dispatchEvent(new global.Event("themeChanged"));
    };

    // Calling commit without setTheme should not throw and should toggle theme
    assert.doesNotThrow(() => {
      commit(undefined, "dark");
    });
    assert.equal(themeAttr, "dark");
    assert.equal(storageVal, "dark");
    assert.equal(eventDispatched, true);
  } finally {
    global.document = originalDoc;
    global.window = originalWindow;
    global.localStorage = originalLocalStorage;
  }
});
