import React, { useContext, useEffect, useState } from "react";
import BooleanInput from "./common/BooleanInput";
import TextInput from "./common/InputText";
import { useTranslation } from "react-i18next";
import { Toast } from "../../../../../helper/links/Link";
import { ApiProductSearchOnAmazon } from "../../../../../api-wrapper/productList/ApiProductList";
import { ProfileContext } from "../../../../../helper/usecontext/useContext";

const getImageURL = (imgArray) => {
    if (!Array.isArray(imgArray)) return null;
    const marketplace = imgArray?.[0];
    if (!marketplace?.images?.length) return null;
    const mainImage = marketplace.images.find(img => img.variant === "MAIN");
    return mainImage?.link || null;
}

const renderMatchTypeBadge = (type) => {
    let bg = "#f1f5f9";
    let color = "#2374F2";
    const normalized = (type || "").toUpperCase();
    if (normalized === "EXACT") {
        bg = "#f1f5f9";
        color = "#2374F2";
    } else if (normalized === "PHRASE") {
        bg = "#f1f5f9";
        color = "#2374F2";
    }
    return (
        <span className="inline-block rounded-full px-2.5 py-1" style={{ backgroundColor: bg, color: color, fontSize: "11px", fontWeight: "700", letterSpacing: "0.5px", textTransform: "uppercase" }}>
            {type}
        </span>
    );
};

const StepTargeting = ({ formik, currencySymbol = "₹" }) => {
    const { t } = useTranslation();
    const { values, setFieldValue } = formik;
    const { profileId } = useContext(ProfileContext);

    const [keywordInput, setKeywordInput] = useState("");
    const [selectedMatchType, setSelectedMatchType] = useState("Broad");
    const MATCH_TYPES = ["Broad", "Phrase", "Exact"];
    const [selectedProductFilters, setSelectedProductFilters] = useState(["Exact", "Expanded"]);

    const [productSearch, setProductSearch] = useState("");
    const [loading, setLoading] = useState(false);
    const [productResults, setProductResults] = useState([]);

    const autoBidModeField = {
        key: "autoBidMode",
        label: t("automaticTargeting"),
        enum: ["default", "group"],
        enumNames: [t("Set default bid"), t("Set bids by targeting group")]
    };

    const autoBidDefaultField = {
        key: "autoBidDefault",
        label: t("Default Bid"),
        placeholder: t("Enter a bid value for Default Bid"),
        type: "number",
        prefix: currencySymbol
    };

    const autoBidGroupFields = [
        { key: "autoBidGroups.closeMatch", keyValue: "closeMatch", placeholder: t("Enter a bid value for Close Match"), label: t("Close Match"), type: "number", prefix: currencySymbol },
        { key: "autoBidGroups.looseMatch", keyValue: "looseMatch", placeholder: t("Enter a bid value for Loose Match"), label: t("Loose Match"), type: "number", prefix: currencySymbol },
        { key: "autoBidGroups.substitutes", keyValue: "substitutes", placeholder: t("Enter a bid value for Substitutes"), label: t("Substitutes"), type: "number", prefix: currencySymbol },
        { key: "autoBidGroups.complements", keyValue: "complements", placeholder: t("Enter a bid value for Complements"), label: t("Complements"), type: "number", prefix: currencySymbol }
    ];

    const handleMatchTypeToggle = (type) => {
        setSelectedMatchType(type);
    };

    const handleAddKeywords = () => {
        if (!keywordInput.trim() || !selectedMatchType) return;

        const lines = keywordInput.split("\n").map((k) => k.trim()).filter((k) => k.length > 0);
        const generated = lines.map((keyword) => ({ keyword, matchType: selectedMatchType, bid: 0 }));
        const updated = [...(values.manualKeywordTargeting || []), ...generated];

        setFieldValue("manualKeywordTargeting", updated);
        setKeywordInput("");
    };

    const removeKeyword = (index) => {
        setFieldValue("manualKeywordTargeting", values.manualKeywordTargeting.filter((_, i) => i !== index));
    };

    const handleAddProductByType = (product, type) => {
        const asin = product?.asin?.trim();
        if (!asin) return;

        const updated = [...(values.manualProductTargeting || [])];
        const exists = updated.some((p) => p.asin === asin && p.type === type);

        if (exists) {
            Toast.error(`${t(type)} ${t("already added")}`);
            return;
        }

        updated.push({ ...product, type, bid: 0 });
        setFieldValue("manualProductTargeting", updated);
    };

    const handleAddAllProducts = () => {
        if (!productResults.length) {
            Toast.error(t("No products to add"));
            return;
        }

        const updated = [...(values.manualProductTargeting || [])];
        let added = 0;

        productResults.forEach((product) => {
            const asin = product?.asin?.trim();
            if (!asin) return;

            selectedProductFilters.forEach((type) => {
                const exists = updated.some((p) => p.asin === asin && p.type === type);
                if (!exists) {
                    updated.push({ ...product, type, bid: 0 });
                    added++;
                }
            });
        });

        if (added === 0) {
            Toast.error(t("All products were already added"));
        } else {
            setFieldValue("manualProductTargeting", updated);
            Toast.success(`${added} ${t("rows added successfully")}`);
        }
    };

    const isAlreadyAdded = (asin, type) => {
        return (values.manualProductTargeting || []).some(p => p.asin === asin && p.type === type);
    };

    const handleProductFilterToggle = (type) => {
        setSelectedProductFilters((prev) => prev.includes(type) ? prev.filter((f) => f !== type) : [...prev, type]);
    };

    const removeProduct = (index) => {
        setFieldValue("manualProductTargeting", values.manualProductTargeting.filter((_, i) => i !== index));
    };

    const handleProductSearch = async (isBrand) => {
        if (!productSearch.trim()) {
            Toast.error(t("Please enter a keyword"));
            return;
        }

        setLoading(true);
        setProductResults([]);
        try {
            const res = await ApiProductSearchOnAmazon({ keyword: productSearch.trim(), profileId: profileId?.value, ...(isBrand && { brand: productSearch.trim() }) });
            const products = res?.data?.items || [];
            if (!products.length) {
                Toast.error(isBrand ? t("No brands found") : t("No products found"));
                return;
            }
            setProductResults(products);
        } catch (err) {
            Toast.error(t("Something went wrong"));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div id="campaign-step-targeting" className="campaign-step-container">
            <h2 className="flow-title mb-2">{t("Targeting Configuration")}</h2>
            <p className="flow-subtitle mb-4">{t("Define how and where your ads will appear to potential customers.")}</p>

            {/* If targeting type is not set, or we allow toggling AUTO vs MANUAL, we can show it here. 
                Assuming values.targetingType is MANUAL for the rich UI matching the mock. */}

            {values.targetingType === "AUTO" && (
                <div className="modern-card">
                    <h3 className="card-title">{t("Automatic Targeting")}</h3>
                    <div className="mt-3">
                        <BooleanInput
                            field={autoBidModeField}
                            value={values.autoBidMode}
                            setFieldValue={setFieldValue}
                        />
                        {values.autoBidMode === "default" && (
                            <div className="mt-3"><TextInput field={autoBidDefaultField} value={values.autoBidDefault} setFieldValue={setFieldValue} /></div>
                        )}
                        {values.autoBidMode === "group" && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                                {autoBidGroupFields.map((f) => (
                                    <div className="mb-3" key={f.key}>
                                        <TextInput field={f} value={values.autoBidGroups[f.keyValue]} setFieldValue={setFieldValue} />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {values.targetingType === "MANUAL" && (
                <>
                    {/* Targeting Type Cards */}
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
                        <div>
                            <div
                                className={`strategy-card h-full ${values.manualTargetType === 'keyword' ? 'active' : ''}`}
                                onClick={() => setFieldValue('manualTargetType', 'keyword')}
                            >
                                <div className="strategy-header mb-3">
                                    <div className="flex items-center justify-center" style={{ width: '40px', height: '40px', background: values.manualTargetType === 'keyword' ? '#e0e7ff' : 'var(--theme-bg-soft)', borderRadius: '8px', color: values.manualTargetType === 'keyword' ? '#2374F2' : 'var(--theme-text-muted)' }}>
                                        <i className="fa-solid fa-key text-lg"></i>
                                    </div>
                                    {values.manualTargetType === 'keyword' && <i className="fa-solid fa-circle-check text-lg text-blue-500"></i>}
                                </div>
                                <div className="strategy-title" style={{ fontSize: '16px' }}>{t("Keyword Targeting")}</div>
                                <div className="strategy-desc">{t("Target customers based on the specific words and phrases they search for.")}</div>
                            </div>
                        </div>
                        <div>
                            <div
                                className={`strategy-card h-full ${values.manualTargetType === 'product' ? 'active' : ''}`}
                                onClick={() => setFieldValue('manualTargetType', 'product')}
                            >
                                <div className="strategy-header mb-3">
                                    <div className="flex items-center justify-center" style={{ width: '40px', height: '40px', background: values.manualTargetType === 'product' ? '#e0e7ff' : 'var(--theme-bg-soft)', borderRadius: '8px', color: values.manualTargetType === 'product' ? '#2374F2' : 'var(--theme-text-muted)' }}>
                                        <i className="fa-solid fa-box-open text-lg"></i>
                                    </div>
                                    {values.manualTargetType === 'product' && <i className="fa-solid fa-circle-check text-lg text-blue-500"></i>}
                                </div>
                                <div className="strategy-title" style={{ fontSize: '16px' }}>{t("Product Targeting")}</div>
                                <div className="strategy-desc">{t("Target specific categories, brands, or individual items related to yours.")}</div>
                            </div>
                        </div>
                    </div>

                    {/* Content Area */}
                    {values.manualTargetType === "keyword" && (
                        <div className="modern-card p-0 overflow-hidden">
                            <div className="p-4 border-b border-slate-200 dark:border-slate-700">
                                <h3 className="card-title m-0">{t("Enter Keywords")}</h3>
                                <p className="card-subtitle m-0 mt-1">{t("Add the search terms you want to target. Use one keyword per line.")}</p>
                            </div>

                            <div className="grid grid-cols-1 xl:grid-cols-12">
                                {/* LEFT SECTION — Input */}
                                <div className="xl:col-span-7 p-4 border-b xl:border-b-0 xl:border-r border-slate-200 dark:border-slate-700" style={{ background: 'var(--theme-bg-light)' }}>
                                    <label className="modern-label text-slate-500 dark:text-slate-400 mb-2" style={{ fontSize: '11px', textTransform: 'uppercase' }}>{t("Match Type")}</label>
                                    <div className="or-tab-switcher w-full mb-4">
                                        <div className="or-tab-switcher__track w-full">
                                            <div
                                                className="or-tab-switcher__indicator"
                                                style={{ 
                                                    width: 'calc(33.33% - 2.66px)',
                                                    transform: `translateX(${MATCH_TYPES.indexOf(selectedMatchType) * 100}%)` 
                                                }}
                                            />
                                            {MATCH_TYPES.map((type) => (
                                                <button
                                                    key={type}
                                                    type="button"
                                                    className={`or-tab-switcher__btn flex-1 justify-center ${selectedMatchType === type ? 'or-tab-switcher__btn--active' : ''}`}
                                                    onClick={() => setSelectedMatchType(type)}
                                                    style={{ textTransform: 'capitalize' }}
                                                >
                                                    <span>{t(type.toLowerCase())}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <label className="modern-label text-slate-500 dark:text-slate-400 mb-2" style={{ fontSize: '11px', textTransform: 'uppercase' }}>{t("Keywords")}</label>
                                    <textarea
                                        placeholder={t("e.g. running shoes\ntrail sneakers\nathletic footwear")}
                                        className="modern-input mb-3"
                                        style={{ height: '150px', resize: 'none', lineHeight: '1.6' }}
                                        value={keywordInput}
                                        onChange={(e) => setKeywordInput(e.target.value)}
                                    />

                                    <button
                                        type="button"
                                        className="customize-button clicked w-full m-0 gap-0"
                                        style={{ height: "36px", display: "flex", alignItems: "center", justifyContent: "center", whiteSpace: "nowrap" }}
                                        onClick={handleAddKeywords}
                                    >
                                        <i className="fa-solid fa-plus pr-1"></i> {t("Add Keywords")}
                                    </button>
                                </div>

                                {/* RIGHT SECTION — Added Keywords */}
                                <div className="xl:col-span-5 p-4 bg-white dark:bg-slate-900 flex flex-col h-full">
                                    <div className="flex justify-between items-center mb-3">
                                        <div>
                                            <h3 className="card-title m-0">{t("Added Keywords")}</h3>
                                            <div className="text-slate-500 dark:text-slate-400" style={{ fontSize: '12px' }}>{values.manualKeywordTargeting.length} {t("Keywords Targeted")}</div>
                                        </div>
                                        {values.manualKeywordTargeting.length > 0 && (
                                            <span className="text-red-500 cursor-pointer font-semibold" style={{ fontSize: '12px', cursor: 'pointer' }} onClick={() => setFieldValue("manualKeywordTargeting", [])}>{t("Clear All")}</span>
                                        )}
                                    </div>

                                    <div className="flex-1 overflow-auto" style={{ maxHeight: "350px" }}>
                                        {values.manualKeywordTargeting.length === 0 ? (
                                            <div className="text-center py-5">
                                                <i className="fa-solid fa-list-ul text-2xl text-slate-500 dark:text-slate-400 opacity-25 mb-3"></i>
                                                <p className="text-slate-500 dark:text-slate-400 mb-0" style={{ fontSize: '13px' }}>{t("Keywords you add will appear here.")}</p>
                                            </div>
                                        ) : (
                                            <div className="border rounded overflow-hidden">
                                                <table className="w-full text-left mb-0" style={{ fontSize: '13px' }}>
                                                    <thead className="bg-slate-50 dark:bg-slate-800">
                                                        <tr>
                                                            <th className="text-slate-500 dark:text-slate-400 font-semibold py-2 pl-3" style={{ fontSize: '11px' }}>{t("KEYWORD & MATCH")}</th>
                                                            <th className="text-slate-500 dark:text-slate-400 font-semibold py-2 text-right" style={{ fontSize: '11px' }}>{t("BID")} ({currencySymbol})</th>
                                                            <th></th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {values.manualKeywordTargeting.map((item, index) => (
                                                            <tr key={index} className="border-b border-slate-100 dark:border-slate-800">
                                                                <td className="align-middle font-medium pl-3 py-3">
                                                                    <div className="truncate text-slate-800 dark:text-slate-100 mb-1.5">{item.keyword}</div>
                                                                    <div className="mt-1">{renderMatchTypeBadge(t(item.matchType))}</div>
                                                                </td>
                                                                <td className="align-middle text-right font-semibold py-3">
                                                                    <div className="modern-input-group" style={{ width: '90px' }}>
                                                                        <input
                                                                            type="number"
                                                                            className="modern-input has-prefix px-2 py-1"
                                                                            style={{ height: "30px", outline: 'none' }}
                                                                            value={item.bid}
                                                                            step="0.01"
                                                                            min="0"
                                                                            onChange={(e) => {
                                                                                const updated = [...values.manualKeywordTargeting];
                                                                                updated[index].bid = Number(e.target.value);
                                                                                setFieldValue("manualKeywordTargeting", updated);
                                                                            }}
                                                                        />
                                                                    </div>
                                                                </td>
                                                                <td className="align-middle text-right pr-3 py-3">
                                                                    <button type="button" className="text-red-500 hover:text-red-700 p-1" onClick={() => removeKeyword(index)}><i className="fa-solid fa-trash"></i></button>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {values.manualTargetType === "product" && (
                        <div className="modern-card p-0 overflow-hidden">
                            <div className="p-4 border-b border-slate-200 dark:border-slate-700">
                                <h3 className="card-title m-0">{t("Target Products")}</h3>
                                <p className="card-subtitle m-0 mt-1">{t("Target specific products to place your ads on their detail pages.")}</p>
                            </div>

                            <div className="grid grid-cols-1 xl:grid-cols-12">
                                {/* LEFT SECTION — Search & Available Products */}
                                <div className="xl:col-span-7 p-4 border-b xl:border-b-0 xl:border-r border-slate-200 dark:border-slate-700" style={{ background: 'var(--theme-bg-light)' }}>
                                    <div className="flex gap-2 mb-3">
                                        <div className="modern-input-group flex-1">
                                            <i className="fa-solid fa-search modern-input-prefix mt-1"></i>
                                            <input
                                                type="text"
                                                className="modern-input has-prefix"
                                                placeholder={t("Search by product name or ASIN")}
                                                value={productSearch}
                                                onChange={(e) => setProductSearch(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && handleProductSearch()}
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            className="customize-button clicked m-0 gap-0"
                                            style={{ height: "36px", display: "inline-flex", alignItems: "center", justifyContent: "center", whiteSpace: "nowrap" }}
                                            onClick={() => handleProductSearch()}
                                            disabled={loading}
                                        >
                                            {loading ? t("Searching...") : t("Search")}
                                        </button>
                                    </div>

                                    <div className="modern-card p-0 overflow-hidden">
                                        <div className="bg-slate-50 dark:bg-slate-800 px-3 py-2 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                                            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--theme-text-dark)' }}>{t("Search Results")} {productResults.length > 0 && `(${productResults.length})`}</span>
                                        </div>
                                        <div className="p-3 bg-white overflow-auto" style={{ maxHeight: "350px" }}>
                                            {productResults.length > 0 ? (
                                                productResults.map((p, i) => (
                                                    <div key={i} className="p-2 mb-2 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 flex items-center gap-3 shadow-sm">
                                                        {Boolean(getImageURL(p?.images)) ? (
                                                            <img src={getImageURL(p?.images)} alt="" style={{ width: '40px', height: '40px', objectFit: 'contain', borderRadius: '4px' }} className="border" />
                                                        ) : (
                                                            <div style={{ width: '40px', height: '40px', background: 'var(--theme-bg-soft)', borderRadius: '4px' }} className="flex items-center justify-center text-slate-500 dark:text-slate-400"><i className="fa-solid fa-box"></i></div>
                                                        )}
                                                        <div className="flex-1 truncate">
                                                            <div className="font-semibold truncate" style={{ fontSize: '13px', color: 'var(--theme-text-dark)', width: "400px" }}>{p.summaries?.[0]?.itemName || p.asin}</div>
                                                            <div className="text-slate-500 dark:text-slate-400" style={{ fontSize: '11px' }}>{p.asin}</div>
                                                        </div>
                                                        <div className="flex gap-2 ml-auto">
                                                            {isAlreadyAdded(p.asin, 'Exact') ? (
                                                                <button type="button" className="inline-flex items-center text-green-500 font-semibold rounded-full px-3 py-0.5 text-xs border border-green-200 bg-green-50 dark:bg-green-900/20" disabled>
                                                                    <i className="fa-solid fa-check mr-1"></i> {t("Exact")}
                                                                </button>
                                                            ) : (
                                                                <button type="button" className="inline-flex items-center border border-blue-500 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 font-semibold rounded-full px-3 py-0.5 text-xs" onClick={() => handleAddProductByType(p, 'Exact')}>
                                                                    {t("Add Exact")}
                                                                </button>
                                                            )}
                                                            {isAlreadyAdded(p.asin, 'Expanded') ? (
                                                                <button type="button" className="inline-flex items-center text-green-500 font-semibold rounded-full px-3 py-0.5 text-xs border border-green-200 bg-green-50 dark:bg-green-900/20" disabled>
                                                                    <i className="fa-solid fa-check mr-1"></i> {t("Expanded")}
                                                                </button>
                                                            ) : (
                                                                <button type="button" className="inline-flex items-center border border-slate-300 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 font-semibold rounded-full px-3 py-0.5 text-xs" onClick={() => handleAddProductByType(p, 'Expanded')}>
                                                                    {t("Add Expanded")}
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="text-center py-5 text-slate-500 dark:text-slate-400" style={{ fontSize: '13px' }}>
                                                    <i className="fa-solid fa-search text-2xl mb-3 opacity-25"></i>
                                                    <p className="mb-0">{t("Search for products to target.")}</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* RIGHT SECTION — Added Products */}
                                <div className="xl:col-span-5 p-4 bg-white dark:bg-slate-900 h-full flex flex-col">
                                    <div className="flex justify-between items-center mb-3">
                                        <div>
                                            <h3 className="card-title m-0">{t("Targeted Products")}</h3>
                                            <div className="text-slate-500 dark:text-slate-400" style={{ fontSize: '12px' }}>{values.manualProductTargeting.length} {t("Products Added")}</div>
                                        </div>
                                        {values.manualProductTargeting.length > 0 && (
                                            <span className="text-red-500 cursor-pointer font-semibold" style={{ fontSize: '12px' }} onClick={() => setFieldValue("manualProductTargeting", [])}>{t("Remove All")}</span>
                                        )}
                                    </div>

                                    <div className="flex-1 overflow-auto" style={{ maxHeight: "450px" }}>
                                        {values.manualProductTargeting.length === 0 ? (
                                            <div className="border border-dashed rounded p-4 text-center flex flex-col items-center justify-center h-full" style={{ borderColor: '#cbd5e1', borderStyle: 'dashed' }}>
                                                <i className="fa-solid fa-box-open text-slate-500 dark:text-slate-400 text-2xl mb-3 opacity-25"></i>
                                                <p className="text-slate-500 dark:text-slate-400 mb-0" style={{ fontSize: '13px' }}>{t("Products you target will appear here.")}</p>
                                            </div>
                                        ) : (
                                            <div className="border rounded overflow-hidden">
                                                <table className="w-full text-left mb-0" style={{ fontSize: '13px' }}>
                                                    <thead className="bg-slate-50 dark:bg-slate-800">
                                                        <tr>
                                                            <th className="text-slate-500 dark:text-slate-400 font-semibold py-3 pl-3" style={{ fontSize: '11px' }}>{t("PRODUCT")}</th>
                                                            <th className="text-slate-500 dark:text-slate-400 font-semibold py-3 text-right" style={{ fontSize: '11px' }}>{t("BID")} ({currencySymbol})</th>
                                                            <th className="pr-3"></th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {values.manualProductTargeting.map((item, index) => (
                                                            <tr key={index} className="border-b border-slate-100 dark:border-slate-800">
                                                                <td className="align-middle font-medium pl-3 py-3">
                                                                    <div className="truncate text-slate-800 dark:text-slate-100 mb-1.5" style={{ maxWidth: '180px' }}>{item?.summaries?.[0]?.itemName || item.asin}</div>
                                                                    <div className="flex items-center gap-2 mt-1">
                                                                        <span className="text-slate-500 dark:text-slate-400 font-normal" style={{ fontSize: '11px' }}>{item.asin}</span>
                                                                        <span className="rounded px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700" style={{ fontSize: '10px' }}>{t(item.type)}</span>
                                                                    </div>
                                                                </td>
                                                                <td className="align-middle text-right font-semibold py-3">
                                                                    <div className="modern-input-group" style={{ width: '90px' }}>
                                                                        <input
                                                                            type="number"
                                                                            className="modern-input has-prefix px-2 py-1"
                                                                            style={{ height: "30px", outline: 'none' }}
                                                                            value={item.bid}
                                                                            step="0.01"
                                                                            min="0"
                                                                            onChange={(e) => {
                                                                                const updated = [...values.manualProductTargeting];
                                                                                updated[index].bid = Number(e.target.value);
                                                                                setFieldValue("manualProductTargeting", updated);
                                                                            }}
                                                                        />
                                                                    </div>
                                                                </td>
                                                                <td className="align-middle text-right pr-3 py-3">
                                                                    <button type="button" className="text-red-500 hover:text-red-700 p-1" style={{ borderRadius: '20px', width: '32px', height: '32px', padding: 0 }} onClick={() => removeProduct(index)}>
                                                                        <i className="fa-solid fa-trash"></i>
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default StepTargeting;
