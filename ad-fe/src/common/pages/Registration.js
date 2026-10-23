import { useTranslation } from "react-i18next";
import { Formik } from "formik";
import { registerSchema, registerSchemaInvited } from "../../utility/validator";
import { Building2 as BusinessIcon, User as PersonIcon, Mail as EmailIcon, Lock as LockIcon, Phone as PhoneIcon, Eye as VisibilityIcon, EyeOff as VisibilityOffIcon } from "lucide-react";
import Logo from "../logo/logo.png";
import LanguageSelector from "../../components/LanguageSelector";
import { Link, useLocation } from "react-router-dom";
import { ApiGenerateToken, ApiLoginWithGoogle } from "../../api-wrapper/auth/ApiAuth";
import Toast from "../helper/toast/Toast";
import { ApiRegistration, ApiSendOtp } from "../../api-wrapper/ApiUsers";
import VerifyOtpModal from "./Registration/VerifyOtpModal";
import { useState } from "react";
import { ROLES } from "../constants";


function Registration() {
  const { t } = useTranslation();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const invitationToken = location.state?.invitationToken || queryParams.get("invitationToken");
  const prefillEmail = location.state?.email || queryParams.get("email");
  const isEmailDisabled = Boolean(prefillEmail);

  const hasInvitation = Boolean(
    invitationToken ||
      sessionStorage.getItem("invitationToken") ||
      localStorage.getItem("invitationToken")
  );

  const initialValues = {
    companyName: "",
    fullName: "",
    email: prefillEmail || "",
    password: "",
    confirmPassword: "",
    phoneNumber: "",
  };

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [formData, setFormData] = useState(null);
  const [registrationRes, setRegistrationRes] = useState(null);
  const [loading, setLoading] = useState(false);

  const submitHandler = async (values) => {
    setLoading(true);
    try {
      const finalToken = invitationToken || sessionStorage.getItem("invitationToken") || localStorage.getItem("invitationToken");
      const payload = finalToken
        ? { ...values, invitationToken: finalToken, companyName: values.companyName || "" }
        : values;
      const res = await ApiRegistration(payload);

      if (res?.isSuccess) {
        setRegistrationRes(res)
        try {
          const sendOtpRes = await ApiSendOtp({ email: values?.email });

          if (sendOtpRes?.isSuccess) {
            Toast.success(t("OTP sent to your email"));
            setFormData(values)
            setShowOtpModal(true);
          } else {
            Toast.error(sendOtpRes?.message || "Failed to send OTP");
          }
        } catch (error) {
          Toast.error(t("Something went wrong"));
        }
      } else {
        Toast.error(res?.message || "Registration failed");
      }
    } catch (error) {
      Toast.error(t("Something went wrong, please try again"));
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSuccess = async () => {
    setShowOtpModal(false);

    if (!registrationRes) return
    const res = registrationRes;

    if (res.role) {
      localStorage.setItem("role", res.role);
    }

    if (res.isGoogleConnected !== undefined) {
      localStorage.setItem("isGoogleConnected", res.isGoogleConnected);
    }

    const data = { userId: res.userId };

    await ApiGenerateToken(data)
      .then((token) => {
        if (token) {
          Toast.success(res.message || "Registration successful");

          localStorage.setItem("sellerToken", token.authToken);
          localStorage.setItem("connection", true);
          localStorage.removeItem("amazon_appstore_flow");
          localStorage.removeItem("appstore_seller_id");
          sessionStorage.removeItem("amazon_appstore_flow");
          sessionStorage.removeItem("appstore_seller_id");

          const inviteRedirect = sessionStorage.getItem("inviteRedirect") || localStorage.getItem("inviteRedirect");
          const savedToken = invitationToken || sessionStorage.getItem("invitationToken") || localStorage.getItem("invitationToken");
          if (savedToken || (inviteRedirect && inviteRedirect.includes("/accept-invitation"))) {
            if (inviteRedirect) {
              sessionStorage.removeItem("inviteRedirect");
              localStorage.removeItem("inviteRedirect");
            }
            const tokenToUse = savedToken || new URLSearchParams(inviteRedirect?.split("?")[1] || "").get("token") || "";
            if (tokenToUse) {
              sessionStorage.setItem("autoAcceptInvite", "true");
              window.location.href = `/accept-invitation?token=${encodeURIComponent(tokenToUse)}`;
              return;
            }
          }

          window.location.href = res?.role === ROLES.ADMIN ? "/select-organization" : "/";
        }
      }, (error) => {
        console.log(error);
      })
  };

  const handleGoogleLogin = async () => {
    const response = await ApiLoginWithGoogle();
    if (response) {
      if (response.success && response.url) window.open(response.url, "_blank")
      else Toast.error(response.message)
    }
  }

  return (
    <main className="auth-page">
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
            {t("Join thousands of")}<br />{t("Amazon sellers")}
          </h1>
          <p className="auth-brand-tagline">
            {t("Start optimising your advertising campaigns with AI-powered insights and automated rules — free to try, simple to scale.")}
          </p>

          {/* Floating metric badges */}
          <div className="auth-brand-metrics" aria-hidden="true">
            <span className="metric-badge metric-badge-1">
              <svg width="20" height="20" viewBox="0 0 46 46" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginRight: '6px' }}>
                <defs>
                  <linearGradient id="greenTopReg" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#34d399" />
                    <stop offset="100%" stopColor="#059669" />
                  </linearGradient>
                  <linearGradient id="greenSideReg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#047857" />
                    <stop offset="100%" stopColor="#065f46" />
                  </linearGradient>
                </defs>
                <path d="M 12 37 L 27 29 L 34 32 L 19 40 Z" fill="black" fillOpacity="0.12" />
                <path d="M 10 32 L 20 27 V 33 L 10 38 Z" fill="url(#greenSideReg)" />
                <path d="M 20 27 L 20 33 L 25 30.5 V 24.5 Z" fill="#047857" />
                <path d="M 10 32 L 20 27 L 25 29.5 L 15 34.5 Z" fill="url(#greenTopReg)" />
                <path d="M 17 25 L 32 17 L 32 23 L 17 31 Z" fill="url(#greenSideReg)" />
                <path d="M 32 17 L 37 19.5 L 37 25.5 L 32 23 Z" fill="#045f46" />
                <path d="M 17 25 L 32 17 L 37 19.5 L 22 27.5 Z" fill="url(#greenTopReg)" />
              </svg>
              ↑ 47% ROAS
            </span>
            <span className="metric-badge metric-badge-2">
              <svg width="20" height="20" viewBox="0 0 46 46" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginRight: '6px' }}>
                <defs>
                  <linearGradient id="targetTopReg" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#fca5a5" />
                    <stop offset="100%" stopColor="#ef4444" />
                  </linearGradient>
                  <linearGradient id="targetSideReg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#b91c1c" />
                    <stop offset="100%" stopColor="#7f1d1d" />
                  </linearGradient>
                  <linearGradient id="arrowGradReg" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#ffffff" />
                    <stop offset="100%" stopColor="#94a3b8" />
                  </linearGradient>
                </defs>
                <ellipse cx="23" cy="29" rx="17" ry="7" fill="black" fillOpacity="0.12" />
                <path d="M 6 22 A 17 7 0 0 0 40 22 V 26 A 17 7 0 0 1 6 26 Z" fill="url(#targetSideReg)" />
                <ellipse cx="23" cy="22" rx="17" ry="7" fill="url(#targetTopReg)" />
                <ellipse cx="23" cy="22" rx="11" ry="4.5" fill="#f87171" />
                <ellipse cx="23" cy="22" rx="5" ry="2" fill="#ef4444" />
                <path d="M 23 22 L 23 4" stroke="url(#arrowGradReg)" strokeWidth="3" strokeLinecap="round" />
                <path d="M 20 7 L 23 4 L 26 7" stroke="url(#arrowGradReg)" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
              ↓ 22% ACoS
            </span>
            <span className="metric-badge metric-badge-3">
              <svg width="20" height="20" viewBox="0 0 46 46" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginRight: '6px' }}>
                <defs>
                  <linearGradient id="blueTopReg" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#60a5fa" />
                    <stop offset="100%" stopColor="#3b82f6" />
                  </linearGradient>
                  <linearGradient id="blueRightReg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563eb" />
                    <stop offset="100%" stopColor="#1d4ed8" />
                  </linearGradient>
                </defs>
                <path d="M 5 36 L 15 31 L 20 33 L 10 38 Z" fill="black" fillOpacity="0.1" />
                <path d="M 16 33 L 26 28 L 31 30 L 21 35 Z" fill="black" fillOpacity="0.1" />
                <path d="M 27 30 L 37 25 L 42 27 L 32 32 Z" fill="black" fillOpacity="0.1" />
                <path d="M 6 28 L 11 31 L 11 36 L 6 33 Z" fill="#1e40af" />
                <path d="M 11 31 L 16 28 L 16 33 L 11 36 Z" fill="url(#blueRightReg)" />
                <path d="M 6 28 L 11 25 L 16 28 L 11 31 Z" fill="url(#blueTopReg)" />
                <path d="M 17 21 L 22 24 L 22 32 L 17 29 Z" fill="#1e40af" />
                <path d="M 22 24 L 27 21 L 27 29 L 22 32 Z" fill="url(#blueRightReg)" />
                <path d="M 17 21 L 22 18 L 27 21 L 22 24 Z" fill="url(#blueTopReg)" />
                <path d="M 28 14 L 33 17 L 33 28 L 28 25 Z" fill="#1e40af" />
                <path d="M 33 17 L 38 14 L 38 25 L 33 28 Z" fill="url(#blueRightReg)" />
                <path d="M 28 14 L 33 11 L 38 14 L 33 17 Z" fill="url(#blueTopReg)" />
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
            <h2 className="auth-card-title">{t("Create your account")}</h2>
            <p className="auth-card-subtitle">{t("Fill in the details below to get started")}</p>
          </div>

          <button className="auth-google-btn" type="button" onClick={handleGoogleLogin}>
            <span className="auth-g-icon">
              <img src="https://developers.google.com/identity/images/g-logo.png" alt="Google" width="20" height="20" />
            </span>
            {t("Sign up with Google")}
          </button>

          <div className="auth-or-divider">{t("or")}</div>

          {/* Form */}
          <Formik
            initialValues={initialValues}
            validationSchema={hasInvitation ? registerSchemaInvited : registerSchema}
            onSubmit={submitHandler}
          >
            {({ values, errors, touched, handleChange, handleBlur, handleSubmit }) => (
              <form onSubmit={handleSubmit}>

                {/* Company Name — full width (hidden if invited) */}
                {!hasInvitation && (
                  <div className={`auth-field${touched.companyName && errors.companyName ? " is-error" : ""}`}>
                    <span className="auth-field-icon"><BusinessIcon /></span>
                    <input
                      name="companyName"
                      placeholder={t("Organization name")}
                      value={values.companyName}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      className="auth-input"
                      autoComplete="organization"
                    />
                  </div>
                )}
                {!hasInvitation && touched.companyName && errors.companyName && (
                  <p className="auth-error-msg">{errors.companyName}</p>
                )}

                {/* Full Name + Phone — 2 columns */}
                <div className="auth-field-row auth-row-spacer">
                  <div className="auth-field-col">
                    <div className={`auth-field${touched.fullName && errors.fullName ? " is-error" : ""}`}>
                      <span className="auth-field-icon"><PersonIcon /></span>
                      <input
                        name="fullName"
                        placeholder={t("Full name")}
                        value={values.fullName}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        className="auth-input"
                        autoComplete="name"
                      />
                    </div>
                    {touched.fullName && errors.fullName && (
                      <p className="auth-error-msg">{errors.fullName}</p>
                    )}
                  </div>
                  <div className="auth-field-col">
                    <div className={`auth-field${touched.phoneNumber && errors.phoneNumber ? " is-error" : ""}`}>
                      <span className="auth-field-icon"><PhoneIcon /></span>
                      <input
                        name="phoneNumber"
                        placeholder={t("Mobile number")}
                        value={values.phoneNumber}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        className="auth-input"
                        autoComplete="tel"
                      />
                    </div>
                    {touched.phoneNumber && errors.phoneNumber && (
                      <p className="auth-error-msg">{errors.phoneNumber}</p>
                    )}
                  </div>
                </div>

                {/* Email — full width */}
                <div className={`auth-field${touched.email && errors.email ? " is-error" : ""}${isEmailDisabled ? " is-disabled" : ""}`}>
                  <span className="auth-field-icon"><EmailIcon /></span>
                  <input
                    type="email"
                    name="email"
                    placeholder={t("Email address")}
                    value={values.email}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    className="auth-input"
                    autoComplete="email"
                    disabled={isEmailDisabled}
                  />
                </div>
                {touched.email && errors.email && (
                  <p className="auth-error-msg">{errors.email}</p>
                )}

                {/* Password + Confirm — 2 columns */}
                <div className="auth-field-row auth-row-spacer">
                  <div className="auth-field-col">
                    <div className={`auth-field has-toggle${touched.password && errors.password ? " is-error" : ""}`}>
                      <span className="auth-field-icon"><LockIcon /></span>
                      <input
                        type={showPassword ? "text" : "password"}
                        name="password"
                        placeholder={t("Password")}
                        value={values.password}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        className="auth-input"
                        autoComplete="new-password"
                      />
                      <button type="button" className="auth-field-toggle" onClick={() => setShowPassword((v) => !v)} tabIndex={-1} aria-label={showPassword ? "Hide password" : "Show password"}>
                        {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                      </button>
                    </div>
                    {touched.password && errors.password && (
                      <p className="auth-error-msg">{errors.password}</p>
                    )}
                  </div>
                  <div className="auth-field-col">
                    <div className={`auth-field has-toggle${touched.confirmPassword && errors.confirmPassword ? " is-error" : ""}`}>
                      <span className="auth-field-icon"><LockIcon /></span>
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        name="confirmPassword"
                        placeholder={t("Confirm password")}
                        value={values.confirmPassword}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        className="auth-input"
                        autoComplete="new-password"
                      />
                      <button type="button" className="auth-field-toggle" onClick={() => setShowConfirmPassword((v) => !v)} tabIndex={-1} aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}>
                        {showConfirmPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                      </button>
                    </div>
                    {touched.confirmPassword && errors.confirmPassword && (
                      <p className="auth-error-msg">{errors.confirmPassword}</p>
                    )}
                  </div>
                </div>

                <button type="submit" className="auth-btn-primary" disabled={loading}>
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <i className="fa fa-spinner fa-spin" />
                      {t("Creating Account...")}
                    </span>
                  ) : (
                    t("Create Account")
                  )}
                </button>
              </form>
            )}
          </Formik>

          <p className="auth-switch-text">
            {t("Already have an account?")}{" "}
            <Link to="/login">{t("Sign in")}</Link>
          </p>
        </div>{/* end auth-card-form */}

      </div>{/* end auth-card */}

      <VerifyOtpModal
        show={showOtpModal}
        email={formData?.email}
        onSuccess={handleOtpSuccess}
      />
    </main>
  );
}

export default Registration;
