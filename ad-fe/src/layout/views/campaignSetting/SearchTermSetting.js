import React, { useEffect, useContext, useState } from "react";
import Filter from "../../../helper/filter/Filter";
import { ProfileContext } from "../../../helper/usecontext/useContext";
import { Toast } from "../../../helper/links/Link";
import { ApiGetRuleSettings, ApiSaveRuleSettings } from "../../../api-wrapper/ApiAdsConfig";
import { Input } from "../../../components/ui/input";
import { SYSTEM_PAGES, PAGE_ACTIONS } from "src/common/constants";
import { PermissionCheck } from "../../../helper/permission/PermissionCheck";
import { Search, Sparkles, Tag } from "lucide-react";
import { useTranslation } from "react-i18next";

function SearchTermSetting() {
  const { t } = useTranslation();
  const { profileId, selectedAdType } = useContext(ProfileContext);

  const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");
  const hasUpdatePermission = PermissionCheck(SYSTEM_PAGES.SETTINGS, PAGE_ACTIONS.UPDATE);

  const [campaignPrefix, setCampaignPrefix] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    const observer = new MutationObserver(handle);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const fetchData = () => {
      setLoading(true);
      ApiGetRuleSettings({ profileId: profileId?.value })
        .then((res) => {
          if (res?.isSuccess) {
            setCampaignPrefix(res?.data?.searchTermRuleSetting?.campaignPrefix || "");
          } else {
            Toast.error(res?.message || t("Failed to load search term settings"));
          }
        })
        .catch(() => Toast.error(t("Failed to load search term settings")))
        .finally(() => setLoading(false));
    };

    if (profileId?.value && selectedAdType) fetchData();
  }, [profileId, selectedAdType, t]);

  const handleSave = () => {
    if (!hasUpdatePermission) return;
    setSubmitting(true);

    const payload = {
      profileId: profileId?.value,
      searchTermRuleSetting: {
        campaignPrefix: campaignPrefix.trim(),
      },
    };

    ApiSaveRuleSettings(payload)
      .then((res) => {
        if (res?.isSuccess) {
          Toast.success(res?.message || t("Search Term settings saved successfully"));
        } else {
          Toast.error(res?.message || t("Failed to save settings"));
        }
      })
      .catch(() => Toast.error(t("Something went wrong")))
      .finally(() => setSubmitting(false));
  };

  return (
    <>
      <div className="bg-white">
        <Filter name={t("Search Term Setting")} dateShow={false} profileShow />
      </div>

      <div className="middle_container">
        <div
          className="glass-grid-container overflow-hidden"
          style={{
            padding: "28px",
            marginTop: "16px",
            background: isDark ? "rgba(255, 255, 255, 0.03)" : "rgba(255, 255, 255, 0.5)",
            backdropFilter: "blur(20px)",
            borderRadius: "16px",
            border: isDark ? "1px solid #334155" : "1px solid rgba(2, 70, 139, 0.08)",
            boxShadow: isDark ? "none" : "0 8px 32px rgba(2, 70, 139, 0.03)",
            maxWidth: "900px",
          }}
        >
          <div
            className="data_content data_content_btn"
            style={{
              background: "transparent",
              border: "none",
              boxShadow: "none",
              margin: 0,
              padding: 0,
            }}
          >
            {/* Header */}
            <div
              className="flex justify-between items-center"
              style={{
                borderBottom: isDark ? "1px solid #334155" : "1px solid rgba(2, 70, 139, 0.08)",
                paddingBottom: "16px",
                marginBottom: "24px",
              }}
            >
              <div>
                <div className="flex items-center gap-2">
                  <div
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "8px",
                      background: isDark ? "rgba(14, 165, 233, 0.15)" : "rgba(14, 165, 233, 0.1)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#0ea5e9",
                    }}
                  >
                    <Search className="w-4 h-4" />
                  </div>
                  <h5
                    style={{
                      fontWeight: 800,
                      color: isDark ? "#f8fafc" : "#0f172a",
                      margin: 0,
                      fontSize: "16px",
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {t("Search Term Campaign Creation Settings")}
                  </h5>
                </div>
                <p style={{ color: isDark ? "#94a3b8" : "#64748b", fontSize: "12px", margin: "6px 0 0 0" }}>
                  {t("Configure campaign naming rules and prefixes automatically applied when Search Term Rules create new campaigns.")}
                </p>
              </div>
            </div>

            {/* Main Form Configuration Area */}
            <div>
              <div
                style={{
                  background: isDark ? "rgba(255, 255, 255, 0.02)" : "rgba(255, 255, 255, 0.6)",
                  border: isDark ? "1px solid #334155" : "1px solid rgba(2, 70, 139, 0.08)",
                  borderRadius: 12,
                  padding: "20px",
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Tag className="w-4 h-4 text-sky-500" />
                  <label
                    className="font-bold text-slate-800 dark:text-slate-100"
                    style={{ fontSize: "13px", margin: 0 }}
                  >
                    {t("Campaign Name Prefix")}
                  </label>
                </div>
                <p style={{ fontSize: "12px", color: isDark ? "#94a3b8" : "#64748b", marginBottom: "14px" }}>
                  {t("Optional prefix prepended to all newly created campaigns from Search Term Rules.")}
                </p>

                <div className="flex items-center gap-2 mb-3">
                  <div className="relative flex-1">
                    <Input
                      type="text"
                      placeholder={t("e.g. Brand, AIQ, ST-Auto")}
                      value={campaignPrefix}
                      onChange={(e) => setCampaignPrefix(e.target.value)}
                      disabled={loading || !hasUpdatePermission}
                      className="w-full h-[40px] text-sm"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span>
                    {t("Leave empty if you want the default naming convention")} (<code>SP - Match - Product | Search Term</code>).
                  </span>
                </div>
              </div>
            </div>

            {/* Action Save Bar */}
            <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-700 flex justify-end">
              <button
                id="search-term-setting-save-btn"
                className="m-0"
                style={{
                  height: "38px",
                  padding: "0 24px",
                  fontSize: "13px",
                  fontWeight: "600",
                  background: "linear-gradient(135deg, #1A9FD4 0%, #2374F2 100%)",
                  border: "none",
                  borderRadius: "8px",
                  color: "#ffffff",
                  boxShadow: "0 4px 12px rgba(2, 70, 139, 0.2)",
                  cursor: submitting || !hasUpdatePermission ? "not-allowed" : "pointer",
                  opacity: submitting || !hasUpdatePermission ? 0.7 : 1,
                  transition: "all 0.2s ease",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                }}
                onClick={handleSave}
                disabled={submitting || !hasUpdatePermission}
              >
                {submitting ? (
                  <>
                    <i className="fa fa-spinner fa-spin mr-1" />
                    {t("Saving...")}
                  </>
                ) : (
                  t("Save Settings")
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default SearchTermSetting;
