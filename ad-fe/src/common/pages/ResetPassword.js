import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Formik } from "formik";
import * as Yup from "yup";
import { Lock as LockIcon, Eye as VisibilityIcon, EyeOff as VisibilityOffIcon } from "lucide-react";
import Logo from "../logo/logo.png";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import Toast from "../helper/toast/Toast";
import { ApiResetPassword } from "../../api-wrapper/ApiUsers";

function ResetPassword() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const token = searchParams.get("payload") || searchParams.get("token");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const initialValues = {
    password: "",
    confirmPassword: "",
  };

  const validationSchema = Yup.object({
    password: Yup.string()
      .min(8, "Password must be at least 8 characters")
      .required("Password is required"),
    confirmPassword: Yup.string()
      .oneOf([Yup.ref("password")], "Passwords do not match")
      .required("Confirm password is required"),
  });

  const submitHandler = async (values, { setSubmitting, resetForm }) => {
    if (!token) {
      Toast.error(t("Invalid or expired reset link"));
      setSubmitting(false);
      return;
    }

    try {
      const payload = {
        token,
        password: values.password,
      };

      const res = await ApiResetPassword(payload);

      if (res?.isSuccess) {
        Toast.success(t("Password reset successfully"));
        resetForm();
        navigate("/login");
      } else {
        Toast.error(res?.message || "Unable to reset password");
      }
    } catch (error) {
      Toast.error(t("Something went wrong"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
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
              <stop offset="0%" stopColor="#2374F2" stopOpacity="0"/>
              <stop offset="25%" stopColor="#2374F2" stopOpacity="0.55"/>
              <stop offset="65%" stopColor="#FF9900" stopOpacity="0.45"/>
              <stop offset="100%" stopColor="#FF9900" stopOpacity="0"/>
            </linearGradient>
            <linearGradient id="lgSecond" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#146EB4" stopOpacity="0"/>
              <stop offset="35%" stopColor="#146EB4" stopOpacity="0.38"/>
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="0"/>
            </linearGradient>
            <linearGradient id="lgThird" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#7c64ff" stopOpacity="0"/>
              <stop offset="50%" stopColor="#7c64ff" stopOpacity="0.25"/>
              <stop offset="100%" stopColor="#7c64ff" stopOpacity="0"/>
            </linearGradient>
            <linearGradient id="lgArea" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#2374F2" stopOpacity="0.10"/>
              <stop offset="100%" stopColor="#2374F2" stopOpacity="0"/>
            </linearGradient>
            <filter id="fGlow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="3" result="b"/>
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            <pattern id="bgDots" x="0" y="0" width="48" height="48" patternUnits="userSpaceOnUse">
              <circle cx="24" cy="24" r="1" fill="rgba(35,116,242,0.20)"/>
            </pattern>
          </defs>
          <rect width="1440" height="900" fill="url(#bgDots)" opacity="0.55" className="bg-fade"/>
          <path d="M -120,820 C 80,770 280,700 480,620 C 680,540 820,470 1000,400 C 1160,340 1300,295 1560,230 L 1560,900 L -120,900 Z" fill="url(#lgArea)" className="bg-fade"/>
          <path d="M -120,820 C 80,770 280,700 480,620 C 680,540 820,470 1000,400 C 1160,340 1300,295 1560,230" fill="none" stroke="url(#lgMain)" strokeWidth="1.6" className="bg-line-draw"/>
          <path d="M -120,875 C 160,845 380,808 580,755 C 780,702 920,660 1080,610 C 1240,560 1360,525 1560,485" fill="none" stroke="url(#lgSecond)" strokeWidth="1" className="bg-line-draw-2"/>
          <path d="M -120,760 C 200,730 420,695 640,655 C 860,615 980,580 1200,530 C 1360,495 1440,475 1560,450" fill="none" stroke="url(#lgThird)" strokeWidth="0.8" className="bg-line-draw-3"/>
          <g filter="url(#fGlow)" className="bg-fade-slow">
            <circle cx="480" cy="620" r="4.5" fill="#2374F2" fillOpacity="0.75"/>
            <circle cx="1000" cy="400" r="5.5" fill="#FF9900" fillOpacity="0.85"/>
            <circle cx="1300" cy="295" r="3.5" fill="#2374F2" fillOpacity="0.65"/>
          </g>
          <circle cx="1000" cy="400" r="14" fill="none" stroke="#FF9900" strokeOpacity="0.25" strokeWidth="1" className="bg-beacon"/>
          <circle cx="480"  cy="620" r="11" fill="none" stroke="#2374F2" strokeOpacity="0.25" strokeWidth="1" className="bg-beacon-2"/>
          <g opacity="0.16" className="bg-fade">
            <line x1="52" y1="100" x2="52" y2="720" stroke="#2374F2" strokeWidth="0.8" strokeDasharray="5,9"/>
            <line x1="52" y1="240" x2="118" y2="240" stroke="#2374F2" strokeWidth="0.7"/>
            <line x1="52" y1="430" x2="118" y2="430" stroke="#2374F2" strokeWidth="0.7"/>
            <line x1="118" y1="240" x2="118" y2="430" stroke="#2374F2" strokeWidth="0.7"/>
            <line x1="52" y1="600" x2="96" y2="600" stroke="#2374F2" strokeWidth="0.7"/>
            <circle cx="52"  cy="240" r="2.5" fill="#2374F2" fillOpacity="0.85"/>
            <circle cx="52"  cy="430" r="2.5" fill="#2374F2" fillOpacity="0.85"/>
            <circle cx="52"  cy="600" r="2"   fill="#2374F2" fillOpacity="0.65"/>
            <circle cx="118" cy="240" r="1.8" fill="#2374F2" fillOpacity="0.45"/>
            <circle cx="118" cy="430" r="1.8" fill="#2374F2" fillOpacity="0.45"/>
            <circle cx="96"  cy="600" r="1.8" fill="#2374F2" fillOpacity="0.45"/>
          </g>
          <g opacity="0.14" className="bg-fade">
            <line x1="1388" y1="120" x2="1388" y2="680" stroke="#FF9900" strokeWidth="0.8" strokeDasharray="5,9"/>
            <line x1="1388" y1="290" x2="1325" y2="290" stroke="#FF9900" strokeWidth="0.7"/>
            <line x1="1388" y1="500" x2="1325" y2="500" stroke="#FF9900" strokeWidth="0.7"/>
            <line x1="1325" y1="290" x2="1325" y2="500" stroke="#FF9900" strokeWidth="0.7"/>
            <circle cx="1388" cy="290" r="2.5" fill="#FF9900" fillOpacity="0.85"/>
            <circle cx="1388" cy="500" r="2.5" fill="#FF9900" fillOpacity="0.85"/>
            <circle cx="1325" cy="290" r="1.8" fill="#FF9900" fillOpacity="0.45"/>
            <circle cx="1325" cy="500" r="1.8" fill="#FF9900" fillOpacity="0.45"/>
          </g>
          <g opacity="0.09" transform="translate(160,855)" className="bg-fade-slow">
            <rect x="0"  y="-90"  width="12" height="90"  rx="2" fill="none" stroke="#2374F2" strokeWidth="0.9"/>
            <rect x="20" y="-135" width="12" height="135" rx="2" fill="none" stroke="#FF9900" strokeWidth="0.9"/>
            <rect x="40" y="-70"  width="12" height="70"  rx="2" fill="none" stroke="#2374F2" strokeWidth="0.9"/>
            <rect x="60" y="-160" width="12" height="160" rx="2" fill="none" stroke="#FF9900" strokeWidth="0.9"/>
            <rect x="80" y="-110" width="12" height="110" rx="2" fill="none" stroke="#146EB4" strokeWidth="0.9"/>
            <rect x="100" y="-45" width="12" height="45"  rx="2" fill="none" stroke="#2374F2" strokeWidth="0.9"/>
          </g>
          <g opacity="0.07" transform="translate(1240,220)" className="bg-fade-slow">
            <rect x="0"  y="-55"  width="9" height="55"  rx="1.5" fill="none" stroke="#FF9900" strokeWidth="0.8"/>
            <rect x="15" y="-85"  width="9" height="85"  rx="1.5" fill="none" stroke="#2374F2" strokeWidth="0.8"/>
            <rect x="30" y="-40"  width="9" height="40"  rx="1.5" fill="none" stroke="#FF9900" strokeWidth="0.8"/>
            <rect x="45" y="-105" width="9" height="105" rx="1.5" fill="none" stroke="#146EB4" strokeWidth="0.8"/>
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
            Set New Password
          </h1>
          <p className="auth-brand-tagline">
            Create a strong, encrypted password to secure your account and return to optimizing your campaigns.
          </p>

          {/* Security stats */}
          <div className="auth-brand-stats">
            <div className="brand-stat">
              <span className="brand-stat-value">256-bit</span>
              <span className="brand-stat-label">Encryption</span>
            </div>
            <div className="brand-stat">
              <span className="brand-stat-value">Instant</span>
              <span className="brand-stat-label">Protection</span>
            </div>
            <div className="brand-stat">
              <span className="brand-stat-value">100%</span>
              <span className="brand-stat-label">Secure</span>
            </div>
          </div>

          {/* Floating badges */}
          <div className="auth-brand-metrics" aria-hidden="true">
            <span className="metric-badge metric-badge-1">
              <svg width="20" height="20" viewBox="0 0 46 46" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginRight: '6px' }}>
                <defs>
                  <linearGradient id="targetTopReset" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#fca5a5"/>
                    <stop offset="100%" stopColor="#ef4444"/>
                  </linearGradient>
                  <linearGradient id="targetSideReset" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#b91c1c"/>
                    <stop offset="100%" stopColor="#7f1d1d"/>
                  </linearGradient>
                  <linearGradient id="arrowGradReset" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#ffffff"/>
                    <stop offset="100%" stopColor="#94a3b8"/>
                  </linearGradient>
                </defs>
                <ellipse cx="23" cy="29" rx="17" ry="7" fill="black" fillOpacity="0.12" />
                <path d="M 6 22 A 17 7 0 0 0 40 22 V 26 A 17 7 0 0 1 6 26 Z" fill="url(#targetSideReset)" />
                <ellipse cx="23" cy="22" rx="17" ry="7" fill="url(#targetTopReset)" />
                <ellipse cx="23" cy="22" rx="11" ry="4.5" fill="#f87171" />
                <ellipse cx="23" cy="22" rx="5" ry="2" fill="#ef4444" />
                <path d="M 23 22 L 23 4" stroke="url(#arrowGradReset)" strokeWidth="3" strokeLinecap="round" />
                <path d="M 20 7 L 23 4 L 26 7" stroke="url(#arrowGradReset)" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
              Protected Account
            </span>
            <span className="metric-badge metric-badge-2">
              <svg width="20" height="20" viewBox="0 0 46 46" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginRight: '6px' }}>
                <defs>
                  <linearGradient id="boxTopReset" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#fcd34d"/>
                    <stop offset="100%" stopColor="#f59e0b"/>
                  </linearGradient>
                  <linearGradient id="boxLeftReset" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#d97706"/>
                    <stop offset="100%" stopColor="#b45309"/>
                  </linearGradient>
                  <linearGradient id="boxRightReset" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#b45309"/>
                    <stop offset="100%" stopColor="#78350f"/>
                  </linearGradient>
                </defs>
                <path d="M 10 34 L 23 27 L 36 34 L 23 41 Z" fill="black" fillOpacity="0.15" />
                <path d="M 10 20 L 23 27 V 40 L 10 33 Z" fill="url(#boxLeftReset)" />
                <path d="M 23 27 L 36 20 V 33 L 23 40 Z" fill="url(#boxRightReset)" />
                <path d="M 10 20 L 23 13 L 36 20 L 23 27 Z" fill="url(#boxTopReset)" />
                <path d="M 20 15.5 L 23 17.2 L 26 15.5 L 23 13.8 Z" fill="#92400e" opacity="0.8" />
                <path d="M 21.5 25.8 V 38.5 L 24.5 37.0 V 24.2 Z" fill="#92400e" opacity="0.8" />
              </svg>
              Zero-Knowledge Auth
            </span>
            <span className="metric-badge metric-badge-3">
              <svg width="20" height="20" viewBox="0 0 46 46" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginRight: '6px' }}>
                <defs>
                  <linearGradient id="blueTopReset" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#60a5fa"/>
                    <stop offset="100%" stopColor="#3b82f6"/>
                  </linearGradient>
                  <linearGradient id="blueRightReset" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563eb"/>
                    <stop offset="100%" stopColor="#1d4ed8"/>
                  </linearGradient>
                </defs>
                <path d="M 5 36 L 15 31 L 20 33 L 10 38 Z" fill="black" fillOpacity="0.1" />
                <path d="M 16 33 L 26 28 L 31 30 L 21 35 Z" fill="black" fillOpacity="0.1" />
                <path d="M 27 30 L 37 25 L 42 27 L 32 32 Z" fill="black" fillOpacity="0.1" />
                <path d="M 6 28 L 11 31 L 11 36 L 6 33 Z" fill="#1e40af" />
                <path d="M 11 31 L 16 28 L 16 33 L 11 36 Z" fill="url(#blueRightReset)" />
                <path d="M 6 28 L 11 25 L 16 28 L 11 31 Z" fill="url(#blueTopReset)" />
                <path d="M 17 21 L 22 24 L 22 32 L 17 29 Z" fill="#1e40af" />
                <path d="M 22 24 L 27 21 L 27 29 L 22 32 Z" fill="url(#blueRightReset)" />
                <path d="M 17 21 L 22 18 L 27 21 L 22 24 Z" fill="url(#blueTopReset)" />
                <path d="M 28 14 L 33 17 L 33 28 L 28 25 Z" fill="#1e40af" />
                <path d="M 33 17 L 38 14 L 38 25 L 33 28 Z" fill="url(#blueRightReset)" />
                <path d="M 28 14 L 33 11 L 38 14 L 33 17 Z" fill="url(#blueTopReset)" />
              </svg>
              Instant Sync
            </span>
          </div>

          <div className="auth-brand-pills">
            {["End-to-End Encrypted", "Secure Hash", "Multi-Layer Protection"].map((f) => (
              <span key={f} className="auth-brand-pill">
                <span className="pill-dot" />
                {f}
              </span>
            ))}
          </div>
        </div>

        {/* ── Form pane ── */}
        <div className="auth-card-form">
          <div className="auth-card-header">
            <h2 className="auth-card-title">Reset Password</h2>
            <p className="auth-card-subtitle">Enter your new secure password below</p>
          </div>

          <Formik
            initialValues={initialValues}
            validationSchema={validationSchema}
            onSubmit={submitHandler}
          >
            {({
              values,
              errors,
              touched,
              handleChange,
              handleBlur,
              handleSubmit,
              isSubmitting,
            }) => (
              <form onSubmit={handleSubmit}>

                {/* New Password */}
                <div className={`auth-field has-toggle${touched.password && errors.password ? " is-error" : ""}`}>
                  <span className="auth-field-icon"><LockIcon /></span>
                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    placeholder={t("New Password")}
                    value={values.password}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    className="auth-input"
                    autoComplete="new-password"
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
                {touched.password && errors.password && (
                  <p className="auth-error-msg">{errors.password}</p>
                )}

                {/* Confirm Password */}
                <div className={`auth-field has-toggle${touched.confirmPassword && errors.confirmPassword ? " is-error" : ""}`} style={{ marginTop: 14 }}>
                  <span className="auth-field-icon"><LockIcon /></span>
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    name="confirmPassword"
                    placeholder={t("Confirm New Password")}
                    value={values.confirmPassword}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    className="auth-input"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="auth-field-toggle"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    tabIndex={-1}
                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                  >
                    {showConfirmPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                  </button>
                </div>
                {touched.confirmPassword && errors.confirmPassword && (
                  <p className="auth-error-msg">{errors.confirmPassword}</p>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="auth-btn-primary"
                  style={{ marginTop: 20 }}
                >
                  {isSubmitting ? "Resetting Password..." : "Reset Password"}
                </button>
              </form>
            )}
          </Formik>

          <div className="auth-switch-text" style={{ marginTop: 24, textAlign: "center" }}>
            Remember your password?{" "}
            <Link to="/login" className="auth-link font-semibold">
              Sign In
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

export default ResetPassword;
