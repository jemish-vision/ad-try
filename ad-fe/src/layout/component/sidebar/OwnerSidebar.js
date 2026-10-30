import React, { useState, useEffect, useContext } from "react";
import { flushSync } from "react-dom";
import logo from "../../../common/logo/logo.png";
import fullLogo from "../../../common/logo/full-logo.png";
import fullLogoDark from "../../../common/logo/full-logo-dark.png";
import { useTranslation } from "react-i18next";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "../../../components/ui/dropdown-menu";
import { useLocation, Link, useNavigate } from "react-router-dom";
import { Toast, useDispatch, handleLoader } from "../../../helper/links/Link";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../../../components/ui/dialog";
import { ApiChangePassword } from "../../../api-wrapper/auth/ApiAuth";
import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { changePWDSchema } from "../../../utility/validator";
import passwordImage from "../../../assets/images/passwordChange.jpg";
import {
  Moon, Sun, UserCircle,
  House, Users, Globe, Gear, Package,
  CalendarCheck, Prohibit, BookOpen, Headset, Buildings,
  ShieldCheck, ChartLineUp, CaretRight, List, SignOut, FileText, X, ClockCountdown, ChatCenteredText, Gauge,
} from "@phosphor-icons/react";
import { ApiDeleteDeviceToken } from "../../../api-wrapper/devices/ApiDeviceToken";
import { ApiGetProfile } from "../../../api-wrapper/customer/ApiCustomer";
import { AppTooltip } from "../../../components/ui/AppTooltip";
import { ProfileContext } from "src/helper/usecontext/useContext";

// Concise nav entries for Super Admin
const OWNER_NAV = [
  { name: "Dashboard", icon: <House size={17} weight="regular" />, path: "/admin-dashboard" },


  { name: "Organizations", icon: <Buildings size={17} weight="regular" />, path: "/organizations" },
  { name: "Users", icon: <Users size={17} weight="regular" />, path: "/users" },
  { name: "Pages", icon: <FileText size={17} weight="regular" />, path: "/pages" },
  { name: "Plans", icon: <Package size={17} weight="regular" />, path: "/packages" },
  { name: "Role", icon: <ShieldCheck size={17} weight="regular" />, path: "/role" },
  { name: "Retention", icon: <ClockCountdown size={17} weight="regular" />, path: "/retention" },
  { name: "Cron Job", icon: <ChartLineUp size={17} weight="regular" />, path: "/cron-job" },
  { name: "API Capacity & Usage", icon: <Gauge size={17} weight="regular" />, path: "/api-capacity" },
  { name: "Holiday/Special Days", icon: <CalendarCheck size={17} weight="regular" />, path: "/holiday" },
  { name: "Rule Blocked Time", icon: <Prohibit size={17} weight="regular" />, path: "/rule-blocked-time" },
  { name: "Support Ticket", icon: <Headset size={17} weight="regular" />, path: "/support-ticket" },
  { name: "Chatbot Gaps", icon: <ChatCenteredText size={17} weight="regular" />, path: "/unanswered-questions" },

  /* { name: "User Guide", icon: <BookOpen size={17} weight="regular" />, path: "/user-guide" }, */
];

function OwnerSidebar({ open, setOpen }) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const getActiveTheme = () => {
    const storedTheme = localStorage.getItem("theme");
    if (storedTheme) return storedTheme;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  };

  const [theme, setTheme] = useState(getActiveTheme());
  const [modalShow, setModalShow] = useState(false);
  const [fullName, setFullName] = useState("");
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 992);
  const { loginUser, setLoginUser } = useContext(ProfileContext);
  const [role] = useState(localStorage.getItem("role") || "Super Admin");

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 992);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const isExpanded = isMobile ? open : !open;

  useEffect(() => {
    const storedName = localStorage.getItem("sellerAdminLoginUser");
    if (storedName) {
      setFullName(storedName);
    }
    ApiGetProfile()
      .then((res) => {
        if (res.isSuccess && res.profile) {
          setLoginUser(res.profile);
          setFullName(res.profile.fullName);
          localStorage.setItem("sellerAdminLoginUser", res.profile.fullName);
          if (res.profile?.email) localStorage.setItem("userEmail", res.profile.email);
          if (res.profile?.fullName || res.profile?.name) localStorage.setItem("userName", res.profile?.fullName || res.profile?.name);
          if (res.profile) localStorage.setItem("userAccount", JSON.stringify(res.profile));
        }
      })
      .catch(() => { });
  }, []);

  const toggleTheme = (e) => {
    const nextTheme = theme === "light" ? "dark" : "light";

    const x = e && e.clientX !== undefined ? `${e.clientX}px` : "50%";
    const y = e && e.clientY !== undefined ? `${e.clientY}px` : "50%";
    document.documentElement.style.setProperty("--vt-x", x);
    document.documentElement.style.setProperty("--vt-y", y);

    // Amazon Ads click ripple & spark effect
    const origin = document.createElement("div");
    origin.className = "ad-click-origin";
    origin.style.setProperty("--vt-x", x);
    origin.style.setProperty("--vt-y", y);

    for (let i = 0; i < 3; i++) {
      const ring = document.createElement("div");
      ring.className = "ad-click-ring";
      origin.appendChild(ring);
    }

    const spark = document.createElement("div");
    spark.className = "ad-click-spark";
    origin.appendChild(spark);

    const smile = document.createElement("div");
    smile.className = "ad-smile-arc";
    origin.appendChild(smile);

    document.body.appendChild(origin);
    setTimeout(() => origin.remove(), 1000);

    const updateTheme = () => {
      setTheme(nextTheme);
      localStorage.setItem("theme", nextTheme);
      document.documentElement.setAttribute("data-theme", nextTheme);
      window.dispatchEvent(new Event("themeChanged"));
    };

    if (!document.startViewTransition) {
      updateTheme();
      return;
    }

    document.startViewTransition(() => {
      updateTheme();
    });
  };

  useEffect(() => {
    const handleThemeChange = () => setTheme(getActiveTheme());
    window.addEventListener("themeChanged", handleThemeChange);
    return () => window.removeEventListener("themeChanged", handleThemeChange);
  }, []);

  const logoutHandler = async () => {
    const deviceToken = localStorage.getItem("device_token");
    if (deviceToken) await ApiDeleteDeviceToken({ deviceToken });
    localStorage.clear();
    window.location.href = "/login";
  };

  function ChangePasswordModal(props) {
    const { register, handleSubmit, formState: { errors } } = useForm({ resolver: yupResolver(changePWDSchema) });
    const changePwdHandler = async (data) => {
      dispatch(handleLoader(true));
      await ApiChangePassword({ oldPassword: data.oldpwd, newPassword: data.password, confirmPassword: data.confirmPwd })
        .then((e) => {
          dispatch(handleLoader(false));
          if (e?.isSuccess) { Toast.success(e?.message); localStorage.clear(); window.location.href = "/login"; }
          else Toast.error(e?.message);
        })
        .catch(() => { dispatch(handleLoader(false)); Toast.error(t("Something went wrong")); });
    };
    return (
      <Dialog open={props.show} onOpenChange={(open) => !open && props.onHide()}>
        <DialogContent className="premium-modal sm:max-w-[500px] gap-0 p-0 overflow-hidden bg-white dark:bg-[#1e1e1e]">
          <DialogHeader className="premium-modal-header border-0 px-6 py-4 relative !justify-start !text-left">
            <div className="flex items-center gap-3.5 w-full justify-start text-left">
              <div className="premium-modal-icon-wrap flex items-center justify-center flex-shrink-0">
                <i className="fa-solid fa-key"></i>
              </div>
              <div className="text-left flex-1">
                <DialogTitle className="premium-modal-title !text-left">{t("Update Password")}</DialogTitle>
                <p className="premium-modal-subtitle m-0 text-sm opacity-80 !text-left">{t("Ensure your account stays secure")}</p>
              </div>
            </div>
          </DialogHeader>
          <form onSubmit={handleSubmit(changePwdHandler)}>
            <div className="premium-modal-body px-6 py-4">
              <div className="form-group mb-4">
                <label className="form-label premium-input-label block mb-1">{t("Current Password")}</label>
                <div className="premium-input-wrapper">
                  <i className="fa-solid fa-lock premium-input-icon"></i>
                  <input
                    className="form-control premium-form-control"
                    type="password"
                    placeholder={t("Enter current password")}
                    {...register("oldpwd")}
                  />
                </div>
                {errors.oldpwd && (
                  <p className="premium-error-msg mt-1 mb-0 small">{errors.oldpwd.message}</p>
                )}
              </div>

              <div className="form-group mb-4">
                <label className="form-label premium-input-label block mb-1">{t("New Password")}</label>
                <div className="premium-input-wrapper">
                  <i className="fa-solid fa-key premium-input-icon"></i>
                  <input
                    type="password"
                    className="form-control premium-form-control"
                    placeholder={t("Enter new password")}
                    {...register("password")}
                  />
                </div>
                {errors.password && (
                  <p className="premium-error-msg mt-1 mb-0 small">{errors.password.message}</p>
                )}
              </div>

              <div className="form-group mb-4">
                <label className="form-label premium-input-label block mb-1">{t("Confirm New Password")}</label>
                <div className="premium-input-wrapper">
                  <i className="fa-solid fa-key premium-input-icon"></i>
                  <input
                    type="password"
                    className="form-control premium-form-control"
                    placeholder={t("Confirm new password")}
                    {...register("confirmPwd")}
                  />
                </div>
                {errors.confirmPwd && (
                  <p className="premium-error-msg mt-1 mb-0 small">{errors.confirmPwd.message}</p>
                )}
              </div>
            </div>
            <DialogFooter className="premium-modal-footer px-6 py-4">
              <button className="premium-btn premium-btn-secondary" type="button" onClick={props.onHide}>
                Cancel
              </button>
              <button className="premium-btn premium-btn-primary" type="submit">
                Reset Password <i className="fa-solid fa-arrow-right-long ml-2"></i>
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <>
      {isMobile && open && (
        <div
          className="owner-sidebar-backdrop"
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(15, 23, 42, 0.4)",
            backdropFilter: "blur(2px)",
            WebkitBackdropFilter: "blur(2px)",
            zIndex: 1040,
            transition: "opacity 0.3s ease",
          }}
        />
      )}
      <aside id="owner-sidebar" className={`owner-sidebar-wrapper ${open ? "mobile-open" : "mobile-closed"}`} style={{ zIndex: 1050 }}>
        <div className="owner-sidebar-inner">

          <div className={`owner-brand-header flex items-center ${!isExpanded ? "justify-center" : "justify-between"}`} style={{ padding: "16px 20px" }}>
            {!isExpanded ? (
              <div className="owner-dock-logo" onClick={() => setOpen(prev => !prev)} style={{ cursor: "pointer" }}>
                <img src={logo} alt="logo" style={{ height: "42px", width: "auto", objectFit: "contain" }} />
              </div>
            ) : (
              <div className="flex items-center justify-between w-full">
                <div className="flex flex-col items-start" style={{ flex: 1, minWidth: 0 }}>
                  <img
                    src={theme === "dark" ? fullLogoDark : fullLogo}
                    alt="AdvertiseIQ"
                    style={{ 
                      height: theme === "dark" ? "140px" : "54px", 
                      width: "auto", 
                      maxWidth: "100%", 
                      objectFit: "contain",
                      margin: theme === "dark" ? "-43px 0" : "0"
                    }}
                  />
                </div>
                {isMobile && (
                  <button
                    type="button"
                    className="owner-mobile-close-btn"
                    onClick={() => setOpen(false)}
                    title={t("Close menu")}
                    style={{
                      background: "rgba(100, 116, 139, 0.12)",
                      border: "none",
                      borderRadius: "8px",
                      width: "34px",
                      height: "34px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      color: "var(--text-primary, #1e293b)",
                      flexShrink: 0,
                      marginLeft: "8px"
                    }}
                  >
                    <X size={18} weight="bold" />
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="owner-hr" />

          {/* ── Navigation ── */}
          <nav className="owner-nav-area">
            <ul className="owner-nav-list">
              {OWNER_NAV.map((item, i) => {
                const isActive = location.pathname === item.path;
                const navLink = (
                  <Link
                    to={item.path}
                    className="owner-nav-link"
                    onClick={() => { if (window.innerWidth < 992) setOpen(false); }}
                  >
                    <span className="owner-nav-icon">{item.icon}</span>
                    {isExpanded && <span className="owner-nav-text">{t(item.name)}</span>}
                    {isExpanded && isActive && <CaretRight size={10} className="owner-nav-caret" />}
                  </Link>
                );
                return (
                  <li key={i} className={`owner-nav-item${isActive ? " is-active" : ""}`}>
                    {!isExpanded ? (
                      <AppTooltip text={t(item.name)} side="right">
                        {navLink}
                      </AppTooltip>
                    ) : navLink}
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* ── Footer ── */}
          <div className="owner-sidebar-bottom">
            <div className="owner-hr" />
            <div className={`owner-bottom-row flex items-center ${!isExpanded ? "justify-center flex-col gap-2" : "justify-between px-2"}`}>
              {isExpanded && fullName && (
                <span className="owner-user-name" title={fullName} style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "120px" }}>
                  {fullName}
                </span>
              )}

              <div className={`flex items-center ${!isExpanded ? "flex-col gap-2" : "gap-1 flex-wrap"}`}>
                <AppTooltip text={t("Profile")} side={!isExpanded ? "right" : "top"}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <span
                        className="owner-icon-btn cursor-pointer flex items-center justify-center"
                        style={{ width: "32px", height: "32px", borderRadius: "8px", transition: "background 0.2s" }}
                      >
                        <UserCircle size={18} weight="regular" />
                      </span>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align={!isExpanded ? "start" : "end"} side={!isExpanded ? "right" : "top"} sideOffset={15} className="w-64 md:w-72 shadow-2xl rounded-2xl border border-gray-200 dark:border-gray-800 p-0 z-[9999] overflow-hidden bg-white dark:bg-slate-900">
                      {/* Top Fixed Bar showing User Name and Email */}
                      <div className="p-3.5 bg-gradient-to-br from-blue-50/90 via-gray-50 to-slate-100/60 dark:from-slate-800 dark:via-slate-800/90 dark:to-slate-900 border-b border-gray-200/80 dark:border-slate-800 space-y-2.5">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1A9FD4] to-[#2374F2] text-white font-extrabold flex items-center justify-center text-sm shadow-sm shrink-0 border border-blue-500/20">
                            {(loginUser?.fullName || loginUser?.name || fullName || localStorage.getItem("userName") || localStorage.getItem("sellerAdminLoginUser") || "U").charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h4 className="font-bold text-sm text-gray-900 dark:text-white truncate" title={loginUser?.fullName || loginUser?.name || fullName || localStorage.getItem("userName") || localStorage.getItem("sellerAdminLoginUser") || "User"}>
                              {loginUser?.fullName || loginUser?.name || fullName || localStorage.getItem("userName") || localStorage.getItem("sellerAdminLoginUser") || "User"}
                            </h4>
                            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium truncate" title={loginUser?.email || localStorage.getItem("userEmail") || localStorage.getItem("email") || ""}>
                              {loginUser?.email || localStorage.getItem("userEmail") || localStorage.getItem("email") || "No Email"}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="p-1.5 space-y-0.5 max-h-[320px] overflow-y-auto">
                        <DropdownMenuItem className="cursor-pointer py-2 px-3 rounded-md" onClick={() => navigate("/profile")}>
                          {t("View Profile")}
                        </DropdownMenuItem>
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </AppTooltip>

                <AppTooltip text={t("Settings")} side={!isExpanded ? "right" : "top"}>
                  <span
                    className={`owner-icon-btn cursor-pointer ${location.pathname === "/settings" ? "active" : ""}`}
                    onClick={() => navigate("/settings")}
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "8px",
                      transition: "background 0.2s",
                      color: location.pathname === "/settings" ? "var(--accent-primary)" : undefined
                    }}
                  >
                    <Gear size={18} weight={location.pathname === "/settings" ? "fill" : "regular"} />
                  </span>
                </AppTooltip>

                <AppTooltip text={t("Logout")} side={!isExpanded ? "right" : "top"}>
                  <span
                    className="owner-icon-btn text-danger cursor-pointer"
                    onClick={logoutHandler}
                    style={{ width: "32px", height: "32px", borderRadius: "8px", transition: "background 0.2s" }}
                  >
                    <SignOut size={18} weight="regular" />
                  </span>
                </AppTooltip>
              </div>
            </div>
          </div>

        </div>
      </aside>

    </>
  );
}

export default OwnerSidebar;
