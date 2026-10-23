import React, { useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import "./MaintenancePage.css";
import { useNavigate } from "react-router-dom";
import { ApiGetGlobalSettings } from "../../../api-wrapper/globalSettings/ApiGlobalSettings";

const POLL_INTERVAL = 30_000;

const MaintenancePage = () => {
    const { t } = useTranslation();
    const [lastChecked, setLastChecked] = useState(null);
    const intervalRef = useRef(null);
    const pollRef = useRef(null);
    const countdownRef = useRef(null);
    const navigate = useNavigate();

    useEffect(() => {
        intervalRef.current = setInterval(() => {

        }, 60);
        return () => clearInterval(intervalRef.current);
    }, []);

    // Poll server every 30s to check if maintenance ended
    const checkStatus = async () => {
        try {
            const res = await ApiGetGlobalSettings();
            const isMaintenance = res?.isSuccess && res?.data ? res.data.isMaintenanceMode : typeof res?.isMaintenanceMode === "boolean" ? res.isMaintenanceMode : true;

            setLastChecked(new Date());

            if (!isMaintenance) {
                clearInterval(pollRef.current);
                clearInterval(countdownRef.current);
                navigate("/", { replace: true });
            }
        } catch {
            setLastChecked(new Date());
        }
    };

    useEffect(() => {
        checkStatus();

        pollRef.current = setInterval(checkStatus, POLL_INTERVAL);


        return () => {
            clearInterval(pollRef.current);
            // eslint-disable-next-line react-hooks/exhaustive-deps
            clearInterval(countdownRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const steps = [
        { title: t("System backup complete"), desc: t("All data has been safely backed up before the update begins.") },
        { title: t("Applying updates"), desc: t("Performance improvements and security patches are being applied.") },
        { title: t("Verification & restore"), desc: t("Final checks and platform will be restored for all users.") },
    ];

    return (
        <div className="mp-wrapper">
            <div className="mp-card">

                <div className="mp-icon-ring">
                    <span className="mp-pulse" />
                    <span className="mp-pulse mp-pulse--2" />
                    <div className="mp-icon-bg">
                        <svg width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="#1A9FD4" strokeWidth="1.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.107-1.204l-.527-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    </div>
                </div>

                <div className="mp-badge">
                    <span className="mp-badge-dot" />
                    {t("Maintenance in progress")}
                </div>

                <h1 className="mp-h1">{t("We'll be back")} <span>{t("very soon")}</span></h1>
                <p className="mp-sub">
                    {t("Our platform is undergoing scheduled maintenance to improve performance and security. We appreciate your patience.")}
                </p>

                <div className="mp-divider" />

                <div className="mp-steps">
                    {steps.map((s, i) => (
                        <div className="mp-step" key={i}>
                            <div className="mp-step-num">{i + 1}</div>
                            <div>
                                <div className="mp-step-title">{s.title}</div>
                                <div className="mp-step-desc">{s.desc}</div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Status check footer */}
                <div className="mp-status-row pb-2">
                    <div className="mp-status-left">
                        {lastChecked ? (
                            <span className="mp-checked-time">
                                {t("Last checked at")} {lastChecked.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                            </span>
                        ) : (
                            <span className="mp-checked-time">{t("Checking status...")}</span>
                        )}
                    </div>
                </div>

                <div className="mp-links">
                    <a href="mailto:info@spiruswastha.com" className="mp-link">{t("Contact support")}</a>
                    <span className="mp-link-dot">·</span>
                    <a href="/" className="mp-link" onClick={(e) => { e.preventDefault(); checkStatus(); }}>
                        {t("Check status")}
                    </a>
                </div>

            </div>

            <p className="mp-footer">&copy; {new Date().getFullYear()} Ads IQ. {t("All rights reserved.")}</p>
        </div>
    );
}

export default MaintenancePage;