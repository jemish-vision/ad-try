import { useContext, useRef, useState } from "react";
import { ErrorMessage } from "formik";
import { useTranslation } from "react-i18next";
import { ProfileContext } from "../../../../../helper/usecontext/useContext";
import { ApiFileUpload } from "../../../../../api-wrapper/productList/ApiProductList";
import { Toast } from "../../../../../helper/links/Link";
import { FieldTitle } from "./ProductCommon";

export default function UrlWithFileInput({ field, fullPath, value, setFieldValue }) {
    const { t } = useTranslation();
    const { profileId } = useContext(ProfileContext);
    const [uploading, setUploading] = useState(false);
    const fileRef = useRef(null);

    const disabledFile = Boolean(value) || uploading;

    const handleFileUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const maxSize = 10 * 1024 * 1024;
        if (file.size > maxSize) {
            Toast.error(t("Maximum file size allowed is 10 MB."));
            e.target.value = "";
            return;
        }

        const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/tiff"];
        if (!allowedTypes.includes(file.type)) {
            Toast.error(t("Only jpg, jpeg, gif, png or tif formats are allowed."));
            e.target.value = "";
            return;
        }

        setUploading(true);
        try {
            const formData = new FormData();
            formData.append("profileId", profileId?.value);
            formData.append("image", file);

            const res = await ApiFileUpload(formData);
            if (res?.isSuccess && res?.data?.image) {
                setFieldValue(fullPath, res?.data?.image);
            } else {
                Toast.error(res?.message ?? t("Invalid file type! Only Images or Excel files allowed."));
            }
        } catch (err) {
            Toast.error(err?.message ?? t("Invalid file type! Only Images or Excel files allowed."));
            console.error("Upload error:", err);
        }
        setUploading(false);
        if (fileRef.current) fileRef.current.value = "";
    };

    // Derive a short display name from a URL
    const displayName = value
        ? value.split("/").pop().split("?")[0] || value
        : null;

    return (
        <div className="pf-field-row">
            <label className="pf-label">
                <FieldTitle
                    title={field.label || field?.key}
                    tooltip={field?.description ?? field.label ?? field?.key}
                />
            </label>

            <div className="pf-url-wrap">
                <div className="pf-url-row">
                    {/* Hidden native file input */}
                    <input
                        ref={fileRef}
                        type="file"
                        className="pf-file-input-hidden"
                        id={`file-${fullPath}`}
                        disabled={disabledFile}
                        onChange={handleFileUpload}
                        accept="image/jpeg,image/jpg,image/png,image/gif,image/tiff"
                    />

                    {/* Styled upload trigger */}
                    <label
                        htmlFor={`file-${fullPath}`}
                        className={`pf-file-label${disabledFile ? " pf-file-disabled" : ""}`}
                        title={disabledFile && !uploading ? t("Clear the URL to upload a new file") : t("Upload image")}
                    >
                        {uploading ? (
                            <span className="pf-uploading-badge">
                                <span className="pf-uploading-spinner" />
                                {t("Uploading…")}
                            </span>
                        ) : (
                            <>
                                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                                    <path d="M8 1v9M4 4l4-3 4 3M2 12h12v3H2v-3z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                {t("Upload")}
                            </>
                        )}
                    </label>

                    {/* URL text input */}
                    <input
                        type="text"
                        className="pf-input"
                        value={value || ""}
                        onChange={(e) => setFieldValue(fullPath, e.target.value)}
                        placeholder={t("Paste image URL…")}
                    />
                </div>

                {/* Preview chip when a value is present */}
                {value && (
                    <div className="pf-preview-chip">
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
                            <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span title={value}>{displayName}</span>
                    </div>
                )}

                <ErrorMessage
                    name={fullPath}
                    render={(msg) => <div className="pf-error-msg">{msg}</div>}
                />
            </div>
        </div>
    );
}