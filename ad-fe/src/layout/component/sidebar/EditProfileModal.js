import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../../../components/ui/dialog";
import { useForm } from "react-hook-form";
import { Toast, useDispatch, handleLoader } from "../../../helper/links/Link";
import { ApiUpdateProfile } from "../../../api-wrapper/auth/ApiAuth";
import Cropper from 'react-easy-crop';
import getCroppedImg from '../../../utils/cropImage';
export default function EditProfileModal({ show, onHide, loginUser, onSuccess }) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [isCropping, setIsCropping] = useState(false);
  const [tempImageUrl, setTempImageUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const { register, handleSubmit, formState: { errors }, reset, setValue } = useForm();

  useEffect(() => {
    if (show && loginUser) {
      setValue("fullName", loginUser.fullName || loginUser.name || "");
      setValue("phoneNumber", loginUser.phoneNumber || "");
      setSelectedFile(null);
      setRemovePhoto(false);
      setIsCropping(false);
      setTempImageUrl(null);
      setPreviewUrl(loginUser.profilePhoto ? `${process.env.REACT_APP_API_BASE || ""}/public/profilePhotos/${loginUser.profilePhoto}` : null);
    }
  }, [show, loginUser, setValue]);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setTempImageUrl(URL.createObjectURL(file));
      setIsCropping(true);
      setRemovePhoto(false);
      // Reset input value so the same file can be selected again if needed
      e.target.value = null;
    }
  };

  const onCropComplete = (croppedArea, croppedAreaPixels) => {
    setCroppedAreaPixels(croppedAreaPixels);
  };

  const handleCropSave = async () => {
    try {
      const croppedImage = await getCroppedImg(tempImageUrl, croppedAreaPixels);
      setPreviewUrl(URL.createObjectURL(croppedImage));
      setSelectedFile(croppedImage);
      setIsCropping(false);
      setTempImageUrl(null);
    } catch (e) {
      console.error(e);
      Toast.error(t("Failed to crop image"));
    }
  };

  const handleCropCancel = () => {
    setIsCropping(false);
    setTempImageUrl(null);
  };

  const submitHandler = async (data) => {
    setLoading(true);
    dispatch(handleLoader(true));
    try {
      const formData = new FormData();
      if (data.fullName) formData.append("fullName", data.fullName);
      if (data.phoneNumber) formData.append("phoneNumber", data.phoneNumber);
      if (selectedFile) formData.append("profilePhoto", selectedFile);
      if (removePhoto) formData.append("removeProfilePhoto", "true");

      // Assuming ApiUpdateProfile is defined in your API wrappers and accepts FormData
      const res = await ApiUpdateProfile(formData);
      if (res?.isSuccess) {
        Toast.success(res.message || t("Profile updated successfully"));
        if (onSuccess) onSuccess();
        onHide();
      } else {
        Toast.error(res?.message || t("Failed to update profile"));
      }
    } catch (err) {
      Toast.error(t("Something went wrong"));
    } finally {
      setLoading(false);
      dispatch(handleLoader(false));
    }
  };

  return (
    <Dialog open={show} onOpenChange={(open) => !open && onHide()}>
      <DialogContent
        className="premium-modal sm:max-w-[500px] gap-0 p-0 overflow-hidden bg-white dark:bg-[#1e1e1e]"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {isCropping ? (
          <>
            <DialogHeader className="premium-modal-header border-0 px-6 py-4 relative !justify-start !text-left">
              <div className="flex items-center gap-3.5 w-full justify-start text-left">
                <div className="premium-modal-icon-wrap flex items-center justify-center flex-shrink-0">
                  <i className="fa fa-crop"></i>
                </div>
                <div className="text-left flex-1">
                  <DialogTitle className="premium-modal-title !text-left">{t("Crop Image")}</DialogTitle>
                  <p className="premium-modal-subtitle m-0 text-sm opacity-80 !text-left">{t("Adjust your profile picture")}</p>
                </div>
              </div>
            </DialogHeader>
            <div className="relative w-full h-[300px] bg-gray-900">
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
                  aria-labelledby="Zoom"
                  onChange={(e) => setZoom(e.target.value)}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                />
                <i className="fa fa-search-plus text-gray-500"></i>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
                  onClick={handleCropCancel}
                >
                  {t("Cancel")}
                </button>
                <button
                  type="button"
                  className="px-4 py-2 text-sm font-medium text-white bg-[#2374F2] rounded-lg hover:bg-[#1A9FD4] transition-colors"
                  onClick={handleCropSave}
                >
                  {t("Save Crop")}
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <DialogHeader className="premium-modal-header border-0 px-6 py-4 relative !justify-start !text-left">
              <div className="flex items-center gap-3.5 w-full justify-start text-left">
                <div className="premium-modal-icon-wrap flex items-center justify-center flex-shrink-0">
                  <i className="fa fa-user"></i>
                </div>
                <div className="text-left flex-1">
                  <DialogTitle className="premium-modal-title !text-left">{t("Edit Profile")}</DialogTitle>
                  <p className="premium-modal-subtitle m-0 text-sm opacity-80 !text-left">{t("Update your personal information")}</p>
                </div>
              </div>
            </DialogHeader>
            <form onSubmit={handleSubmit(submitHandler)}>
              <div className="premium-modal-body px-6 py-4 space-y-4">

                <div className="flex flex-col items-center justify-center mb-4">
                  <div className="relative group">
                    <div className="w-24 h-24 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden flex items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-600 relative">
                      {previewUrl ? (
                        <img src={previewUrl} alt={t("Preview")} className="w-full h-full object-cover" />
                      ) : (
                        <i className="fa fa-user text-3xl text-gray-400"></i>
                      )}
                    </div>
                    {previewUrl && (
                      <button
                        type="button"
                        className="absolute -top-1 -right-1 w-7 h-7 bg-white dark:bg-gray-800 text-red-500 rounded-full flex items-center justify-center shadow-md border border-gray-200 dark:border-gray-700 hover:text-red-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors z-10 focus:outline-none"
                        onClick={(e) => {
                          e.preventDefault();
                          setPreviewUrl(null);
                          setSelectedFile(null);
                          setRemovePhoto(true);
                        }}
                        title={t("Remove Photo")}
                      >
                        <i className="fa fa-times text-sm"></i>
                      </button>
                    )}
                    <label className="absolute inset-0 bg-black/50 text-white flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity z-0">
                      <i className="fa fa-camera text-xl"></i>
                      <input type="file" className="hidden" accept="image/jpeg, image/png, image/jpg, image/webp" onChange={handleFileChange} />
                    </label>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-2">{t("Allowed: JPEG, PNG, JPG, WEBP")}</p>
                </div>

                <div className="form-group">
                  <label className="form-label premium-input-label block mb-1">{t("Email ID")}</label>
                  <div className="premium-input-wrapper opacity-70">
                    <i className="fa fa-envelope premium-input-icon"></i>
                    <input
                      className="form-control premium-form-control"
                      type="email"
                      value={loginUser?.email || ""}
                      disabled
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label premium-input-label block mb-1">{t("Full Name")}</label>
                  <div className="premium-input-wrapper">
                    <i className="fa fa-user premium-input-icon"></i>
                    <input
                      className="form-control premium-form-control"
                      type="text"
                      placeholder={t("Enter full name")}
                      {...register("fullName", { required: t("Full name is required") })}
                    />
                  </div>
                  {errors.fullName && <p className="premium-error-msg mt-1 mb-0 small">{errors.fullName.message}</p>}
                </div>

                <div className="form-group">
                  <label className="form-label premium-input-label block mb-1">{t("Phone Number")}</label>
                  <div className="premium-input-wrapper">
                    <i className="fa fa-phone premium-input-icon"></i>
                    <input
                      className="form-control premium-form-control"
                      type="text"
                      placeholder={t("Enter phone number")}
                      {...register("phoneNumber")}
                    />
                  </div>
                </div>

              </div>
              <DialogFooter className="premium-modal-footer px-6 py-4">
                <button className="premium-btn premium-btn-secondary" type="button" onClick={onHide}>
                  {t("Cancel")}
                </button>
                <button className="premium-btn premium-btn-primary" type="submit">
                  {t("Save Changes")}
                </button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
