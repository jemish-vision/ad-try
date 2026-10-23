import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Settings as SettingsIcon,
  Store as StorefrontIcon,
  Megaphone as CampaignIcon,
  Sliders as RuleIcon,
  Lightbulb as TipsAndUpdatesIcon,
  Globe as WebIcon,
  Info as InfoOutlinedIcon,
  Search as SearchIcon
} from "lucide-react";

import Config from "../config/Config";
import SellerConfig from "../sellerConfig/SellerConfig";
import CampaignSetting from "../campaignSetting/CampaignSetting";
import RuleSetting from "../campaignSetting/RuleSetting";
import SearchTermSetting from "../campaignSetting/SearchTermSetting";
import RecommendationRules from "../recommendationRule/RecommendationRules";
import PortalSetting from "../portalSetting/PortalSetting";
import { useLocation } from "react-router-dom";
import { ROLES } from "src/common/constants";

function Settings() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState(0);
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [role] = useState(localStorage.getItem('role'));
  const location = useLocation();

  const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");

  useEffect(() => {
    const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    const observer = new MutationObserver(handle);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  const visibleTabs = useMemo(() => {
    const TABS = [
      {
        label: t("Ads Config"),
        icon: <SettingsIcon className="h-4 w-4" />,
        description: t("Manage your advertising configuration, credentials, and API spend limits."),
        component: <Config />,
        isHidden: false,
      },
      {
        label: t("Seller Config"),
        icon: <StorefrontIcon className="h-4 w-4" />,
        description: t("Configure seller account connection preferences and store details."),
        component: <SellerConfig />,
        isHidden: false,
      },
      {
        label: t("Campaign Setting"),
        icon: <CampaignIcon className="h-4 w-4" />,
        description: t("Set global defaults applied across all sponsored campaign automations."),
        component: <CampaignSetting />,
        isHidden: role === ROLES.SUPER_ADMIN,
      },
      {
        label: t("Rule Setting"),
        icon: <RuleIcon className="h-4 w-4" />,
        description: t("Define automated rules based on customized ROAS/ACOS performance thresholds."),
        component: <RuleSetting />,
        isHidden: role === ROLES.SUPER_ADMIN,
      },
      {
        label: t("Search Term Setting"),
        icon: <SearchIcon className="h-4 w-4" />,
        description: t("Configure campaign naming rules, custom prefixes, and search term automation defaults."),
        component: <SearchTermSetting />,
        isHidden: role === ROLES.SUPER_ADMIN,
      },
      {
        label: t("Recommendation Setting"),
        icon: <TipsAndUpdatesIcon className="h-4 w-4" />,
        description: t("Manage recommendation engine thresholds, automation, and visibility parameters."),
        component: <RecommendationRules />,
        isHidden: role === ROLES.SUPER_ADMIN,
      },
      {
        label: t("Portal Setting"),
        icon: <WebIcon className="h-4 w-4" />,
        description: t("Manage portal UI themes, system modes, and global maintenance preferences."),
        component: <PortalSetting />,
        isHidden: role !== ROLES.SUPER_ADMIN,
      },
    ];
    return TABS.filter(tab => !tab.isHidden);
  }, [role, t]);

  useEffect(() => {
    const tabParam = new URLSearchParams(location.search).get("tab");
    if (tabParam !== null) {
      // Strip spaces AND hyphens so "seller-config" (used in redirect URLs) matches the "Seller Config" label.
      const normalize = (s) => String(s).toLowerCase().replace(/[\s-]+/g, "");
      const matchedIdx = visibleTabs.findIndex(t => normalize(t.label) === normalize(tabParam));
      if (matchedIdx !== -1) {
        setActiveTab(matchedIdx);
      } else {
        const tabIdx = parseInt(tabParam, 10);
        if (!isNaN(tabIdx) && tabIdx >= 0 && tabIdx < visibleTabs.length) {
          setActiveTab(tabIdx);
        }
      }
    }
  }, [location.search, visibleTabs?.length]);

  const activeComponent = useMemo(() => {
    return visibleTabs[activeTab]?.component || null;
  }, [activeTab, visibleTabs]);

  return (
    <div className="w-full bg-transparent rounded-lg">
      {/* Folder-style Tab Selector */}
      <div
        className="flex justify-start flex-wrap"
        style={{
          gap: "6px",
          marginBottom: "-1px",
          position: "relative",
          zIndex: 2,
          background: isDark ? "rgba(15, 23, 42, 0.7)" : "rgba(255, 255, 255, 0.7)",
          backdropFilter: "blur(20px) saturate(120%)",
          WebkitBackdropFilter: "blur(20px) saturate(120%)",
          borderRadius: "16px 16px 0 0",
          borderBottom: isDark ? "1px solid #334155" : "1px solid rgba(2, 70, 139, 0.08)",
          padding: "16px 24px 0 24px",
        }}
      >
        {visibleTabs.map((tab, index) => {
          const isActive = activeTab === index;
          const isHovered = hoveredIndex === index;

          return (
            <button
              key={index}
              id={`settings-tab-${tab.label.replace(/\s+/g, '-').toLowerCase()}`}
              onClick={() => setActiveTab(index)}
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
              style={{
                position: "relative",
                padding: "10px 42px 10px 22px",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                outline: "none",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.2s ease",
                minHeight: "42px"
              }}
            >
              <svg
                viewBox="0 0 180 40"
                preserveAspectRatio="none"
                style={{
                  position: "absolute",
                  top: "1px",
                  left: "1px",
                  width: "calc(100% - 2px)",
                  height: "calc(100% - 1px)",
                  zIndex: 0,
                  pointerEvents: "none",
                  overflow: "visible"
                }}
              >
                <defs>
                  <linearGradient id={`tabGrad-${index}`} x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="var(--accent-primary, #1A9FD4)" />
                    <stop offset="100%" stopColor="var(--accent-secondary, #2374F2)" />
                  </linearGradient>
                </defs>
                <path
                  d="M 0,40 L 0,8 A 8,8 0 0 1 8,0 L 145,0 Q 153,0 160,10 L 180,40 Z"
                  fill={isActive ? `url(#tabGrad-${index})` : isHovered ? (isDark ? "rgba(26, 159, 212, 0.15)" : "rgba(26, 159, 212, 0.08)") : (isDark ? "rgba(255, 255, 255, 0.03)" : "#eaeef5")}
                  stroke={isActive ? "var(--accent-primary, #1A9FD4)" : (isDark ? "#334155" : "rgba(2, 70, 139, 0.15)")}
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  color: isActive ? "#ffffff" : isHovered ? "var(--accent-primary, #1A9FD4)" : (isDark ? "rgba(255, 255, 255, 0.65)" : "#475569"),
                  position: "relative",
                  zIndex: 1,
                  fontFamily: "'Inter', sans-serif",
                  fontWeight: "600",
                  fontSize: "14px",
                  transition: "color 0.2s ease"
                }}
              >
                <span style={{ display: "inline-flex" }}>
                  {tab.icon}
                </span>
                <span>{tab.label}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Description */}
      <div
        className={`px-6 py-2 flex items-center gap-2.5 backdrop-blur-md ${isDark ? "bg-white/5 border-b border-slate-700" : "bg-white/35 border-b border-sky-950/10"
          }`}
      >
        <InfoOutlinedIcon className="h-4 w-4 text-[#1A9FD4] shrink-0" />
        <p
          className={`font-sans font-medium text-xs ${isDark ? "text-white/60" : "text-slate-400"
            }`}
        >
          {visibleTabs[activeTab]?.description}
        </p>
      </div>

      {/* Content */}
      <div className="mt-2">
        {activeComponent}
      </div>
    </div>
  );
}

export default Settings;