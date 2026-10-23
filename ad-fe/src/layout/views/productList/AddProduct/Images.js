import { ErrorMessage } from "formik";
import { t } from "i18next";
import React, { useRef } from "react";

import { FieldTitle } from "./ProductCommon";

const NativeImageUploader = ({ value, onChange, max = 8, multiple = false }) => {
    const inputRef = useRef(null);

    // Always convert value → array
    const normalizedValue = multiple
        ? Array.isArray(value) ? value : []
        : value
            ? [value]
            : [];

    const fileList = normalizedValue.map((file, index) => {
        const isFile = file instanceof File;
        return {
            uid: index.toString(),
            name: isFile ? file.name : `image-${index}`,
            url: isFile ? URL.createObjectURL(file) : file, // ✅ supports URL or File
            originFileObj: isFile ? file : null,
        };
    });

    const handleFileChange = (e) => {
        const files = Array.from(e.target.files);
        if (!files.length) return;

        if (multiple) {
            const combined = [...fileList.map(f => f.originFileObj || f.url), ...files].slice(0, max);
            onChange(combined);
        } else {
            onChange(files[0]);
        }
        // Reset input so the same file can be selected again if needed
        if (inputRef.current) inputRef.current.value = "";
    };

    const handleRemove = (indexToRemove) => {
        if (multiple) {
            const newList = fileList.filter((_, idx) => idx !== indexToRemove).map(f => f.originFileObj || f.url);
            onChange(newList);
        } else {
            onChange(null);
        }
    };

    return (
        <div className="flex flex-wrap gap-2">
            {fileList.map((file, idx) => (
                <div key={file.uid} className="relative w-[100px] h-[100px] border border-gray-200 dark:border-white/10 p-1 rounded-md overflow-hidden group">
                    <img src={file.url} alt={file.name} className="w-full h-full object-cover rounded-sm" />
                    <button
                        type="button"
                        onClick={() => handleRemove(idx)}
                        className="absolute top-1 right-1 bg-white/80 dark:bg-black/50 text-red-500 hover:text-red-700 rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-[10px] shadow-sm"
                    >
                        <i className="fa fa-times"></i>
                    </button>
                </div>
            ))}

            {fileList.length < max && (
                <div
                    onClick={() => inputRef.current?.click()}
                    className="w-[100px] h-[100px] border border-dashed border-gray-300 dark:border-white/20 bg-gray-50 dark:bg-white/5 rounded-md flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 hover:text-blue-500 transition-colors text-gray-500 dark:text-gray-400"
                >
                    <span className="text-xl mb-1 font-light">+</span>
                    <span className="text-[12px]">{t("Upload")}</span>
                </div>
            )}

            <input
                type="file"
                ref={inputRef}
                className="hidden"
                accept="image/*"
                multiple={multiple}
                onChange={handleFileChange}
            />
        </div>
    );
};


const Images = ({ values, setFieldValue }) => (
    <div className="flex flex-wrap -mx-3">

        <div className="flex flex-wrap -mx-3 w-full mb-4">
            <FieldTitle title={`* ${t("Main Image")}`} tooltip={t("mainProductImage-ToolTip")} />
            <div className="w-full md:w-2/3 px-3">
                <NativeImageUploader
                    value={values?.mainProductImage}
                    multiple={false}
                    max={1}
                    onChange={(file) => setFieldValue("mainProductImage", file)}
                />
                <ErrorMessage name="mainProductImage" render={(msg) => <div className="text-danger mt-1 text-sm">{t(msg)}</div>} />
            </div>
        </div>

        <div className="flex flex-wrap -mx-3 w-full mb-4">
            <FieldTitle title={`* ${t("Additional Images")}`} tooltip={t("additionalImages-ToolTip")} />
            <div className="w-full md:w-2/3 px-3">
                <NativeImageUploader
                    value={values?.additionalImages}
                    multiple={true}
                    max={8}
                    onChange={(files) => setFieldValue("additionalImages", files)}
                />
                <ErrorMessage name="additionalImages" render={(msg) => <div className="text-danger mt-1 text-sm">{t(msg)}</div>} />
            </div>
        </div>

    </div>
);

export default Images;
