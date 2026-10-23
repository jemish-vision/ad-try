import { useTranslation } from "react-i18next";
import { loginSchema } from "../../utility/validator";
import { ApiLogin, ApiLoginWithGoogle, ApiGenerateToken, ApiVerify2FALogin, ApiSend2FAEmailOtp, ApiVerify2FAEmailOtp } from "../../api-wrapper/auth/ApiAuth";
import LanguageSelector from "../../components/LanguageSelector";
import {
  Toast,
  useDispatch,
  useForm,
  yupResolver,
  Controller,
} from "../../helper/links/Link";
import { useState, useEffect, useRef } from "react";
import { handleLoader } from "../redux/action";
import Cookies from "js-cookie";
import Loader from "../helper/loader/Loader";
import { useSelector } from "react-redux";
import Logo from "../logo/logo.png";
import axios from "axios";
import nav from "../../router/nav";
import { useLocation, Link } from "react-router-dom";
import { Mail as EmailIcon, Lock as LockIcon, Eye as VisibilityIcon, EyeOff as VisibilityOffIcon } from "lucide-react";
import VerifyOtpModal from "./Registration/VerifyOtpModal";
import { ApiSendOtp } from "../../api-wrapper/ApiUsers";
import { ROLES } from "../constants";


const getSavedCredentials = () => {
  try {
    const raw = Cookies.get("sellerLogin");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && parsed.email) {
        return { email: parsed.email || "", password: parsed.password || "" };
      }
    }
  } catch {
    Cookies.remove("sellerLogin");
  }
  return null;
};

function Login() {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const locationRouter = useLocation();
  const Loading = useSelector((state) => state.data);

  const initialSaved = getSavedCredentials();
  const [flag, setFlag] = useState(Boolean(initialSaved));

  const {
    handleSubmit,
    control,
    reset,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: yupResolver(loginSchema),
    defaultValues: {
      email: initialSaved?.email || "",
      password: initialSaved?.password || "",
    },
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpEmail, setOtpEmail] = useState("");
  const [pendingLoginData, setPendingLoginData] = useState(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [redirectUrl, setRedirectUrl] = useState("");
  const [counts, setCounts] = useState({ roas: 0, acos: 0, ctr: 0.0, cpc: 1.00 });
  const [syncProgress, setSyncProgress] = useState(0);

  const [requires2fa, setRequires2fa] = useState(false);
  const [tempToken, setTempToken] = useState("");
  const [twoFactorEmail, setTwoFactorEmail] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState(["", "", "", "", "", ""]);
  const [isEmailOtpFallback, setIsEmailOtpFallback] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const otpInputsRef = useRef([]);

  const handleOtpChange = (value, index) => {
    if (!/^\d?$/.test(value)) return;
    const newOtp = [...twoFactorCode];
    newOtp[index] = value;
    setTwoFactorCode(newOtp);

    if (value && index < 5) {
      otpInputsRef.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (e, index) => {
    if (e.key === "Backspace" && !twoFactorCode[index] && index > 0) {
      otpInputsRef.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData("text").trim();
    if (!/^\d{6}$/.test(pasteData)) return;

    const pasteOtp = pasteData.split("");
    setTwoFactorCode(pasteOtp);
    pasteOtp.forEach((_, index) => {
      if (otpInputsRef.current[index]) {
        otpInputsRef.current[index].value = pasteOtp[index];
      }
    });
    otpInputsRef.current[5]?.focus();
  };

  const handleSendEmailOtp = async () => {
    setIsSendingOtp(true);
    try {
      const res = await ApiSend2FAEmailOtp({ tempToken });
      if (res.isSuccess) {
        Toast.success(t("OTP sent to your email."));
        setIsEmailOtpFallback(true);
        setTwoFactorCode(["", "", "", "", "", ""]);
      } else {
        Toast.error(res.message || "Failed to send OTP.");
      }
    } catch {
      Toast.error(t("Something went wrong"));
    } finally {
      setIsSendingOtp(false);
    }
  };

  useEffect(() => {
    if (!showWelcome) return;
    const duration = 2000;
    const steps = 50;
    const intervalTime = duration / steps;
    let step = 0;
    const timer = setInterval(() => {
      step++;
      setCounts({
        roas: Math.min(Math.round((47 / steps) * step), 47),
        acos: Math.min(Math.round((22 / steps) * step), 22),
        ctr: Math.min(parseFloat(((3.1 / steps) * step).toFixed(1)), 3.1),
        cpc: Math.max(parseFloat((1.00 - ((0.62 / steps) * step)).toFixed(2)), 0.38)
      });
      setSyncProgress(Math.min(Math.round((100 / steps) * step), 100));
      if (step >= steps) clearInterval(timer);
    }, intervalTime);
    return () => clearInterval(timer);
  }, [showWelcome]);

  const [loginMeta, setLoginMeta] = useState({ ipAddress: "" });
  const [location, setLocation] = useState({
    country_name: "", country_code: "", state_name: "", state_code: "",
    city: "", postal_code: "", latitude: "", longitude: "",
  });
  const [timeZone, setTimeZone] = useState({ name: "", abbreviation: "", current_time: "" });
  const [currency, setCurrency] = useState({ currency_name: "", currency_code: "" });
  const [countryflag, setCountryFlag] = useState();

  const APIkey = process.env.REACT_APP_API_KEY_IPLOCATION;

  const getUserLocationFromAPI = async () => {
    try {
      const response = await axios.get(
        `https://ipgeolocation.abstractapi.com/v1/?api_key=${APIkey}`
      );
      setLocation({
        country_name: response.data?.country,
        country_code: response.data?.country_code,
        state_name: response.data?.region,
        state_code: response.data?.region_iso_code,
        city: response.data?.city,
        postal_code: response.data?.postal_code,
        latitude: response.data?.latitude?.toString(),
        longitude: response.data?.longitude?.toString(),
      });
      setTimeZone({
        name: response.data?.timezone?.name,
        abbreviation: response.data?.timezone?.abbreviation,
        current_time: response.data?.timezone?.current_time,
      });
      setCurrency({
        currency_name: response.data?.currency?.currency_name,
        currency_code: response.data?.currency?.currency_code,
      });
      setCountryFlag(response.data?.flag?.svg);
    } catch (error) {
      console.log("Geolocation unavailable", error);
    }
  };

  const getIpAddress = async () => {
    try {
      const res = await axios.get("https://api.ipify.org/?format=json");
      setLoginMeta({ ipAddress: res.data?.ip });
    } catch (error) {
      console.log("IP lookup unavailable", error);
    }
  };

  useEffect(() => {
    getIpAddress();
    getUserLocationFromAPI();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const saved = getSavedCredentials();
    if (saved) {
      reset({ email: saved.email, password: saved.password });
      setValue("email", saved.email);
      setValue("password", saved.password);
      setFlag(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reset, setValue]);

  useEffect(() => {
    const params = new URLSearchParams(locationRouter.search);
    const payload = params.get("payload");
    if (!payload) return;
    try {
      const decoded = JSON.parse(atob(payload));
      if (decoded.role) localStorage.setItem("role", decoded.role);
      if (decoded.isGoogleConnected !== undefined)
        localStorage.setItem("isGoogleConnected", decoded.isGoogleConnected);
      ApiGenerateToken({ userId: decoded.userId }).then(
        (res) => {
          if (res?.isSuccess) {
            navigateAfterLogin({
              role: decoded.role,
              authToken: res.authToken,
              userId: decoded.userId,
              isGoogleConnected: decoded.isGoogleConnected,
            });
          } else {
            Toast?.error(res?.message);
          }
        },
        () => Toast?.error("Something went wrong!")
      );
    } catch (err) {
      Toast?.error("Something went wrong!");
    }
  }, [locationRouter.search]);

  const navigateAfterLogin = async (res) => {
    localStorage.setItem("role", res.role);
    localStorage.setItem("sellerToken", res.authToken);
    localStorage.setItem("isGoogleConnected", res.isGoogleConnected);
    if (res.email) localStorage.setItem("userEmail", res.email);
    if (res.fullName) localStorage.setItem("userName", res.fullName);
    localStorage.removeItem("amazon_appstore_flow");
    localStorage.removeItem("appstore_seller_id");
    sessionStorage.removeItem("amazon_appstore_flow");
    sessionStorage.removeItem("appstore_seller_id");
    if (!res.authToken) return;
    const headers = { Authorization: `Bearer ${res.authToken}`, "Content-Type": "application/json" };
    try {
      const [connectResult, profileResult] = await Promise.all([
        axios.post(`${process.env.REACT_APP_API_BASE}/api/config/checkConnectAccount`, { userId: res.userId }, { headers }).catch(() => ({ data: { connect: false } })),
        axios.get(`${process.env.REACT_APP_API_BASE}/api/customer/getProfile`, { headers }).catch(() => ({ data: { isSuccess: false } })),
      ]);

      const connect = connectResult.data?.connect || false;
      const profile = profileResult.data?.profile || {};
      const org = profileResult.data?.organization || profile?.organization || null;

      if (profile.email) localStorage.setItem("userEmail", profile.email);
      if (profile.fullName || profile.name) localStorage.setItem("userName", profile.fullName || profile.name);
      if (profile) localStorage.setItem("userAccount", JSON.stringify(profile));

      localStorage.setItem("connection", connect);

      const inviteRedirect = sessionStorage.getItem("inviteRedirect") || localStorage.getItem("inviteRedirect") || new URLSearchParams(locationRouter.search).get("redirect");
      const invitationToken = sessionStorage.getItem("invitationToken") || localStorage.getItem("invitationToken");
      let targetUrl = "/select-organization";
      if ((inviteRedirect && inviteRedirect.includes("/accept-invitation")) || invitationToken) {
        sessionStorage.removeItem("inviteRedirect");
        localStorage.removeItem("inviteRedirect");
        const tokenToUse = invitationToken || new URLSearchParams(inviteRedirect?.split("?")[1] || "").get("token") || "";
        if (tokenToUse) {
          sessionStorage.setItem("autoAcceptInvite", "true");
          targetUrl = `/accept-invitation?token=${encodeURIComponent(tokenToUse)}`;
        } else if (inviteRedirect) {
          sessionStorage.setItem("autoAcceptInvite", "true");
          targetUrl = inviteRedirect;
        }
      } else if (res.role === ROLES.SUPER_ADMIN) {
        targetUrl = "/admin-dashboard";
      } else if (res.role === ROLES.ADMIN) {
        targetUrl = "/select-organization";
      }

      setRedirectUrl(targetUrl);
      setShowWelcome(true);
      setTimeout(() => {
        window.location.href = targetUrl;
      }, 2600);
      dispatch(handleLoader(false));
    } catch {
      const inviteRedirect = sessionStorage.getItem("inviteRedirect") || localStorage.getItem("inviteRedirect") || new URLSearchParams(locationRouter.search).get("redirect");
      const invitationToken = sessionStorage.getItem("invitationToken") || localStorage.getItem("invitationToken");
      let fallbackUrl = "/";
      if ((inviteRedirect && inviteRedirect.includes("/accept-invitation")) || invitationToken) {
        sessionStorage.removeItem("inviteRedirect");
        localStorage.removeItem("inviteRedirect");
        const tokenToUse = invitationToken || new URLSearchParams(inviteRedirect?.split("?")[1] || "").get("token") || "";
        if (tokenToUse) {
          sessionStorage.setItem("autoAcceptInvite", "true");
          fallbackUrl = `/accept-invitation?token=${encodeURIComponent(tokenToUse)}`;
        } else if (inviteRedirect) {
          sessionStorage.setItem("autoAcceptInvite", "true");
          fallbackUrl = inviteRedirect;
        }
      }
      setRedirectUrl(fallbackUrl);
      setShowWelcome(true);
      setTimeout(() => {
        window.location.href = fallbackUrl;
      }, 2600);
      dispatch(handleLoader(false));
    }
  };

  const submitHandler = async (data) => {
    const updatedData = {
      ...data,
      ip_address: loginMeta.ipAddress,
      location,
      timeZone,
      currency,
      flag: countryflag,
    };
    if (flag) {
      Cookies.set("sellerLogin", JSON.stringify({ email: data.email, password: data.password }), { expires: 30, sameSite: "lax" });
    } else {
      Cookies.remove("sellerLogin");
    }
    dispatch(handleLoader(true));
    try {
      const res = await ApiLogin(updatedData);
      if (res.isSuccess) {
        if (res.requires2fa) {
          setRequires2fa(true);
          setTempToken(res.tempToken);
          setTwoFactorEmail(updatedData.email);
          dispatch(handleLoader(false));
          return;
        }
        navigateAfterLogin(res);
      } else if (res.showOtpModal) {
        try {
          const sendOtpRes = await ApiSendOtp({ email: updatedData?.email });
          if (sendOtpRes?.isSuccess) {
            Toast.success(t("OTP sent to your email"));
            setOtpEmail(updatedData?.email);
            setPendingLoginData(updatedData);
            setShowOtpModal(true);
          } else {
            Toast.error(sendOtpRes?.message || "Failed to send OTP");
          }
        } catch {
          Toast.error(t("Something went wrong"));
        }
        dispatch(handleLoader(false));
      } else {
        Toast.error(res.message);
        dispatch(handleLoader(false));
      }
    } catch {
      dispatch(handleLoader(false));
      Toast.error(t("Something went wrong"));
    }
  };

  const handleOtpSuccess = () => {
    setShowOtpModal(false);
    if (!pendingLoginData) return;
    dispatch(handleLoader(true));
    ApiLogin(pendingLoginData)
      .then((res) => {
        if (res.isSuccess) {
          if (res.requires2fa) {
            setRequires2fa(true);
            setTempToken(res.tempToken);
            setTwoFactorEmail(pendingLoginData.email);
            return;
          }
          navigateAfterLogin(res);
        } else Toast.error(res.message);
      })
      .finally(() => {
        dispatch(handleLoader(false));
        setPendingLoginData(null);
      });
  };

  const handle2FASubmit = async (e) => {
    e.preventDefault();
    const otpValue = twoFactorCode.join("");
    if (otpValue.length !== 6) {
      Toast.error(t("Please enter the 6-digit code"));
      return;
    }
    dispatch(handleLoader(true));
    try {
      let res;
      if (isEmailOtpFallback) {
        res = await ApiVerify2FAEmailOtp({ tempToken, otp: otpValue });
      } else {
        res = await ApiVerify2FALogin({ tempToken, code: otpValue });
      }

      if (res.isSuccess) {
        navigateAfterLogin(res);
      } else {
        Toast.error(res.message);
        dispatch(handleLoader(false));
      }
    } catch {
      dispatch(handleLoader(false));
      Toast.error(t("Something went wrong"));
    }
  };


  const rememberMeHandler = (e) => {
    if (e.target.checked) {
      setFlag(true);
    } else {
      Cookies.remove("sellerLogin");
      setFlag(false);
    }
  };

  const handleGoogleLogin = async () => {
    const response = await ApiLoginWithGoogle();
    if (response) {
      if (response.success && response.url) window.open(response.url, "_blank");
      else Toast.error(response.message);
    }
  };

  return (
    <>
      {showWelcome && (
        <div className="amazon-ads-welcome-overlay">
          <div className="welcome-glow-blue" />
          <div className="welcome-glow-orange" />
          <div className="welcome-scanline" />

          {/* Floating Ad-Tech Metric Cards */}
          <div className="welcome-metric-card" style={{ "--delay": "0.4s", top: "15%", left: "15%" }}>
            <span className="welcome-metric-title">Campaign ROAS</span>
            <div className="welcome-metric-value">
              +{counts.roas}% <span className="welcome-metric-trend up">↑</span>
            </div>
          </div>

          <div className="welcome-metric-card" style={{ "--delay": "0.6s", top: "25%", right: "12%" }}>
            <span className="welcome-metric-title">ACoS Reducer</span>
            <div className="welcome-metric-value">
              -{counts.acos}% <span className="welcome-metric-trend down">↓</span>
            </div>
          </div>

          <div className="welcome-metric-card" style={{ "--delay": "0.8s", bottom: "25%", left: "10%" }}>
            <span className="welcome-metric-title">Click-Through (CTR)</span>
            <div className="welcome-metric-value">
              +{counts.ctr.toFixed(1)}% <span className="welcome-metric-trend up">↑</span>
            </div>
          </div>

          <div className="welcome-metric-card" style={{ "--delay": "1s", bottom: "18%", right: "16%" }}>
            <span className="welcome-metric-title">Target CPC</span>
            <div className="welcome-metric-value">
              ${counts.cpc.toFixed(2)} <span className="welcome-metric-trend down">↓</span>
            </div>
          </div>

          {/* Rotating Bid Optimizer Dials */}
          <div className="welcome-ad-dial welcome-ad-dial-1" />
          <div className="welcome-ad-dial welcome-ad-dial-2" />

          <div className="welcome-logo-container">
            <div className="welcome-partner-badge">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ width: "16px", height: "16px" }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
              </svg>
              <span>Amazon Ads Authorized Partner</span>
            </div>
            <div className="welcome-brand-logo">
              ADVERTISE IQ
            </div>
            <div className="welcome-smile-arrow-wrapper">
              <svg viewBox="0 0 160 40" className="welcome-smile-arrow">
                <defs>
                  <linearGradient id="smileGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#06b6d4" />
                    <stop offset="100%" stopColor="#2374F2" />
                  </linearGradient>
                </defs>
                <path d="M 10,10 Q 80,35 150,10" fill="none" stroke="url(#smileGrad)" strokeWidth="6" strokeLinecap="round" />
                <path d="M 142,5 L 152,11 L 140,20" fill="none" stroke="url(#smileGrad)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>

            {/* Holographic Dynamic Growth Line Chart */}
            <div className="welcome-growth-chart-wrap">
              <svg viewBox="0 0 240 60" style={{ width: "100%", height: "100%" }}>
                <defs>
                  <linearGradient id="chartGrad" x1="0%" y1="100%" x2="0%" y2="0%">
                    <stop offset="0%" stopColor="rgba(6, 182, 212, 0)" />
                    <stop offset="100%" stopColor="rgba(6, 182, 212, 0.25)" />
                  </linearGradient>
                </defs>
                <path
                  d="M 0,55 Q 30,52 60,40 T 120,42 T 180,20 T 240,5"
                  fill="none"
                  stroke="#06b6d4"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  className="welcome-growth-chart-line"
                />
                <path
                  d="M 0,55 Q 30,52 60,40 T 120,42 T 180,20 T 240,5 L 240,55 Z"
                  fill="url(#chartGrad)"
                />
                {/* Traveling glowing nodes along the curve */}
                <circle r="4" fill="#00ffff" style={{ filter: "drop-shadow(0 0 6px #00ffff)" }}>
                  <animateMotion dur="1.8s" repeatCount="indefinite" path="M 0,55 Q 30,52 60,40 T 120,42 T 180,20 T 240,5" />
                </circle>
                <circle cx="240" cy="5" r="5" fill="#06b6d4" style={{ filter: "drop-shadow(0 0 6px #06b6d4)" }} />
              </svg>
            </div>

            <div className="welcome-brand-tagline">
              Optimizing campaigns & synchronizing profiles... {syncProgress}%
            </div>
          </div>
        </div>
      )}

      {Loading.loader === true && <Loader />}

      <main className="auth-page" style={{ visibility: Loading.loader === true || showWelcome ? 'hidden' : 'visible' }}>
        <div className="absolute top-4 right-4 z-50">
          <LanguageSelector />
        </div>
        {/* Animated advanced 3D background elements */}
        <div className="auth-3d-bg">
          <div className="auth-orb auth-orb-1" />
          <div className="auth-orb auth-orb-2" />
          <div className="auth-orb auth-orb-3" />

          {/* 3D Wireframe Cube 1 */}
          <div className="cube-3d-container cube-pos-1">
            <div className="cube-3d-box">
              <div className="cube-face face-front"></div>
              <div className="cube-face face-back"></div>
              <div className="cube-face face-left"></div>
              <div className="cube-face face-right"></div>
              <div className="cube-face face-top"></div>
              <div className="cube-face face-bottom"></div>
            </div>
          </div>

          {/* 3D Wireframe Cube 2 */}
          <div className="cube-3d-container cube-pos-2">
            <div className="cube-3d-box">
              <div className="cube-face face-front"></div>
              <div className="cube-face face-back"></div>
              <div className="cube-face face-left"></div>
              <div className="cube-face face-right"></div>
              <div className="cube-face face-top"></div>
              <div className="cube-face face-bottom"></div>
            </div>
          </div>

          {/* Concentric Tech Rings */}
          <div className="tech-rings-container">
            <div className="tech-ring ring-1"></div>
            <div className="tech-ring ring-2"></div>
          </div>

          {/* Premium Analytics Background */}
          <svg className="auth-bg-visual" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <defs>
              <linearGradient id="lgMain" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#2374F2" stopOpacity="0" />
                <stop offset="25%" stopColor="#2374F2" stopOpacity="0.55" />
                <stop offset="65%" stopColor="#FF9900" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#FF9900" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="lgSecond" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#146EB4" stopOpacity="0" />
                <stop offset="35%" stopColor="#146EB4" stopOpacity="0.38" />
                <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="lgThird" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#7c64ff" stopOpacity="0" />
                <stop offset="50%" stopColor="#7c64ff" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#7c64ff" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="lgArea" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#2374F2" stopOpacity="0.10" />
                <stop offset="100%" stopColor="#2374F2" stopOpacity="0" />
              </linearGradient>
              <filter id="fGlow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="3" result="b" />
                <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <pattern id="bgDots" x="0" y="0" width="48" height="48" patternUnits="userSpaceOnUse">
                <circle cx="24" cy="24" r="1" fill="rgba(35,116,242,0.20)" />
              </pattern>
            </defs>
            <rect width="1440" height="900" fill="url(#bgDots)" opacity="0.55" className="bg-fade" />
            <path d="M -120,820 C 80,770 280,700 480,620 C 680,540 820,470 1000,400 C 1160,340 1300,295 1560,230 L 1560,900 L -120,900 Z" fill="url(#lgArea)" className="bg-fade" />
            <path d="M -120,820 C 80,770 280,700 480,620 C 680,540 820,470 1000,400 C 1160,340 1300,295 1560,230" fill="none" stroke="url(#lgMain)" strokeWidth="1.6" className="bg-line-draw" />
            <path d="M -120,875 C 160,845 380,808 580,755 C 780,702 920,660 1080,610 C 1240,560 1360,525 1560,485" fill="none" stroke="url(#lgSecond)" strokeWidth="1" className="bg-line-draw-2" />
            <path d="M -120,760 C 200,730 420,695 640,655 C 860,615 980,580 1200,530 C 1360,495 1440,475 1560,450" fill="none" stroke="url(#lgThird)" strokeWidth="0.8" className="bg-line-draw-3" />
            <g filter="url(#fGlow)" className="bg-fade-slow">
              <circle cx="480" cy="620" r="4.5" fill="#2374F2" fillOpacity="0.75" />
              <circle cx="1000" cy="400" r="5.5" fill="#FF9900" fillOpacity="0.85" />
              <circle cx="1300" cy="295" r="3.5" fill="#2374F2" fillOpacity="0.65" />
            </g>
            <circle cx="1000" cy="400" r="14" fill="none" stroke="#FF9900" strokeOpacity="0.25" strokeWidth="1" className="bg-beacon" />
            <circle cx="480" cy="620" r="11" fill="none" stroke="#2374F2" strokeOpacity="0.25" strokeWidth="1" className="bg-beacon-2" />
            <g opacity="0.16" className="bg-fade">
              <line x1="52" y1="100" x2="52" y2="720" stroke="#2374F2" strokeWidth="0.8" strokeDasharray="5,9" />
              <line x1="52" y1="240" x2="118" y2="240" stroke="#2374F2" strokeWidth="0.7" />
              <line x1="52" y1="430" x2="118" y2="430" stroke="#2374F2" strokeWidth="0.7" />
              <line x1="118" y1="240" x2="118" y2="430" stroke="#2374F2" strokeWidth="0.7" />
              <line x1="52" y1="600" x2="96" y2="600" stroke="#2374F2" strokeWidth="0.7" />
              <circle cx="52" cy="240" r="2.5" fill="#2374F2" fillOpacity="0.85" />
              <circle cx="52" cy="430" r="2.5" fill="#2374F2" fillOpacity="0.85" />
              <circle cx="52" cy="600" r="2" fill="#2374F2" fillOpacity="0.65" />
              <circle cx="118" cy="240" r="1.8" fill="#2374F2" fillOpacity="0.45" />
              <circle cx="118" cy="430" r="1.8" fill="#2374F2" fillOpacity="0.45" />
              <circle cx="96" cy="600" r="1.8" fill="#2374F2" fillOpacity="0.45" />
            </g>
            <g opacity="0.14" className="bg-fade">
              <line x1="1388" y1="120" x2="1388" y2="680" stroke="#FF9900" strokeWidth="0.8" strokeDasharray="5,9" />
              <line x1="1388" y1="290" x2="1325" y2="290" stroke="#FF9900" strokeWidth="0.7" />
              <line x1="1388" y1="500" x2="1325" y2="500" stroke="#FF9900" strokeWidth="0.7" />
              <line x1="1325" y1="290" x2="1325" y2="500" stroke="#FF9900" strokeWidth="0.7" />
              <circle cx="1388" cy="290" r="2.5" fill="#FF9900" fillOpacity="0.85" />
              <circle cx="1388" cy="500" r="2.5" fill="#FF9900" fillOpacity="0.85" />
              <circle cx="1325" cy="290" r="1.8" fill="#FF9900" fillOpacity="0.45" />
              <circle cx="1325" cy="500" r="1.8" fill="#FF9900" fillOpacity="0.45" />
            </g>
            <g opacity="0.09" transform="translate(160,855)" className="bg-fade-slow">
              <rect x="0" y="-90" width="12" height="90" rx="2" fill="none" stroke="#2374F2" strokeWidth="0.9" />
              <rect x="20" y="-135" width="12" height="135" rx="2" fill="none" stroke="#FF9900" strokeWidth="0.9" />
              <rect x="40" y="-70" width="12" height="70" rx="2" fill="none" stroke="#2374F2" strokeWidth="0.9" />
              <rect x="60" y="-160" width="12" height="160" rx="2" fill="none" stroke="#FF9900" strokeWidth="0.9" />
              <rect x="80" y="-110" width="12" height="110" rx="2" fill="none" stroke="#146EB4" strokeWidth="0.9" />
              <rect x="100" y="-45" width="12" height="45" rx="2" fill="none" stroke="#2374F2" strokeWidth="0.9" />
            </g>
            <g opacity="0.07" transform="translate(1240,220)" className="bg-fade-slow">
              <rect x="0" y="-55" width="9" height="55" rx="1.5" fill="none" stroke="#FF9900" strokeWidth="0.8" />
              <rect x="15" y="-85" width="9" height="85" rx="1.5" fill="none" stroke="#2374F2" strokeWidth="0.8" />
              <rect x="30" y="-40" width="9" height="40" rx="1.5" fill="none" stroke="#FF9900" strokeWidth="0.8" />
              <rect x="45" y="-105" width="9" height="105" rx="1.5" fill="none" stroke="#146EB4" strokeWidth="0.8" />
            </g>
          </svg>
        </div>

        {/* Unified glass card */}
        <div className="auth-card">

          {/* ── Brand pane ── */}
          <div className="auth-card-brand">
            {/* Circuit decoration */}
            <div className="auth-brand-circuit-deco" aria-hidden="true">
              <span className="c-line c-line-h" />
              <span className="c-line c-line-v" />
              <span className="c-line c-line-h2" />
              <span className="c-dot c-dot-1" />
              <span className="c-dot c-dot-2" />
              <span className="c-dot c-dot-3" />
              <span className="c-dot c-dot-4" />

              {/* Rotating 3D wireframe mesh */}
              <div className="card-brand-3d-mesh">
                <div className="mesh-cube">
                  <div className="mesh-face face-front"></div>
                  <div className="mesh-face face-back"></div>
                  <div className="mesh-face face-left"></div>
                  <div className="mesh-face face-right"></div>
                  <div className="mesh-face face-top"></div>
                  <div className="mesh-face face-bottom"></div>
                </div>
              </div>
            </div>

            <div className="auth-brand-logo-wrap">
              <img src={Logo} alt="Advertise IQ" className="auth-brand-logo" />
            </div>

            <h1 className="auth-brand-headline">
              {t("Smarter Ads,")}<br />{t("Better Results")}
            </h1>
            <p className="auth-brand-tagline">
              {t("AI-powered advertising intelligence that optimises your Amazon campaigns in real time — so you can focus on growth.")}
            </p>

            {/* Floating metric badges */}
            <div className="auth-brand-metrics" aria-hidden="true">
              <span className="metric-badge metric-badge-1">
                <svg width="20" height="20" viewBox="0 0 46 46" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginRight: '6px' }}>
                  <defs>
                    <linearGradient id="greenTop" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#34d399" />
                      <stop offset="100%" stopColor="#059669" />
                    </linearGradient>
                    <linearGradient id="greenSide" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#047857" />
                      <stop offset="100%" stopColor="#065f46" />
                    </linearGradient>
                  </defs>
                  <path d="M 12 37 L 27 29 L 34 32 L 19 40 Z" fill="black" fillOpacity="0.12" />
                  <path d="M 10 32 L 20 27 V 33 L 10 38 Z" fill="url(#greenSide)" />
                  <path d="M 20 27 L 20 33 L 25 30.5 V 24.5 Z" fill="#047857" />
                  <path d="M 10 32 L 20 27 L 25 29.5 L 15 34.5 Z" fill="url(#greenTop)" />
                  <path d="M 17 25 L 32 17 L 32 23 L 17 31 Z" fill="url(#greenSide)" />
                  <path d="M 32 17 L 37 19.5 L 37 25.5 L 32 23 Z" fill="#045f46" />
                  <path d="M 17 25 L 32 17 L 37 19.5 L 22 27.5 Z" fill="url(#greenTop)" />
                </svg>
                ↑ 47% ROAS
              </span>
              <span className="metric-badge metric-badge-2">
                <svg width="20" height="20" viewBox="0 0 46 46" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginRight: '6px' }}>
                  <defs>
                    <linearGradient id="targetTop" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#fca5a5" />
                      <stop offset="100%" stopColor="#ef4444" />
                    </linearGradient>
                    <linearGradient id="targetSide" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#b91c1c" />
                      <stop offset="100%" stopColor="#7f1d1d" />
                    </linearGradient>
                    <linearGradient id="arrowGrad" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#ffffff" />
                      <stop offset="100%" stopColor="#94a3b8" />
                    </linearGradient>
                  </defs>
                  <ellipse cx="23" cy="29" rx="17" ry="7" fill="black" fillOpacity="0.12" />
                  <path d="M 6 22 A 17 7 0 0 0 40 22 V 26 A 17 7 0 0 1 6 26 Z" fill="url(#targetSide)" />
                  <ellipse cx="23" cy="22" rx="17" ry="7" fill="url(#targetTop)" />
                  <ellipse cx="23" cy="22" rx="11" ry="4.5" fill="#f87171" />
                  <ellipse cx="23" cy="22" rx="5" ry="2" fill="#ef4444" />
                  <path d="M 23 22 L 23 4" stroke="url(#arrowGrad)" strokeWidth="3" strokeLinecap="round" />
                  <path d="M 20 7 L 23 4 L 26 7" stroke="url(#arrowGrad)" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
                ↓ 22% ACoS
              </span>
              <span className="metric-badge metric-badge-3">
                <svg width="20" height="20" viewBox="0 0 46 46" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginRight: '6px' }}>
                  <defs>
                    <linearGradient id="blueTop" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#60a5fa" />
                      <stop offset="100%" stopColor="#3b82f6" />
                    </linearGradient>
                    <linearGradient id="blueRight" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2563eb" />
                      <stop offset="100%" stopColor="#1d4ed8" />
                    </linearGradient>
                  </defs>
                  <path d="M 5 36 L 15 31 L 20 33 L 10 38 Z" fill="black" fillOpacity="0.1" />
                  <path d="M 16 33 L 26 28 L 31 30 L 21 35 Z" fill="black" fillOpacity="0.1" />
                  <path d="M 27 30 L 37 25 L 42 27 L 32 32 Z" fill="black" fillOpacity="0.1" />
                  <path d="M 6 28 L 11 31 L 11 36 L 6 33 Z" fill="#1e40af" />
                  <path d="M 11 31 L 16 28 L 16 33 L 11 36 Z" fill="url(#blueRight)" />
                  <path d="M 6 28 L 11 25 L 16 28 L 11 31 Z" fill="url(#blueTop)" />
                  <path d="M 17 21 L 22 24 L 22 32 L 17 29 Z" fill="#1e40af" />
                  <path d="M 22 24 L 27 21 L 27 29 L 22 32 Z" fill="url(#blueRight)" />
                  <path d="M 17 21 L 22 18 L 27 21 L 22 24 Z" fill="url(#blueTop)" />
                  <path d="M 28 14 L 33 17 L 33 28 L 28 25 Z" fill="#1e40af" />
                  <path d="M 33 17 L 38 14 L 38 25 L 33 28 Z" fill="url(#blueRight)" />
                  <path d="M 28 14 L 33 11 L 38 14 L 33 17 Z" fill="url(#blueTop)" />
                </svg>
                ↑ 31% CTR
              </span>
            </div>

            <div className="auth-brand-pills">
              {["AI Bidding Automation", "Real-time Analytics", "Rule-based Targeting", "ROI Optimization"].map((f) => (
                <span key={f} className="auth-brand-pill">
                  <span className="pill-dot" />
                  {t(f)}
                </span>
              ))}
            </div>
          </div>

          {/* ── Form pane ── */}
          <div className="auth-card-form">
            <div className="auth-card-header">
              <h2 className="auth-card-title">{t("Welcome back")}</h2>
              <p className="auth-card-subtitle">{t("Sign in to your account to continue")}</p>
            </div>

            <button className="auth-google-btn" type="button" onClick={handleGoogleLogin}>
              <span className="auth-g-icon">
                <img src="https://developers.google.com/identity/images/g-logo.png" alt="Google" width="20" height="20" />
              </span>
              {t("Continue with Google")}
            </button>

            <div className="auth-or-divider">{t("or")}</div>

            {requires2fa ? (
              <form onSubmit={handle2FASubmit}>
                <div style={{ textAlign: "center", marginBottom: "1rem" }}>
                  <div className="w-12 h-12 mx-auto rounded-full bg-blue-500/5 border border-blue-500/10 dark:bg-blue-500/10 dark:border-blue-500/20 flex items-center justify-center mb-4">
                    {isEmailOtpFallback ? (
                      <EmailIcon className="w-5 h-5 text-blue-400" />
                    ) : (
                      <LockIcon className="w-5 h-5 text-blue-400" />
                    )}
                  </div>
                  <h3 style={{ fontSize: "16px", fontWeight: "bold" }}>
                    {isEmailOtpFallback ? "Email Verification" : "Two-Factor Authentication"}
                  </h3>
                  <p style={{ fontSize: "13px", color: "#6b7280", marginTop: "0.5rem" }}>
                    {isEmailOtpFallback
                      ? "Enter the 6-digit code sent to"
                      : "Enter the 6-digit code from your authenticator app for"}
                  </p>
                  <div className="text-center text-[13.5px] font-semibold text-sky-600 dark:text-sky-400 mt-2 mb-4 bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-500/20 px-3 py-1.5 rounded-full inline-block">
                    {twoFactorEmail}
                  </div>
                </div>

                <div className="flex justify-center gap-2.5 mb-6 w-full" onPaste={handleOtpPaste}>
                  {twoFactorCode.map((digit, index) => (
                    <input
                      key={index}
                      type="text"
                      value={digit}
                      maxLength={1}
                      ref={(el) => (otpInputsRef.current[index] = el)}
                      onChange={(e) => handleOtpChange(e.target.value, index)}
                      onKeyDown={(e) => handleOtpKeyDown(e, index)}
                      className="w-[44px] h-[50px] text-center font-bold text-[18px] rounded-[11px] border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#121212] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                    />
                  ))}
                </div>

                <button
                  type="submit"
                  disabled={twoFactorCode.join("").length !== 6}
                  className="auth-btn-primary disabled:opacity-50"
                  style={{ marginTop: '1rem' }}
                >
                  Verify
                </button>

                {!isEmailOtpFallback && (
                  <button
                    type="button"
                    className="auth-link"
                    style={{ marginTop: '1rem', width: '100%', textAlign: 'center', display: 'block', background: 'none', border: 'none', cursor: 'pointer' }}
                    onClick={handleSendEmailOtp}
                    disabled={isSendingOtp}
                  >
                    {isSendingOtp ? "Sending OTP..." : "Verify with Email OTP instead"}
                  </button>
                )}
              </form>
            ) : (
              <>
                <form onSubmit={handleSubmit(submitHandler)}>
                  {/* Email */}
                  <div className={`auth-field${errors?.email ? " is-error" : ""}`}>
                    <span className="auth-field-icon"><EmailIcon /></span>
                    <Controller
                      name="email"
                      control={control}
                      render={({ field }) => (
                        <input
                          {...field}
                          type="email"
                          placeholder={t("Email address")}
                          className="auth-input"
                          autoComplete="email"
                        />
                      )}
                    />
                  </div>
                  {errors?.email && <p className="auth-error-msg">{errors.email.message}</p>}

                  {/* Password */}
                  <div className={`auth-field has-toggle${errors?.password ? " is-error" : ""}`}>
                    <span className="auth-field-icon"><LockIcon /></span>
                    <Controller
                      name="password"
                      control={control}
                      render={({ field }) => (
                        <input
                          {...field}
                          type={showPassword ? "text" : "password"}
                          placeholder={t("Password")}
                          className="auth-input"
                          autoComplete="current-password"
                        />
                      )}
                    />
                    <button
                      type="button"
                      className="auth-field-toggle"
                      onClick={() => setShowPassword((v) => !v)}
                      tabIndex={-1}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                    </button>
                  </div>
                  {errors?.password && <p className="auth-error-msg">{errors.password.message}</p>}

                  {/* Remember + Forgot */}
                  <div className="auth-meta-row">
                    <label className="auth-check-label">
                      <input type="checkbox" checked={flag} onChange={rememberMeHandler} />
                      {t("Remember me")}
                    </label>
                    <Link to="/forgot-password" className="auth-link">
                      {t("Forgot password?")}
                    </Link>
                  </div>

                  <button type="submit" className="auth-btn-primary">
                    {t("Sign In")}
                  </button>
                </form>
                <p className="auth-switch-text">
                  {t("New to Advertise IQ?")}{" "}
                  <Link to="/registration">{t("Create an account")}</Link>
                </p>
              </>
            )}
          </div>

        </div>
      </main>

      <VerifyOtpModal
        show={showOtpModal}
        email={otpEmail}
        onSuccess={handleOtpSuccess}
      />
    </>
  );
}

export default Login;
