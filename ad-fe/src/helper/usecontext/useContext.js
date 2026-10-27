import React, { createContext, useState, useEffect } from "react";

import { ApiGetPermission } from "../../api-wrapper/auth/ApiAuth";
export const ProfileContext = createContext();

export function UseContext({ children }) {
  const [tour, setTour] = useState(null);

  const [loginUser, setLoginUser] = useState(() => {
    try {
      const cached = localStorage.getItem("userAccount");
      return cached ? JSON.parse(cached) : undefined;
    } catch (e) {
      return undefined;
    }
  });
  const [profileData, setProfileData] = useState();
  const [selectedAdType, setSelectedAdType] = useState(localStorage.getItem("adType"));
  const [selectedConfig, setSelectedConfig] = useState();
  const [selectedDate, setSelectedDate] = useState(() => {
    try {
      const profileObj = JSON.parse(localStorage.getItem("profile"));
      if (profileObj?.date && Array.isArray(profileObj.date) && profileObj.date.length >= 2) {
        return profileObj.date;
      }
    } catch (e) {}
    return undefined;
  });
  const [today, setToday] = useState();
  const [currencyCode, setcurrencyCode] = useState()
  const [profileId, setProfileId] = useState([]);
  const [profileList, setProfileList] = useState([]);

  const [refreshSideBar, setRefreshSideBar] = useState(1);

  const [remainingDays, setRemainingDays] = useState(0);
  const [amazonConnectLimit, setAmazonConnectLimit] = useState(0);
  const [numberOfInvites, setNumberOfInvites] = useState(0);
  const [totalOrgConfigs, setTotalOrgConfigs] = useState(0);
  const [totalOrgUsers, setTotalOrgUsers] = useState(0);
  const [totalPendingInvites, setTotalPendingInvites] = useState(0);
  const [profileLimit, setProfileLimit] = useState(0);
  const [totalOrgProfiles, setTotalOrgProfiles] = useState(0);
  const [storeDara, setstoreDara] = useState();
  const [isConnection, setIsConnection] = useState(false);
  const [pagePermission, setPagePermission] = useState(() => {
    const cached = localStorage.getItem("permission");
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {
        return undefined;
      }
    }
    return undefined;
  });
  const [typeValue, setTypeValue] = useState([]);

  const [isPlanActive, setIsPlanActive] = useState(localStorage.getItem("isPlanActive") === "true");

  useEffect(() => {
    const handlePlanStatusChange = () => {
      setIsPlanActive(localStorage.getItem("isPlanActive") === "true");
    };
    window.addEventListener("planStatusChanged", handlePlanStatusChange);
    return () => window.removeEventListener("planStatusChanged", handlePlanStatusChange);
  }, []);

  const refreshOrgContext = React.useCallback(() => {
    const token = localStorage.getItem('sellerToken');
    if (token) {
      ApiGetPermission()
        .then((res) => {
          if (res?.data?.pages) {
            setPagePermission(res.data.pages);
            localStorage.setItem("permission", JSON.stringify(res.data.pages));
          } else {
            const cached = localStorage.getItem("permission");
            setPagePermission(cached ? JSON.parse(cached) : []);
          }
        })
        .catch(() => {
          const cached = localStorage.getItem("permission");
          setPagePermission(cached ? JSON.parse(cached) : []);
        });
    }
  }, []);

  useEffect(() => {
    refreshOrgContext();
  }, [refreshOrgContext]);

  useEffect(() => {
    const handleOrgChange = () => {
      setProfileList([]);
      setProfileData(null);
      setPagePermission(undefined);
      refreshOrgContext();
    };
    window.addEventListener("organizationChanged", handleOrgChange);
    return () => window.removeEventListener("organizationChanged", handleOrgChange);
  }, [refreshOrgContext]);

  useEffect(() => {
    if (localStorage.getItem("profile") != null) {
      try {
        const profileObj = JSON.parse(localStorage.getItem("profile"));
        setstoreDara(profileObj);
        setcurrencyCode(profileObj?.currencyCode);
        if (profileObj?.date && Array.isArray(profileObj.date) && profileObj.date.length >= 2) {
          setSelectedDate(profileObj.date);
        }
      } catch (err) {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localStorage.getItem("profile")]);

  useEffect(() => {
    const handleProfileChange = (e) => {
      if (e?.detail?.profile) {
        setcurrencyCode(e.detail.profile.currencyCode);
      }
      try {
        const profileObj = JSON.parse(localStorage.getItem("profile"));
        if (profileObj) setstoreDara(profileObj);
      } catch (err) {}
    };
    window.addEventListener("profileChanged", handleProfileChange);
    return () => window.removeEventListener("profileChanged", handleProfileChange);
  }, []);

  useEffect(() => {
    if (selectedAdType) localStorage.setItem("adType", selectedAdType)
  }, [selectedAdType]);

  let data = {
    refreshOrgContext,
    setToday,
    setSelectedDate,
    loginUser,
    setLoginUser,
    setProfileData,
    profileData,
    profileList,
    setProfileList,
    profileId,
    setProfileId,
    currencyCode: currencyCode || storeDara?.profile?.currencyCode,
    timezone: storeDara?.profile?.timezone,
    countryCode: storeDara?.profile?.countryCode,
    selectedDate,
    profileValue: storeDara?.profile?.profileId,
    profileSendID: storeDara?.profile?.profileId,
    today,
    fromDate: selectedDate && selectedDate[0],
    toDate: selectedDate && selectedDate[1],
    isConnection,
    setIsConnection,
    pagePermission,
    setPagePermission,
    setTypeValue,
    typeValue,
    customerId: storeDara?.profile?.customerId,
    selectedConfig,
    setSelectedConfig,
    remainingDays,
    setRemainingDays,
    amazonConnectLimit,
    setAmazonConnectLimit,
    numberOfInvites,
    setNumberOfInvites,
    totalOrgConfigs,
    setTotalOrgConfigs,
    totalOrgUsers,
    setTotalOrgUsers,
    totalPendingInvites,
    setTotalPendingInvites,
    profileLimit,
    setProfileLimit,
    totalOrgProfiles,
    setTotalOrgProfiles,
    isPlanActive,
    setIsPlanActive,
    selectedAdType,
    setSelectedAdType,
    refreshSideBar,
    setRefreshSideBar,
    tour,
    setTour,
  };

  return (
    <ProfileContext.Provider value={data}>{children}</ProfileContext.Provider>
  );
}
