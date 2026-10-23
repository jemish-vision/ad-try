import React, { useContext, useState } from "react";
import { Toast } from "../../../../../helper/links/Link";
import { ApiCheckASINFromDB } from "../../../../../api-wrapper/productList/ApiProductList";
import { ProfileContext } from "../../../../../helper/usecontext/useContext";
import FormattedAsin from "../../../../../helper/FormattedAsin";
import { t } from "i18next";
import { FaTrash } from "react-icons/fa";
import { useTranslation } from "react-i18next";

const StepProducts = ({ formik, currencySymbol = "₹" }) => {
    const { t } = useTranslation();
    const { profileId } = useContext(ProfileContext);

    const [activeTab, setActiveTab] = useState("keyword");
    const [loading, setLoading] = useState(false);
    const [keyword, setKeyword] = useState("");
    const [asinTags, setAsinTags] = useState([]);
    const [asinInput, setAsinInput] = useState("");

    const parseAsinString = (text) => {
        if (!text) return [];
        return text
            .split(/[\s,]+/)
            .map((t) => t.trim().toUpperCase())
            .filter(Boolean);
    };

    const addAsinFromText = (text) => {
        const tags = parseAsinString(text);
        if (tags.length === 0) return;

        setAsinTags((prev) => {
            const next = [...prev];
            tags.forEach((tag) => {
                if (!next.includes(tag)) {
                    next.push(tag);
                }
            });
            return next;
        });
        setAsinInput("");
    };

    const handleAsinKeyDown = (e) => {
        if (e.key === "Enter" || e.key === "," || e.key === " ") {
            e.preventDefault();
            if (asinInput.trim()) {
                const newAsins = parseAsinString(asinInput);
                const merged = [...asinTags];
                newAsins.forEach(tag => {
                    if (!merged.includes(tag)) merged.push(tag);
                });
                setAsinTags(merged);
                setAsinInput("");
                if (e.key === "Enter") {
                    executeSearch(merged);
                }
            } else if (e.key === "Enter" && asinTags.length > 0) {
                executeSearch(asinTags);
            }
        } else if (e.key === "Backspace" && !asinInput && asinTags.length > 0) {
            setAsinTags(asinTags.slice(0, -1));
        }
    };

    const handleAsinPaste = (e) => {
        e.preventDefault();
        const pastedData = e.clipboardData?.getData("text") || "";
        addAsinFromText(pastedData);
    };

    const removeAsinTag = (tagToRemove) => {
        setAsinTags(asinTags.filter((tag) => tag !== tagToRemove));
    };

    // Temporary list of fetched products
    const [fetchedProducts, setFetchedProducts] = useState([]);

    const executeSearch = async (asinsToSearch = null) => {
        setLoading(true);

        try {
            let payload = { profileId: profileId?.value };

            if (activeTab === "keyword") {
                if (!keyword.trim()) {
                    Toast.error(t("Enter product name or sku"));
                    setLoading(false);
                    return;
                }
                payload.search = keyword.trim();
            } else {
                let currentAsins = Array.isArray(asinsToSearch) ? [...asinsToSearch] : [...asinTags];

                // If there's pending text in asinInput, commit it
                if (asinInput.trim()) {
                    const extraTags = parseAsinString(asinInput);
                    extraTags.forEach((tag) => {
                        if (!currentAsins.includes(tag)) {
                            currentAsins.push(tag);
                        }
                    });
                    setAsinTags(currentAsins);
                    setAsinInput("");
                }

                if (currentAsins.length === 0) {
                    Toast.error(t("Enter at least one ASIN"));
                    setLoading(false);
                    return;
                }

                payload.asins = currentAsins;
            }

            const res = await ApiCheckASINFromDB(payload);

            if (res?.isSuccess && res?.data) {
                const list = Array.isArray(res.data) ? res.data : [res.data];
                setFetchedProducts(list);
                if (list.length === 0) {
                    Toast.error(t("No products found"));
                }
            } else {
                setFetchedProducts([]);
                Toast.error(res?.message || t("No products found"));
            }

        } catch (err) {
            setFetchedProducts([]);
            Toast.error(t("Search failed"));
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = () => {
        executeSearch();
    };

    // Add product → final Formik list
    const addToFinalList = (product) => {
        const exists = formik.values.products.some((p) => p.asin === product.asin);

        if (exists) {
            Toast.error(t("Product already added"));
            return;
        }

        formik.setFieldValue("products", [
            ...formik.values.products,
            product,
        ]);
    };

    const deleteFinal = (index) => {
        const updated = [...formik.values.products];
        updated.splice(index, 1);
        formik.setFieldValue("products", updated);
    };

    const renderProductCard = (product, index, isFinal = false) => {
        const alreadyAdded = formik.values.products.some(p => p.asin === product.asin);
        return (
            <div key={index} className={`product-row ${isFinal ? 'selected-product-card' : ''}`}>
                <div className="flex items-center gap-3 flex-1">
                    {Boolean(product.imageURL) ? (
                        <img
                            src={product.imageURL}
                            alt={product.itemName}
                            style={{ width: "48px", height: "48px", objectFit: "contain", borderRadius: "6px" }}
                            className="border bg-white"
                        />
                    ) : (
                        <div style={{ width: "48px", height: "48px", background: "var(--theme-bg-soft)", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <i className="fa-solid fa-box text-slate-500 dark:text-slate-400"></i>
                        </div>
                    )}
                    <div>
                        <div className="font-semibold text-wrap truncate" style={{ fontSize: "13px", color: "var(--theme-text-dark)", maxWidth: "250px" }}>{product.itemName}</div>
                        <div className="flex flex-wrap items-center gap-2 mt-1" style={{ fontSize: "11px" }}>
                            <span
                                className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700/80 border border-slate-200/80 dark:border-slate-600 font-bold"
                                title="ASIN"
                            >
                                <FormattedAsin code={product.asin} />
                            </span>
                            {product.sku && (
                                <span
                                    className="font-mono text-slate-500 dark:text-slate-400 truncate max-w-[200px]"
                                    style={{ fontFamily: '"Consolas", "Cascadia Code", "Monaco", monospace' }}
                                    title={`SKU: ${product.sku}`}
                                >
                                    <FormattedAsin code={product.sku} />
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {!isFinal ? (
                    <div className="ml-auto pl-3 text-right flex items-center gap-3">
                        {product.price && <div className="font-semibold" style={{ fontSize: "13px", color: "var(--theme-text-dark)" }}>{currencySymbol}{product.price}</div>}
                        {alreadyAdded ? (
                            <button type="button" className="inline-flex items-center justify-center bg-slate-100 dark:bg-slate-700 text-green-500 rounded-full w-8 h-8 p-0" disabled>
                                <i className="fa-solid fa-check" />
                            </button>
                        ) : (
                            <button type="button" className="inline-flex items-center justify-center border border-blue-500 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-full w-8 h-8 p-0" onClick={() => addToFinalList(product)} title={t("Add Product")}>
                                <i className="fa-solid fa-plus" />
                            </button>
                        )}
                    </div>
                ) : (
                    <>
                        <div className="ml-auto pl-3 text-right flex items-center gap-3">
                            {product.price && <div className="font-semibold" style={{ fontSize: "13px", color: "#2374F2" }}>{currencySymbol}{product.price}</div>}
                        </div>
                        <button type="button" className="inline-flex items-center justify-center bg-slate-100 dark:bg-slate-700 text-red-500 delete-btn-overlay shadow-sm rounded-full w-8 h-8 p-0" onClick={() => deleteFinal(index)} title={t("Remove")}>
                            <i className="fa-solid fa-xmark" />
                        </button>
                    </>
                )}
            </div>
        )
    };

    return (
        <div id="campaign-step-products" className="campaign-step-container">
            <h2 className="flow-title mb-2">{t("Add Products to Campaign")}</h2>
            <p className="flow-subtitle mb-4">{t("Select the products you want to feature in this advertising campaign.")}</p>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                {/* LEFT SECTION — Search & Available Products */}
                <div className="xl:col-span-7 xl:pr-4">
                    <div className="flex gap-2 mb-4">
                        <div className="modern-input-group flex-1 w-full">
                            <i className="fa-solid fa-search modern-input-prefix mt-1"></i>
                            {activeTab === "keyword" ? (
                                <input
                                    type="text"
                                    className="modern-input has-prefix"
                                    placeholder={t("Search Products by Name or SKU")}
                                    value={keyword}
                                    onChange={(e) => setKeyword(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            handleSearch();
                                        }
                                    }}
                                />
                            ) : (
                                <div
                                    className="modern-input flex flex-wrap items-center gap-1.5 p-1.5 min-h-[38px] w-full cursor-text"
                                    style={{ paddingLeft: '32px', height: 'auto', minHeight: '38px' }}
                                    onClick={() => document.getElementById("step-products-asin-input")?.focus()}
                                >
                                    {asinTags.map((tag) => (
                                        <span
                                            key={tag}
                                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider bg-blue-50 dark:bg-slate-700 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-slate-600 shadow-sm"
                                        >
                                            <FormattedAsin code={tag} />
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    removeAsinTag(tag);
                                                }}
                                                className="inline-flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-100 focus:outline-none ml-1 w-3.5 h-3.5 text-xs leading-none cursor-pointer"
                                            >
                                                &times;
                                            </button>
                                        </span>
                                    ))}
                                    <input
                                        id="step-products-asin-input"
                                        type="text"
                                        value={asinInput}
                                        onChange={(e) => setAsinInput(e.target.value)}
                                        onKeyDown={handleAsinKeyDown}
                                        onPaste={handleAsinPaste}
                                        placeholder={asinTags.length === 0 ? t("Enter ASIN(s) and click Search") : ""}
                                        className="asin-tag-input flex-1 text-sm tracking-wider uppercase text-slate-700 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 min-w-[120px]"
                                        style={{
                                            border: 'none',
                                            outline: 'none',
                                            boxShadow: 'none',
                                            background: 'transparent',
                                            padding: '2px 0',
                                            margin: 0,
                                            fontFamily: 'Consolas, "Cascadia Code", "Courier New", monospace',
                                            fontVariantNumeric: 'slashed-zero',
                                            fontFeatureSettings: '"zero" 1'
                                        }}
                                    />
                                </div>
                            )}
                        </div>
                        <button type="button" className="customize-button clicked m-0 gap-0" style={{ height: "36px", display: "inline-flex", alignItems: "center", justifyContent: "center", whiteSpace: "nowrap" }} onClick={handleSearch} disabled={loading}>
                            {loading ? t("Searching...") : t("Search")}
                        </button>
                    </div>

                    <div className="or-tab-switcher w-full mb-3">
                        <div className="or-tab-switcher__track w-full">
                            <div
                                className="or-tab-switcher__indicator"
                                style={{ transform: activeTab === "keyword" ? "translateX(0)" : "translateX(100%)" }}
                            />
                            {[
                                { value: "keyword", label: t("Product Name") },
                                { value: "asin", label: t("ASIN") }
                            ].map((opt) => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    className={`or-tab-switcher__btn flex-1 justify-center ${activeTab === opt.value ? 'or-tab-switcher__btn--active' : ''}`}
                                    onClick={() => setActiveTab(opt.value)}
                                >
                                    <span>{opt.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="modern-card p-0 mt-3 overflow-hidden">
                        <div className="bg-slate-50 dark:bg-slate-800 px-3 py-2 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--theme-text-dark)' }}>{t("Available Products")} <span className="text-slate-500 dark:text-slate-400 font-normal">({fetchedProducts.length} {t("items")})</span></span>
                            <span className="rounded-full px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300" style={{ fontSize: '11px' }}>{t("Sort by: Relevance")}</span>
                        </div>
                        <div className="p-3 bg-white overflow-auto" style={{ maxHeight: "400px" }}>
                            {fetchedProducts.length > 0 ? (
                                fetchedProducts.map((product, index) => renderProductCard(product, index))
                            ) : (
                                <div className="text-center py-5 text-slate-500 dark:text-slate-400" style={{ fontSize: '13px' }}>
                                    <i className="fa-solid fa-box-open text-2xl mb-3 opacity-25"></i>
                                    <p className="mb-0">{t("Search for products to add to your campaign.")}</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* RIGHT section: Selected Products */}
                <div className="xl:col-span-5">
                    {(() => {
                        const hasProductError = Boolean(formik.errors?.products && formik.touched?.products);
                        return (
                            <div
                                className="modern-card h-full flex flex-col"
                                style={{
                                    background: 'var(--theme-bg-light)',
                                    borderColor: hasProductError ? '#ef4444' : 'var(--theme-border)',
                                    boxShadow: hasProductError ? '0 0 0 1px #ef4444' : undefined
                                }}
                            >
                                <div className="flex justify-between items-center mb-1">
                                    <h3 className="card-title m-0">{t("Selected Products")}</h3>
                                    <span className="rounded-full flex items-center justify-center font-bold text-xs" style={{ width: '24px', height: '24px', background: hasProductError ? '#ef4444' : '#2374F2', color: 'white' }}>{formik.values.products.length}</span>
                                </div>
                                <p className="card-subtitle mb-3">{t("Summary of items to be promoted.")}</p>

                                <div className="flex-1 overflow-auto" style={{ maxHeight: "300px" }}>
                                    {formik.values.products.length === 0 ? (
                                        <div className="border border-dashed rounded p-4 text-center flex flex-col items-center justify-center h-full" style={{ borderColor: 'var(--theme-border-alt)', borderStyle: 'dashed' }}>
                                            <i className="fa-regular fa-square-plus text-slate-500 dark:text-slate-400 text-xl mb-2 opacity-50"></i>
                                            <p className="text-slate-500 dark:text-slate-400 mb-0" style={{ fontSize: '12px' }}>{t("Add more products to see them here")}</p>
                                        </div>
                                    ) : (
                                        formik.values.products.map((product, index) =>
                                            renderProductCard(product, index, true)
                                        )
                                    )}
                                </div>

                                {hasProductError && (
                                    <div className="text-red-500 text-xs mt-2 font-medium flex items-center gap-1.5">
                                        <i className="fa-solid fa-circle-exclamation text-red-500"></i>
                                        <span>{typeof formik.errors.products === 'string' ? formik.errors.products : "Please select at least one product."}</span>
                                    </div>
                                )}

                                <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="font-bold" style={{ fontSize: '15px', color: 'var(--theme-text-dark)' }}>{t("Total Products")}</span>
                                        <span className="font-bold" style={{ fontSize: '15px', color: hasProductError ? '#ef4444' : '#2374F2' }}>{formik.values.products.length}</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })()}
                </div>
            </div>
        </div>
    );
};

export default StepProducts;
