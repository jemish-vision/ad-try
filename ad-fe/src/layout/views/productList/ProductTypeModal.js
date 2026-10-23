import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "../../../components/ui/select";
import { Input } from "../../../components/ui/input";
import { useTranslation } from "react-i18next";
import { Formik, Form, Field } from "formik";
import * as Yup from "yup";
import React, { useState, useEffect, useContext } from "react";

import { ProfileContext } from "../../../helper/usecontext/useContext";
import {
    ApiGetProductTypes,
    ApiCheckASIN
} from "../../../api-wrapper/productList/ApiProductList";
import { Toast } from "../../../helper/links/Link";

export default function ProductTypeModal({ show, onClose, onSelect }) {
    const { t } = useTranslation();
    const { profileId, selectedAdType } = useContext(ProfileContext);

    const [activeTab, setActiveTab] = useState(0);
    const [productTypes, setProductTypes] = useState([]);
    const [fetchedProduct, setFetchedProduct] = useState(null);
    const [marketplaceId, setMarketplaceId] = useState("");

    const languageTags = [
        { value: "en_IN", label: "English (India)" },
    ];

    // ---------------------- Validation ----------------------
    const schemaAddNew = Yup.object().shape({
        languageTag: Yup.object().nullable().required(t("languageTagRequired")),
        productType: Yup.object().nullable().required(t("productTypeRequired")),
    });

    const schemaAsin = Yup.object().shape({
        asin: Yup.string().required(t("asinRequired")),
    });

    // ---------------------- Fetch Product Types ----------------------
    const loadProductTypes = async () => {
        try {
            const res = await ApiGetProductTypes({ profileId: profileId.value });
            if (res?.isSuccess) {
                setMarketplaceId(res.marketplace_id);
                setProductTypes(
                    res.productType.map((p) => ({
                        value: p.name,
                        label: p.displayName,
                    }))
                );
            } else {
                setProductTypes([]);
            }
        } catch {
            setProductTypes([]);
            Toast.error(t("somethingWentWrong"));
        }
    };

    useEffect(() => {
        if (profileId?.value && selectedAdType) loadProductTypes();
    }, [profileId?.value, selectedAdType]);

    // ---------------------- Copy Listing Handler ----------------------
    const handleCopySubmit = async (values, { setSubmitting }) => {
        try {
            const res = await ApiCheckASIN({ asin: values?.asin, profileId: profileId?.value });
            if (res?.isSuccess) {
                Toast.success(t("productFound"));
                setFetchedProduct(res?.data);
            } else {
                Toast.error(t("productNotFound"));
            }
        } catch {
            Toast.error(t("somethingWentWrong"));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={show} onOpenChange={onClose}>
            <DialogContent className="max-w-[500px] p-0 gap-0 overflow-hidden bg-white dark:bg-[#0f172a] shadow-2xl border-slate-200 dark:border-white/10">
                <DialogHeader className="p-4 px-6 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/50">
                    <DialogTitle className="text-lg font-bold text-slate-900 dark:text-white">
                        {t("selectProductType")}
                    </DialogTitle>
                </DialogHeader>

                {/* Tab Switcher */}
                <div className="flex border-b border-slate-200 dark:border-slate-800 shrink-0">
                    <button
                        type="button"
                        onClick={() => setActiveTab(0)}
                        className={`flex-1 py-3.5 text-xs font-bold text-center border-b-2 transition-all focus:outline-none uppercase tracking-wider ${activeTab === 0
                            ? "border-[#2374F2] text-[#2374F2] dark:text-[#60a5fa] dark:border-[#2374F2]"
                            : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-250"
                            }`}
                    >
                        {t("tabAddNewListing")}
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab(1)}
                        className={`flex-1 py-3.5 text-xs font-bold text-center border-b-2 transition-all focus:outline-none uppercase tracking-wider ${activeTab === 1
                            ? "border-[#2374F2] text-[#2374F2] dark:text-[#60a5fa] dark:border-[#2374F2]"
                            : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-250"
                            }`}
                    >
                        {t("tabCopyListing")}
                    </button>
                </div>

                <div className="p-6">
                    {/* Tab 1 → Add New Listing */}
                    {activeTab === 0 && (
                        <Formik
                            initialValues={{ languageTag: null, productType: null }}
                            validationSchema={schemaAddNew}
                            onSubmit={(values) => onSelect({ ...values, marketplaceId })}
                        >
                            {({ values, setFieldValue, errors, touched, isSubmitting }) => (
                                <Form>
                                    {/* Language */}
                                    <div className="mb-3">
                                        <label className="form-label block mb-1.5">
                                            {t("languageTag")}
                                        </label>
                                        <Select
                                            value={values.languageTag?.value || ""}
                                            onValueChange={(val) => {
                                                const option = languageTags.find(t => t.value === val);
                                                setFieldValue("languageTag", option ? { value: option.value, label: option.label } : null);
                                            }}
                                        >
                                            <SelectTrigger className="w-full h-[40px] border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                                <SelectValue placeholder={t("selectLanguageTag")} />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {languageTags.map(tag => (
                                                    <SelectItem key={tag.value} value={tag.value}>{tag.label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        {errors.languageTag && touched.languageTag && (
                                            <div className="invalid-feedback block">
                                                {errors.languageTag}
                                            </div>
                                        )}
                                    </div>

                                    {/* Product Type */}
                                    <div className="mb-3">
                                        <label className="form-label block mb-1.5">
                                            {t("selectProductTypeLabel")}
                                        </label>
                                        <Select
                                            value={values.productType?.value || ""}
                                            onValueChange={(val) => {
                                                const option = productTypes.find(p => p.value === val);
                                                setFieldValue("productType", option ? { value: option.value, label: option.label } : null);
                                            }}
                                        >
                                            <SelectTrigger className="w-full h-[40px] border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                                <SelectValue placeholder={t("searchProductType")} />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {productTypes.map(pt => (
                                                    <SelectItem key={pt.value} value={pt.value}>{pt.label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        {errors.productType && touched.productType && (
                                            <div className="invalid-feedback block">
                                                {errors.productType}
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex justify-end p-4 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/50 mt-4 -mx-6 -mb-6">
                                        <button type="button" className="px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-md transition-colors mr-2" onClick={onClose} disabled={isSubmitting}>
                                            {t("close")}
                                        </button>
                                        <button type="submit" className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors shadow-sm">
                                            {t("saveAndNext")}
                                        </button>
                                    </div>
                                </Form>
                            )}
                        </Formik>
                    )}

                    {/* Tab 2 → Copy Listing */}
                    {activeTab === 1 && (
                        <Formik initialValues={{ asin: "" }} validationSchema={schemaAsin} onSubmit={handleCopySubmit}>
                            {({ values, errors, touched }) => (
                                <Form>
                                    {!fetchedProduct && (
                                        <>
                                            {/* Step 1 → Enter ASIN */}
                                            <div className="mb-3">
                                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">{t("enterASIN")}</label>
                                                <Field name="asin" as={Input} placeholder={t("enterASIN")} className={`${errors.asin && touched.asin ? "border-red-500 ring-red-500" : ""}`} />
                                                {errors.asin && touched.asin && (<div className="text-red-500 text-xs mt-1">{errors.asin}</div>)}
                                            </div>

                                            <div className="flex justify-end p-4 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/50 mt-4 -mx-6 -mb-6">
                                                <button type="button" className="px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-md transition-colors mr-2" onClick={onClose}>
                                                    {t("close")}
                                                </button>

                                                <button type="submit" className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors shadow-sm">
                                                    {t("fetchProduct")}
                                                </button>
                                            </div>
                                        </>
                                    )}

                                    {fetchedProduct && (
                                        <>
                                            {/* Step 2 → Show Product Type (Disabled) */}
                                            <div className="mb-3">
                                                <label className="form-label">{t("productType")}</label>
                                                <Select
                                                    value={fetchedProduct?.productTypes?.[0]?.productType || ""}
                                                    disabled
                                                >
                                                    <SelectTrigger className="w-full h-[40px] border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                                                        <SelectValue placeholder={fetchedProduct?.productTypes?.[0]?.productType || "Select"} />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {productTypes.map(pt => (
                                                            <SelectItem key={pt.value} value={pt.value}>{pt.label}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            <div className="flex justify-end p-4 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/50 mt-4 -mx-6 -mb-6">
                                                <button type="button" className="px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-md transition-colors mr-2" onClick={onClose}>
                                                    {t("close")}
                                                </button>

                                                <button type="button" className="px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors mr-2" onClick={() => setFetchedProduct(null)}>
                                                    {t("back")}
                                                </button>

                                                <button
                                                    type="button"
                                                    className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors shadow-sm"
                                                    onClick={() =>
                                                        onSelect({
                                                            asin: values?.asin,
                                                            marketplaceId,
                                                            languageTag: { value: fetchedProduct?.languageTag },
                                                            asinData: fetchedProduct,
                                                            productType: {
                                                                value: fetchedProduct?.productTypes?.[0]?.productType,
                                                                label: productTypes?.find((item) => item?.value === fetchedProduct?.productTypes?.[0]?.productType)?.label ?? fetchedProduct?.productTypes?.[0]?.productType
                                                            },
                                                        })
                                                    }
                                                >
                                                    {t("saveAndNext")}
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </Form>
                            )}
                        </Formik>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
