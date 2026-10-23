import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ApiInitiateAmazonSellerAuth } from "../api-wrapper/ApiAdsConfig";
import Toast from "../common/helper/toast/Toast";

const AmazonAuthHandler = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const isInitiatingRef = useRef(false);

  useEffect(() => {
    // 1. Capture query parameters if amazon_callback_uri is present
    const params = new URLSearchParams(location.search);
    const amazonCallbackUri = params.get("amazon_callback_uri");
    const amazonState = params.get("amazon_state");
    const sellingPartnerId = params.get("selling_partner_id");
    const version = params.get("version");

    if (amazonCallbackUri) {
      const authParams = {
        amazon_callback_uri: amazonCallbackUri,
        amazon_state: amazonState || "",
        selling_partner_id: sellingPartnerId || "",
        version: version || "beta",
      };
      sessionStorage.setItem("amazon_auth_params", JSON.stringify(authParams));
    }
  }, [location.search]);

  useEffect(() => {
    // 2. Check if user is authenticated and parameters exist in sessionStorage
    const checkAndContinueAuth = async () => {
      const token = localStorage.getItem("sellerToken");
      const storedParamsStr = sessionStorage.getItem("amazon_auth_params");

      if (token && storedParamsStr && !isInitiatingRef.current) {
        isInitiatingRef.current = true;
        try {
          const storedParams = JSON.parse(storedParamsStr);
          const res = await ApiInitiateAmazonSellerAuth(storedParams);
          if (res?.isSuccess && res?.data?.authUrl) {
            sessionStorage.removeItem("amazon_auth_params");
            window.location.href = res.data.authUrl;
          } else {
            Toast.error(res?.message || t("Failed to initiate Amazon authorization"));
            sessionStorage.removeItem("amazon_auth_params");
            isInitiatingRef.current = false;
          }
        } catch (error) {
          console.error("Error continuing Amazon auth:", error);
          Toast.error(t("Failed to initiate Amazon authorization"));
          sessionStorage.removeItem("amazon_auth_params");
          isInitiatingRef.current = false;
        }
      }
    };

    checkAndContinueAuth();
  }, [location]);

  return null;
};

export default AmazonAuthHandler;
