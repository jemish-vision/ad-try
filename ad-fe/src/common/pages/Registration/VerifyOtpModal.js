import { useTranslation } from "react-i18next";
import { useState, useRef, useEffect } from "react";
import Toast from "../../helper/toast/Toast";
import { ApiVerifyOtp, ApiSendOtp } from "../../../api-wrapper/ApiUsers";
import { Dialog, DialogContent } from "../../../components/ui/dialog";

function VerifyOtpModal({ show, email, onSuccess }) {
  const { t } = useTranslation();
    const [otp, setOtp] = useState(["", "", "", "", "", ""]);
    const [loading, setLoading] = useState(false);
    const [resendTimer, setResendTimer] = useState(30);
    const inputsRef = useRef([]);

    /* ---------------- TIMER ---------------- */
    useEffect(() => {
        if (!show) return;

        setResendTimer(30);
        const interval = setInterval(() => {
            setResendTimer((prev) => {
                if (prev <= 1) {
                    clearInterval(interval);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(interval);
    }, [show]);

    /* ---------------- VERIFY OTP ---------------- */
    const handleVerify = async (customOtp) => {
        const otpValue = typeof customOtp === "string" ? customOtp : otp.join("");

        if (otpValue.length !== 6) {
            Toast.error(t("Please enter complete OTP"));
            return;
        }

        try {
            setLoading(true);
            const res = await ApiVerifyOtp({ email, otp: otpValue });

            if (res?.isSuccess) {
                Toast.success(t("OTP verified successfully"));
                onSuccess();
            } else {
                Toast.error(res?.message || "Invalid OTP");
            }
        } catch {
            Toast.error(t("OTP verification failed"));
        } finally {
            setLoading(false);
        }
    };

    const handlePaste = (e) => {
        e.preventDefault();
        const pasteData = e.clipboardData.getData("text").trim();

        if (!/^\d{6}$/.test(pasteData)) return;

        const pasteOtp = pasteData.split("");
        setOtp(pasteOtp);

        pasteOtp.forEach((_, index) => {
            if (inputsRef.current[index]) {
                inputsRef.current[index].value = pasteOtp[index];
            }
        });

        inputsRef.current[5]?.focus();

        if (!loading) {
            handleVerify(pasteData);
        }
    };

    /* ---------------- OTP INPUT ---------------- */
    const handleChange = (value, index) => {
        if (!/^\d?$/.test(value)) return;

        const newOtp = [...otp];
        newOtp[index] = value;
        setOtp(newOtp);

        if (value && index < 5) {
            inputsRef.current[index + 1].focus();
        }

        const otpString = newOtp.join("");
        if (otpString.length === 6 && !loading) {
            handleVerify(otpString);
        }
    };

    const handleKeyDown = (e, index) => {
        if (e.key === "Backspace" && !otp[index] && index > 0) {
            inputsRef.current[index - 1].focus();
        }
    };

    /* ---------------- RESEND OTP ---------------- */
    const handleResendOtp = async () => {
        try {
            const res = await ApiSendOtp({ email });

            if (res?.isSuccess) {
                Toast.success(t("OTP resent successfully"));
                setOtp(["", "", "", "", "", ""]);
                inputsRef.current[0]?.focus();
                setResendTimer(30);
            } else {
                Toast.error(res?.message || "Failed to resend OTP");
            }
        } catch {
            Toast.error(t("Unable to resend OTP"));
        }
    };

    return (
        <Dialog open={show}>
            <DialogContent className="max-w-[420px] p-8 rounded-[24px] bg-white text-slate-900 border border-slate-200/80 shadow-[0_20px_50px_rgba(0,0,0,0.08)] dark:bg-[#0c1222]/85 dark:text-white dark:border-white/10 dark:shadow-[0_36px_100px_rgba(0,0,0,0.62)] backdrop-blur-[34px] overflow-hidden flex flex-col items-center [&>button]:hidden">
                {/* Circuit top glow line indicator */}
                <div 
                    className="absolute top-0 left-0 right-0 h-[1.5px] pointer-events-none"
                    style={{
                        background: "linear-gradient(90deg, transparent 0%, #2374F2 25%, #3ECFA8 60%, #7c64ff 80%, transparent 100%)",
                        opacity: 0.8
                    }}
                />

                <div className="w-12 h-12 rounded-full bg-blue-500/5 border border-blue-500/10 dark:bg-blue-500/10 dark:border-blue-500/20 flex items-center justify-center mb-4">
                    <i className="fa-regular fa-envelope text-blue-400 text-[18px]"></i>
                </div>

                <h4 className="text-[20px] font-bold text-center text-slate-900 dark:text-white tracking-tight mb-1 font-sans">Verify your email</h4>
                <p className="text-[13px] font-normal text-center text-slate-500 dark:text-white/50 mb-2">
                    Enter the 6-digit code sent to
                </p>

                {email && (
                    <div className="text-center text-[13.5px] font-semibold text-sky-600 dark:text-sky-400 mb-6 bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-500/20 px-3 py-1.5 rounded-full">
                        {email}
                    </div>
                )}

                {/* OTP INPUT */}
                <div className="flex justify-center gap-2.5 mb-6 w-full" onPaste={handlePaste}>
                    {otp.map((digit, index) => (
                        <input
                            key={index}
                            type="text"
                            value={digit}
                            maxLength={1}
                            ref={(el) => (inputsRef.current[index] = el)}
                            onChange={(e) => handleChange(e.target.value, index)}
                            onKeyDown={(e) => handleKeyDown(e, index)}
                            className="w-[44px] h-[50px] text-center font-bold text-[18px] rounded-[11px] border border-slate-200 bg-slate-50 text-slate-950 dark:border-white/10 dark:bg-white/5 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#2374F2] focus:border-transparent transition-all"
                            style={{
                                fontFamily: "'Plus Jakarta Sans', sans-serif"
                            }}
                        />
                    ))}
                </div>

                <button
                    onClick={handleVerify}
                    disabled={loading}
                    className="auth-btn-primary w-full h-[44px] flex items-center justify-center"
                    type="button"
                >
                    {loading ? "Verifying..." : "Verify OTP"}
                </button>

                {/* RESEND OTP */}
                <div className="text-center text-[12.5px] mt-2">
                    {resendTimer > 0 ? (
                        <span className="text-slate-500 dark:text-white/50">
                            Resend OTP in <b className="text-slate-900 dark:text-white">{resendTimer}s</b>
                        </span>
                    ) : (
                        <div className="text-center text-slate-500 dark:text-white/50">
                            <span>Didn’t receive the code?</span>{" "}
                            <button 
                                type="button" 
                                className="text-[#2374F2] hover:text-[#3ECFA8] font-semibold transition-colors focus:outline-none ml-1" 
                                onClick={handleResendOtp}
                            >
                                Resend OTP
                            </button>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default VerifyOtpModal;
