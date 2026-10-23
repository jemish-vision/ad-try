import React, { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ProfileContext } from "../../../../../helper/usecontext/useContext";
import FormattedAsin from "../../../../../helper/FormattedAsin";

import { Toast } from "../../../../../helper/links/Link";
import { ApiProductSearchOnAmazon } from "../../../../../api-wrapper/productList/ApiProductList";

const getImageURL = (imgArray) => {
  if (!Array.isArray(imgArray)) return null;
  const marketplace = imgArray?.[0];
  if (!marketplace?.images?.length) return null;
  const mainImage = marketplace.images.find((img) => img.variant === "MAIN");
  return mainImage?.link || null;
};

const renderMatchTypeBadge = (type, t) => {
  let bg = "#f1f5f9";
  let color = "#2374F2";
  const normalized = (type || "").toUpperCase();
  if (normalized === "EXACT" || normalized === "NEGATIVE_EXACT") {
    bg = "#f1f5f9";
    color = "#2374F2";
  } else if (normalized === "PHRASE" || normalized === "NEGATIVE_PHRASE") {
    bg = "#f1f5f9";
    color = "#2374F2";
  }
  const displayText = type.replace("NEGATIVE_", "NEGATIVE ");
  return (
    <span
      className="inline-block rounded-full px-2.5 py-1"
      style={{
        backgroundColor: bg,
        color: color,
        fontSize: "11px",
        fontWeight: "700",
        padding: "4px 10px",
        letterSpacing: "0.5px",
        textTransform: "uppercase",
      }}
    >
      {t ? t(displayText) : displayText}
    </span>
  );
};

const StepNegativeTargeting = ({ formik }) => {
  const { t } = useTranslation();
  const { values, setFieldValue } = formik;
  const { profileId } = useContext(ProfileContext);

  const [negProductSearch, setNegProductSearch] = useState("");
  const [negLoading, setNegLoading] = useState(false);
  const [negProductResults, setNegProductResults] = useState([]);

  const [negInput, setNegInput] = useState("");
  const [negType, setNegType] = useState("NEGATIVE_EXACT");

  const [negProdTab, setNegProdTab] = useState("product");

  const handleNegProductSearch = async (isBrand) => {
    if (!negProductSearch.trim()) {
      Toast.error(t("Please enter a keyword"));
      return;
    }

    setNegLoading(true);
    setNegProductResults([]);
    try {
      const res = await ApiProductSearchOnAmazon({
        keyword: negProductSearch.trim(),
        profileId: profileId?.value,
        ...(isBrand && { brand: negProductSearch.trim() }),
      });
      const products = res?.data?.items || [];
      if (!products.length) {
        Toast.error(t(!isBrand ? "No products found" : "No brands found"));
        return;
      }
      setNegProductResults(products);
    } catch (err) {
      Toast.error(t("Something went wrong"));
    } finally {
      setNegLoading(false);
    }
  };

  const handleAddNagetiveKeyword = () => {
    const lines = negInput
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (!lines.length) {
      Toast.error(t("Please enter at least one keyword"));
      return;
    }

    const updated = [...values.negativeKeywords];
    let addedCount = 0;

    lines.forEach((keyword) => {
      const exists = updated.some(
        (k) =>
          k.keyword.toLowerCase() === keyword.toLowerCase() &&
          k.matchType === negType,
      );
      if (!exists) {
        updated.push({ keyword, matchType: negType });
        addedCount++;
      }
    });

    if (addedCount === 0) {
      Toast.error(t("No new keywords added (duplicates)"));
    } else {
      Toast.success(`${addedCount} ${t("keywords added")}`);
    }

    setFieldValue("negativeKeywords", updated);
    setNegInput("");
  };

  const filteredResults = React.useMemo(() => {
    if (negProdTab === "brand") {
      const uniqueBrands = new Map();

      negProductResults.forEach((p) => {
        const item = p?.summaries?.[0];
        if (!item?.brandName) return;
        if (!uniqueBrands.has(item.brandName))
          uniqueBrands.set(item.brandName, p);
      });

      return Array.from(uniqueBrands.values());
    }

    return negProductResults;
  }, [negProductResults, negProdTab]);

  useEffect(() => {
    if (filteredResults?.length) setNegProductResults([]);
  }, [negProdTab]);

  return (
    <div id="campaign-step-negative" className="campaign-step-container">
      <h2 className="flow-title mb-2">{t("Negative Targeting Configuration")}</h2>
      <p className="flow-subtitle mb-4">
        {t("Prevent your ads from appearing on irrelevant searches or products.")}
      </p>

      {/* Negative Keywords Card */}
      <div className="modern-card p-0 overflow-hidden mb-4">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <h3 className="card-title m-0">{t("Negative Keywords")}</h3>
          <p className="card-subtitle m-0 mt-1">
            {t("Add keywords that you do not want your ads to show up for.")}
          </p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12">
          {/* LEFT SECTION — Input */}
          <div
            className="xl:col-span-7 p-4 border-b xl:border-b-0 xl:border-r border-slate-200 dark:border-slate-700"
            style={{ background: "var(--theme-bg-light)" }}
          >
            <label
              className="modern-label text-slate-500 dark:text-slate-400 mb-2"
              style={{ fontSize: "11px", textTransform: "uppercase" }}
            >
              {t("Match Type")}
            </label>
            <div className="or-tab-switcher w-full mb-4">
              <div className="or-tab-switcher__track w-full">
                <div
                  className="or-tab-switcher__indicator"
                  style={{
                    transform:
                      negType === "NEGATIVE_EXACT"
                        ? "translateX(0)"
                        : "translateX(100%)",
                  }}
                />
                {[
                  { value: "NEGATIVE_EXACT", label: t("Exact") },
                  { value: "NEGATIVE_PHRASE", label: t("Phrase") },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`or-tab-switcher__btn flex-1 justify-center ${negType === opt.value ? "or-tab-switcher__btn--active" : ""}`}
                    onClick={() => setNegType(opt.value)}
                  >
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <label
              className="modern-label text-slate-500 dark:text-slate-400 mb-2"
              style={{ fontSize: "11px", textTransform: "uppercase" }}
            >
              {t("Keywords")}
            </label>
            <textarea
              placeholder={t("Enter keywords separated by new line.")}
              className="modern-input mb-3"
              style={{ height: "150px", resize: "none", lineHeight: "1.6" }}
              value={negInput}
              onChange={(e) => setNegInput(e.target.value)}
            />

            <button
              type="button"
              className="customize-button clicked w-full m-0 gap-0"
              style={{
                height: "36px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                whiteSpace: "nowrap",
              }}
              onClick={handleAddNagetiveKeyword}
            >
              <i className="fa-solid fa-ban pr-1"></i> {t("Add Negative Keywords")}
            </button>
          </div>

          {/* RIGHT SECTION — Added Negative Keywords */}
          <div className="xl:col-span-5 p-4 bg-white dark:bg-slate-900 flex flex-col h-full">
            <div className="flex justify-between items-center mb-3">
              <div>
                <h3 className="card-title m-0">{t("Added Keywords")}</h3>
                <div className="text-slate-500 dark:text-slate-400" style={{ fontSize: "12px" }}>
                  {values.negativeKeywords.length} {t("Keywords Excluded")}
                </div>
              </div>
              {values.negativeKeywords.length > 0 && (
                <span
                  className="text-red-500 cursor-pointer font-semibold"
                  style={{ fontSize: "12px", cursor: "pointer" }}
                  onClick={() => setFieldValue("negativeKeywords", [])}
                >
                  {t("Clear All")}
                </span>
              )}
            </div>

            <div
              className="flex-1 overflow-auto"
              style={{ maxHeight: "350px" }}
            >
              {values.negativeKeywords.length === 0 ? (
                <div className="text-center py-5">
                  <i className="fa-solid fa-list-ul text-2xl text-slate-500 dark:text-slate-400 opacity-25 mb-3"></i>
                  <p className="text-slate-500 dark:text-slate-400 mb-0" style={{ fontSize: "13px" }}>
                    {t("Keywords you add will appear here.")}
                  </p>
                </div>
              ) : (
                <div className="border rounded overflow-hidden">
                  <table className="w-full text-left mb-0" style={{ fontSize: "13px" }}>
                    <thead className="bg-slate-50 dark:bg-slate-800">
                      <tr>
                        <th
                          className="text-slate-500 dark:text-slate-400 font-semibold py-2 pl-3"
                          style={{ fontSize: "11px" }}
                        >
                          {t("KEYWORD & MATCH")}
                        </th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {values.negativeKeywords.map((item, idx) => (
                        <tr key={idx} className="border-b border-slate-100 dark:border-slate-800">
                          <td className="align-middle font-medium pl-3 py-3">
                            <div className="truncate text-slate-800 dark:text-slate-100 mb-1.5">
                              {item.keyword}
                            </div>
                            <div className="mt-1">{renderMatchTypeBadge(item.matchType, t)}</div>
                          </td>
                          <td className="align-middle text-right pr-3 py-3">
                            <button
                              type="button"
                              className="text-red-500 hover:text-red-700 p-1"
                              onClick={() =>
                                setFieldValue(
                                  "negativeKeywords",
                                  values.negativeKeywords.filter(
                                    (_, i) => i !== idx,
                                  ),
                                )
                              }
                            >
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

      {/* Negative Products Card */}
      <div className="modern-card p-0 overflow-hidden mb-4">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <h3 className="card-title m-0">{t("Negative Products")}</h3>
          <p className="card-subtitle m-0 mt-1">
            {t("Exclude specific products or brands from your targeting.")}
          </p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12">
          {/* LEFT SECTION — Search & Available Negative Products */}
          <div
            className="xl:col-span-7 p-4 border-b xl:border-b-0 xl:border-r border-slate-200 dark:border-slate-700"
            style={{ background: "var(--theme-bg-light)" }}
          >
            <div className="or-tab-switcher w-full mb-3">
              <div className="or-tab-switcher__track w-full">
                <div
                  className="or-tab-switcher__indicator"
                  style={{
                    transform:
                      negProdTab === "brand"
                        ? "translateX(0)"
                        : "translateX(100%)",
                  }}
                />
                {[
                  { value: "brand", label: t("Brand") },
                  { value: "product", label: t("Product") },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`or-tab-switcher__btn flex-1 justify-center ${negProdTab === opt.value ? "or-tab-switcher__btn--active" : ""}`}
                    onClick={() => setNegProdTab(opt.value)}
                  >
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 mb-4">
              <div className="modern-input-group flex-1">
                <i className="fa-solid fa-search modern-input-prefix mt-1"></i>
                <input
                  type="text"
                  className="modern-input has-prefix"
                  placeholder={t(negProdTab === "brand" ? "Search by brand names" : "Search by product names or ASINs")}
                  value={negProductSearch}
                  onChange={(e) => setNegProductSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleNegProductSearch(negProdTab === "brand");
                    }
                  }}
                />
              </div>

              <button
                type="button"
                className="customize-button clicked m-0 gap-0"
                style={{
                  height: "36px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  whiteSpace: "nowrap",
                }}
                onClick={() => handleNegProductSearch(negProdTab === "brand")}
                disabled={negLoading}
              >
                <i className="fa-solid fa-search pr-1"></i>{" "}
                {negLoading ? t("Searching...") : t("Search")}
              </button>
            </div>

            <div className="modern-card p-0 overflow-hidden">
              <div className="bg-slate-50 dark:bg-slate-800 px-3 py-2 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                <span
                  style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "var(--theme-text-dark)",
                  }}
                >
                  {t("Search Results")}{" "}
                  {filteredResults.length > 0 && `(${filteredResults.length})`}
                </span>
              </div>
              <div
                className="p-3 bg-white overflow-auto"
                style={{ maxHeight: "350px" }}
              >
                {filteredResults.length > 0 ? (
                  filteredResults.map((product, idx) => {
                    const item = product?.summaries?.[0] ?? {};
                    const exists = values?.negativeProducts.some(
                      (p) =>
                        p?.product.asin === product.asin &&
                        p.type === negProdTab,
                    );

                    return (
                      <div
                        key={idx}
                        className="p-2 mb-2 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 flex items-center gap-3 shadow-sm"
                      >
                        {negProdTab === "product" &&
                        Boolean(getImageURL(product?.images)) ? (
                          <img
                            src={getImageURL(product?.images)}
                            alt=""
                            style={{
                              width: "40px",
                              height: "40px",
                              objectFit: "contain",
                              borderRadius: "4px",
                            }}
                            className="border"
                          />
                        ) : (
                          <div
                            style={{
                              width: "40px",
                              height: "40px",
                              background: "var(--theme-bg-soft)",
                              borderRadius: "4px",
                            }}
                            className="flex items-center justify-center text-slate-500 dark:text-slate-400"
                          >
                            <i
                              className={`fa-solid ${negProdTab === "brand" ? "fa-tags" : "fa-box"}`}
                            ></i>
                          </div>
                        )}
                        <div className="flex-1 truncate">
                          <div
                            className="font-semibold truncate"
                            style={{
                              fontSize: "13px",
                              color: "var(--theme-text-dark)",
                              width: "400px",
                            }}
                          >
                            {negProdTab === "brand"
                              ? `${t("Brand")}: ${item?.brandName}`
                              : item?.itemName || product.asin}
                          </div>
                          {negProdTab === "product" && (
                            <div
                              className="mt-1"
                              style={{ fontSize: "11px" }}
                            >
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 font-bold">
                                <FormattedAsin code={product.asin} />
                              </span>
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          className="inline-flex items-center justify-center text-xs font-semibold"
                          style={{
                            borderRadius: "6px",
                            width: "32px",
                            height: "32px",
                            padding: 0,
                            color: exists ? "#10b981" : "#ef4444",
                            background: exists ? "#d1fae5" : "#fee2e2",
                            border: "none",
                          }}
                          onClick={() =>
                            !exists &&
                            setFieldValue("negativeProducts", [
                              ...values?.negativeProducts,
                              { type: negProdTab, product },
                            ])
                          }
                          disabled={exists}
                        >
                          <i
                            className={`fa-solid ${exists ? "fa-check" : "fa-plus"}`}
                          ></i>
                        </button>
                      </div>
                    );
                  })
                ) : (
                  <div
                    className="text-center py-5 text-slate-500 dark:text-slate-400"
                    style={{ fontSize: "13px" }}
                  >
                    <i className="fa-solid fa-search text-2xl mb-3 opacity-25"></i>
                    <p className="mb-0">{negProdTab === "brand" ? t("Search for brands to exclude.") : t("Search for products to exclude.")}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT SECTION — Added Negative Products */}
          <div className="xl:col-span-5 p-4 bg-white dark:bg-slate-900 h-full flex flex-col">
            <div className="flex justify-between items-center mb-3">
              <div>
                <h3 className="card-title m-0">{t("Excluded Products")}</h3>
                <div className="text-slate-500 dark:text-slate-400" style={{ fontSize: "12px" }}>
                  {values.negativeProducts.length} {t("Products Excluded")}
                </div>
              </div>
              {values.negativeProducts.length > 0 && (
                <span
                  className="text-red-500 cursor-pointer font-semibold"
                  style={{ fontSize: "12px" }}
                  onClick={() => setFieldValue("negativeProducts", [])}
                >
                  {t("Remove All")}
                </span>
              )}
            </div>

            <div
              className="flex-1 overflow-auto"
              style={{ maxHeight: "450px" }}
            >
              {values.negativeProducts.length === 0 ? (
                <div
                  className="border border-dashed rounded p-4 text-center flex flex-col items-center justify-center h-full"
                  style={{
                    borderColor: "var(--theme-border-alt)",
                    borderStyle: "dashed",
                  }}
                >
                  <i className="fa-solid fa-box-open text-slate-500 dark:text-slate-400 text-2xl mb-3 opacity-25"></i>
                  <p className="text-slate-500 dark:text-slate-400 mb-0" style={{ fontSize: "13px" }}>
                    {t("Products you exclude will appear here.")}
                  </p>
                </div>
              ) : (
                <div className="border rounded overflow-hidden">
                  <table className="w-full text-left mb-0" style={{ fontSize: "13px" }}>
                    <thead className="bg-slate-50 dark:bg-slate-800">
                      <tr>
                        <th
                          className="text-slate-500 dark:text-slate-400 font-semibold py-3 pl-3"
                          style={{ fontSize: "11px" }}
                        >
                          {t("ITEM")}
                        </th>
                        <th className="pr-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {(values.negativeProducts || []).map((item, idx) => (
                        <tr key={idx} className="border-b border-slate-100 dark:border-slate-800">
                          <td className="align-middle font-medium pl-3 py-3">
                            <div
                              className="truncate text-slate-800 dark:text-slate-100 mb-1.5"
                              style={{ maxWidth: "180px" }}
                            >
                              {item?.type === "brand" ? (
                                <span>
                                  <b>{t("Brand")}:</b>{" "}
                                  {item?.product?.summaries?.[0]?.brandName}
                                </span>
                              ) : (
                                <span>
                                  {item?.product?.summaries?.[0]?.itemName ||
                                    item?.product?.asin}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              {item?.type !== "brand" && (
                                <span
                                  className="text-slate-500 dark:text-slate-400 font-normal"
                                  style={{ fontSize: "11px" }}
                                >
                                  {item?.product?.asin}
                                </span>
                              )}
                              <div className="mt-1">
                                {renderMatchTypeBadge(
                                  item?.type === "brand" ? "Brand" : "Product",
                                  t
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="align-middle text-right pr-3 py-3">
                            <button
                              type="button"
                              className="text-red-500 hover:text-red-700 p-1"
                              style={{
                                borderRadius: "20px",
                                width: "32px",
                                height: "32px",
                                padding: 0,
                              }}
                              onClick={() =>
                                setFieldValue(
                                  "negativeProducts",
                                  values?.negativeProducts.filter(
                                    (_, i) => i !== idx,
                                  ),
                                )
                              }
                            >
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
    </div>
  );
};

export default StepNegativeTargeting;
