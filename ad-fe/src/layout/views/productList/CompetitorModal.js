// CompetitorModal.jsx
import React, { useState, useEffect, useRef, useCallback, useContext } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { ApiGetCompetitorsBrands, ApiGetCompetitorsLists } from "../../../api-wrapper/productList/ApiProductList";
import Toast from "../../../common/helper/toast/Toast";
import { useTranslation } from "react-i18next";
import { ProfileContext } from "../../../helper/usecontext/useContext";
import { getCurrencySymbol } from "../../../helper/currencyCode/CurrencyCode";


// ── Default filter state ───────────────────────────────────────────────────────
const DEFAULT_FILTERS = {
    minPrice: "",
    maxPrice: "",
    selectedBrands: [],
    fieldName: "price",
    sortOrder: 1,
};

// ── Count how many filters differ from defaults ────────────────────────────────
const countAppliedFilters = (filters) => {
    let count = 0;
    if (filters.minPrice !== "") count++;
    if (filters.maxPrice !== "") count++;
    if (filters.selectedBrands.length > 0) count++;
    // Sort: anything other than default (price asc) counts
    if (filters.fieldName !== "price" || filters.sortOrder !== 1) count++;
    return count;
};

function CompetitorModal({ isOpen, onClose, profileId, asin }) {
    const { t } = useTranslation();
    const { currencyCode } = useContext(ProfileContext);

    // ── Products Tab State ────────────────────────────────────────────────────
    const [productsLoading, setProductsLoading] = useState(false);
    const [productsLoadingMore, setProductsLoadingMore] = useState(false);
    const [productsData, setProductsData] = useState(null);
    const [allProducts, setAllProducts] = useState([]);
    const [productsCurrentPage, setProductsCurrentPage] = useState(1);
    const [productsHasMore, setProductsHasMore] = useState(true);
    const [selectedProduct, setSelectedProduct] = useState(null);

    // ── Brands Tab State ──────────────────────────────────────────────────────
    const [brandsLoading, setBrandsLoading] = useState(false);
    const [brandsData, setBrandsData] = useState(null);
    const [selectedBrand, setSelectedBrand] = useState(null);
    const [brandProducts, setBrandProducts] = useState([]);
    const [brandProductsCurrentPage, setBrandProductsCurrentPage] = useState(1);
    const [brandProductsHasMore, setBrandProductsHasMore] = useState(true);
    const [brandProductsLoadingMore, setBrandProductsLoadingMore] = useState(false);
    const [selectedBrandProduct, setSelectedBrandProduct] = useState(null);

    const [activeTab, setActiveTab] = useState("products");

    // ── Applied filters (used in API calls) ───────────────────────────────────
    const [filters, setFilters] = useState({ ...DEFAULT_FILTERS });

    // ── Filter Modal State ────────────────────────────────────────────────────
    const [showFilterModal, setShowFilterModal] = useState(false);
    // Draft = what the user is editing inside filter modal (not yet applied)
    const [draftFilters, setDraftFilters] = useState({ ...DEFAULT_FILTERS });

    // ── Derived flags ─────────────────────────────────────────────────────────
    const showProductDetail = !!selectedProduct;
    const showBrandProducts = !!selectedBrand && !selectedBrandProduct;
    const showBrandProductDetail = !!selectedBrandProduct;
    const isDrillDown = showProductDetail || showBrandProducts || showBrandProductDetail;
    const appliedFilterCount = countAppliedFilters(filters);

    // ── Effects ──────────────────────────────────────────Filter & Sort─────────────────────
    useEffect(() => {
        if (isOpen && asin && profileId) {
            if (activeTab === "products") fetchProducts();
            else if (!selectedBrand) fetchBrands();
        } else {
            resetAll();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, asin, profileId, activeTab, selectedBrand]);

    // ── Resets ────────────────────────────────────────────────────────────────
    const resetAll = () => {
        setProductsData(null);
        setAllProducts([]);
        setProductsCurrentPage(1);
        setProductsHasMore(true);
        setSelectedProduct(null);
        setBrandsData(null);
        setSelectedBrand(null);
        setBrandProducts([]);
        setBrandProductsCurrentPage(1);
        setBrandProductsHasMore(true);
        setSelectedBrandProduct(null);
        setFilters({ ...DEFAULT_FILTERS });
        setDraftFilters({ ...DEFAULT_FILTERS });
    };

    // ── API calls ─────────────────────────────────────────────────────────────
    const fetchProducts = async (isLoadMore = false, page = 1, overrideFilters = null) => {
        const f = overrideFilters || filters;
        isLoadMore ? setProductsLoadingMore(true) : setProductsLoading(true);
        try {
            const body = {
                profileId,
                asin,
                page,
                limit: 10,
                fieldName: f.fieldName,
                sortOrder: f.sortOrder,
                ...(f.minPrice && { minPrice: Number(f.minPrice) }),
                ...(f.maxPrice && { maxPrice: Number(f.maxPrice) }),
                ...(f.selectedBrands.length > 0 && { brands: f.selectedBrands }),
            };
            const res = await ApiGetCompetitorsLists(body);
            if (res?.isSuccess) {
                const lists = res.data.lists || [];
                if (isLoadMore) {
                    setAllProducts(p => [...p, ...lists]);
                } else {
                    setProductsData(res.data);
                    setAllProducts(lists);
                }
                setProductsCurrentPage(res.data.currentPage);
                setProductsHasMore(res.data.currentPage < res.data.totalPages);
            } else {
                Toast.error(res?.message || t("Failed to fetch products"));
            }
        } catch {
            Toast.error(t("Something went wrong while fetching products"));
        } finally {
            isLoadMore ? setProductsLoadingMore(false) : setProductsLoading(false);
        }
    };

    const fetchBrands = async () => {
        setBrandsLoading(true);
        try {
            const res = await ApiGetCompetitorsBrands({ profileId, asin });
            if (res?.isSuccess) setBrandsData(res.data);
            else Toast.error(res?.message || t("Failed to fetch brands"));
        } catch {
            Toast.error(t("Something went wrong while fetching brands"));
        } finally {
            setBrandsLoading(false);
        }
    };

    const fetchBrandProducts = async (brandName, isLoadMore = false, page = 1, overrideFilters = null) => {
        const f = overrideFilters || filters;
        isLoadMore ? setBrandProductsLoadingMore(true) : setBrandsLoading(true);
        try {
            const body = {
                profileId,
                asin,
                brands: [brandName],
                page,
                limit: 10,
                fieldName: f.fieldName,
                sortOrder: f.sortOrder,
                ...(f.minPrice && { minPrice: Number(f.minPrice) }),
                ...(f.maxPrice && { maxPrice: Number(f.maxPrice) }),
            };
            const res = await ApiGetCompetitorsLists(body);
            if (res?.isSuccess) {
                const lists = res.data.lists || [];
                isLoadMore ? setBrandProducts(p => [...p, ...lists]) : setBrandProducts(lists);
                setBrandProductsCurrentPage(res.data.currentPage);
                setBrandProductsHasMore(res.data.currentPage < res.data.totalPages);
            } else {
                Toast.error(res?.message || t("Failed to fetch brand products"));
            }
        } catch {
            Toast.error(t("Something went wrong while fetching brand products"));
        } finally {
            isLoadMore ? setBrandProductsLoadingMore(false) : setBrandsLoading(false);
        }
    };

    // ── Filter Modal handlers ─────────────────────────────────────────────────
    const handleOpenFilterModal = () => {
        // Sync draft with currently applied filters
        setDraftFilters({ ...filters });
        setShowFilterModal(true);
    };

    const handleCloseFilterModal = () => setShowFilterModal(false);

    const handleApplyFilters = () => {
        setFilters({ ...draftFilters });
        setShowFilterModal(false);

        // Reset pagination and re-fetch with new filters
        setProductsCurrentPage(1);
        setProductsHasMore(true);
        setBrandProductsCurrentPage(1);
        setBrandProductsHasMore(true);

        setProductsLoading(true);
        setProductsData(null);
        setAllProducts([]);
        setBrandProducts([]);

        if (activeTab === "products") {
            fetchProducts(false, 1, draftFilters);
        } else if (selectedBrand) {
            fetchBrandProducts(selectedBrand.brand, false, 1, draftFilters);
        }
    };

    const handleResetFilters = () => {
        setDraftFilters({ ...DEFAULT_FILTERS });
    };

    const handleToggleDraftBrand = (brandName) => {
        setDraftFilters(prev => {
            const already = prev.selectedBrands.includes(brandName);
            return {
                ...prev,
                selectedBrands: already
                    ? prev.selectedBrands.filter(b => b !== brandName)
                    : [...prev.selectedBrands, brandName],
            };
        });
    };

    // ── Event handlers ────────────────────────────────────────────────────────
    const handleViewOnAmazon = (productAsin, e) => {
        e?.stopPropagation();
        window.open(`https://www.amazon.in/dp/${productAsin}`, "_blank");
    };

    const handleBrandClick = async (brand) => {
        setSelectedBrand(brand);
        await fetchBrandProducts(brand.brand);
    };

    const handleBackToBrands = () => {
        setSelectedBrand(null);
        setBrandProducts([]);
        setBrandProductsCurrentPage(1);
        setBrandProductsHasMore(true);
        setSelectedBrandProduct(null);
    };

    // ── Helpers ───────────────────────────────────────────────────────────────
    const formatPrice = (price) =>
        price ? `${price.currency} ${price?.amount?.toLocaleString()}` : t("N/A");

    const handleImageError = (e) => {
        e.target.src = "https://via.placeholder.com/88x88?text=N/A";
        e.target.onerror = null;
    };

    // ── Sort label helper ─────────────────────────────────────────────────────
    const getSortLabel = (fieldName, sortOrder) => {
        if (fieldName === "price") return sortOrder === 1 ? t("Price: Low to High") : t("Price: High to Low");
        return t("Custom");
    };

    // ── Micro-components ──────────────────────────────────────────────────────
    const LoadingState = ({ text = t("Loading..."), textHide }) => (
        <div className="text-center py-10 flex flex-col items-center justify-center">
            <div className="w-8 h-8 border-3 border-slate-100 border-t-sky-500 dark:border-white/5 dark:border-t-[#38bdf8] rounded-full animate-spin mb-3" style={{ borderTopColor: "var(--accent-primary)" }} />
            {!textHide && <span className="text-sm text-slate-500 dark:text-white/50">{text}</span>}
        </div>
    );

    const EmptyState = ({ text = t("No data available"), type = "default" }) => (
        <div className="beautiful-empty-state">
            <div className="beautiful-empty-icon-wrapper">
                {type === "products" ? (
                    <i className="fa fa-box-open beautiful-empty-icon" />
                ) : type === "brands" ? (
                    <i className="fa fa-building-slash beautiful-empty-icon" />
                ) : (
                    <i className="fa fa-inbox beautiful-empty-icon" />
                )}
            </div>
            <h4 className="beautiful-empty-title">
                {type === "products" ? t("No Products Found") : type === "brands" ? t("No Brands Found") : t("No Data")}
            </h4>
            <p className="beautiful-empty-subtitle">{text}</p>
        </div>
    );

    // ── Filter Button ─────────────────────────────────────────────────────────
    const FilterButton = () => (
        <button
            className="filter-trigger-btn"
            onClick={handleOpenFilterModal}
            title={t("Filters & Sorting")}
        >
            <i className="fa fa-sliders filter-trigger-icon" />
            <span>{t("Filter & Sort")}</span>
            {appliedFilterCount > 0 && (
                <span className="filter-badge">{appliedFilterCount}</span>
            )}
        </button>
    );


    // Reusable horizontal product card
    const ProductCard = ({ product, onClick, refProp }) => (
        <div
            ref={refProp}
            className="product-card-hover product-card"
            onClick={() => onClick(product)}
        >
            {/* Thumbnail */}
            <div className="product-img">
                {product.imageUrl ? (
                    <img
                        src={product.imageUrl}
                        alt={product.name}
                        onError={handleImageError}
                        loading="lazy"
                        className="product-thumbnail"
                    />
                ) : (
                    <i className="fa fa-image product-placeholder-icon" />
                )}
            </div>

            {/* Centre info */}
            <div className="product-info">
                <p className="product-name">{product.name}</p>

                <div className="badge-row">
                    <span className="rank-badge">#{product.salesRankOverall?.toLocaleString() || t("N/A")}</span>
                    {product.salesRankCategoryName && (
                        <span className="cat-badge">{product.salesRankCategoryName}</span>
                    )}
                    {product.brand && <span className="brand-badge">{product.brand}</span>}
                </div>

                <div className="spec-row">
                    {product.size && <span className="spec"><i className="fa fa-arrows-alt spec-icon" />{product.size}</span>}
                    {product.form && <span className="spec"><i className="fa fa-tint spec-icon" />{product.form}</span>}
                    {product.weight && <span className="spec"><i className="fa fa-weight-hanging spec-icon" />{product.weight} {product.weightUnit}</span>}
                </div>

                {product.ingredients && product.ingredients !== "N/A" && (
                    <p className="ingredients-prev">
                        <i className="fa fa-leaf ingredients-icon" />
                        {product.ingredients.length > 90
                            ? `${product.ingredients.substring(0, 90)}…`
                            : product.ingredients}
                    </p>
                )}
            </div>

            {/* Right: price + CTA */}
            <div className="product-right">
                <div style={{ textAlign: "end" }}>
                    <p className="price">{formatPrice(product.price)}</p>
                    {product.price?.amount && product.unitValue && product.unitType && (
                        <p className="per-unit">
                            {getCurrencySymbol(product.price?.currency || currencyCode)}{(product.price.amount / product.unitValue).toFixed(2)}/{product.unitType}
                        </p>
                    )}
                </div>
                <button
                    className="inline-flex items-center gap-1 h-6 px-2.5 rounded-[6px] border border-slate-200 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5 bg-white dark:bg-[#1e293b] text-slate-700 dark:text-slate-300 transition-colors text-[10px] font-semibold"
                    onClick={(e) => handleViewOnAmazon(product.asin, e)}
                    title={t("View on Amazon")}
                >
                    <i className="fa-brands fa-amazon text-[10px] text-amber-500 mr-1" />{t("Amazon")}
                </button>
            </div>
        </div>
    );

    const BrandCard = ({ brand, onClick }) => (
        <div
            className="brand-card-hover brand-card"
            onClick={() => onClick(brand)}
        >
            <div className="brand-icon">
                <i className="fa fa-building" />
            </div>
            <div className="brand-info">
                <p className="brand-name">{brand.brand}</p>
                <p className="brand-count">
                    <i className="fa fa-box brand-count-icon" />
                    {t("{{count}} Products", { count: brand?.count })}
                </p>
            </div>
            <div className="brand-chevron">
                <i className="fa fa-chevron-right" />
            </div>
        </div>
    );

    const ProductDetailView = ({ product, onBack }) => (
        <div className="product-detail-view">
            <button
                type="button"
                onClick={onBack}
                className="back-button-hover back-button px-3 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
                <i className="fa fa-arrow-left back-icon" />{t("Back")}
            </button>

            <div className="detail-card">
                {/* Image */}
                <div className="detail-img-wrap">
                    {product.imageUrl ? (
                        <img
                            src={product.imageUrl}
                            alt={product.name}
                            onError={handleImageError}
                            className="detail-image"
                        />
                    ) : (
                        <div className="detail-placeholder">
                            <i className="fa fa-image detail-placeholder-icon" />
                        </div>
                    )}
                </div>

                {/* Content */}
                <div className="detail-content">
                    <p className="detail-title">{product.name}</p>

                    <div className="badge-row">
                        {product.brand && (
                            <span className="brand-badge">
                                <i className="fa fa-building badge-icon" />{product.brand}
                            </span>
                        )}
                        <span className="rank-badge">#{product.salesRankOverall?.toLocaleString() || t("N/A")}</span>
                        <span className="cat-badge">{product.asin}</span>
                    </div>

                    <div className="detail-grid">
                        {[
                            [t("Category"), product.salesRankCategoryName],
                            [t("Cat. Rank"), product.salesRankCategory ? `#${product.salesRankCategory.toLocaleString()}` : null],
                            [t("Size"), product.size],
                            [t("Form"), product.form],
                            [t("Weight"), product.weight ? `${product.weight} ${product.weightUnit}` : null],
                            [t("Diet Type"), product.dietType],
                            [t("Vegetarian"), product.isVegetarian != null ? (product.isVegetarian ? t("Yes") : t("No")) : null],
                        ].filter(([, v]) => v).map(([label, val]) => (
                            <div key={label} className="detail-row">
                                <span className="detail-label">{label}:</span>
                                <span className="detail-value">{val}</span>
                            </div>
                        ))}
                    </div>

                    {product.ingredients && (
                        <div className="ingredients-section">
                            <p className="section-label">
                                <i className="fa fa-flask section-icon" />{t("Ingredients")}
                            </p>
                            <p className="ingredients-full">{product.ingredients}</p>
                        </div>
                    )}

                    {product.allergens?.length > 0 && (
                        <div className="allergens-section">
                            <p className="section-label">
                                <i className="fa fa-exclamation-triangle allergens-icon" />
                                {t("Allergens")}
                            </p>
                            <div className="badge-row">
                                {product.allergens.map((a, i) => (
                                    <span key={i} className="allergen-tag">{a}</span>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="detail-footer">
                        <div>
                            <span className="detail-label">{t("Price")}</span>
                            <p className="detail-price">{formatPrice(product.price)}</p>
                        </div>
                        <button
                            type="button"
                            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5 bg-white dark:bg-[#1e293b] text-slate-700 dark:text-slate-300 transition-colors text-xs font-semibold"
                            onClick={() => handleViewOnAmazon(product.asin)}
                        >
                            <i className="fa-brands fa-amazon text-xs text-amber-500" />{t("View on Amazon")}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );

    const AppliedFilterChips = () => {
        if (appliedFilterCount === 0) return null;
        const sym = getCurrencySymbol(currencyCode);
        return (
            <div className="applied-chips-row">
                {filters.minPrice && (
                    <span className="applied-chip">
                        {t("Min")} {sym}{filters.minPrice}
                        <button className="chip-remove" onClick={() => {
                            const f = { ...filters, minPrice: "" };
                            setFilters(f);
                            fetchProducts(false, 1, f);
                        }}>×</button>
                    </span>
                )}
                {filters.maxPrice && (
                    <span className="applied-chip">
                        {t("Max")} {sym}{filters.maxPrice}
                        <button className="chip-remove" onClick={() => {
                            const f = { ...filters, maxPrice: "" };
                            setFilters(f);
                            fetchProducts(false, 1, f);
                        }}>×</button>
                    </span>
                )}
                {filters.selectedBrands.map(b => (
                    <span key={b} className="applied-chip">
                        {b}
                        <button className="chip-remove" onClick={() => {
                            const f = { ...filters, selectedBrands: filters.selectedBrands.filter(x => x !== b) };
                            setFilters(f);
                            fetchProducts(false, 1, f);
                        }}>×</button>
                    </span>
                ))}
                {(filters.fieldName !== "price" || filters.sortOrder !== 1) && (
                    <span className="applied-chip">
                        {getSortLabel(filters.fieldName, filters.sortOrder)}
                        <button className="chip-remove" onClick={() => {
                            const f = { ...filters, fieldName: "price", sortOrder: 1 };
                            setFilters(f);
                            fetchProducts(false, 1, f);
                        }}>×</button>
                    </span>
                )}
            </div>
        );
    };

    // ── Tab renderers ─────────────────────────────────────────────────────────
    const renderProductsTab = () => {
        if (showProductDetail)
            return <ProductDetailView product={selectedProduct} onBack={() => setSelectedProduct(null)} />;
        if (productsLoading && !productsData)
            return <LoadingState text={t("Loading products...")} />;
        if (!productsData)
            return <EmptyState text={t("No products available")} type="products" />;
        return (
            <>
                <div className="list-header-row flex justify-between items-center">
                    <AppliedFilterChips />
                    <p className="list-meta">
                        <i className="fa fa-box list-meta-icon" />
                        {t("{{count}} products found", { count: productsData?.totalRecords || allProducts?.filter(x => x?.price)?.length })}
                    </p>
                </div>
                <div className="products-list">
                    {allProducts?.filter(x => x?.price)?.map((product, index) => (
                        <ProductCard
                            key={`${product.asin}_${index}`}
                            product={product?.amazonData}
                            onClick={setSelectedProduct}
                        />
                    ))}
                    {productsLoadingMore && <LoadingState text={t("Loading more products...")} />}
                    {productsHasMore && allProducts.length > 0 && !productsLoadingMore && (
                        <div className="text-center mt-3 mb-3">
                            <button type="button" className="customize-button clicked h-8 px-4 m-0 gap-0 btn-campaign-primary font-semibold text-xs" onClick={() => fetchProducts(true, productsCurrentPage + 1)}>
                                {t("Load More")}
                            </button>
                        </div>
                    )}
                    {!productsHasMore && allProducts.length > 0 && (
                        <p className="end-msg">
                            <i className="fa fa-check-circle end-msg-icon" />{t("All products loaded")}
                        </p>
                    )}
                </div>
            </>
        );
    };

    const renderBrandsTab = () => {
        if (showBrandProductDetail)
            return <ProductDetailView product={selectedBrandProduct} onBack={() => setSelectedBrandProduct(null)} />;

        if (showBrandProducts) {
            if (brandsLoading && !brandProducts.length)
                return <LoadingState text={t("Loading {{brand}} products...", { brand: selectedBrand?.brand })} />;
            return (
                <>
                    <div className="brand-products-header">
                        <button
                            type="button"
                            onClick={handleBackToBrands}
                            className="back-button-hover back-button px-3 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                        >
                            <i className="fa fa-arrow-left back-icon" />{t("Brands")}
                        </button>
                        <div className="brand-title-section">
                            <span className="brand-title">{selectedBrand?.brand}</span>
                            <span className="brand-product-count">— {t("{{count}} products", { count: selectedBrand?.count })}</span>
                        </div>
                    </div>
                    {brandProducts?.filter(x => x?.price && x?.price)?.map((product, index) => (
                        <ProductCard
                            key={`${product.asin}_${index}`}
                            product={product?.amazonData}
                            onClick={setSelectedBrandProduct}
                        />
                    ))}
                    {brandProductsLoadingMore && <LoadingState text={t("Loading more products...")} />}
                    {brandProductsHasMore && brandProducts.length > 0 && !brandProductsLoadingMore && (
                        <div className="text-center mt-3 mb-3">
                            <button type="button" className="customize-button clicked h-8 px-4 m-0 gap-0 btn-campaign-primary font-semibold text-xs" onClick={() => fetchBrandProducts(selectedBrand.brand, true, brandProductsCurrentPage + 1)}>
                                {t("Load More")}
                            </button>
                        </div>
                    )}
                    {!brandProductsHasMore && brandProducts.length > 0 && (
                        <p className="end-msg">
                            <i className="fa fa-check-circle end-msg-icon" />{t("All products loaded")}
                        </p>
                    )}
                </>
            );
        }

        if (brandsLoading && !brandsData) return <LoadingState text={t("Loading brands...")} />;
        if (!brandsData) return <EmptyState text={t("No brands available")} type="brands" />;

        return (
            <>
                <p className="list-meta">
                    <i className="fa fa-building list-meta-icon" />
                    {t("{{count}} competing brands — click to explore products", { count: brandsData?.length || 0 })}
                </p>
                <div className="brands-list">
                    {brandsData?.map((brand, index) => (
                        <BrandCard key={index} brand={brand} onClick={handleBrandClick} />
                    ))}
                </div>
            </>
        );
    };

    const availableBrands = brandsData || [];
    const draftFilterCount = countAppliedFilters(draftFilters);

    return (
        <>
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent style={{ overflow: "hidden" }} className="max-w-[1000px] w-[95vw] p-8 rounded-[24px] bg-white text-slate-900 border border-slate-200/80 shadow-[0_20px_50px_rgba(0,0,0,0.1)] dark:bg-[#0c1222]/90 dark:backdrop-blur-[24px] dark:border-white/10 dark:shadow-[0_36px_100px_rgba(0,0,0,0.62)] overflow-hidden dark:text-white flex flex-col max-h-[90vh] [&>button]:border [&>button]:border-slate-200 dark:[&>button]:border-white/10 [&>button]:bg-slate-50 dark:[&>button]:bg-white/5 [&>button]:text-slate-500 dark:[&>button]:text-white/70 hover:[&>button]:text-slate-900 dark:hover:[&>button]:text-white [&>button]:rounded-full [&>button]:p-1.5 [&>button]:transition-all">
                {/* Circuit top glow line indicator */}
                <div 
                    className="absolute top-0 left-0 right-0 h-[1.5px] pointer-events-none"
                    style={{
                        background: "linear-gradient(90deg, transparent 0%, #2374F2 25%, #3ECFA8 60%, #7c64ff 80%, transparent 100%)",
                        opacity: 0.8
                    }}
                />

                <DialogHeader className="p-0 shrink-0 mb-6 text-left border-b-0">
                    <div className="header-left flex items-center gap-3">
                        <div className="header-icon-wrapper bg-blue-500/10 border border-blue-500/20 text-blue-500 dark:text-blue-400 p-2.5 rounded-xl flex items-center justify-center flex-shrink-0">
                            <i className="fa fa-chart-line header-icon text-base" />
                        </div>
                        <div>
                            <DialogTitle className="modal-title-custom text-lg font-bold text-slate-900 dark:text-white leading-tight">
                                {t("Competitor Analysis")}
                            </DialogTitle>
                            {!isDrillDown && (
                                <p className="header-subtitle text-xs text-slate-500 dark:text-white/50 font-medium mt-0.5">{t("Analyze competitors & their products")}</p>
                            )}
                        </div>
                    </div>
                </DialogHeader>

                {!isDrillDown ? (
                    <div className="tabs-header-wrapper flex justify-between items-center mb-4 border-b border-slate-200 dark:border-white/10 shrink-0">
                        <div className="flex space-x-4">
                            <button
                                onClick={() => setActiveTab("products")}
                                className={`pb-2 px-1 text-sm font-medium transition-colors ${activeTab === "products" ? "border-b-2 border-[var(--accent-primary)] text-[var(--accent-primary)]" : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"}`}
                            >
                                <i className="fa fa-box tab-icon mr-2" />{t("Products")}
                            </button>
                            <button
                                onClick={() => setActiveTab("brands")}
                                className={`pb-2 px-1 text-sm font-medium transition-colors ${activeTab === "brands" ? "border-b-2 border-[var(--accent-primary)] text-[var(--accent-primary)]" : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"}`}
                            >
                                <i className="fa fa-building tab-icon mr-2" />{t("Brands")}
                            </button>
                        </div>
                        <div className="filter-button-wrapper pb-2">
                            {activeTab === "products" && <FilterButton />}
                        </div>
                    </div>
                ) : null}

                <div className="competitor-modal-body flex-1 min-h-0 overflow-y-auto pr-1.5 relative">
                    <div className="tab-content-wrapper">
                        {!isDrillDown ? (
                            activeTab === "products" ? renderProductsTab() : renderBrandsTab()
                        ) : activeTab === "products" ? renderProductsTab() : renderBrandsTab()}
                    </div>
                </div>
            </DialogContent>
        </Dialog>

        {/* Filter Dialog - rendered separately if needed, but handled inside main container for now */}
        <Dialog open={showFilterModal} onOpenChange={handleCloseFilterModal}>
            <DialogContent className="max-w-[400px] p-0 gap-0 overflow-hidden bg-white dark:bg-[#0f172a] shadow-2xl border-slate-200 dark:border-white/10 z-[1050]">
                <DialogHeader className="p-4 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/50">
                    <div className="filter-modal-title-row flex justify-between items-center">
                        <DialogTitle className="text-base font-bold text-slate-900 dark:text-white flex items-center">
                            <i className="fa fa-sliders filter-title-icon mr-2" />
                            {t("Filter & Sort")}
                        </DialogTitle>
                        {draftFilterCount > 0 && (
                            <span className="filter-draft-count text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{t("{{count}} active", { count: draftFilterCount })}</span>
                        )}
                    </div>
                </DialogHeader>

                <div className="filter-modal-body p-4 max-h-[60vh] overflow-y-auto">
                    {/* ── Price Range ─────────────────────────────────────── */}
                    <div className="filter-section">
                        <p className="filter-section-label">
                            {t("Price Range")} ({getCurrencySymbol(currencyCode)})
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                            <div className="relative flex-1">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-medium text-sm">{getCurrencySymbol(currencyCode)}</span>
                                <Input
                                    type="number"
                                    placeholder={t("Min")}
                                    className="pl-7"
                                    value={draftFilters.minPrice}
                                    min={0}
                                    onChange={e => setDraftFilters(prev => ({ ...prev, minPrice: e.target.value }))}
                                />
                            </div>
                            <span className="text-slate-400 font-medium">—</span>
                            <div className="relative flex-1">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-medium text-sm">{getCurrencySymbol(currencyCode)}</span>
                                <Input
                                    type="number"
                                    placeholder={t("Max")}
                                    className="pl-7"
                                    value={draftFilters.maxPrice}
                                    min={0}
                                    onChange={e => setDraftFilters(prev => ({ ...prev, maxPrice: e.target.value }))}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="filter-section">
                        <p className="filter-section-label">
                            {t("Sort By")}
                        </p>
                        <div className="sort-options">
                            {[
                                { fieldName: "price", sortOrder: 1, label: t("Price: Low to High"), icon: "fa-arrow-up" },
                                { fieldName: "price", sortOrder: -1, label: t("Price: High to Low"), icon: "fa-arrow-down" },
                            ].map(opt => {
                                const active = draftFilters.fieldName === opt.fieldName && draftFilters.sortOrder === opt.sortOrder;
                                return (
                                    <button
                                        key={`${opt.fieldName}_${opt.sortOrder}`}
                                        className={`sort-option-btn ${active ? "sort-option-active" : ""}`}
                                        onClick={() => setDraftFilters(prev => ({ ...prev, fieldName: opt.fieldName, sortOrder: opt.sortOrder }))}
                                    >
                                        <i className={`fa ${opt.icon} sort-opt-icon`} />
                                        {opt.label}
                                        {active && <i className="fa fa-check sort-check-icon" />}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <div className="filter-modal-footer p-4 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/50 flex justify-end gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleResetFilters}
                        className="reset-filter-btn border-slate-300"
                    >
                        <i className="fa fa-rotate-left mr-2" /> {t("Reset")}
                    </Button>
                    <Button
                        variant="default"
                        size="sm"
                        onClick={handleApplyFilters}
                        className="apply-filter-btn bg-blue-600 hover:bg-blue-700 text-white"
                    >
                        {t("Apply Filters")}
                        {draftFilterCount > 0 && (
                            <span className="apply-filter-badge ml-2 bg-blue-800 text-white px-2 py-0.5 rounded-full text-xs">{draftFilterCount}</span>
                        )}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    </>
    );

}

export default CompetitorModal;