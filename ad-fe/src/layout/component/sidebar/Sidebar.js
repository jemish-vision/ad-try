import React, { useEffect, useState, forwardRef } from "react";
import { flushSync } from "react-dom";
import logo from "../../../common/logo/logo.png";
import fullLogo from "../../../common/logo/full-logo.png";
import fullLogoDark from "../../../common/logo/full-logo-dark.png";
import { useTranslation } from "react-i18next";
import nav from "../../../router/nav";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "../../../components/ui/dropdown-menu";
import { useLocation } from "react-router-dom";
import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import {
  Toast,
  useDispatch,
  useNavigate,
  handleLoader,
} from "../../../helper/links/Link";
import { ApiGetProfile } from "../../../api-wrapper/customer/ApiCustomer";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../../../components/ui/dialog";
import {
  ApiChangePassword,
  ApiConnectGoogle,
  ApiDisconnectGoogle,
  ApiGetGoogleSheetLink,
} from "../../../api-wrapper/auth/ApiAuth";
import { useSelector } from "react-redux";
import { ProfileContext } from "../../../helper/usecontext/useContext";
import { useContext } from "react";
import passwordImage from "../../../assets/images/passwordChange.jpg";
import { changePWDSchema } from "../../../utility/validator";


import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";

import { useSpring, animated } from "@react-spring/web";

import { Link } from "react-router-dom";
import { CaretRight, CaretDown, Moon, Sun, UserCircle, List, ChartLineUp, Package, Gear, MagnifyingGlass, SignOut, Sliders, X, ChatCenteredText } from "@phosphor-icons/react";
import { AppTooltip } from "../../../components/ui/AppTooltip";
import { ApiCreateDeviceToken, ApiDeleteDeviceToken } from "../../../api-wrapper/devices/ApiDeviceToken";
import { messaging } from "../../../common/helper/firebase/FirebaseInitialize";
import { getToken } from "firebase/messaging";
import TrialStatusModal from "./Sidebar/TrialModal";
import EditProfileModal from "./EditProfileModal";
import moment from "moment";
import ConfigTypeDropdown from "../../../helper/filter/ConfigDropDown/ConfigTypeDropdown";
import ConfigProfileDropdown from "../../../helper/filter/ConfigDropDown/ConfigProfileDropdown";
import NotificationPanel from "../../../helper/notification/NotificationPanel";
import ChatbotWidget from "../../../helper/chatbot/ChatbotWidget";
import { ApiGetTotalRecommendationCount } from "../../../api-wrapper/recommendation/ApiRecommendation";
import { useTour } from "../../../tour";
import { PAGE_ACTIONS, ROLES, SYSTEM_PAGES } from "src/common/constants";
import { PermissionCheck } from "src/helper/permission/PermissionCheck";

function Sidebar({ open, setOpen }) {
  const { t } = useTranslation();
  const { startTour, state: tourState } = useTour();
  const isProfileTourActive = tourState?.run && tourState?.activeTourId === "sidebar-dock-profile";
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [collapsedMenus, setCollapsedMenus] = useState({});


  const { profileId, selectedAdType, refreshSideBar } = useContext(ProfileContext)

  const [activeCategory, setActiveCategory] = useState("optimize");
  const [showSubPanel, setShowSubPanel] = useState(() => window.innerWidth >= 1024);
  const [searchQuery, setSearchQuery] = useState("");
  const [profileModalShow, setProfileModalShow] = useState(false);

  const CATEGORIES = {
    optimize: {
      name: "Optimize",
      icon: <ChartLineUp size={22} weight="regular" />,
      items: ["Dashboard", "Campaigns", "Placement", "Budget Rules", "Recommendation", "Targeting", "Search Term", "Hourly Performance Tracking"]
    },
    operations: {
      name: "Operations",
      icon: <Package size={22} weight="regular" />,
      items: [
        "Profit Analysis", "Orders", "Order Report", "Product List", "Product Ads", "Product Performance", "Promotions", "Coupons", "Deals",
        "Inventory", "Warehouse Inventory", "Warehouse Details", "FBA Planning", "MFN to FBA", "Reconciliation & Reimbursement", "Returns & Refunds"
      ]
    },
    management: {
      name: "Management",
      icon: <Sliders size={22} weight="regular" />,
      items: [
        "Analytics", "Brand Analytics", "History", "Audit Log", "Cron Job Scheduler", "Cron Job", "P/L Calculater",
        "Users", "Pages", "Role", "Plans", "Holiday/Special Days", "ASANA Users",
        "Rule Blocked Time"/*, "User Guide"*/, "Support Ticket"
      ]
    }
  };

  const getActiveTheme = () => {
    const storedTheme = localStorage.getItem("theme");
    if (storedTheme) return storedTheme;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  };

  const [theme, setTheme] = useState(getActiveTheme());
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
    const handleThemeChange = () => {
      setTheme(getActiveTheme());
    };
    window.addEventListener("themeChanged", handleThemeChange);
    return () => window.removeEventListener("themeChanged", handleThemeChange);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setShowSubPanel(false);
        setOpen(false);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const [modalShow, setModalShow] = React.useState(false);
  let { pagePermission, loginUser, setLoginUser, setAmazonConnectLimit, setNumberOfInvites, setTotalOrgConfigs, setTotalOrgUsers, setTotalPendingInvites, setProfileLimit, setTotalOrgProfiles, isPlanActive, setIsPlanActive, profileList } = useContext(ProfileContext);
  let navigate = useNavigate();
  let location = useLocation();
  const [activePath, setActivePath] = useState(location.pathname);

  useEffect(() => {
    setActivePath(location.pathname);
  }, [location.pathname]);

  const isPathActive = (path) => {
    if (!path) return false;
    if (`${path}`?.toLowerCase() === `${activePath}`?.toLowerCase()) return true;
    if ((path === "/" || path === "/dashboard") && (activePath === "/" || activePath === "/dashboard")) return true;
    return false;
  };

  useEffect(() => {
    // Find all submenus and position their sliding indicator bar
    const submenus = document.querySelectorAll(".sidebar-right-scroll .submenu");
    submenus.forEach((submenu) => {
      let indicator = submenu.querySelector(".submenu_indicator");
      if (!indicator) {
        indicator = document.createElement("div");
        indicator.className = "submenu_indicator";
        submenu.appendChild(indicator);
      }

      // Query active child element
      const activeLi = submenu.querySelector("li.active");
      if (activeLi) {
        const top = activeLi.offsetTop;
        const height = activeLi.offsetHeight;
        indicator.style.transform = `translateY(${top}px)`;
        indicator.style.height = `${height}px`;
        indicator.style.opacity = "1";
      } else {
        indicator.style.opacity = "0";
        indicator.style.height = "0px";
      }
    });
  }, [activePath, collapsedMenus, refreshSideBar]);

  const dispatch = useDispatch();
  const [profileData, setProfileData] = useState();
  const [navRoutes, setNavRoutes] = useState();
  const [checkFlag, setcheckFlag] = useState(false);
  const [permissionPages, setPermissionPages] = useState([]);
  const [isGoogleConnected, setIsGoogleConnected] = useState(false);
  const [googleSheetLink, setGoogleSheetLink] = useState(null);
  const [googleKeywordSheetLink, setGoogleKeywordSheetLink] = useState(null);
  const [opens, setOpens] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [popUpRemainingDays, setPopUpRemainingDays] = useState(0);
  const [totalNewRecommendations, setTotalNewRecommendations] = useState(0);

  const [role] = useState(localStorage.getItem('role'));

  const handleClick = (event) => {
    setOpens((previousOpen) => !previousOpen);
  };

  const canBeOpen = opens && Boolean(anchorEl);
  const id = canBeOpen ? "spring-popper" : undefined;

  const Fade = forwardRef(function Fade(props, ref) {
    const { in: open, children, onEnter, onExited, ...other } = props;
    const style = useSpring({
      from: { opacity: 0 },
      to: { opacity: open ? 1 : 0 },
      onStart: () => {
        if (open && onEnter) {
          onEnter();
        }
      },
      onRest: () => {
        if (!open && onExited) {
          onExited();
        }
      },
    });

    return (
      <animated.div ref={ref} style={style} {...other}>
        {children}
      </animated.div>
    );
  });

  const logoutHandler = async () => {
    const deviceToken = localStorage.getItem("device_token");
    if (deviceToken) await ApiDeleteDeviceToken({ deviceToken })
    localStorage.removeItem("sellerToken");
    localStorage.removeItem("profile");
    localStorage.removeItem("connection");
    localStorage.removeItem("customerId");
    localStorage.removeItem("campaigns");
    localStorage.clear();
    window.location.href = "/login";
  };

  const { isLoading, error, data, refetch } = useQuery({
    queryKey: ["Notification"],
    queryFn: async () => {
      try {
        // const response = await axios.get(`${api}/get-notifications`, {
        //   headers,
        // });

        // const notifications = response.data?.data || [];
        // const finalNotifications = notifications?.reverse() || [];
        // const seenTrueData = finalNotifications?.filter(
        //   (item) => item.seen === true
        // );
        // const seenFalseData = finalNotifications?.filter(
        //   (item) => item.seen === false
        // );

        // setNotifications(finalNotifications);
        // setSeenNotifications(seenTrueData);
        // setUnseenNotifications(seenFalseData);

        // return finalNotifications;
        return [];
      } catch (err) {
        throw err;
      }
    },
    enabled: false,
  });

  const pageChangeHandler = (path) => {
    setcheckFlag(true);
    navigate(path);
    if (window.innerWidth < 1024) {
      setOpen(false);
      setShowSubPanel(false);
    }
  };

  const fetchProfileData = () => {
    ApiGetProfile()
      .then((res) => {
        if (res.isSuccess) {
          setLoginUser(res.profile);
          setProfileData(res.profile);
          if (res.profile?.email) localStorage.setItem("userEmail", res.profile.email);
          if (res.profile?.fullName || res.profile?.name) localStorage.setItem("userName", res.profile?.fullName || res.profile?.name);
          if (res.profile) localStorage.setItem("userAccount", JSON.stringify(res.profile));

          // Check here that Plan is Active or Not.
          const profile = res.profile;
          setAmazonConnectLimit(profile?.amazonConnectLimit || 0);
          setNumberOfInvites(profile?.numberOfInvites || 0);
          setTotalOrgConfigs(profile?.totalOrgConfigs || 0);
          setTotalOrgUsers(profile?.totalOrgUsers || 0);
          setTotalPendingInvites(profile?.totalPendingInvites || 0);
          setProfileLimit(profile?.profileLimit || 0);
          setTotalOrgProfiles(profile?.totalOrgProfiles || 0);
          const org = res?.organization || profile?.organization || null;
          const isOrgTrialActive = Boolean(org?.isTrialActive);
          const hasUsedTrialFromBe = Boolean(org?.hasUsedTrial ?? res?.hasUsedTrial ?? profile?.hasUsedTrial);

          let currentPlanStatus = false;
          if (profile?.packageId && profile?.packageStartDate && profile?.packageEndDate) {
            const today = new Date();
            const startDate = new Date(profile?.packageStartDate);
            const endDate = new Date(profile?.packageEndDate);
            today.setHours(0, 0, 0, 0);
            startDate.setHours(0, 0, 0, 0);
            endDate.setHours(23, 59, 59, 999);
            currentPlanStatus = today >= startDate && today <= endDate;
          } else if (org?.planId && !isOrgTrialActive) {
            currentPlanStatus = true;
          }

          // If packageEndDate is in the future, treat the plan as active regardless of hasUsedTrial flag
          // (Super Admin may have extended endDate after trial expired)
          const hasFutureEndDate = Boolean((profile?.packageEndDate && new Date(profile.packageEndDate) > new Date()) || (org?.endDate && new Date(org.endDate) > new Date()));
          const isPlanActiveFlag = hasFutureEndDate ? true : (currentPlanStatus && !hasUsedTrialFromBe);
          setIsPlanActive(isPlanActiveFlag);
          localStorage.setItem("isPlanActive", isPlanActiveFlag ? "true" : "false");
          localStorage.setItem("isTrialActive", (isOrgTrialActive || hasFutureEndDate) ? "true" : "false");
          // hasUsedTrial should be false when there is a valid future endDate
          const effectiveTrialCompleted = hasFutureEndDate ? false : (hasUsedTrialFromBe || (!currentPlanStatus && (isOrgTrialActive || profile?.packageId)));
          localStorage.setItem("hasUsedTrial", effectiveTrialCompleted ? "true" : "false");
          window.dispatchEvent(new Event("planStatusChanged"));

          if (role === ROLES.ADMIN && !org && location.pathname !== "/select-organization" && location.pathname !== "/select-plan") {
            navigate("/select-organization");
          } else if (org && !org?.planId && !isOrgTrialActive && !hasFutureEndDate && location.pathname !== "/select-organization" && location.pathname !== "/select-plan" && location.pathname !== "/purchase-plans" && location.pathname !== "/update-subscription") {
            navigate("/select-plan");
          } else if (role === ROLES.ADMIN && !profile?.packageId && (!org || (!org?.planId && !isOrgTrialActive && !hasFutureEndDate)) && location.pathname !== "/select-organization" && location.pathname !== "/select-plan" && location.pathname !== "/purchase-plans" && location.pathname !== "/update-subscription") {
            navigate("/select-plan");
          } else if (role !== ROLES.SUPER_ADMIN && (!isPlanActiveFlag || effectiveTrialCompleted) && !["/select-organization", "/select-plan", "/purchase-plans", "/update-subscription", "/maintenance-mode", "/payment-success", "/payment-failed", "/accept-invitation"].includes(location.pathname)) {
            navigate("/select-plan");
          }

          if (role === ROLES.ADMIN && profile?.packageStartDate && profile?.packageEndDate) {
            let remainingDays = moment(profile?.packageEndDate).endOf("day").diff(moment().startOf("day"), "days");
            if (remainingDays < 0) remainingDays = 0;
            setPopUpRemainingDays(remainingDays);
            setShowPlanModal(remainingDays <= 3 && role === ROLES.ADMIN);
          }

          localStorage.setItem("sellerAdminLoginUser", res.profile?.fullName);
        } else {
          Toast.error(res.message);
        }
      })
      .catch((err) => {
        // Suppress or handle err
      });
  }; // Extract function for reuse

  useEffect(() => {
    const isConnected = localStorage.getItem("isGoogleConnected") === "true";
    setIsGoogleConnected(isConnected);
    refetch();

    fetchProfileData();
  }, [refreshSideBar, location.pathname]);

  const getGoogleSheetLink = async () => {
    try {
      await ApiGetGoogleSheetLink({ profileId: profileId?.value })
        .then((res) => {
          if (res?.isSuccess) {
            if (res?.url) setGoogleSheetLink(res?.url)
            if (res?.keywordUrl) setGoogleKeywordSheetLink(res?.keywordUrl)
          }
          else {
            setGoogleSheetLink(null)
            setGoogleKeywordSheetLink(null)
          }
        });
    } catch (error) {
      setGoogleSheetLink(null)
      setGoogleKeywordSheetLink(null)
      console.log("Google Sheet Error:", error);
    }
  }

  useEffect(() => {
    const registerDeviceToken = async () => {
      try {
        const currentToken = await getToken(messaging, { vapidKey: process.env.REACT_APP_FIREBASE_VAPID_KEY });

        if (!currentToken) {
          console.log("No device token received");
          return;
        }

        console.log("Generated Device Token:", currentToken);
        const res = await ApiCreateDeviceToken({ deviceToken: currentToken, profileId: profileId?.value });

        if (res?.isSuccess) {
          console.log("Token saved or already existed in DB");
        }

        // 4) Store in local
        localStorage.setItem("device_token", currentToken);

      } catch (error) {
        console.log("Token generation error:", error);
      }
    };

    if (profileId?.value && selectedAdType) registerDeviceToken();
    if (profileId?.value && selectedAdType) getGoogleSheetLink();
  }, [profileId?.value, selectedAdType]);

  useEffect(() => {
    const fetchRecommendationCount = async () => {
      if (!profileId?.value) return;
      try {
        const res = await ApiGetTotalRecommendationCount({ profileId: profileId?.value });
        if (res?.isSuccess) {
          setTotalNewRecommendations(res?.rulesWithNew || 0);
        }
      } catch (error) {
        console.log("Recommendation count error:", error);
      }
    };

    fetchRecommendationCount();
  }, [profileId?.value, selectedAdType, refreshSideBar]);

  useEffect(() => {
    const wrapper = document.getElementById("wrapper");
    if (!wrapper) return;
    // Desktop: toggled = dock-only (collapsed sub-panel)
    // Mobile/tablet: toggled = sub-panel open (overlay over content)
    if (window.innerWidth >= 1024) {
      if (showSubPanel) {
        wrapper.classList.remove("toggled");
      } else {
        wrapper.classList.add("toggled");
      }
    } else {
      if (showSubPanel) {
        wrapper.classList.add("toggled");
      } else {
        wrapper.classList.remove("toggled");
      }
    }
  }, [showSubPanel]);

  useEffect(() => {
    if (window.innerWidth < 1024) {
      setShowSubPanel(open);
    }
  }, [open]);

  function ChangePasswordModal(props) {
    const {
      register,
      handleSubmit,
      formState: { errors },
    } = useForm({
      resolver: yupResolver(changePWDSchema),
    });

    const changePwdHandler = async (data) => {

      dispatch(handleLoader(true));
      const passwordData = {
        oldPassword: data.oldpwd,
        newPassword: data.password,
        confirmPassword: data.confirmPwd,
      };
      await ApiChangePassword(passwordData)
        .then((e) => {
          if (e?.isSuccess) {
            dispatch(handleLoader(false));
            Toast.success(e?.message);
            localStorage.clear();
            window.location.href = "/login";
          } else {
            dispatch(handleLoader(false));
            Toast.error(e?.message);
          }
        })
        .catch((e) => {
          dispatch(handleLoader(false));
          Toast.error(t("Something went wrong"));
        });
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
                {t("Cancel")}
              </button>
              <button className="premium-btn premium-btn-primary" type="submit">
                {t("Reset Password")} <i className="fa-solid fa-arrow-right-long ml-2"></i>
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    );
  }

  useEffect(() => {
    const alwaysAllow = [/*"User Guide",*/ "Profile", "Product Performance", "Warehouse Inventory", "Warehouse Details", "MFN to FBA"];
    if (role === ROLES.SUPER_ADMIN) alwaysAllow.push("Dashboard");

    const hasUsedTrialFromStorage = localStorage.getItem("hasUsedTrial") === "true";
    if (role !== ROLES.SUPER_ADMIN && (hasUsedTrialFromStorage || !isPlanActive)) {
      setNavRoutes([]);
    } else if (localStorage.getItem("connection") == "false") {
      const allowedFiltered = nav.filter((x) =>
        alwaysAllow.includes(x.name) || (x.children && x.children.some(c => alwaysAllow.includes(c.name)))
      ).map((item) => {
        let newItem = { ...item };
        if (newItem.children) {
          newItem.children = newItem.children.filter(child => alwaysAllow.includes(child.name));
        }
        return newItem;
      }).filter(item => !(item.children && item.children.length === 0));
      setNavRoutes(allowedFiltered);
    } else {
      const pages = pagePermission?.map((el) => el.pageName) || [];
      // pages.push("User Guide");
      pages.push("Profile");
      pages.push("Warehouse Inventory");
      pages.push("Warehouse Details");
      pages.push("Product Performance");
      pages.push("MFN to FBA");
      if (role === ROLES.SUPER_ADMIN) pages.push("Dashboard");
      setPermissionPages(pages);

      const filtered = nav.filter((x) => {
        if (role === ROLES.SUPER_ADMIN) return true;
        if (pages.includes(x.name)) return true;
        if (x.children && x.children.some(child => pages.includes(child.name))) return true;
        return false;
      }).map((item) => {
        let newItem = { ...item };
        if (newItem.name === "Dashboard" && role === ROLES.SUPER_ADMIN) {
          newItem.path = "/admin-dashboard";
        }
        if (newItem.children && role !== ROLES.SUPER_ADMIN) {
          newItem.children = newItem.children.filter(child => pages.includes(child.name));
        }
        return newItem;
      }).filter(item => !(item.children && item.children.length === 0));
      setNavRoutes(filtered);
    }
  }, [localStorage.getItem("connection"), pagePermission, isPlanActive]);

  const handleMenuClick = (menuName, hasChildren) => {
    if (hasChildren) {
      setCollapsedMenus((prev) => ({
        ...prev,
        [menuName]: !prev[menuName],
      }));
    }

    if (window.innerWidth < 1024 && !hasChildren) {
      setOpen(false);
      setShowSubPanel(false);
    }
  };

  const handleConnectGoogle = async () => {
    await ApiConnectGoogle()
      .then((res) => {
        if (res?.success && res?.url) window.open(res?.url, "_blank")
        else Toast.error(res?.message)
      })
      .catch(err => Toast.error(t("Something went wrong!!")))
  }

  const handleDisconnectGoogle = async () => {
    await ApiDisconnectGoogle()
      .then((res) => {
        if (res?.success) {
          localStorage.setItem("isGoogleConnected", false);
          setIsGoogleConnected(false);
          navigate(0);
        }
        else Toast.error(res?.message)
      })
      .catch(err => Toast.error(t("Something went wrong!!")))
  }

  /* ── Auto-detect active category + open parent menu on route change ── */
  useEffect(() => {
    if (location.pathname === "/ai-assistant") {
      setShowSubPanel(false);
      setActiveCategory(null);
      return;
    }
    if (!navRoutes?.length) return;
    const path = location.pathname;

    // Find which top-level nav item (or its child) matches current path
    let matchedName = null;
    let parentName = null;

    for (const route of navRoutes) {
      if (route.path === path) {
        matchedName = route.name;
        break;
      }
      if (route.children) {
        const child = route.children.find(c => c.path === path);
        if (child) {
          matchedName = child.name;
          parentName = route.name;
          break;
        }
      }
    }

    // Ensure parent group is open (not collapsed) on active route change
    if (parentName) {
      setCollapsedMenus((prev) => ({
        ...prev,
        [parentName]: false,
      }));
    }

    // Sync active category
    if (matchedName) {
      for (const [catKey, catVal] of Object.entries(CATEGORIES)) {
        if (catVal.items.includes(matchedName) || catVal.items.includes(parentName)) {
          setActiveCategory(catKey);
          break;
        }
      }
    }
  }, [location.pathname, navRoutes]);

  const activeCatConfig = CATEGORIES[activeCategory];
  const activeRoutes = navRoutes?.filter((route) => {
    if (activeCatConfig?.items.includes(route.name)) return true;
    if (route.children && route.children.some(child => activeCatConfig?.items.includes(child.name))) return true;
    return false;
  }) || [];

  const getFilteredRoutes = () => {
    if (!searchQuery) return activeRoutes;
    const query = searchQuery.toLowerCase();
    return activeRoutes.map(route => {
      if (route.name.toLowerCase().includes(query)) return route;
      if (route.children) {
        const matchingChildren = route.children.filter(child =>
          child.name.toLowerCase().includes(query)
        );
        if (matchingChildren.length > 0) {
          return { ...route, children: matchingChildren };
        }
      }
      return null;
    }).filter(Boolean);
  };

  const filteredRoutes = getFilteredRoutes();

  return (
    <>
      {window.innerWidth < 1024 && open && (
        <div
          className="sidebar-mobile-backdrop"
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
      <aside
        id="sidebar-wrapper"
        className={`sidebar_container ${showSubPanel ? "expanded" : "collapsed"} ${open ? "mobile-open" : "mobile-closed"}`}
        style={{ zIndex: 1050 }}
      >
        {/* ── Left Dock (always 70px) ── */}
        <div className="sidebar-left-dock">
          {/* Top: logo + category icons */}
          <div className="flex flex-col items-center gap-3 w-full px-2">
            {/* Brand mark / collapse toggle */}
            <div
              className="sidebar-dock-logo"
              onClick={() => {
                if (window.innerWidth < 1024) {
                  setOpen(!showSubPanel);
                  setShowSubPanel(!showSubPanel);
                } else {
                  setShowSubPanel(!showSubPanel);
                }
              }}
              title={showSubPanel ? t("Collapse menu") : t("Expand menu")}
            >
              <img src={logo} className="header_logo dock_logo_img" alt="Logo Mark" />
            </div>

            {/* Category buttons */}
            {Object.entries(CATEGORIES).map(([key, value]) => {
              const hasAccess = navRoutes ? navRoutes.some((route) => {
                if (value.items.includes(route.name)) return true;
                if (route.children && route.children.some(child => value.items.includes(child.name))) return true;
                return false;
              }) : true;

              if (!hasAccess && navRoutes?.length > 0) return null;

              return (
                <AppTooltip key={key} text={t(value.name)} placement="right">
                  <button
                    id={key}
                    className={`sidebar-category-btn${activeCategory === key ? " active" : ""}`}
                    onClick={() => {
                      const hasUsedTrialCheck = localStorage.getItem("hasUsedTrial") === "true";
                      if (role !== ROLES.SUPER_ADMIN && (hasUsedTrialCheck || !isPlanActive)) return;
                      setActiveCategory(key);
                      setShowSubPanel(true);
                      if (window.innerWidth < 1024) setOpen(true);
                    }}
                  >
                    {value.icon}
                  </button>
                </AppTooltip>
              );
            })}
          
            {/* AI Assistant Dedicated Dock Button (governed by plan permissions) */}
            {Boolean(
              role !== ROLES.SUPER_ADMIN &&
              pagePermission?.some(
                (p) =>
                  (p.pageName === "AI Assistant" || p.pageSlug === "ai-assistant" || p.pageName?.toLowerCase() === "ai assistant") &&
                  (!p.allocatedActions?.length || p.allocatedActions.some((a) => a.actionType === PAGE_ACTIONS.VIEW_ONLY && a.status === true))
              )
            ) && (
              <AppTooltip text={t("AI Assistant")} placement="right">
                <button
                  id="sidebar-ai-assistant-btn"
                  className={`sidebar-category-btn${location.pathname === "/ai-assistant" ? " active" : ""}`}
                  style={location.pathname === "/ai-assistant" ? {
                    backgroundColor: "#2563eb",
                    color: "#ffffff",
                    boxShadow: "0 4px 14px rgba(37, 99, 235, 0.45)",
                  } : undefined}
                  onClick={() => {
                    const hasUsedTrialCheck = localStorage.getItem("hasUsedTrial") === "true";
                    if (role !== ROLES.SUPER_ADMIN && (hasUsedTrialCheck || !isPlanActive)) return;
                    setShowSubPanel(false);
                    setActiveCategory(null);
                    if (window.innerWidth < 1024) setOpen(false);
                    navigate("/ai-assistant");
                  }}
                >
                  <ChatCenteredText size={22} weight={location.pathname === "/ai-assistant" ? "fill" : "regular"} />
                </button>
              </AppTooltip>
            )}
          </div>

          {/* Bottom: settings, logout, notifications, chatbot, profile */}
          <div className="flex flex-col items-center gap-2 w-full px-2 pt-3 border-t">
            {(role === ROLES.SUPER_ADMIN || PermissionCheck(SYSTEM_PAGES.SETTINGS, PAGE_ACTIONS.VIEW_ONLY)) && (
              <AppTooltip text={t("Settings")} placement="right">
                <div id="nav-settings">
                  <button
                    className={`sidebar-dock-btn ${location.pathname === "/settings" ? "active" : ""}`}
                    style={{ color: location.pathname === "/settings" ? "var(--accent-primary)" : undefined }}
                    onClick={() => {
                      const hasUsedTrialCheck = localStorage.getItem("hasUsedTrial") === "true";
                      if (role !== ROLES.SUPER_ADMIN && (hasUsedTrialCheck || !isPlanActive)) return;
                      navigate("/settings");
                    }}
                  >
                    <Gear size={20} weight={location.pathname === "/settings" ? "fill" : "regular"} />
                  </button>
                </div>
              </AppTooltip>
            )}

            <AppTooltip text={t("Logout")} placement="right">
              <button id="sidebar-dock-logout" className="sidebar-dock-btn text-danger" onClick={logoutHandler}>
                <SignOut size={20} weight="regular" />
              </button>
            </AppTooltip>

            {/* Profile dropdown */}
            <div id={"sidebar-dock-profile"} className="sidebar-dock-profile">
              <DropdownMenu
                open={profileDropdownOpen || isProfileTourActive}
                onOpenChange={setProfileDropdownOpen}
                modal={!isProfileTourActive}
              >
                <DropdownMenuTrigger asChild>
                  <button className="bg-transparent border-0 p-0 text-slate-500 hover:text-[#2374F2] dark:text-slate-300 dark:hover:text-[#3CBBF2] transition-colors focus:outline-none" id="dropdown-basic">
                    <UserCircle size={26} weight="regular" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" side="right" sideOffset={15} className={`w-64 md:w-72 shadow-2xl rounded-2xl border border-gray-200 dark:border-gray-800 p-0 overflow-hidden bg-white dark:bg-slate-900 ${isProfileTourActive ? "z-[9999]" : "z-[1000000]"}`}>
                  {/* Top Fixed Bar showing User Name, Email, Organization & Role */}
                  <div className="p-3.5 bg-gradient-to-br from-blue-50/90 via-gray-50 to-slate-100/60 dark:from-slate-800 dark:via-slate-800/90 dark:to-slate-900 border-b border-gray-200/80 dark:border-slate-800 space-y-2.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1A9FD4] to-[#2374F2] text-white font-extrabold flex items-center justify-center text-sm shadow-sm shrink-0 border border-blue-500/20">
                        {loginUser?.profilePhoto ? (
                          <img src={`${process.env.REACT_APP_API_BASE || ""}/public/profilePhotos/${loginUser.profilePhoto}`} alt={t("Profile")} className="w-full h-full rounded-xl object-cover" />
                        ) : (
                          (loginUser?.fullName || loginUser?.name || localStorage.getItem("userName") || localStorage.getItem("sellerAdminLoginUser") || "U").charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-bold text-sm text-gray-900 dark:text-white truncate" title={loginUser?.fullName || loginUser?.name || localStorage.getItem("userName") || localStorage.getItem("sellerAdminLoginUser") || t("User")}>
                          {loginUser?.fullName || loginUser?.name || localStorage.getItem("userName") || localStorage.getItem("sellerAdminLoginUser") || t("User")}
                        </h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400 font-medium truncate" title={loginUser?.email || localStorage.getItem("userEmail") || localStorage.getItem("email") || ""}>
                          {loginUser?.email || localStorage.getItem("userEmail") || localStorage.getItem("email") || t("No Email")}
                        </p>
                      </div>
                    </div>

                    <div
                      id="org-switcher"
                      className={`bg-white/90 dark:bg-slate-900/90 rounded-xl p-2.5 border border-gray-200/70 dark:border-slate-700/70 flex items-center justify-between gap-2 shadow-2xs ${
                        role !== ROLES.SUPER_ADMIN && !localStorage.getItem("superAdminToken")
                          ? "group cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50/40 dark:hover:bg-blue-950/20 transition-all"
                          : ""
                      }`}
                      onClick={() => {
                        if (role !== ROLES.SUPER_ADMIN && !localStorage.getItem("superAdminToken")) {
                          window.location.href = "/select-organization?mode=switch";
                        }
                      }}
                      title={role !== ROLES.SUPER_ADMIN && !localStorage.getItem("superAdminToken") ? t("Switch Organization") : undefined}
                    >
                      <div className="min-w-0 flex items-center gap-2 flex-1">
                        <div className="w-6 h-6 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xs shrink-0 group-hover:bg-blue-100 dark:group-hover:bg-blue-900/80 transition-colors">
                          <i className="fa fa-building" />
                        </div>
                        <span className="font-semibold text-xs text-gray-800 dark:text-gray-200 truncate" title={localStorage.getItem("organizationName") || loginUser?.organization?.organizationName || loginUser?.companyName || t("Organization")}>
                          {localStorage.getItem("organizationName") || loginUser?.organization?.organizationName || loginUser?.companyName || t("Organization")}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800 shrink-0 uppercase tracking-wider">
                          {role || localStorage.getItem("role") || t("Member")}
                        </span>
                        {role !== ROLES.SUPER_ADMIN && !localStorage.getItem("superAdminToken") && (
                          <button
                            type="button"
                            className="w-6 h-6 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 group-hover:bg-blue-600 group-hover:text-white dark:group-hover:bg-blue-600 dark:group-hover:text-white flex items-center justify-center text-[11px] transition-all border border-slate-200/80 dark:border-slate-700 shrink-0"
                            title={t("Switch Organization")}
                            onClick={(e) => {
                              e.stopPropagation();
                              window.location.href = "/select-organization?mode=switch";
                            }}
                          >
                            <i className="fa fa-exchange-alt" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Menu Items */}
                  <div className="p-1.5 space-y-0.5 max-h-[320px] overflow-y-auto">
                    <DropdownMenuItem className="cursor-pointer py-2 px-3 rounded-md" onClick={() => navigate("/profile")}>
                      {t("View Profile")}
                    </DropdownMenuItem>
                    {role !== ROLES.SUPER_ADMIN && !localStorage.getItem("superAdminToken") && (
                      <DropdownMenuItem
                        className="cursor-pointer py-2 px-3 rounded-md flex items-center gap-2 text-slate-700 dark:text-slate-200"
                        onClick={() => window.location.href = "/select-organization?mode=switch"}
                      >
                        <i className="fa fa-exchange-alt text-xs text-blue-500" />
                        <span>{t("Switch Organization")}</span>
                      </DropdownMenuItem>
                    )}
                    {role === ROLES.ADMIN && (
                      <DropdownMenuItem className="cursor-pointer py-2 px-3 rounded-md" onClick={() => navigate("/purchase-plans")}>
                        {t("Purchase Plans")}
                      </DropdownMenuItem>
                    )}
                    {googleSheetLink && (
                      <DropdownMenuItem className="cursor-pointer py-2 px-3 rounded-md" id="sidebar-sheet-item" onClick={() => window.open(googleSheetLink, "_blank", "noopener,noreferrer")}>
                        {t("Top Performer Sheet")}
                      </DropdownMenuItem>
                    )}
                    {googleKeywordSheetLink && (
                      <DropdownMenuItem className="cursor-pointer py-2 px-3 rounded-md" id="sidebar-keyword-item" onClick={() => window.open(googleKeywordSheetLink, "_blank", "noopener,noreferrer")}>
                        {t("Keyword Analysis")}
                      </DropdownMenuItem>
                    )}
                    {role !== ROLES.SUPER_ADMIN && (
                      <>
                        {isPlanActive && (
                          !isGoogleConnected
                            ? <DropdownMenuItem className="cursor-pointer py-2 px-3 rounded-md" onClick={handleConnectGoogle}>{t("ConnectGoogleAccount")}</DropdownMenuItem>
                            : <DropdownMenuItem className="cursor-pointer py-2 px-3 rounded-md text-red-500" onClick={handleDisconnectGoogle}>{t("DisconnectGoogleAccount")}</DropdownMenuItem>
                        )}
                      </>
                    )}
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* ── Right Sub-Panel (slides in/out) ── */}
        {showSubPanel && (
          <div className="sidebar-right-panel py-3 px-2">
            {/* Brand Logo Header */}
            <div className="sidebar-right-logo-container flex items-center justify-between mb-3 mx-1">
              <img
                src={theme === "dark" ? fullLogoDark : fullLogo}
                className="header_logo"
                style={{
                  height: theme === "dark"
                    ? (window.innerWidth < 1024 ? "130px" : "140px")
                    : (window.innerWidth < 1024 ? "50px" : "54px"),
                  width: "auto",
                  maxWidth: "100%",
                  objectFit: "contain",
                  margin: theme === "dark" ? "-43px 0" : "0"
                }}
                alt="Advertise IQ"
              />
              {window.innerWidth < 1024 && (
                <button
                  type="button"
                  className="sidebar-mobile-close-btn"
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

            {/* Header: category title + collapse */}
            <div className="sidebar-right-header flex items-center justify-between mb-3 px-1">
              <span className="font-bold">{t(activeCatConfig.name)}</span>
              <div
                className="menu-toggle-arrow"
                onClick={() => {
                  setShowSubPanel(false);
                }}
                title={t("Collapse category")}
                style={{ cursor: "pointer", display: "flex", alignItems: "center" }}
              >
                <CaretRight size={14} />
              </div>
            </div>

            {/* Mobile header controls */}
            <div className="mobile-header-controls flex md:hidden items-center justify-between px-1 pb-2 mb-2" style={{ borderBottom: "1px solid var(--glass-border)" }}>
              <ConfigTypeDropdown compact={true} />
              <ConfigProfileDropdown ConfigList={profileList} compact={true} />
            </div>

            {/* Live search */}
            <div className="sidebar-search-container mb-2 px-1">
              <div className="relative">
                <MagnifyingGlass
                  size={14}
                  className="absolute top-1/2 -translate-y-1/2"
                  style={{ left: "9px" }}
                />
                <input
                  type="text"
                  placeholder={t("Search menus...")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="sidebar-search-input w-full"
                />
              </div>
            </div>

            {/* Nav list */}
            <div className="sidebar-right-scroll sidebar_overflow grow">
              <ul className="sidebar-nav">
                {filteredRoutes?.map((el, i) => {
                  const getTourId = (name) => {
                    if (!name) return "";
                    return `nav-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`;
                  };
                  return (
                    <li
                      id={el.children ? `${getTourId(el.name)}-parent` : getTourId(el.name)}
                      key={i}
                      className={`${isPathActive(el.path)
                        ? "active"
                        : el.children && el.children.some(c => isPathActive(c.path))
                          ? "active"
                          : ""
                        } ${el.children ? "has-submenu" : ""}`}
                    >
                      {el.children ? (
                        <a
                          className="sidebar_link"
                          onClick={() => handleMenuClick(el.name, true)}
                        >
                          <span className="sidebar_icon_wrapper">{el.icon}</span>
                          <span className="sidebar_link_text">{t(el.name)}</span>
                          <span className="sidebar_arrow">
                            {!collapsedMenus[el.name] ? <CaretDown size={12} /> : <CaretRight size={12} />}
                          </span>
                        </a>
                      ) : (
                        <Link
                          to={el.path}
                          className="sidebar_link"
                          onClick={() => {
                            setActivePath(el.path);
                            handleMenuClick(el.name, false);
                          }}
                        >
                          <span className="sidebar_icon_wrapper">{el.icon}</span>
                          <span className="sidebar_link_text">{t(el.name)}</span>
                          {el.name === "Recommendation" && totalNewRecommendations > 0 && (
                            <span className="badge rounded-full bg-red-500 ml-auto px-2 py-0.5 text-xs text-white">
                              {totalNewRecommendations > 99 ? "99+" : totalNewRecommendations}
                            </span>
                          )}
                        </Link>
                      )}

                      {el.children && (
                        <ul className={`submenu${!collapsedMenus[el.name] ? " show" : ""}`}>
                          {el.children.map((child, j) =>
                            role === ROLES.SUPER_ADMIN ||
                            pagePermission?.some((x) => x.pageName?.toLowerCase()?.includes(child.name?.toLowerCase()) || x.pageName === child.name || x.pageSlug === child.id) ||
                              child.name === "Product Performance" ||
                              child.name === "Warehouse Inventory" ||
                              child.name === "Warehouse Details" ||
                              child.name === "MFN to FBA" ||
                              child.name === "Profile Setting" ? (
                              <li
                                key={j}
                                id={getTourId(child.name)}
                                className={isPathActive(child.path) ? "active" : ""}
                              >
                                <Link
                                  to={child.path}
                                  className="sidebar_link submenu_link"
                                  onClick={() => {
                                    setActivePath(child.path);
                                    if (window.innerWidth < 1024) {
                                      setOpen(false);
                                      setShowSubPanel(false);
                                    }
                                  }}
                                >
                                  <span className="sidebar_icon_wrapper">{child.icon}</span>
                                  <span className="submenu_text">{t(child.name)}</span>
                                </Link>
                              </li>
                            ) : null
                          )}
                        </ul>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>
        )}
      </aside>

      <TrialStatusModal
        show={showPlanModal}
        remainingDays={popUpRemainingDays}
        onHide={() => setShowPlanModal(false)}
      />
    </>
  );
}

export default Sidebar;
