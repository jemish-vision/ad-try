import React, { useState, useEffect, useContext, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ProfileContext } from "../../../helper/usecontext/useContext";
import useSpConnection from "../../../helper/hooks/useSpConnection";
import SpAccountNotConnected from "../../../common/components/SpAccountNotConnected";
import Filter from "../../../helper/filter/Filter";
import MfnToFbaRecommendations from "./MfnToFbaRecommendations";

const MfnToFbaPage = () => {
  const { t } = useTranslation();
  const {
    profileId,
    selectedConfig,
    storeDara,
    profileData,
  } = useContext(ProfileContext);
  const { isConnected: isSpConnected, isLoaded: isSpLoaded } = useSpConnection();

  const [isDark, setIsDark] = useState(
    document.documentElement.getAttribute("data-theme") === "dark"
  );

  useEffect(() => {
    const handle = () =>
      setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    const observer = new MutationObserver(handle);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  // Robust Profile & Config ID resolution
  const activeProfileId = useMemo(() => {
    let pId = profileId?.value ?? profileId;
    if (Array.isArray(pId)) {
      pId = pId.length > 0 ? pId[0] : null;
    }
    if (pId && typeof pId === "object" && pId.value) {
      pId = pId.value;
    }
    if (pId && !isNaN(Number(pId)) && Number(pId) > 0) {
      return Number(pId);
    }

    const candidates = [
      selectedConfig?.profile?.profileId,
      selectedConfig?.profileId,
      profileData?.profile?.profileId,
      profileData?.profileId,
      storeDara?.profile?.profileId,
      storeDara?.profileId,
    ];

    for (const c of candidates) {
      if (c && !isNaN(Number(c)) && Number(c) > 0) return Number(c);
    }

    try {
      const raw = localStorage.getItem("profile");
      if (raw) {
        const parsed = JSON.parse(raw);
        const p = parsed?.profile?.profileId || parsed?.profileId;
        if (p && !isNaN(Number(p)) && Number(p) > 0) return Number(p);
      }
    } catch (e) {}
    return null;
  }, [profileId, selectedConfig, profileData, storeDara]);

  const activeConfigId = useMemo(() => {
    const candidates = [
      selectedConfig?.config?.configId,
      selectedConfig?.config?._id,
      selectedConfig?.configId,
      selectedConfig?._id,
      selectedConfig?.profile?.configId,
      storeDara?.config?.configId,
      storeDara?.config?._id,
      storeDara?.configId,
      storeDara?._id,
      storeDara?.profile?.configId,
      profileData?.configId,
      profileData?._id,
    ];

    for (const c of candidates) {
      if (c && typeof c === "string" && c.trim()) return String(c).trim();
      if (c && typeof c === "object" && c._id) return String(c._id);
    }

    try {
      const raw = localStorage.getItem("profile");
      if (raw) {
        const parsed = JSON.parse(raw);
        const c =
          parsed?.config?.configId ||
          parsed?.config?._id ||
          parsed?.configId ||
          parsed?.profile?.configId ||
          parsed?._id;
        if (c) return String(c).trim();
      }
    } catch (e) {}
    return null;
  }, [selectedConfig, storeDara, profileData]);

  return (
    <div
      className="mfn-to-fba-page middle_container w-full min-h-full bg-slate-50/50 dark:bg-slate-950/50"
      style={{ paddingBottom: "80px" }}
    >
      <Filter
        nameShow={false}
        name={t("MFN to FBA Recommendations")}
        dateShow={false}
        profileShow={true}
      />

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 space-y-6 pt-4 pb-6">
        {isSpLoaded && !isSpConnected ? (
          <div className="w-full h-full flex flex-col items-center justify-center p-8">
            <SpAccountNotConnected
              feature={t("MFN to FBA Recommendations")}
              isDark={isDark}
            />
          </div>
        ) : (
          <MfnToFbaRecommendations
            activeProfileId={activeProfileId}
            activeConfigId={activeConfigId}
            isDark={isDark}
          />
        )}
      </div>
    </div>
  );
};

export default MfnToFbaPage;
