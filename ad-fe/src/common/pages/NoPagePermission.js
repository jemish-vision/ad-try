// NoSitePermission.jsx
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LockKeyhole as LockOutlinedIcon, LogIn as LoginOutlinedIcon, CheckCircle as CheckCircleOutlineIcon } from "lucide-react";

const NoSitePermission = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();

    const handleSwitchAccount = () => {
        localStorage.clear();
        sessionStorage.clear();
        navigate("/login");
    };

    return (
        <div style={{ minHeight: "100vh", background: "#f0f4f8", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", fontFamily: "Arial, sans-serif" }}>
            <div style={{ maxWidth: "460px", width: "100%", background: "#ffffff", borderRadius: "12px", overflow: "hidden", boxShadow: "0 2px 12px rgba(2,70,139,0.10)" }}>

                {/* Header */}
                <div style={{ background: "#1A9FD4", color: "#ffffff", padding: "20px 28px 16px" }}>
                    <div style={{ fontSize: "12px", letterSpacing: "1.5px", textTransform: "uppercase", opacity: 0.7, marginBottom: "6px" }}>
                        AdvertiseIQ
                    </div>
                    <div className="flex items-center" style={{ gap: "10px" }}>
                        <LockOutlinedIcon style={{ fontSize: "22px" }} />
                        <span style={{ fontSize: "20px", fontWeight: 700 }}>{t("No Permission Granted")}</span>
                    </div>
                </div>

                {/* Body */}
                <div style={{ padding: "36px 28px 28px", textAlign: "center" }}>

                    {/* Icon Circle */}
                    <div style={{ width: "84px", height: "84px", borderRadius: "50%", background: "#f0f5ff", border: "2px solid #1A9FD4", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }}>
                        <LockOutlinedIcon style={{ fontSize: "38px", color: "#1A9FD4" }} />
                    </div>

                    <h2 style={{ margin: "0 0 12px", fontSize: "20px", fontWeight: 700, color: "#1a2940" }}>
                        {t("Your account is awaiting access approval")}
                    </h2>

                    <p style={{ fontSize: "15px", color: "#6b7280", lineHeight: 1.7, margin: "0 0 24px" }}>
                        {t("Your account has been created, but your administrator hasn't granted site access yet. You'll receive an email as soon as access is enabled.")}
                    </p>

                    {/* Info Box */}
                    <div style={{ background: "#f0f5ff", borderLeft: "4px solid #1A9FD4", borderRadius: "0 8px 8px 0", padding: "16px 20px", textAlign: "left", marginBottom: "24px" }}>
                        <p style={{ margin: "0 0 8px", fontSize: "12px", color: "#6b7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                            {t("What to do next")}
                        </p>
                        {[
                            t("Your administrator will review and approve your access."),
                            t("You'll get an email notification once access is enabled."),
                            t("Open the email link to sign in and reach your dashboard."),
                        ].map((text, i) => (
                            <div className="flex items-start gap-2" key={i} style={{ marginBottom: i < 2 ? "8px" : 0 }}>
                                <CheckCircleOutlineIcon style={{ fontSize: "17px", color: "#1A9FD4", marginTop: "2px", flexShrink: 0 }} />
                                <span style={{ fontSize: "14px", color: "#1a2940", lineHeight: 1.6 }}>{text}</span>
                            </div>
                        ))}
                    </div>

                    {/* Switch Account Button */}
                    <button
                        onClick={handleSwitchAccount}
                        onMouseEnter={e => {
                            e.currentTarget.style.background = "#1A9FD4";
                            e.currentTarget.style.color = "#ffffff";
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.background = "#f0f5ff";
                            e.currentTarget.style.color = "#1A9FD4";
                        }}
                        onMouseDown={e => e.currentTarget.style.transform = "scale(0.98)"}
                        onMouseUp={e => e.currentTarget.style.transform = "scale(1)"}
                        style={{
                            width: "100%",
                            background: "#f0f5ff",
                            color: "#1A9FD4",
                            border: "1.5px solid #1A9FD4",
                            padding: "13px 24px",
                            borderRadius: "8px",
                            fontSize: "15px",
                            fontWeight: 600,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "8px",
                            transition: "background 0.2s, color 0.2s, transform 0.1s",
                        }}
                    >
                        <LoginOutlinedIcon style={{ fontSize: "20px" }} />
                        {t("Sign in with a different account")}
                    </button>

                </div>

                {/* Footer */}
                <div style={{ padding: "14px 28px 18px", borderTop: "1px solid #e5e7eb", textAlign: "center" }}>
                    <p style={{ margin: 0, fontSize: "12px", color: "#9ca3af" }}>
                        © {new Date().getFullYear()} <strong style={{ color: "#1A9FD4" }}>AdvertiseIQ</strong>
                    </p>
                </div>

            </div>
        </div>
    );
};

export default NoSitePermission;