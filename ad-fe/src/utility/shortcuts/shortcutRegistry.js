/**
 * Keyboard Shortcuts Registry for AdvertiseIQ
 * 
 * Defines standard sequence chords (e.g. 'G' then 'D') and Alt modifiers (Alt + D)
 * for the 12 primary application workspaces + global utilities.
 */

export const SHORTCUT_CATEGORIES = {
  OPTIMIZE: "Optimize",
  OPERATIONS: "Operations",
  MANAGEMENT: "Management",
  GENERAL: "General",
};

export const NAVIGATION_SHORTCUTS = [
  // ── Optimize ──
  {
    id: "dashboard",
    name: "Dashboard",
    category: SHORTCUT_CATEGORIES.OPTIMIZE,
    path: "/",
    chord: ["g", "d"],
    chordDisplay: ["G", "D"],
    altKey: "d",
    altDisplay: "Alt + D",
    description: "Go to Main Performance Dashboard",
    icon: "fa-solid fa-house",
  },
  {
    id: "campaigns",
    name: "Campaigns",
    category: SHORTCUT_CATEGORIES.OPTIMIZE,
    path: "/campaigns",
    chord: ["g", "c"],
    chordDisplay: ["G", "C"],
    altKey: "c",
    altDisplay: "Alt + C",
    description: "Go to Ad Campaigns",
    icon: "fa-solid fa-bullhorn",
  },
  {
    id: "placement",
    name: "Placement",
    category: SHORTCUT_CATEGORIES.OPTIMIZE,
    path: "/placement",
    chord: ["g", "l"],
    chordDisplay: ["G", "L"],
    altKey: "l",
    altDisplay: "Alt + L",
    description: "Go to Placement Bids & Placement Rules",
    icon: "fa-solid fa-crosshairs",
  },
  {
    id: "budget-rules",
    name: "Budget Rules",
    category: SHORTCUT_CATEGORIES.OPTIMIZE,
    path: "/budget-rule",
    chord: ["g", "b"],
    chordDisplay: ["G", "B"],
    altKey: "b",
    altDisplay: "Alt + B",
    description: "Go to Automated Budget Rules",
    icon: "fa-solid fa-sack-dollar",
  },
  {
    id: "targeting",
    name: "Targeting",
    category: SHORTCUT_CATEGORIES.OPTIMIZE,
    path: "/targeting",
    chord: ["g", "t"],
    chordDisplay: ["G", "T"],
    altKey: "t",
    altDisplay: "Alt + T",
    description: "Go to Targets & Keywords",
    icon: "fa-solid fa-chart-simple",
  },
  {
    id: "search-term",
    name: "Search Term",
    category: SHORTCUT_CATEGORIES.OPTIMIZE,
    path: "/search-term",
    chord: ["g", "s"],
    chordDisplay: ["G", "S"],
    altKey: "s",
    altDisplay: "Alt + S",
    description: "Go to Search Term Intelligence",
    icon: "fa-solid fa-magnifying-glass-chart",
  },
  {
    id: "recommendation",
    name: "Recommendation",
    category: SHORTCUT_CATEGORIES.OPTIMIZE,
    path: "/recommandation",
    chord: ["g", "r"],
    chordDisplay: ["G", "R"],
    altKey: "r",
    altDisplay: "Alt + R",
    description: "Go to Recommendations",
    icon: "fa-solid fa-star",
  },

  // ── Operations ──
  {
    id: "product-list",
    name: "Product List",
    category: SHORTCUT_CATEGORIES.OPERATIONS,
    path: "/product-list",
    chord: ["g", "p"],
    chordDisplay: ["G", "P"],
    altKey: "p",
    altDisplay: "Alt + P",
    description: "Go to Product Catalog & Listings",
    icon: "fa-solid fa-box-open",
  },
  {
    id: "orders",
    name: "Orders",
    category: SHORTCUT_CATEGORIES.OPERATIONS,
    path: "/orders",
    chord: ["g", "o"],
    chordDisplay: ["G", "O"],
    altKey: "o",
    altDisplay: "Alt + O",
    description: "Go to Customer Orders",
    icon: "fa-solid fa-cart-shopping",
  },
  {
    id: "inventory",
    name: "Inventory",
    category: SHORTCUT_CATEGORIES.OPERATIONS,
    path: "/inventory-management",
    chord: ["g", "i"],
    chordDisplay: ["G", "I"],
    altKey: "i",
    altDisplay: "Alt + I",
    description: "Go to FBA & FBM Inventory",
    icon: "fa-solid fa-warehouse",
  },
  {
    id: "fba-planning",
    name: "FBA Planning",
    category: SHORTCUT_CATEGORIES.OPERATIONS,
    path: "/fba-planning",
    chord: ["g", "f"],
    chordDisplay: ["G", "F"],
    altKey: "f",
    altDisplay: "Alt + F",
    description: "Go to FBA Restock & Planning",
    icon: "fa-solid fa-truck-ramp-box",
  },
  {
    id: "profit-analysis",
    name: "Profit Analysis",
    category: SHORTCUT_CATEGORIES.OPERATIONS,
    path: "/profit-analysis",
    chord: ["g", "a"],
    chordDisplay: ["G", "A"],
    altKey: "a",
    altDisplay: "Alt + A",
    description: "Go to Profit & Loss Analysis",
    icon: "fa-solid fa-chart-pie",
  },

  // ── Management ──
  {
    id: "settings",
    name: "Settings",
    category: SHORTCUT_CATEGORIES.MANAGEMENT,
    path: "/settings",
    chord: ["g", ","],
    chordDisplay: ["G", ","],
    altKey: ",",
    altDisplay: "Alt + ,",
    description: "Go to Settings",
    icon: "fa-solid fa-gear",
  },
];

export const GENERAL_SHORTCUTS = [
  {
    id: "help-guide",
    name: "Shortcuts Help",
    category: SHORTCUT_CATEGORIES.GENERAL,
    keyDisplay: ["?"],
    description: "Open this Keyboard Shortcuts Guide",
    icon: "fa-solid fa-keyboard",
  },
  {
    id: "close-modal",
    name: "Close / Dismiss",
    category: SHORTCUT_CATEGORIES.GENERAL,
    keyDisplay: ["Esc"],
    description: "Close current modal, dropdown or dismiss shortcuts",
    icon: "fa-solid fa-xmark",
  },
  {
    id: "toggle-theme",
    name: "Toggle Dark / Light Mode",
    category: SHORTCUT_CATEGORIES.GENERAL,
    keyDisplay: ["Alt", "M"],
    chordDisplay: ["G", "M"],
    description: "Switch between Dark and Light themes",
    icon: "fa-solid fa-circle-half-stroke",
  },
];

/** Quick lookup of shortcut by route path */
export const SHORTCUTS_BY_PATH = NAVIGATION_SHORTCUTS.reduce((acc, sc) => {
  acc[sc.path] = sc;
  if (sc.id === "recommendation") {
    acc["/recommendation"] = sc;
  }
  return acc;
}, {});
