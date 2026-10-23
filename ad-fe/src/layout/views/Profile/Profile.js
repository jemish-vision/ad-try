import React, { useState, useEffect, useContext, useRef } from "react";
import { useForm } from "react-hook-form";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Toast, useDispatch, handleLoader } from "../../../helper/links/Link";
import { ApiUpdateProfile, ApiChangePassword } from "../../../api-wrapper/auth/ApiAuth";
import { ApiGetOrganizationList, ApiUpdateOrganization } from "../../../api-wrapper/ApiOrganization";
import { ApiGenerate2FA, ApiVerifyAndEnable2FA, ApiDisable2FA } from "../../../api-wrapper/ApiUsers";
import { ProfileContext } from "../../../helper/usecontext/useContext";
import Cropper from 'react-easy-crop';
import getCroppedImg from '../../../utils/cropImage';
import { changePWDSchema } from "../../../utility/validator";
import { yupResolver } from "@hookform/resolvers/yup";
import { ROLES } from "../../../common/constants";
import Filter from "../../../helper/filter/Filter";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { AppTooltip } from "../../../components/ui/AppTooltip";
import { CustomModal } from "../../../helper/modal/CustomModal";
import TwoFALight from "../../../assets/images/2FA-light.svg";
import TwoFADark from "../../../assets/images/2FA-dark.svg";
import AnimateTOTP from "../../../assets/images/AnimateTOTP.svg";

const orgColors = [
  "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
  "bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400",
  "bg-green-50 text-green-600 dark:bg-green-500/10 dark:text-green-400",
  "bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400",
  "bg-pink-50 text-pink-600 dark:bg-pink-500/10 dark:text-pink-400",
  "bg-teal-50 text-teal-600 dark:bg-teal-500/10 dark:text-teal-400"
];

const format2FADate = (dateString) => {
  if (!dateString) return "N/A";
  const date = new Date(dateString);
  const formatted = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).format(date);
  return formatted.replace('am', 'AM').replace('pm', 'PM');
};

export default function Profile() {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const location = useLocation();
  const { loginUser, refreshSideBar, setRefreshSideBar } = useContext(ProfileContext);

  // Profile Edit State
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [isCropping, setIsCropping] = useState(false);
  const [tempImageUrl, setTempImageUrl] = useState(null);

  const {
    register: registerProfile,
    handleSubmit: handleProfileSubmit,
    formState: { errors: profileErrors },
    setValue: setProfileValue,
    watch: watchProfile
  } = useForm();

  // Password Change State
  const {
    register: registerPassword,
    handleSubmit: handlePasswordSubmit,
    formState: { errors: passwordErrors },
    reset: resetPassword,
    watch: watchPassword
  } = useForm({
    resolver: yupResolver(changePWDSchema)
  });

  const [organizations, setOrganizations] = useState([]);
  const [editingOrg, setEditingOrg] = useState(null);
  const [editOrgName, setEditOrgName] = useState("");
  const [isOrgModalOpen, setIsOrgModalOpen] = useState(false);
  const currentPasswordRef = useRef(null);
  const [showOldPwd, setShowOldPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [showConfPwd, setShowConfPwd] = useState(false);

  // 2FA State
  const [is2FAModalOpen, setIs2FAModalOpen] = useState(false);
  const [isDisable2FAModalOpen, setIsDisable2FAModalOpen] = useState(false);
  const [isManualKeyModalOpen, setIsManualKeyModalOpen] = useState(false);
  const [twoFactorStep, setTwoFactorStep] = useState(1);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState("");
  const [twoFactorSecret, setTwoFactorSecret] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState(["", "", "", "", "", ""]);
  const [is2FAEnabled, setIs2FAEnabled] = useState(false);
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

  const role = localStorage.getItem("role");
  const isSuperAdmin = role === ROLES.SUPER_ADMIN;

  // Change detection
  const profileFullName = watchProfile("fullName");
  const profilePhone = watchProfile("phoneNumber");

  const isProfileChanged =
    (profileFullName !== undefined && profileFullName !== (loginUser?.fullName || loginUser?.name || "")) ||
    (profilePhone !== undefined && profilePhone !== (loginUser?.phoneNumber || "")) ||
    selectedFile !== null ||
    removePhoto;

  const oldPwd = watchPassword("oldpwd");
  const newPwd = watchPassword("password");
  const confPwd = watchPassword("confirmPwd");
  const isPasswordChanged = Boolean(oldPwd || newPwd || confPwd);

  const getPasswordStrength = (pwd) => {
    if (!pwd) return { score: 0, label: "", color: "bg-gray-200" };
    let score = 0;
    if (pwd.length >= 8) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[a-z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[!@#$%^&*(),.?":{}|<>]/.test(pwd)) score++;
    
    if (score <= 2) return { score, label: t("Weak"), color: "bg-red-500", text: "text-red-500" };
    if (score <= 4) return { score, label: t("Medium"), color: "bg-amber-500", text: "text-amber-500" };
    return { score, label: t("Strong"), color: "bg-emerald-500", text: "text-emerald-500" };
  };
  
  const strength = getPasswordStrength(newPwd);

  const isOrgChanged = editOrgName !== editingOrg?.organizationName;

  useEffect(() => {
    if (loginUser) {
      setProfileValue("fullName", loginUser.fullName || loginUser.name || "");
      setProfileValue("phoneNumber", loginUser.phoneNumber || "");
      setPreviewUrl(loginUser.profilePhoto ? `${process.env.REACT_APP_API_BASE || ""}/public/profilePhotos/${loginUser.profilePhoto}` : null);
      setIs2FAEnabled(loginUser.twoFactorEnabled || false);
    }
    fetchOrganizations();
  }, [loginUser, setProfileValue]);

  useEffect(() => {
    if (location.state?.openPasswordModal) {
      setTimeout(() => {
        currentPasswordRef.current?.focus();
        document.getElementById("profile-security-section")?.scrollIntoView({ behavior: "smooth" });
      }, 100);
      window.history.replaceState({}, document.title);
    }
  }, [location]);

  const fetchOrganizations = async () => {
    try {
      const res = await ApiGetOrganizationList();
      if (res?.isSuccess) {
        setOrganizations(res.organizations || []);
        const ownerOrg = res.organizations?.find((org) => Boolean(org.isOwner));
        if (ownerOrg) {
          setEditingOrg(ownerOrg);
          setEditOrgName(ownerOrg.organizationName);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Profile Image Handlers
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setTempImageUrl(URL.createObjectURL(file));
      setIsCropping(true);
      setRemovePhoto(false);
      e.target.value = null;
    }
  };
  const onCropComplete = (croppedArea, croppedAreaPixels) => setCroppedAreaPixels(croppedAreaPixels);
  const handleCropSave = async () => {
    try {
      const croppedImage = await getCroppedImg(tempImageUrl, croppedAreaPixels);
      setPreviewUrl(URL.createObjectURL(croppedImage));
      setSelectedFile(croppedImage);
      setIsCropping(false);
      setTempImageUrl(null);
    } catch (e) {
      Toast.error(t("Failed to crop image"));
    }
  };
  const handleCropCancel = () => {
    setIsCropping(false);
    setTempImageUrl(null);
  };

  const onProfileSubmit = async (data) => {
    dispatch(handleLoader(true));
    try {
      const formData = new FormData();
      if (data.fullName) formData.append("fullName", data.fullName);
      if (data.phoneNumber) formData.append("phoneNumber", data.phoneNumber);
      if (selectedFile) formData.append("profilePhoto", selectedFile);
      if (removePhoto) formData.append("removeProfilePhoto", "true");

      const res = await ApiUpdateProfile(formData);
      if (res?.isSuccess) {
        Toast.success(res.message || t("Profile updated successfully"));
        if (setRefreshSideBar) setRefreshSideBar(!refreshSideBar);
      } else {
        Toast.error(res?.message || t("Failed to update profile"));
      }
    } catch (err) {
      Toast.error(t("Something went wrong"));
    } finally {
      dispatch(handleLoader(false));
    }
  };

  const onPasswordSubmit = async (data) => {
    dispatch(handleLoader(true));
    try {
      const res = await ApiChangePassword({
        oldPassword: data.oldpwd,
        newPassword: data.password,
        confirmPassword: data.confirmPwd
      });
      if (res?.isSuccess) {
        Toast.success(res.message || t("Password changed successfully"));
        resetPassword();
        localStorage.clear();
        window.location.href = "/login";
      } else {
        Toast.error(res?.message || t("Failed to change password"));
      }
    } catch (err) {
      Toast.error(t("Something went wrong"));
    } finally {
      dispatch(handleLoader(false));
    }
  };

  const handleOrgUpdate = async () => {
    if (!editOrgName || !editOrgName.trim()) {
      Toast.error(t("Organization name cannot be empty"));
      return;
    }
    dispatch(handleLoader(true));
    try {
      const res = await ApiUpdateOrganization({
        organizationId: editingOrg._id,
        organizationName: editOrgName.trim()
      });
      if (res?.isSuccess) {
        Toast.success(res.message || t("Organization updated successfully!"));
        setIsOrgModalOpen(false);
        fetchOrganizations();
      } else {
        Toast.error(res?.message || t("Could not update organization"));
      }
    } catch (err) {
      Toast.error(t("Error updating organization"));
    } finally {
      dispatch(handleLoader(false));
    }
  };

  const handleEnable2FAInit = async () => {
    dispatch(handleLoader(true));
    try {
      const res = await ApiGenerate2FA();
      if (res.isSuccess) {
        setQrCodeDataUrl(res.qrCodeUrl);
        setTwoFactorSecret(res.secret);
        setTwoFactorStep(1);
        setIs2FAModalOpen(true);
      } else {
        Toast.error(res.message);
      }
    } catch {
      Toast.error(t("Something went wrong"));
    } finally {
      dispatch(handleLoader(false));
    }
  };

  const handleVerify2FA = async (e) => {
    e.preventDefault();
    const otpValue = twoFactorCode.join("");
    if (otpValue.length !== 6) {
      Toast.error(t("Please enter the 6-digit code"));
      return;
    }
    dispatch(handleLoader(true));
    try {
      const res = await ApiVerifyAndEnable2FA({ secret: twoFactorSecret, code: otpValue });
      if (res.isSuccess) {
        Toast.success(t("2FA has been successfully enabled."));
        setIs2FAEnabled(true);
        setIs2FAModalOpen(false);
        setTwoFactorCode(["", "", "", "", "", ""]);
        if (setRefreshSideBar) setRefreshSideBar(!refreshSideBar);
      } else {
        Toast.error(res.message);
      }
    } catch {
      Toast.error(t("Something went wrong"));
    } finally {
      dispatch(handleLoader(false));
    }
  };

  const handleDisable2FA = async () => {
    setIsDisable2FAModalOpen(false);
    dispatch(handleLoader(true));
    try {
      const res = await ApiDisable2FA();
      if (res.isSuccess) {
        Toast.success(t("2FA has been disabled."));
        setIs2FAEnabled(false);
        if (setRefreshSideBar) setRefreshSideBar(!refreshSideBar);
      } else {
        Toast.error(res.message);
      }
    } catch {
      Toast.error(t("Something went wrong"));
    } finally {
      dispatch(handleLoader(false));
    }
  };

  return (
    <>
      <Filter name={"Profile"} dateShow={false} profileShow={true} />

      <Dialog open={isCropping} onOpenChange={(open) => !open && handleCropCancel()}>
        <DialogContent
          className="premium-modal sm:max-w-[500px] gap-0 p-0 overflow-hidden bg-white dark:bg-[#1e1e1e]"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader className="premium-modal-header border-0 px-6 py-4 relative !justify-start !text-left">
            <div className="flex items-center gap-3 w-full justify-start text-left">
              <div className="w-10 h-10 rounded-full bg-[#E0F4FD] dark:bg-[#1A9FD4]/20 text-primary flex items-center justify-center flex-shrink-0">
                <i className="fa fa-crop"></i>
              </div>
              <div className="text-left flex-1">
                <DialogTitle className="text-lg font-bold text-gray-900 dark:text-white !text-left">Crop Image</DialogTitle>
                <p className="text-sm text-gray-500 m-0 !text-left">Adjust your profile picture</p>
              </div>
            </div>
          </DialogHeader>
          <div className="relative w-full h-[300px] bg-gray-900 overflow-hidden">
            <Cropper
              image={tempImageUrl}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onCropComplete={onCropComplete}
              onZoomChange={setZoom}
            />
          </div>
          <div className="p-6 bg-white dark:bg-[#1e1e1e] space-y-4">
            <div className="flex items-center gap-4">
              <i className="fa fa-search-minus text-gray-500"></i>
              <input
                type="range"
                value={zoom}
                min={1}
                max={3}
                step={0.1}
                onChange={(e) => setZoom(e.target.value)}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
              />
              <i className="fa fa-search-plus text-gray-500"></i>
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button type="button" className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200" onClick={handleCropCancel}>
                Cancel
              </button>
              <button type="button" className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90" onClick={handleCropSave}>
                Save Crop
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isOrgModalOpen} onOpenChange={setIsOrgModalOpen}>
        <DialogContent className="premium-modal sm:max-w-[450px] gap-0 p-0 overflow-hidden bg-white dark:bg-[#1e1e1e]">
          <DialogHeader className="premium-modal-header border-b border-gray-100 dark:border-gray-800 px-6 py-4 relative !justify-start !text-left">
            <div className="flex items-center gap-3 w-full justify-start text-left">
              <div className="w-10 h-10 rounded-full bg-[#E0F4FD] dark:bg-[#1A9FD4]/20 text-primary flex items-center justify-center flex-shrink-0">
                <i className="fa fa-building"></i>
              </div>
              <div className="text-left flex-1">
                <DialogTitle className="text-lg font-bold text-gray-900 dark:text-white !text-left">{t("Rename Organization")}</DialogTitle>
              </div>
            </div>
          </DialogHeader>
          <div className="p-6 bg-white dark:bg-[#1e1e1e] space-y-4">
            <div className="form-group">
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">{t("Organization Name")}</label>
              <input
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#121212] focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all"
                type="text"
                value={editOrgName}
                onChange={(e) => setEditOrgName(e.target.value)}
                placeholder={t("Enter organization name")}
              />
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                onClick={() => setIsOrgModalOpen(false)}
              >
                {t("Cancel")}
              </button>
              <button
                type="button"
                className="px-6 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                onClick={handleOrgUpdate}
                disabled={!isOrgChanged}
              >
                {t("Rename")}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>



      <Dialog open={is2FAModalOpen} onOpenChange={setIs2FAModalOpen}>
        <DialogContent onInteractOutside={(e) => e.preventDefault()} className="premium-modal sm:max-w-[480px] gap-0 p-0 overflow-hidden bg-white dark:bg-[#1e1e1e]">
          {/* Header */}
          <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800 flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-[#F0F5FF] dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0">
              <i className="fa-solid fa-lock text-xl"></i>
            </div>
            <div className="flex-1 mt-0.5">
              <DialogTitle className="text-[17px] font-extrabold text-gray-900 dark:text-white leading-tight">{t("Setup Two-Factor Authentication")}</DialogTitle>
              <p className="text-[13px] text-gray-500 dark:text-gray-400 mt-1">{t("Add an extra layer of security to your account")}</p>
            </div>
          </div>

          {/* Progress Indicator */}
          <div className="py-4 flex justify-center items-center">
            <div className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white ${twoFactorStep >= 1 ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'}`}>
                {twoFactorStep > 1 ? <i className="fa-solid fa-check"></i> : "1"}
              </div>
              <span className={`text-[13px] font-bold ${twoFactorStep >= 1 ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500'}`}>{t("Scan QR Code")}</span>
            </div>
            <div className="w-10 h-px bg-gray-200 dark:bg-gray-700 mx-3"></div>
            <div className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${twoFactorStep >= 2 ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500'}`}>
                2
              </div>
              <span className={`text-[13px] font-bold ${twoFactorStep >= 2 ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`}>{t("Verify Code")}</span>
            </div>
          </div>

          <div className="p-6 pt-2 bg-white dark:bg-[#1e1e1e] flex flex-col items-center">
            {twoFactorStep === 1 ? (
              <div className="w-full flex flex-col items-center text-center animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="w-20 h-20 rounded-2xl bg-[#F0F5FF] dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-5">
                  <i className="fa-solid fa-qrcode text-[32px]"></i>
                </div>
                <h3 className="text-lg font-extrabold text-gray-900 dark:text-white mb-2">{t("Scan this QR code with your authenticator app")}</h3>
                <p className="text-[13px] text-gray-500 dark:text-gray-400 mb-6 px-4 leading-relaxed">
                  {t("Use apps like Google Authenticator, Authy, Microsoft Authenticator, or 1Password.")}
                </p>
                
                {qrCodeDataUrl && (
                  <div className="p-3 bg-white border border-gray-200 dark:border-gray-700 rounded-xl mb-6 shadow-sm inline-block">
                    <img src={qrCodeDataUrl} alt="2FA QR Code" className="w-[160px] h-[160px] object-contain" />
                  </div>
                )}
                
                <p className="text-[12px] text-gray-500 dark:text-gray-400 mb-8">
                  <i className="fa-solid fa-circle-info mr-1.5 opacity-70"></i>
                  {t("Can't scan the QR code?")} <span className="text-blue-600 dark:text-blue-400 font-bold cursor-pointer hover:underline" onClick={() => setIsManualKeyModalOpen(true)}>{t("Enter this secret key manually.")}</span>
                </p>

                <div className="grid grid-cols-2 gap-3 w-full">
                  <button
                    type="button"
                    className="px-4 py-2.5 text-[14px] font-bold text-gray-700 dark:text-gray-300 bg-white dark:bg-[#121212] border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex justify-center items-center gap-2 shadow-sm"
                    onClick={() => setIs2FAModalOpen(false)}
                  >
                    {t("Cancel")}
                  </button>
                  <button
                    type="button"
                    className="px-4 py-2.5 rounded-xl font-bold text-[14px] text-white bg-blue-600 hover:bg-blue-700 transition-colors flex justify-center items-center gap-2 shadow-sm"
                    onClick={() => setTwoFactorStep(2)}
                  >
                    {t("Next")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="w-full flex flex-col items-center text-center animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="w-20 h-20 rounded-2xl bg-[#E6F8F3] dark:bg-green-900/20 text-green-600 dark:text-green-500 flex items-center justify-center mb-5 relative">
                  <i className="fa-solid fa-shield-halved text-[32px]"></i>
                  <div className="absolute -bottom-2 -right-2 w-7 h-7 bg-green-500 rounded-full flex items-center justify-center text-white border-[3px] border-white dark:border-[#1e1e1e]">
                    <i className="fa-solid fa-check text-[10px]"></i>
                  </div>
                </div>
                <h3 className="text-lg font-extrabold text-gray-900 dark:text-white mb-2">{t("Enter the 6-digit code")}</h3>
                <p className="text-[13px] text-gray-500 dark:text-gray-400 mb-8 px-4 leading-relaxed">
                  {t("Enter the code generated by your authenticator app.")}
                </p>

                <form onSubmit={handleVerify2FA} className="w-full">
                  <div className="flex justify-center gap-2.5 sm:gap-3 mb-8 w-full" onPaste={handleOtpPaste}>
                    {twoFactorCode.map((digit, index) => (
                      <input
                        key={index}
                        type="text"
                        value={digit}
                        maxLength={1}
                        ref={(el) => (otpInputsRef.current[index] = el)}
                        onChange={(e) => handleOtpChange(e.target.value, index)}
                        onKeyDown={(e) => handleOtpKeyDown(e, index)}
                        className="w-[46px] h-[54px] sm:w-[50px] sm:h-[58px] text-center font-bold text-[20px] rounded-[12px] border border-blue-200 dark:border-blue-800/50 bg-white dark:bg-[#121212] text-blue-600 dark:text-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-sm"
                      />
                    ))}
                  </div>

                  <div className="w-full bg-[#F5F8FF] dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/30 rounded-xl p-4 flex gap-3 text-left mb-8 items-start">
                    <div className="text-blue-600 dark:text-blue-400 mt-0.5 bg-blue-100 dark:bg-blue-900/30 w-6 h-6 rounded-full flex items-center justify-center shrink-0">
                      <i className="fa-solid fa-shield-check text-[10px]"></i>
                    </div>
                    <div>
                      <p className="text-[13px] font-bold text-blue-900 dark:text-blue-300 mb-0.5">{t("Tip: Keep your device time accurate")}</p>
                      <p className="text-[12px] text-blue-700/80 dark:text-blue-400/80">{t("Make sure your device time is set to automatic.")}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 w-full mb-6">
                    <button
                      type="button"
                      className="px-4 py-2.5 text-[14px] font-bold text-gray-700 dark:text-gray-300 bg-white dark:bg-[#121212] border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex justify-center items-center gap-2 shadow-sm"
                      onClick={() => setTwoFactorStep(1)}
                    >
                      {t("Back")}
                    </button>
                    <button
                      type="submit"
                      disabled={!twoFactorCode || twoFactorCode.join("").length !== 6}
                      className="px-4 py-2.5 rounded-xl font-bold text-[14px] text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2 shadow-sm"
                    >
                      {t("Verify")}
                    </button>
                  </div>

                  <p className="text-[12px] text-gray-500 dark:text-gray-400 text-center">
                    {t("Having trouble?")} <span className="text-blue-600 dark:text-blue-400 font-bold cursor-pointer hover:underline" onClick={() => setTwoFactorStep(1)}>{t("Rescan the QR code")}</span>
                  </p>
                </form>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isManualKeyModalOpen} onOpenChange={setIsManualKeyModalOpen}>
        <DialogContent onInteractOutside={(e) => e.preventDefault()} className="premium-modal sm:max-w-[400px] gap-0 p-0 overflow-hidden bg-white dark:bg-[#1e1e1e]">
          {/* Header */}
          <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#F0F5FF] dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0">
                <i className="fa-solid fa-key text-[15px]"></i>
              </div>
              <DialogTitle className="text-[16px] font-extrabold text-gray-900 dark:text-white leading-tight">{t("Enter secret key manually")}</DialogTitle>
            </div>
          </div>

          <div className="p-6 bg-white dark:bg-[#1e1e1e] flex flex-col">
            <p className="text-[13px] text-gray-500 dark:text-gray-400 mb-5">
              {t("Enter this secret key in your authenticator app.")}
            </p>

            <div className="mb-6">
              <label className="block text-[13px] font-bold text-gray-900 dark:text-white mb-2">{t("Secret Key")}</label>
              <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-white dark:bg-[#121212]">
                <input 
                  type="text" 
                  value={twoFactorSecret} 
                  readOnly 
                  className="flex-1 px-4 py-2.5 text-[14px] font-bold tracking-wide text-gray-900 dark:text-white bg-transparent outline-none" 
                />
                <button 
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(twoFactorSecret);
                    Toast.success(t("Copied to clipboard!"));
                  }}
                  className="px-4 py-2.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 font-bold text-[13px] transition-colors border-l border-gray-200 dark:border-gray-700 flex items-center gap-1.5 h-full"
                >
                  <i className="fa-regular fa-copy"></i> {t("Copy")}
                </button>
              </div>
            </div>

            <div className="bg-[#F5F8FF] dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/30 rounded-xl p-5 mb-2">
              <div className="flex items-center gap-2 mb-3">
                <i className="fa-solid fa-circle-info text-blue-600 dark:text-blue-400"></i>
                <h4 className="text-[13px] font-bold text-blue-600 dark:text-blue-400">{t("How to add manually?")}</h4>
              </div>
              <ol className="text-[12.5px] text-gray-600 dark:text-gray-400 space-y-2 list-decimal list-outside ml-4 font-medium">
                <li className="pl-1">{t("Open your authenticator app")}</li>
                <li className="pl-1">{t('Choose "Enter a setup key" or "Manual setup"')}</li>
                <li className="pl-1">{t("Enter the secret key above")}</li>
                <li className="pl-1">{t("Use type: Time-based (TOTP)")}</li>
                <li className="pl-1">{t("Save and go back to verify")}</li>
              </ol>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="p-4 md:p-8 mx-auto space-y-8 animate-fade-in-up !pb-24">
        {/* Profile Info Section */}
        <div id="profile-info-section" className="bg-white dark:bg-[#1e1e1e] rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden relative group/profile transition-all duration-300 hover:shadow-md hover:border-blue-100/80 dark:hover:border-blue-900/30">
          <div className="p-5 md:p-6 pb-2 flex justify-between items-start relative z-10">
            <div>
              <h2 className="text-xl font-extrabold text-gray-900 dark:text-white">{t("Profile Information")}</h2>
              <p className="text-sm text-gray-500 mt-1 font-medium">{t("Update your personal details and profile picture.")}</p>
            </div>
          </div>
          <form onSubmit={handleProfileSubmit(onProfileSubmit)} className="p-5 md:p-6 pt-3">
            <div className="flex flex-col md:flex-row items-center gap-6 mb-8">
              <div className="relative shrink-0 ml-2">
                <div className="w-[110px] h-[110px] rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden flex items-center justify-center border-[4px] border-white dark:border-[#1e1e1e] group-hover/profile:border-primary/30 shadow-sm relative z-10 transition-all duration-300 group-hover/profile:scale-[1.02]">
                  {previewUrl ? (
                    <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" className="w-[70px] h-[70px] text-gray-300" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 12C14.21 12 16 10.21 16 8C16 5.79 14.21 4 12 4C9.79 4 8 5.79 8 8C8 10.21 9.79 12 12 12ZM12 14C9.33 14 4 15.34 4 18V20H20V18C20 15.34 14.67 14 12 14Z" fill="currentColor" />
                    </svg>
                  )}
                </div>
                {previewUrl && (
                  <button
                    type="button"
                    className="absolute bottom-1 right-1 w-7 h-7 bg-white dark:bg-gray-800 text-red-500 rounded-full flex items-center justify-center shadow-md border border-gray-100 dark:border-gray-700 hover:text-red-600 transition-colors z-10"
                    onClick={(e) => {
                      e.preventDefault();
                      setPreviewUrl(null);
                      setSelectedFile(null);
                      setRemovePhoto(true);
                    }}
                    title={t("Remove Photo")}
                  >
                    <i className="fa-solid fa-times text-[10px]"></i>
                  </button>
                )}
              </div>

              <div className="flex-1 w-full" id="profile-picture-upload">
                <label className="border-[1.5px] border-dashed border-gray-200 dark:border-gray-700 hover:border-primary bg-[#f8faff] dark:bg-[#121212]/50 rounded-2xl p-4 flex items-center gap-4 cursor-pointer transition-colors w-full group">
                  <div className="w-12 h-12 rounded-full bg-[#E0F4FD] flex items-center justify-center shrink-0">
                    <i className="fa-solid fa-cloud-arrow-up text-primary text-xl"></i>
                  </div>
                  <div>
                    <h4 className="text-[13px] font-bold text-gray-900 dark:text-gray-200">{t("Upload new picture")}</h4>
                    <p className="text-[11px] text-gray-500 mt-0.5 font-medium">{t("JPG, PNG, GIF, WEBP. Max size 2MB.")}</p>
                    <div className="mt-2 inline-block px-4 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 text-xs font-bold text-primary bg-white dark:bg-[#1e1e1e] shadow-sm hover:bg-gray-50 transition-colors">
                      {t("Choose File")}
                    </div>
                  </div>
                  <input type="file" className="hidden" accept="image/jpeg, image/png, image/jpg, image/webp" onChange={handleFileChange} />
                </label>
              </div>
            </div>

            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                <div className="form-group" id="profile-fullname-wrapper">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">{t("Full Name")}</label>
                  <input
                    id="profile-fullname-input"
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#121212] focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all"
                    type="text"
                    placeholder={t("Enter your full name")}
                    {...registerProfile("fullName", { required: "Full name is required" })}
                  />
                  {profileErrors.fullName && <p className="text-red-500 text-xs mt-1.5">{profileErrors.fullName.message}</p>}
                </div>

                <div className="form-group" id="profile-email-wrapper">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">{t("Email Address")}</label>
                  <input
                    id="profile-email-input"
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-gray-500 outline-none cursor-not-allowed"
                    type="email"
                    value={loginUser?.email || ""}
                    disabled
                  />
                </div>

                <div className="form-group" id="profile-phone-wrapper">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">{t("Phone Number")}</label>
                  <input
                    id="profile-phone-input"
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#121212] focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all"
                    type="text"
                    placeholder={t("Enter phone number")}
                    {...registerProfile("phoneNumber")}
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  id="profile-save-btn"
                  type="submit"
                  disabled={!isProfileChanged}
                  className="px-6 py-2.5 rounded-xl font-bold text-white bg-gradient-to-br from-[#1A9FD4] to-[#2374F2] hover:opacity-90 shadow-md shadow-blue-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 group"
                >
                  {t("Update and Save")} <i className="fa fa-arrow-right text-[11px] transition-transform group-hover:translate-x-1" />
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Security & Credentials Section */}
        <div id="profile-security-section" className="bg-white dark:bg-[#1e1e1e] rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden relative group/sec transition-all duration-300 hover:shadow-md hover:border-blue-100/80 dark:hover:border-blue-900/30">
          <div className="p-5 md:p-6 pb-2 border-b border-gray-100 dark:border-gray-800 relative z-10">
            <div className="flex items-center justify-start mb-4">
              <div className="w-8 h-8 rounded bg-[#E0F4FD] flex items-center justify-center text-primary mr-3 shrink-0">
                <i className="fa-solid fa-shield-halved text-sm"></i>
              </div>
              <div>
                <h2 className="text-xl font-extrabold text-gray-900 dark:text-white leading-tight">{t("Security & Credentials")}</h2>
                <p className="text-[13px] text-gray-500 font-medium">{t("Manage your passwords and account security settings.")}</p>
              </div>
            </div>
          </div>
          <div className="p-5 md:p-6 pt-4 relative z-10">
            <form onSubmit={handlePasswordSubmit(onPasswordSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Left Side: Password Form (spans 2 columns) */}
                <div className="lg:col-span-2 space-y-4">
                  {/* Current Password Field */}
                  <div className="form-group max-w-md">
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-1.5">{t("Current Password")}</label>
                    <div className="relative">
                      <i className="fa-solid fa-lock absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 text-xs"></i>
                      <input
                        className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#121212] focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm font-medium"
                        type={showOldPwd ? "text" : "password"}
                        placeholder={t("Enter current password")}
                        {...registerPassword("oldpwd")}
                        ref={(e) => {
                          registerPassword("oldpwd").ref(e);
                          currentPasswordRef.current = e;
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowOldPwd(!showOldPwd)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors bg-transparent border-0 outline-none p-0 flex items-center justify-center w-5 h-5 shadow-none"
                      >
                        <i className={showOldPwd ? "fa-solid fa-eye-slash text-xs" : "fa-solid fa-eye text-xs"}></i>
                      </button>
                    </div>
                    {passwordErrors.oldpwd && <p className="text-red-500 text-xs mt-1.5">{passwordErrors.oldpwd.message}</p>}
                  </div>

                  {/* New Password & Confirm Password side-by-side */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="form-group">
                      <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-1.5">{t("New Password")}</label>
                      <div className="relative">
                        <i className="fa-solid fa-lock absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 text-xs"></i>
                        <input
                          className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#121212] focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm font-medium"
                          type={showNewPwd ? "text" : "password"}
                          placeholder={t("Enter new password")}
                          {...registerPassword("password")}
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPwd(!showNewPwd)}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors bg-transparent border-0 outline-none p-0 flex items-center justify-center w-5 h-5 shadow-none"
                        >
                          <i className={showNewPwd ? "fa-solid fa-eye-slash text-xs" : "fa-solid fa-eye text-xs"}></i>
                        </button>
                      </div>
                      {passwordErrors.password && <p className="text-red-500 text-xs mt-1.5">{passwordErrors.password.message}</p>}
                    </div>

                    <div className="form-group">
                      <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-1.5">{t("Confirm Password")}</label>
                      <div className="relative">
                        <i className="fa-solid fa-lock absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 text-xs"></i>
                        <input
                          className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#121212] focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm font-medium"
                          type={showConfPwd ? "text" : "password"}
                          placeholder={t("Confirm new password")}
                          {...registerPassword("confirmPwd")}
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfPwd(!showConfPwd)}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors bg-transparent border-0 outline-none p-0 flex items-center justify-center w-5 h-5 shadow-none"
                        >
                          <i className={showConfPwd ? "fa-solid fa-eye-slash text-xs" : "fa-solid fa-eye text-xs"}></i>
                        </button>
                      </div>
                      {passwordErrors.confirmPwd && <p className="text-red-500 text-xs mt-1.5">{passwordErrors.confirmPwd.message}</p>}
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      id="profile-password-btn"
                      type="submit"
                      disabled={!isPasswordChanged}
                      className="px-6 py-2.5 rounded-xl font-bold text-white bg-gradient-to-br from-[#1A9FD4] to-[#2374F2] hover:opacity-90 shadow-md shadow-blue-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 group"
                    >
                      {t("Update Password")} <i className="fa fa-arrow-right text-[11px] transition-transform group-hover:translate-x-1" />
                    </button>
                  </div>
                </div>

                {/* Right Side: Security Rules Helper Card (1 column) */}
                <div className="bg-[#f8faff] dark:bg-[#121212]/50 border border-blue-100/50 dark:border-gray-800 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center gap-2.5 text-primary border-b border-gray-100 dark:border-gray-800/80 pb-3">
                    <i className="fa-solid fa-shield-halved text-sm"></i>
                    <h4 className="font-bold text-xs uppercase tracking-wider text-gray-800 dark:text-gray-200">{t("Security Guidance")}</h4>
                  </div>

                  {/* Password Strength Indicator */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-[10px] font-bold">
                      <span className="text-gray-500 uppercase tracking-wider">{t("Strength")}</span>
                      <span className={newPwd ? strength.text : "text-gray-400"}>{newPwd ? t(strength.label) : t("Empty")}</span>
                    </div>
                    <div className="h-1.5 w-full bg-gray-200/60 dark:bg-gray-800 rounded-full overflow-hidden flex gap-1">
                      <div className={`h-full rounded-full transition-all duration-300 flex-1 ${newPwd && strength.score >= 1 ? strength.color : "bg-gray-200 dark:bg-gray-700"}`}></div>
                      <div className={`h-full rounded-full transition-all duration-300 flex-1 ${newPwd && strength.score >= 3 ? strength.color : "bg-gray-200 dark:bg-gray-700"}`}></div>
                      <div className={`h-full rounded-full transition-all duration-300 flex-1 ${newPwd && strength.score >= 5 ? strength.color : "bg-gray-200 dark:bg-gray-700"}`}></div>
                    </div>
                  </div>

                  {/* Requirements Checklist Vertical */}
                  <div className="space-y-2.5 pt-1.5">
                    <h5 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t("Requirements")}</h5>
                    <div className="space-y-2 text-xs">
                      <div className="flex items-center gap-2.5 font-semibold">
                        <i className={`fa-solid ${newPwd && newPwd.length >= 8 ? "fa-circle-check text-emerald-500" : "fa-circle text-gray-300 dark:text-gray-700"}`}></i>
                        <span className={newPwd && newPwd.length >= 8 ? "text-emerald-600 dark:text-emerald-400" : "text-gray-500"}>{t("At least 8 characters")}</span>
                      </div>
                      <div className="flex items-center gap-2.5 font-semibold">
                        <i className={`fa-solid ${newPwd && /[A-Z]/.test(newPwd) ? "fa-circle-check text-emerald-500" : "fa-circle text-gray-300 dark:text-gray-700"}`}></i>
                        <span className={newPwd && /[A-Z]/.test(newPwd) ? "text-emerald-600 dark:text-emerald-400" : "text-gray-500"}>{t("One uppercase letter")}</span>
                      </div>
                      <div className="flex items-center gap-2.5 font-semibold">
                        <i className={`fa-solid ${newPwd && /[0-9]/.test(newPwd) ? "fa-circle-check text-emerald-500" : "fa-circle text-gray-300 dark:text-gray-700"}`}></i>
                        <span className={newPwd && /[0-9]/.test(newPwd) ? "text-emerald-600 dark:text-emerald-400" : "text-gray-500"}>{t("One number")}</span>
                      </div>
                      <div className="flex items-center gap-2.5 font-semibold">
                        <i className={`fa-solid ${newPwd && /[!@#$%^&*(),.?":{}|<>]/.test(newPwd) ? "fa-circle-check text-emerald-500" : "fa-circle text-gray-300 dark:text-gray-700"}`}></i>
                        <span className={newPwd && /[!@#$%^&*(),.?":{}|<>]/.test(newPwd) ? "text-emerald-600 dark:text-emerald-400" : "text-gray-500"}>{t("One special character")}</span>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </form>
          </div>
        </div>

        {/* Two-Factor Authentication Section */}
        <div id="profile-2fa-section" className="bg-white dark:bg-[#1e1e1e] rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden relative group/twofa transition-all duration-300 hover:shadow-md hover:border-blue-100/80 dark:hover:border-blue-900/30">
          <div className="p-5 md:p-6 pb-2 !pb-0 border-b border-gray-100 dark:border-gray-800 relative z-10">
            <div className="flex items-center justify-start mb-4">
              <div className="w-8 h-8 rounded bg-[#E0F4FD] flex items-center justify-center text-primary mr-3 shrink-0">
                <i className="fa-solid fa-shield-halved text-sm"></i>
              </div>
              <div>
                <h2 className="text-xl font-extrabold text-gray-900 dark:text-white leading-tight">{t("Two-Factor Authentication (2FA)")}</h2>
                <p className="text-[13px] text-gray-500 font-medium">{t("Add an extra layer of security to your account.")}</p>
              </div>
            </div>
          </div>
          <div className="p-5 md:p-6 pt-6 bg-gray-50/50 dark:bg-transparent">
            {is2FAEnabled ? (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-[#f0fdf4] dark:bg-green-900/10 border border-green-200 dark:border-green-800/30 rounded-xl p-4 gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white shrink-0 shadow-sm shadow-green-500/30">
                      <i className="fa-solid fa-check"></i>
                    </div>
                    <div>
                      <h3 className="font-bold text-green-800 dark:text-green-400">{t("2FA is Enabled")}</h3>
                      <p className="text-sm text-green-700 dark:text-green-500 mt-0.5">{t("Your account is secured with two-factor authentication.")}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={handleEnable2FAInit}
                      className="flex-1 sm:flex-none px-4 py-2 border border-blue-200 text-blue-600 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-900/20 rounded-lg text-sm font-bold transition-colors text-center shadow-sm"
                    >
                      {t("Reset 2FA")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsDisable2FAModalOpen(true)}
                      className="flex-1 sm:flex-none px-4 py-2 border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20 rounded-lg text-sm font-bold transition-colors text-center shadow-sm"
                    >
                      {t("Disable 2FA")}
                    </button>
                  </div>
                </div>

                <div className="bg-white dark:bg-[#121212] border border-gray-200 dark:border-gray-800 rounded-xl p-6 flex flex-col md:flex-row items-center gap-6 shadow-sm">
                  <div className="w-16 h-20 shrink-0 relative flex items-center justify-center transition-transform duration-500 group-hover/twofa:scale-105 group-hover/twofa:-translate-y-1">
                    <img src={AnimateTOTP} alt="TOTP Authentication" className="w-full h-full object-contain scale-[1.5]" />
                  </div>
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-6 w-full text-center md:text-left divide-y md:divide-y-0 md:divide-x divide-gray-100 dark:divide-gray-800">
                    <div className="pt-4 md:pt-0">
                      <p className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5">{t("Authentication Method")}</p>
                      <div className="flex items-center justify-center md:justify-start gap-2">
                        <span className="font-bold text-gray-900 dark:text-white">{t("Authenticator App")}</span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">TOTP</span>
                      </div>
                    </div>
                    <div className="pt-4 md:pt-0 md:pl-6">
                      <p className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5">{t("Added On")}</p>
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-200">
                        {format2FADate(loginUser?.twoFactorAddedOn)}
                      </p>
                    </div>
                    <div className="pt-4 md:pt-0 md:pl-6">
                      <p className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5">{t("Last Used")}</p>
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-200">
                        {format2FADate(loginUser?.twoFactorLastUsed)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col md:flex-row items-center md:items-start gap-8 md:gap-4 lg:gap-10 w-full">
            <div className="w-full md:w-[40%] flex justify-center md:justify-center items-center relative md:pr-4 lg:pr-8">
              <div className="w-48 h-48 md:w-full md:max-w-[260px] md:h-auto aspect-square flex items-center justify-center relative transition-transform duration-500 group-hover/twofa:scale-[1.02] group-hover/twofa:-translate-y-0.5">
                <div className="absolute inset-0 bg-blue-500/5 dark:bg-blue-500/10 rounded-full animate-pulse blur-xl"></div>
                <img src={TwoFALight} alt="2FA Security" className="w-full h-full object-contain relative dark:hidden" />
                <img src={TwoFADark} alt="2FA Security" className="w-full h-full object-contain relative hidden dark:block" />
              </div>
            </div>
                <div className="w-full md:w-[60%] text-center md:text-left md:pt-4">
                  <h3 className="text-[22px] font-extrabold text-gray-900 dark:text-white mb-2 leading-tight">{t("No two-factor authentication added yet")}</h3>
                  <p className="text-[14px] font-medium text-gray-500 mb-8">{t("Secure your account by adding an extra layer of protection.")}</p>

                  <div className="space-y-5 mb-8 text-left">
                    <div className="flex items-start gap-4">
                      <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center text-blue-500 shrink-0">
                        <i className="fa-solid fa-shield-halved text-[13px]"></i>
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-0.5">{t("Stronger Security")}</h4>
                        <p className="text-[13px] text-gray-500">{t("Protect your account from unauthorized access.")}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-4">
                      <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center text-blue-500 shrink-0">
                        <i className="fa-solid fa-mobile-screen text-[13px]"></i>
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-0.5">{t("Authenticator App")}</h4>
                        <p className="text-[13px] text-gray-500">{t("Use apps like Google Authenticator, Authy, or Microsoft Authenticator.")}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-4">
                      <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center text-blue-500 shrink-0">
                        <i className="fa-solid fa-bolt text-[13px]"></i>
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-0.5">{t("Quick & Easy Setup")}</h4>
                        <p className="text-[13px] text-gray-500">{t("It only takes a few minutes to set up.")}</p>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleEnable2FAInit}
                    className="px-6 py-2.5 rounded-xl font-bold text-white bg-gradient-to-br from-[#1A9FD4] to-[#2374F2] hover:opacity-90 shadow-md shadow-blue-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 group"
                  >
                    {t("Enable 2FA")} <i className="fa-solid fa-arrow-right text-[11px] ml-2"></i>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Organizations Section */}
        {!isSuperAdmin && (
          <div id="profile-orgs-section" className="bg-white dark:bg-[#1e1e1e] rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden relative group/org transition-all duration-300 hover:shadow-md hover:border-blue-100/80 dark:hover:border-blue-900/30">
            <div className="p-5 md:p-6 pb-2 !pb-0 relative z-10">
              <div className="flex items-center justify-start mb-2">
                <div className="w-8 h-8 rounded bg-[#E0F4FD] flex items-center justify-center text-primary mr-3 shrink-0">
                  <i className="fa-solid fa-building text-sm"></i>
                </div>
                <div>
                  <h2 className="text-xl font-extrabold text-gray-900 dark:text-white leading-tight">{t("Organizations")}</h2>
                  <p className="text-[13px] text-gray-500 font-medium">{t("Manage the organizations you own or are a member of.")}</p>
                </div>
              </div>

              <div className="absolute top-0 right-0 opacity-40 pointer-events-none hidden sm:block transition-all duration-500 group-hover/org:scale-105 group-hover/org:-translate-y-1 group-hover/org:opacity-60">
                <svg width="200" height="80" viewBox="0 0 200 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M160 80L160 30L190 30L190 80H160Z" fill="#E2E8F0" />
                  <path d="M125 80V10H160V80H125Z" fill="#CBD5E1" />
                  <path d="M100 80V40H125V80H100Z" fill="#E2E8F0" />
                  <path d="M70 80V60H100V80H70Z" fill="#F1F5F9" />
                  <circle cx="135" cy="25" r="3" fill="white" />
                  <circle cx="150" cy="25" r="3" fill="white" />
                  <circle cx="135" cy="40" r="3" fill="white" />
                  <circle cx="150" cy="40" r="3" fill="white" />
                  <circle cx="110" cy="55" r="3" fill="white" />
                  <circle cx="170" cy="45" r="3" fill="white" />
                  <circle cx="180" cy="45" r="3" fill="white" />
                  <path d="M110 80C110 75 115 75 115 75C115 75 120 75 120 80" fill="#94A3B8" />
                  <path d="M90 70C90 68 85 65 80 68C75 70 70 75 75 80" fill="#86EFAC" />
                  <path d="M85 80C85 75 90 70 95 72C100 75 105 80 100 80" fill="#86EFAC" />
                </svg>
              </div>
            </div>

            <div className="p-5 md:p-6 space-y-6 pt-4">

              {editingOrg && (
                <div id="profile-own-orgs" className="bg-[#f8faff] dark:bg-[#121212]/50 rounded-xl p-4 border border-blue-100/50 dark:border-gray-800 flex items-center justify-between">
                  <div>
                    <h3 className="text-[11px] font-bold text-primary dark:text-primary uppercase tracking-widest mb-0.5">{t("Owner Organization")}</h3>
                    <p className="text-gray-900 dark:text-white font-extrabold text-[15px]">{editingOrg.organizationName}</p>
                  </div>
                  <button
                    onClick={() => {
                      setEditOrgName(editingOrg.organizationName);
                      setIsOrgModalOpen(true);
                    }}
                    className="px-4 py-1.5 dark:bg-[#1A9FD4]/20 border border-primary text-primary font-semibold rounded-lg shadow-sm hover:bg-[#d1effc] dark:hover:bg-[#1A9FD4]/30 transition-colors text-xs flex items-center gap-1.5"
                  >
                    <i className="fa-solid fa-pen text-[10px]"></i>
                    {t("Edit")}
                  </button>
                </div>
              )}

              <div id="profile-member-orgs">
                <h3 className="text-[13px] font-bold text-gray-800 dark:text-gray-200 mb-4">{t("Organizations You Belong To")}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {organizations.map((org, index) => {
                    const colorClass = orgColors[index % orgColors.length];
                    return (
                      <div key={org._id} className="flex items-center p-3.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-[#121212] w-full shadow-sm">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mr-3.5 ${colorClass}`}>
                          <i className="fa-solid fa-building text-[15px]"></i>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-gray-900 dark:text-gray-100 truncate text-[13px]">{org.organizationName}</p>
                          <p className="text-[11px] text-gray-500 mt-0.5 font-medium">{org.isOwner ? t("Owner") : t("Member")}</p>
                        </div>
                        {org.isOwner && (
                          <div className="ml-2 pl-2">
                            <i className="fa-solid fa-crown text-yellow-400 text-[13px]" title={t("Owner")}></i>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {organizations.length === 0 && (
                    <p className="text-gray-500 text-sm py-4">{t("You are not a member of any organizations yet.")}</p>
                  )}
                </div>
              </div>

            </div>
          </div>
        )}

        <CustomModal
          show={isDisable2FAModalOpen}
          onHide={() => setIsDisable2FAModalOpen(false)}
          title={t("Disable Two-Factor Authentication")}
          icon="danger"
          iconVariant="danger"
          message="Are you sure you want to disable Two-Factor Authentication? This will reduce the security of your account."
          actions={[
            { label: 'Cancel', cancel: true, onClick: () => setIsDisable2FAModalOpen(false) },
            { label: 'Disable 2FA', variant: 'danger', onClick: handleDisable2FA }
          ]}
        />
      </div>
    </>
  );
}
