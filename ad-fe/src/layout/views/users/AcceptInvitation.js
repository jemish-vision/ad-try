import React, { useEffect, useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ApiCheckInvitation, ApiAcceptInvitation, ApiRejectInvitation } from "../../../api-wrapper/ApiUsers";
import { ApiSelectOrganization } from "../../../api-wrapper/ApiOrganization";
import { ApiGetProfile } from "../../../api-wrapper/customer/ApiCustomer";
import { ROLES } from "../../../common/constants";
import Toast from "../../../common/helper/toast/Toast";
import Logo from "../../../common/logo/logo.png";
import Spinner from "../../../common/helper/loader/Loader";

export default function AcceptInvitation() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const token = params.get("token");

  const [loading, setLoading] = useState(true);
  const [invitation, setInvitation] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [accepting, setAccepting] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejected, setRejected] = useState(false);

  const isLoggedIn = !!localStorage.getItem("sellerToken");
  const [loggedInEmail, setLoggedInEmail] = useState(() => {
    return localStorage.getItem("userEmail") || JSON.parse(localStorage.getItem("userAccount") || localStorage.getItem("profile") || "{}")?.email || "";
  });

  useEffect(() => {
    if (isLoggedIn && !loggedInEmail) {
      ApiGetProfile()
        .then((res) => {
          if (res?.isSuccess && res?.profile?.email) {
            setLoggedInEmail(res.profile.email);
            localStorage.setItem("userEmail", res.profile.email);
          }
        })
        .catch(() => { });
    }
  }, [isLoggedIn, loggedInEmail]);

  useEffect(() => {
    if (!token) {
      setErrorMsg("Invitation token is missing from the link.");
      setLoading(false);
      return;
    }

    localStorage.setItem("inviteRedirect", `/accept-invitation?token=${token}`);
    sessionStorage.setItem("inviteRedirect", `/accept-invitation?token=${token}`);
    localStorage.setItem("invitationToken", token);
    sessionStorage.setItem("invitationToken", token);

    ApiCheckInvitation(token)
      .then((res) => {
        if (res?.isSuccess) {
          setInvitation(res.data);
          const action = params.get("action");
          if (action === "reject") {
            handleReject();
            return;
          }
        } else {
          setErrorMsg(res?.message || "This invitation link is invalid or has expired.");
        }
      })
      .catch(() => {
        setErrorMsg("Failed to verify invitation link. Please check your connection.");
      })
      .finally(() => {
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isLoggedIn]);

  useEffect(() => {
    if (errorMsg || rejected) {
      sessionStorage.removeItem("inviteRedirect");
      localStorage.removeItem("inviteRedirect");
      sessionStorage.removeItem("invitationToken");
      localStorage.removeItem("invitationToken");
      sessionStorage.removeItem("autoAcceptInvite");
    }
  }, [errorMsg, rejected]);

  const handleAccept = async () => {
    const currentEmail = loggedInEmail || localStorage.getItem("userEmail") || JSON.parse(localStorage.getItem("userAccount") || localStorage.getItem("profile") || "{}")?.email || "";
    if (invitation?.email && currentEmail && invitation.email.toLowerCase().trim() !== currentEmail.toLowerCase().trim()) {
      Toast.error(`Security check failed: This invitation is sent to ${invitation.email}, but you are currently logged in as ${currentEmail}.`);
      return;
    }
    setAccepting(true);
    try {
      const res = await ApiAcceptInvitation({ token });
      if (res?.isSuccess) {
        Toast.success(res.message || "Invitation accepted!");
        sessionStorage.removeItem("inviteRedirect");
        localStorage.removeItem("inviteRedirect");
        sessionStorage.removeItem("invitationToken");
        localStorage.removeItem("invitationToken");
        sessionStorage.removeItem("autoAcceptInvite");

        if (res.organizationId) {
          try {
            const selectRes = await ApiSelectOrganization({ organizationId: res.organizationId });
            if (selectRes?.isSuccess) {
              if (selectRes.authToken) localStorage.setItem("sellerToken", selectRes.authToken);
              if (selectRes.role) localStorage.setItem("role", selectRes.role);
              if (selectRes.organization?._id) {
                localStorage.setItem("organizationId", selectRes.organization._id);
                localStorage.setItem("organizationName", selectRes.organization.organizationName || "");
                localStorage.removeItem("profile");
                window.dispatchEvent(new Event("organizationChanged"));
              }

              const selectedOrg = selectRes.organization;
              const hasFutureEndDate = selectedOrg?.endDate && new Date(selectedOrg.endDate) > new Date();
              const isOrgTrialActive = Boolean(selectedOrg?.isTrialActive);
              const hasUsedTrialOrg = Boolean(selectedOrg?.hasUsedTrial);
              const hasActivePlan = Boolean(selectedOrg?.planId) || isOrgTrialActive || hasFutureEndDate;
              const trialExpired = hasUsedTrialOrg && !hasFutureEndDate && !selectedOrg?.planId;
              localStorage.setItem("isPlanActive", hasActivePlan ? "true" : "false");
              localStorage.setItem("isTrialActive", isOrgTrialActive ? "true" : "false");
              localStorage.setItem("hasUsedTrial", trialExpired ? "true" : "false");

              const currentRole = selectRes.role || localStorage.getItem("role");
              setTimeout(() => {
                if (selectRes.requiresPlan) {
                  window.location.href = "/select-plan";
                } else {
                  window.location.href = currentRole === ROLES.SUPER_ADMIN ? "/admin-dashboard" : "/";
                }
              }, 1000);
              return;
            }
          } catch (err) {
            console.error("Auto select organization error:", err);
          }
        }

        setTimeout(() => {
          window.location.href = "/select-organization";
        }, 1500);
      } else {
        Toast.error(res?.message || t("Failed to accept invitation."));
        setAccepting(false);
      }
    } catch (error) {
      Toast.error(t("Something went wrong while accepting invitation."));
      setAccepting(false);
    }
  };

  const handleReject = async () => {
    setRejecting(true);
    try {
      const res = await ApiRejectInvitation({ token });
      if (res?.isSuccess) {
        Toast.success(res.message || t("Invitation rejected."));
        setRejected(true);
        sessionStorage.removeItem("inviteRedirect");
        localStorage.removeItem("inviteRedirect");
        sessionStorage.removeItem("invitationToken");
        localStorage.removeItem("invitationToken");
      } else {
        Toast.error(res?.message || t("Failed to reject invitation."));
      }
    } catch (error) {
      Toast.error(t("Something went wrong while rejecting invitation."));
    } finally {
      setRejecting(false);
    }
  };

  const handleLoginRedirect = () => {
    const target = `${location.pathname}${location.search}`;
    sessionStorage.setItem("inviteRedirect", target);
    localStorage.setItem("inviteRedirect", target);
    navigate(`/login?redirect=${encodeURIComponent(target)}`);
  };

  const handleRegisterRedirect = () => {
    const target = `${location.pathname}${location.search}`;
    sessionStorage.setItem("inviteRedirect", target);
    localStorage.setItem("inviteRedirect", target);
    navigate("/registration", {
      state: {
        invitationToken: token,
        email: invitation?.email || ""
      }
    });
  };

  return (
    <main className="auth-page min-h-screen flex items-center justify-center relative overflow-hidden py-12 px-4">
      {/* 3D Animated Background matching SelectOrganization & Login */}
      <div className="auth-3d-bg">
        <div className="auth-orb auth-orb-1" />
        <div className="auth-orb auth-orb-2" />
        <div className="auth-orb auth-orb-3" />

        {/* 3D Wireframe Cubes */}
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

        {/* Premium Background Visual */}
        <svg
          className="auth-bg-visual"
          viewBox="0 0 1440 900"
          preserveAspectRatio="xMidYMid slice"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="lgMain" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#2374F2" stopOpacity="0" />
              <stop offset="25%" stopColor="#2374F2" stopOpacity="0.45" />
              <stop offset="65%" stopColor="#FF9900" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#FF9900" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M -100 750 C 300 450, 700 850, 1540 350"
            stroke="url(#lgMain)"
            strokeWidth="2.5"
            fill="none"
            opacity="0.6"
          />
        </svg>
      </div>

      {/* Main Glass Rounded Card exactly matching reference design */}
      <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl rounded-[32px] shadow-[0_25px_70px_rgba(0,0,0,0.08)] border border-gray-200/80 dark:border-slate-800/80 max-w-lg w-full p-8 md:p-10 text-center relative z-10 text-gray-800 dark:text-gray-100">

        {/* Top Brand Logo */}
        <Link to="/" className="mx-auto mb-6 block">
          <img src={Logo} alt="Advertise IQ" className="h-11 w-auto mx-auto object-contain drop-shadow-md" />
        </Link>

        {loading && (
          <div className="py-14 flex flex-col items-center justify-center gap-4">
            <Spinner />
            <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">{t("Verifying your team invitation...")}</p>
          </div>
        )}

        {!loading && errorMsg && !rejected && (
          <div className="py-6 space-y-6 w-full">
            <div className="w-16 h-16 rounded-2xl bg-red-100/80 dark:bg-red-900/50 text-red-600 dark:text-red-400 flex items-center justify-center text-3xl mx-auto shadow-sm border border-red-200/50 dark:border-red-800">
              <i className="fa fa-exclamation-triangle" />
            </div>
            <div>
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-bold bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400 border border-red-200/60 dark:border-red-800 uppercase tracking-wider mb-3">
                {t("Invitation Error")}
              </span>
              <h3 className="text-2xl font-extrabold text-gray-900 dark:text-white tracking-tight">{t("Link Expired or Invalid")}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">{errorMsg}</p>
            </div>
            <div className="pt-2">
              <Link to="/login" className="w-full block">
                <button className="w-full py-3.5 px-6 rounded-2xl font-bold text-sm text-white bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/25 transition-all">
                  {t("Back to Login")}
                </button>
              </Link>
            </div>
          </div>
        )}

        {rejected && (
          <div className="py-6 space-y-6 w-full">
            <div className="w-16 h-16 rounded-2xl bg-gray-100/80 dark:bg-slate-800 text-gray-500 dark:text-gray-400 flex items-center justify-center text-3xl mx-auto shadow-sm border border-gray-200 dark:border-slate-700">
              <i className="fa fa-times-circle text-red-500 dark:text-red-400" />
            </div>
            <div>
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-bold bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400 border border-red-200/60 dark:border-red-800 uppercase tracking-wider mb-3">
                {t("Invitation Declined")}
              </span>
              <h2 className="text-2xl font-extrabold text-gray-900 dark:text-white tracking-tight">
                {t("Invitation Rejected")}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">
                {t("You have declined the invitation to join {{name}}. This invitation is now closed.", { name: invitation?.organizationName || t("this organization") })}
              </p>
            </div>
            <div className="pt-2">
              <Link to="/login" className="w-full block">
                <button className="w-full py-3.5 px-6 rounded-2xl font-bold text-sm text-white bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/25 transition-all">
                  {t("Go to Login / Dashboard")}
                </button>
              </Link>
            </div>
          </div>
        )}

        {!loading && invitation && !rejected && (
          <div className="space-y-6 w-full">
            {/* Team Icon Box */}
            <div className="w-16 h-16 rounded-2xl bg-blue-100/80 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 flex items-center justify-center text-2xl mx-auto shadow-sm border border-blue-200/40 dark:border-blue-800">
              <i className="fa fa-users" />
            </div>

            {/* Pill Badge */}
            <div>
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-bold bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800 uppercase tracking-wider mb-3">
                <i className="fa fa-envelope" /> {t("Team Invitation")}
              </span>
              <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">
                {t("Join {{name}}", { name: invitation.organizationName })}
              </h1>
              <p className="text-gray-500 dark:text-gray-400 text-sm md:text-base font-medium mt-2 leading-relaxed">
                {t("You have been invited to join {{org}} with the role of {{role}}.", { org: invitation.organizationName, role: invitation.roleName })}
              </p>
            </div>

            {/* Details Box matching reference */}
            <div className="bg-gray-50/80 dark:bg-slate-800/80 rounded-2xl border border-gray-200/80 dark:border-slate-700/80 p-5 my-6 text-left space-y-3.5 text-sm shadow-sm">
              <div className="flex items-center justify-between gap-3 pb-3 border-b border-gray-200/60 dark:border-slate-700/60">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-blue-100/80 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xs shrink-0 border border-blue-200/50 dark:border-blue-800">
                    <i className="fa fa-envelope" />
                  </div>
                  <span className="text-gray-500 dark:text-gray-400 font-medium">{t("Invited Email:")}</span>
                </div>
                <span className="font-bold text-gray-800 dark:text-gray-100 truncate ml-2">{invitation.email}</span>
              </div>

              <div className="flex items-center justify-between gap-3 pb-3 border-b border-gray-200/60 dark:border-slate-700/60">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-purple-100/80 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400 flex items-center justify-center text-xs shrink-0 border border-purple-200/50 dark:border-purple-800">
                    <i className="fa fa-shield-alt" />
                  </div>
                  <span className="text-gray-500 dark:text-gray-400 font-medium">{t("Organization Role:")}</span>
                </div>
                <span className="font-bold text-blue-600 dark:text-blue-400">{invitation.roleName}</span>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-emerald-100/80 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xs shrink-0 border border-emerald-200/50 dark:border-emerald-800">
                    <i className="fa fa-user-tag" />
                  </div>
                  <span className="text-gray-500 dark:text-gray-400 font-medium">{t("Profiles Access:")}</span>
                </div>
                <span className="font-bold text-gray-800 dark:text-gray-100">
                  {invitation.profilesCount || invitation.profileCount || (Array.isArray(invitation.profiles) ? invitation.profiles.length : t("All"))} {t("Profile(s)")}
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            {isLoggedIn && loggedInEmail && invitation?.email && loggedInEmail.toLowerCase().trim() !== invitation.email.toLowerCase().trim() ? (
              <div className="bg-amber-50 dark:bg-amber-950/50 border-2 border-amber-300 dark:border-amber-800 rounded-2xl p-4.5 text-left space-y-4 shadow-sm p-4">
                <div className="flex items-start gap-3.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 shadow-sm">
                    <i className="fa fa-exclamation-triangle text-base" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-amber-900 dark:text-amber-200">
                      {t("Account Email Mismatch")}
                    </h4>
                    <p className="text-xs text-amber-800 dark:text-amber-300 mt-1 leading-relaxed">
                      {t("This invitation was sent specifically to {{email}}, but you are currently logged in as {{loggedInEmail}}. You cannot accept this invitation with a different account.", { email: invitation.email, loggedInEmail })}
                    </p>
                  </div>
                </div>
                <div className="space-y-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      localStorage.removeItem("sellerToken");
                      localStorage.removeItem("userEmail");
                      localStorage.removeItem("profile");
                      sessionStorage.setItem("invitationToken", token);
                      window.location.href = `/login?redirect=/accept-invitation?token=${token}`;
                    }}
                    className="w-full py-3 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs sm:text-sm transition-all shadow-md shadow-amber-600/20 flex items-center justify-center gap-2"
                  >
                    <i className="fa fa-sign-out-alt" />
                    <span>{t("Switch Account & Login as {{email}}", { email: invitation.email })}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      sessionStorage.removeItem("invitationToken");
                      navigate("/");
                    }}
                    className="w-full py-3 px-4 rounded-xl bg-white dark:bg-slate-800 hover:bg-amber-100/50 dark:hover:bg-amber-900/40 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-800/80 font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2"
                  >
                    <i className="fa fa-home" />
                    <span>{t("Continue as {{email}} (Go to Dashboard)", { email: loggedInEmail })}</span>
                  </button>
                </div>
              </div>
            ) : isLoggedIn ? (
              <div className="space-y-3 pt-1">
                <button
                  type="button"
                  onClick={handleAccept}
                  disabled={accepting || rejecting}
                  className="w-full py-3.5 px-6 rounded-2xl font-bold text-sm md:text-base text-white bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/25 transition-all relative flex items-center justify-center gap-2.5 group disabled:opacity-50"
                >
                  {accepting ? (
                    <>
                      <i className="fa fa-spinner fa-spin text-base" />
                      <span>{t("Joining Organization...")}</span>
                    </>
                  ) : (
                    <>
                      <span className="inline-flex items-center gap-2.5">
                        <i className="fa fa-check-circle text-base" />
                        <span>{t("Accept Invitation & Join")}</span>
                      </span>
                      <i className="fa fa-chevron-right text-xs absolute right-6 top-1/2 -translate-y-1/2 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleReject}
                  disabled={accepting || rejecting}
                  className="w-full py-3.5 px-6 rounded-2xl font-bold text-sm md:text-base text-gray-700 dark:text-gray-300 bg-white dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600 dark:hover:text-red-400 border border-gray-200 dark:border-slate-700 hover:border-red-200 dark:hover:border-red-800/60 transition-all flex items-center justify-center gap-2.5 disabled:opacity-50"
                >
                  {rejecting ? (
                    <>
                      <i className="fa fa-spinner fa-spin text-sm" />
                      <span>{t("Declining...")}</span>
                    </>
                  ) : (
                    <>
                      <i className="fa fa-times text-sm" />
                      <span>{t("Reject Invitation")}</span>
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="space-y-3 pt-1">
                {invitation.isUserExist ? (
                  <>
                    <button
                      type="button"
                      onClick={handleLoginRedirect}
                      disabled={accepting || rejecting}
                      className="w-full py-3.5 px-6 rounded-2xl font-bold text-sm md:text-base text-white bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/25 transition-all relative flex items-center justify-center gap-2.5 group disabled:opacity-50"
                    >
                      <span className="inline-flex items-center gap-2.5">
                        <i className="fa fa-sign-in-alt text-base" />
                        <span>{t("Login to Accept Invitation")}</span>
                      </span>
                      <i className="fa fa-chevron-right text-xs absolute right-6 top-1/2 -translate-y-1/2 group-hover:translate-x-1 transition-transform" />
                    </button>

                    <button
                      type="button"
                      onClick={handleReject}
                      disabled={rejecting}
                      className="w-full py-3.5 px-6 rounded-2xl font-bold text-sm md:text-base text-gray-700 dark:text-gray-300 bg-white dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600 dark:hover:text-red-400 border border-gray-200 dark:border-slate-700 hover:border-red-200 dark:hover:border-red-800/60 transition-all flex items-center justify-center gap-2.5 disabled:opacity-50"
                    >
                      {rejecting ? (
                        <>
                          <i className="fa fa-spinner fa-spin text-sm" />
                          <span>{t("Declining...")}</span>
                        </>
                      ) : (
                        <>
                          <i className="fa fa-times text-sm" />
                          <span>{t("Reject Invitation")}</span>
                        </>
                      )}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={handleRegisterRedirect}
                      disabled={accepting || rejecting}
                      className="w-full py-3.5 px-6 rounded-2xl font-bold text-sm md:text-base text-white bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/25 transition-all relative flex items-center justify-center gap-2.5 group disabled:opacity-50"
                    >
                      <span className="inline-flex items-center gap-2.5">
                        <i className="fa fa-user-plus text-base" />
                        <span>{t("Register & Accept Invitation")}</span>
                      </span>
                      <i className="fa fa-chevron-right text-xs absolute right-6 top-1/2 -translate-y-1/2 group-hover:translate-x-1 transition-transform" />
                    </button>

                    <button
                      type="button"
                      onClick={handleReject}
                      disabled={rejecting}
                      className="w-full py-3.5 px-6 rounded-2xl font-bold text-sm md:text-base text-gray-700 dark:text-gray-300 bg-white dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600 dark:hover:text-red-400 border border-gray-200 dark:border-slate-700 hover:border-red-200 dark:hover:border-red-800/60 transition-all flex items-center justify-center gap-2.5 disabled:opacity-50"
                    >
                      {rejecting ? (
                        <>
                          <i className="fa fa-spinner fa-spin text-sm" />
                          <span>{t("Declining...")}</span>
                        </>
                      ) : (
                        <>
                          <i className="fa fa-times text-sm" />
                          <span>{t("Reject Invitation")}</span>
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Footer Lock & Note */}
            <div className="mt-6 text-center text-xs text-gray-500 dark:text-gray-400 font-medium">
              <p className="flex items-center justify-center gap-1.5">
                <i className="fa fa-lock text-gray-400 dark:text-gray-500" />{" "}
                {isLoggedIn
                  ? t("You are currently logged in.")
                  : invitation?.isUserExist
                    ? t("Please log in to your account to accept.")
                    : t("Create your account to join immediately.")}
              </p>
              <p className="text-gray-400 dark:text-gray-500 mt-1">
                {isLoggedIn
                  ? t("Clicking accept will grant you immediate access to the team.")
                  : invitation?.isUserExist
                    ? t("An account with {{email}} already exists.", { email: invitation.email })
                    : t("We will set up your workspace profile for {{email}}.", { email: invitation.email })}
              </p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
