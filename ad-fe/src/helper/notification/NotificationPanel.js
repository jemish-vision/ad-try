import { useTranslation } from "react-i18next";
import React, { useState, useRef, useEffect, useContext } from "react";
import { ApiNotification, ApiReadNotification, ApiReadAllNotification } from "../../api-wrapper/notification/ApiNotification";
import { ProfileContext } from "../usecontext/useContext";
import { handleLoader, Toast, useNavigate } from "../links/Link";
import { useDispatch } from "react-redux";
import moment from "moment";
import { t } from "i18next";
import { useTour } from "../../tour";

const NotificationPanel = () => {
  const { t } = useTranslation();
    const { profileId, selectedAdType } = useContext(ProfileContext);
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const { state: tourState } = useTour();
    const isNotificationTourActive = tourState?.run && tourState?.activeTourId === "notification-dropdown-panel";

    const [isOpen, setIsOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    const [isTablet, setIsTablet] = useState(window.innerWidth >= 768 && window.innerWidth < 1024);

    useEffect(() => {
        const handleResize = () => {
            setIsMobile(window.innerWidth < 768);
            setIsTablet(window.innerWidth >= 768 && window.innerWidth < 1024);
        };
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    const panelRef = useRef();
    const listRef = useRef();

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (isNotificationTourActive) return; // Prevent closing if tour is active
            if (panelRef.current && !panelRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [isNotificationTourActive]);

    const [notifications, setNotifications] = useState([]);
    const [activeTab, setActiveTab] = useState("unread");
    const [pageNo, setPageNo] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalUnseen, setTotalUnseen] = useState(0);
    const [loadingMore, setLoadingMore] = useState(false);
    const [readingAll, setReadingAll] = useState(false);

    // fetch notification list
    const NotificationList = async (page = 1, append = false) => {
        if (!profileId?.value || !selectedAdType) return;
        const data = { profileId: profileId.value, pageNo: page, perPage: 10 };

        if (page > 1) setLoadingMore(true);

        try {
            const res = await ApiNotification(data);
            if (res?.isSuccess) {
                setTotalUnseen(res.totalUnseen);
                setTotalPages(res.totalPages);
                setPageNo(res.currentPageNo);

                setNotifications((prev) => (append ? [...prev, ...res.data] : res.data));
            } else {
                Toast.error(res?.message || "Failed to fetch notifications");
            }
        } catch {
            Toast.error(t("Something went wrong"));
        } finally {
            setLoadingMore(false);
        }
    };

    // initial fetch
    useEffect(() => {
        NotificationList(1, false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [profileId?.value, selectedAdType]);

    // infinite scroll
    const handleScroll = (e) => {
        const { scrollTop, scrollHeight, clientHeight } = e.target;
        if (scrollTop + clientHeight >= scrollHeight - 10 && !loadingMore && pageNo < totalPages) {
            NotificationList(pageNo + 1, true);
        }
    };

    // mark single notification as read
    const handleReadNotification = async (e, id, isRead) => {
        if (!isRead) {
            try {
                const res = await ApiReadNotification({ notificationId: id });
                if (res?.isSuccess) {
                    setNotifications((prev) =>
                        prev.map((n) => (n._id === id ? { ...n, seen: true } : n))
                    );
                    setTotalUnseen((prev) => (prev > 0 ? prev - 1 : 0));
                } else {
                    Toast.error(res?.message || "Failed to mark as read");
                }
            } catch {
                Toast.error(t("Something went wrong"));
            } finally {
                dispatch(handleLoader(false));
            }
        }

        const target = e.target.closest("[data-link]");
        if (target) {
            e.preventDefault();
            const link = target.getAttribute("data-link");
            if (link) navigate(link);
        }
    };

    // mark all notifications as read
    const handleReadAll = async () => {
        if (!profileId?.value || !selectedAdType) return;
        setReadingAll(true);
        try {
            const res = await ApiReadAllNotification({ profileId: profileId.value });
            if (res?.isSuccess) {
                setNotifications((prev) => prev.map((n) => ({ ...n, seen: true })));
                setTotalUnseen(0);
                Toast.success(t("All notifications marked as read"));
            } else {
                Toast.error(res?.message || "Failed to mark all as read");
            }
        } catch {
            Toast.error(t("Something went wrong"));
        } finally {
            dispatch(handleLoader(false));
            setReadingAll(false);
        }
    };

    // helper to get modern icon configuration
    const getNotificationStyle = (title = "") => {
        const tLower = title.toLowerCase();
        if (tLower.includes("inventory") || tLower.includes("stock") || tLower.includes("exceeded")) {
            return {
                icon: "fa-solid fa-gauge-high",
                typeClass: "type-warning"
            };
        }
        if (tLower.includes("reimbursement") || tLower.includes("refund") || tLower.includes("claim") || tLower.includes("payment")) {
            return {
                icon: "fa-solid fa-file-invoice-dollar",
                typeClass: "type-success"
            };
        }
        if (tLower.includes("star") || tLower.includes("review")) {
            return {
                icon: "fa-solid fa-star",
                typeClass: "type-star"
            };
        }
        if (tLower.includes("scan") || tLower.includes("duplicate")) {
            return {
                icon: "fa-solid fa-network-wired",
                typeClass: "type-scan"
            };
        }
        return {
            icon: "fa-solid fa-circle-info",
            typeClass: "type-info"
        };
    };

    const filteredNotifications = activeTab === "unread"
        ? notifications.filter((n) => !n.seen)
        : notifications;

    return (
        <div className="relative inline-block" ref={panelRef}>
            <button
                className="notif-trigger-btn"
                onClick={() => setIsOpen(!isOpen)}
                aria-label="Open notifications"
            >
                <i className="fa-regular fa-bell" style={{ fontSize: "14px" }}></i>
                {totalUnseen > 0 && (
                    <span className="notif-count-badge">
                        {totalUnseen > 99 ? "99+" : totalUnseen}
                    </span>
                )}
            </button>

            {(isOpen || isNotificationTourActive) && (
                <div
                    id="notification-dropdown-panel" className={`${isMobile ? "fixed" : "absolute"} notification-dropdown-panel shadow rounded-3 mt-2`}
                    style={{
                        top: isMobile ? "65px" : "110%",
                        right: isMobile ? "10px" : "-10px",
                        left: isMobile ? "10px" : "auto",
                        width: isMobile ? "auto" : (isTablet ? "400px" : "450px"),
                        maxWidth: "450px",
                        maxHeight: "80vh",
                        zIndex: 20000,
                        animation: "ddFade 0.15s ease",
                    }}
                >
                    <div className="notification-header p-3 pb-2 font-semibold flex justify-between items-center">
                        <div className="flex items-center">
                            <span className="h5 m-0 font-bold">{t("Notifications")}</span>
                            <span className="preview-badge ml-2">{t("Preview")}</span>
                        </div>
                        <div className="flex items-center">
                            <button
                                disabled={readingAll || totalUnseen === 0}
                                onClick={handleReadAll}
                                className="notification-read-all-btn"
                            >
                                {readingAll ? t("Reading...") : t("Mark all as read")}
                            </button>
                        </div>
                    </div>

                    <div className="notification-tabs flex px-3 border-b">
                        <div
                            className={`notification-tab py-2 mr-4 cursor-pointer ${activeTab === "unread" ? "active" : ""}`}
                            onClick={() => setActiveTab("unread")}
                        >
                            {t("Unread")} ({totalUnseen})
                        </div>
                        <div
                            className={`notification-tab py-2 cursor-pointer ${activeTab === "all" ? "active" : ""}`}
                            onClick={() => setActiveTab("all")}
                        >
                            {t("All")}
                        </div>
                    </div>

                    <div
                        ref={listRef}
                        onScroll={handleScroll}
                        className="notification-scroll-container p-2"
                        style={{ overflowY: "auto", maxHeight: "50vh" }}
                    >
                        {filteredNotifications.length > 0 ? (
                            <>
                                {filteredNotifications.map((n) => {
                                    const config = getNotificationStyle(n.notificationTitle);
                                    return (
                                        <div
                                            key={n._id}
                                            onClick={(e) => handleReadNotification(e, n?._id, n?.seen)}
                                            className={`notification-item flex items-start p-3 rounded cursor-pointer ${!n?.seen ? `unseen ${config.typeClass}` : "seen"}`}
                                        >
                                            <div className={`notification-icon-wrapper ${config.typeClass} mr-3 flex items-center justify-center relative`}>
                                                <i className={`${config.icon} m-0`}></i>
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div className="notification-title font-bold text-truncate">
                                                    {n.notificationTitle}
                                                </div>
                                                <div
                                                    className="notification-text small"
                                                    dangerouslySetInnerHTML={{ __html: n?.notificationText }}
                                                ></div>

                                                <div className="notification-time">
                                                    {moment(n.createdAt).fromNow()} &bull; AdvertiseIQ Alert
                                                </div>
                                            </div>
                                            <div className="ml-auto pl-2 flex items-center justify-center" style={{ minWidth: "24px" }}>
                                                {Boolean(!n?.seen) && <span className="unseen-dot bg-danger rounded-circle" />}
                                            </div>
                                        </div>
                                    );
                                })}

                                {loadingMore && (
                                    <div className="text-center text-gray-500 small my-2">
                                        {t("Loading more...")}
                                    </div>
                                )}
                            </>
                        ) : (
                            <div
                                className="flex items-center justify-center text-gray-500"
                                style={{ height: "200px" }}
                            >
                                {t("No Notifications")}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default React.memo(NotificationPanel);
