import { SYSTEM_PAGES, PAGE_ACTIONS } from "src/common/constants";
import React, { useState, useEffect, useContext, useRef, useCallback, useMemo } from "react";
import ReactDOM from "react-dom";
import Filter from "../../../helper/filter/Filter";
import AgTable from "../../../common/grid/AgTable";
import useSpConnection from "../../../helper/hooks/useSpConnection";
import SpAccountNotConnected from "../../../common/components/SpAccountNotConnected";
import { ApiGetSPProduct, ApiChangeProductSetting, ApiUpdateProductPrice, ApiToggleProductFavorite } from "../../../api-wrapper/productList/ApiProductList";
import { Star, Heart, Plus, Upload, Filter as FilterIcon, FilterX, ChevronDown } from "lucide-react";
import { ProfileContext } from "../../../helper/usecontext/useContext";
import { useDispatch } from "react-redux";
import { handleLoader } from "../../../common/redux/action";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Switch } from "../../../components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "../../../components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import Toast from "../../../common/helper/toast/Toast";
import { PermissionCheck } from "../../../helper/permission/PermissionCheck";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { Buffer } from "buffer";
import SelectProductTypeModal from "./ProductTypeModal";
import BulkPriceUploadModal from "./BulkPriceUploadModal";
import ListingOptimizationModal from "./ListingOptimizationModal";
import CurrencyFormat from "../../../helper/currencyCode/CurrencyFormat";
import { firstPageRows, paginationRowsPerPageOptions } from "../../../helper/table/TableStyle";
import InlineEditPopup from "../../../helper/modal/InlineEditPopup";
import CurrencyCode from "../../../helper/currencyCode/CurrencyCode";
import { Skeleton } from "../../../components/ui/skeleton";
import { Sheet, SheetContent } from "../../../components/ui/sheet";

import TableSkeleton from "../../../common/skeleton/TableSkeleton";
import { ShadcnDateRangePicker as DateRangePicker } from "../../../components/ui/date-range-picker";
import { predefinedRanges } from "../../../common/helper/calendarValues/calendarValues";
import moment from "moment-timezone";
import CompetitorModal from "./CompetitorModal";
import APlusContentModal from "./APlusContentModal";
import { ApiCreateAPlusContent, ApiSubmitForApproveAPlusContent, ApiUpdateAPlusContent, ApiGetPendingAPlusBatchJobs, ApiPublishAPlusBatchJob } from "../../../api-wrapper/aPlusContent/ApiAPlusContent";
import { MdOutlineClose } from "react-icons/md";
import usePageFilter from "../../../helper/filter/usePageFilter";
import { AppTooltip } from "../../../components/ui/AppTooltip";

// Portal-based tooltip immune to AG-Grid CSS transform offsets

function ProductList() {
  const { t } = useTranslation();

  let { profileId, selectedAdType, currencyCode } = useContext(ProfileContext);
  const { isConnected: isSpConnected, isLoaded: isSpLoaded } = useSpConnection();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();

  const [tableData, setTableData] = useState([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 350);
    return () => clearTimeout(handler);
  }, [search]);

  const [isRightSideBar, setIsRightSideBar] = useState(null);
  const [rightSideData, setRightSideData] = useState(null);
  const [reviewRequestEnable, setReviewRequestEnable] = useState(false);
  const [notifyMeOnOrder, setNotifyMeOnOrder] = useState(false);
  const [notifyOnLowStock, setNotifyOnLowStock] = useState(false);
  const [notify, setNotify] = useState('');
  const [status, setStatus] = useState('');
  const [reviewRequestDelay, setReviewRequestDelay] = useState(0);
  const [showProductTypeModal, setShowProductTypeModal] = useState(false);
  const [showBulkPriceModal, setShowBulkPriceModal] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);

  const [rowsPerPage, setRowsPerPage] = useState(firstPageRows);
  const [totalRecords, setTotalRecords] = useState(0);
  const [currentPage, setcurrentPage] = useState(1);
  const [sortColumn, setSortColumn] = useState("productCreatedDate");
  const [sortOrder, setSortOrder] = useState("DESC");
  const [isTableLoading, setIsTableLoading] = useState(false);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [advancedSort, setAdvancedSort] = useState("");
  const [showAdvanceFilters, setShowAdvanceFilters] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 1024);
  const [isNarrow, setIsNarrow] = useState(window.innerWidth < 500);
  const [modalState, setModalState] = useState({ open: false, asin: null });

  const [aPlusModal, setAPlusModal] = useState({ open: false, mode: "create", product: null });
  const [isCreating, setCreating] = useState(false)
  const [isEditing, setEditing] = useState(false)
  const [isApproving, setApproving] = useState(false)
  const [isPublishingBatch, setPublishingBatch] = useState(false)
  // Keyed by ASIN → { jobId, status: "PENDING"|"PROCESSING"|"COMPLETED", generatedImages }
  // PENDING/PROCESSING = still generating. COMPLETED = generated, ready for user to review & publish.
  const [pendingAPlusJobs, setPendingAPlusJobs] = useState(new Map());

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 1024);
      setIsNarrow(window.innerWidth < 500);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const gridRef = useRef(null);

  const appliedFiltersObj = useMemo(() => ({
    notify,
    status,
    minPrice,
    maxPrice,
    startDate,
    endDate,
    advancedSort
  }), [notify, status, minPrice, maxPrice, startDate, endDate, advancedSort]);

  const { isFilterReady } = usePageFilter({
    pageName: "ProductList",
    profileId: profileId?.value,
    selectedAdType,
    appliedFilters: appliedFiltersObj,
    setAppliedFilters: (saved) => {
      if (saved && !Array.isArray(saved) && typeof saved === "object") {
        setNotify(saved.notify || "");
        setStatus(saved.status || "");
        setMinPrice(saved.minPrice || "");
        setMaxPrice(saved.maxPrice || "");
        setStartDate(saved.startDate || "");
        setEndDate(saved.endDate || "");
        setAdvancedSort(saved.advancedSort || "");

        // Auto-expand advanced filters if any are active
        if (saved.minPrice || saved.maxPrice || saved.startDate || saved.endDate || saved.advancedSort) {
          setShowAdvanceFilters(true);
        }
      }
    }
  });

  const handleToggleFavorite = async (sku, currentStatus) => {
    try {
      const res = await ApiToggleProductFavorite({
        profileId: profileId.value,
        sku: sku,
        isFavorite: !currentStatus
      });
      if (res?.isSuccess) {
        Toast.success(res.message);
        ApiListing();
      } else {
        Toast.error(res?.message || t("Failed to toggle favorite"));
      }
    } catch (error) {
      Toast.error(t("Something went wrong"));
    }
  };

  const columns = useMemo(() => [
    ...(PermissionCheck(SYSTEM_PAGES.PRODUCT_LIST, PAGE_ACTIONS.UPDATE) ? [{
      headerName: "",
      field: "isFavorite",
      width: 50,
      pinned: isMobile ? null : "left",
      lockPinned: !isMobile,
      suppressMovable: true,
      suppressMenu: true,
      sortable: false,
      resizable: false,
      cellRenderer: (params) => {
        const isFav = params.data?.isFavorite;
        return (
          <div className="flex items-center justify-center h-full cursor-pointer">
            <div onClick={(e) => {
              e.stopPropagation();
              handleToggleFavorite(params.data?.sku, isFav);
            }}>
              {isFav ?
                <Star className="h-[22px] w-[22px] text-amber-500 fill-amber-500" /> :
                <Star className="h-[22px] w-[22px] text-[#adb5bd]" />
              }
            </div>
          </div>
        );
      }
    }] : []),
    {
      headerName: t("reviewRequest"),
      field: "reviewRequestEnable",
      title: "Review Request",
      width: 140,
      pinned: isMobile ? null : "left",
      lockPinned: !isMobile,
      suppressMovable: true,
      sortable: true,
      resizable: false,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        return (
          <div className="flex flex-col items-center justify-center" style={{ height: "100%" }}>
            <span
              className={`badge ${row.reviewRequestEnable ? "bg-success" : "bg-secondary"}`}
              style={{ padding: "6px 10px", fontSize: "12px", borderRadius: "6px", minWidth: "70px", textAlign: "center" }}
            >
              {row.reviewRequestEnable ? t("active") : t("inactive")}
            </span>
            <div className="text-wrap text-center mt-1">
              {row?.reviewRequestDelay ?? 0} {t("Days")}
            </div>
          </div>
        );
      },
    },
    {
      headerName: t("productDetails"),
      field: "itemName",
      title: "Product Details",
      minWidth: 500,
      flex: 1,
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      cellStyle: { whiteSpace: "normal", wordBreak: "break-word", overflowWrap: "anywhere", lineHeight: "1.4" },
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        return (
          <div
            id={"product-list-first-target-" + params.node.rowIndex}
            className="flex items-start my-2 cursor-pointer pb-1"
            style={{ minHeight: "100px" }}
            onClick={() => setIsRightSideBar(row?._id)}
            onDoubleClick={() => setIsRightSideBar(null)}
          >
            <div
              className="rounded mr-3 flex items-center justify-center bg-gray-100 border position-relative"
              style={{ width: "100px", minWidth: "100px", height: "100px", overflow: "hidden" }}
            >
              {!row?.imageURL ? (
                <div className="text-gray-500 small">{t("No Image")}</div>
              ) : (
                <>
                  <Skeleton
                    className="w-[100px] h-[100px] absolute top-0 left-0 bg-slate-200 dark:bg-slate-800 animate-pulse rounded"
                  />
                  <img
                    src={row?.imageURL}
                    alt="product"
                    className="position-relative"
                    style={{
                      maxWidth: "100%",
                      maxHeight: "100%",
                      objectFit: "contain",
                      zIndex: 1,
                      backgroundColor: "white",
                    }}
                    onLoad={(e) => { e.target.previousSibling.style.display = 'none'; }}
                  />
                </>
              )}
            </div>
            <div className="flex flex-col flex-grow-1 h-full" style={{ minWidth: 0, gap: "6px" }}>
              <h6
                className="mb-1 font-bold text-dark"
                style={{
                  whiteSpace: "normal",
                  overflowWrap: "anywhere",
                  wordBreak: "break-word",
                  fontSize: "13px",
                  lineHeight: "1.5"
                }}
              >
                {row?.itemName}
              </h6>
              <div className="flex flex-col flex-wrap small text-gray-500 gap-1">
                <div className="mr-3 mb-1">
                  <strong className="text-dark">{t("type")}:</strong> {row?.productType || "-"}
                </div>
                <div className="mr-3 mb-1">
                  <strong className="text-dark">{t("asins")}:</strong> {row?.asin || "-"}
                </div>
                <div className="mr-3 mb-1">
                  <strong className="text-dark">{t("SKU")}:</strong> {row?.sku || "-"}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  {PermissionCheck(SYSTEM_PAGES.PRODUCT_LIST, PAGE_ACTIONS.UPDATE) && (
                    <Button
                      variant="outline"
                      size="sm"
                      id={"product-list-optimize-ai-" + params.node.rowIndex}
                      className="sku-btn-optimize"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRightSideData(row);
                        setShowAIModal(true);
                      }}
                    >
                      <i className="fas fa-magic" style={{ fontSize: "10px" }}></i>
                      {t("Optimize with AI")}
                    </Button>
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    id={"product-list-view-competitors-" + params.node.rowIndex}
                    className="sku-btn-competitors"
                    onClick={(e) => {
                      e.stopPropagation();
                      setModalState({ open: true, asin: row?.asin });
                    }}
                  >
                    <i className="fas fa-users" style={{ fontSize: "10px" }}></i>
                    {t("View Competitors")}
                  </Button>

                  {PermissionCheck(SYSTEM_PAGES.PRODUCT_LIST, PAGE_ACTIONS.UPDATE) && (() => {
                    const batchJob = pendingAPlusJobs.get(row?.asin);
                    // hasAPlusContent flipping true means it's already published — trust that over a stale job entry.
                    const isGenerating = Boolean(batchJob) && batchJob.status !== "COMPLETED" && !row?.hasAPlusContent;
                    const isReadyToReview = Boolean(batchJob) && batchJob.status === "COMPLETED" && !row?.hasAPlusContent;
                    console.log(isGenerating, "isGenerating");
                    console.log(isReadyToReview, "isReadyToReview");
                    console.log(batchJob, "batchJob");
                    console.log(row?.asin, "asin");
                    const tooltipText = isGenerating
                      ? t("Generating A+ Content…")
                      : isReadyToReview
                        ? t("A+ Content ready — click to review & publish")
                        : row?.hasAPlusContent ? t("View A+ Content") : t("Create A+ Content");

                    const badgeClass = isGenerating
                      ? "aplus-generating"
                      : isReadyToReview
                        ? "aplus-ready"
                        : row?.hasAPlusContent ? "aplus-view" : "aplus-create";

                    const iconClass = isGenerating
                      ? "fa-solid fa-hourglass-half"
                      : isReadyToReview
                        ? "fa-regular fa-eye"
                        : `fa-regular ${row?.hasAPlusContent ? "fa-eye" : "fa-images"}`;

                    const modalMode = isGenerating ? "generating" : isReadyToReview ? "review" : row?.hasAPlusContent ? "view" : "create";

                    return (
                      <AppTooltip text={tooltipText}>
                        <div
                          className={`product-notification-badge aplus-badge ${badgeClass}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setAPlusModal({
                              open: true,
                              mode: modalMode,
                              product: isReadyToReview
                                ? { ...row, __batchJobId: batchJob.jobId, __generatedImages: batchJob.generatedImages }
                                : row,
                            });
                          }}
                          style={{ cursor: "pointer" }}
                        >
                          <i className={iconClass} style={{ fontSize: "11px" }}></i>
                        </div>
                      </AppTooltip>
                    );
                  })()}

                  <AppTooltip text={row?.notifyMeOnOrder ? t("Notify When Order Placed") : t("Notification Disabled")}>
                    <div className={`product-notification-badge ${row?.notifyMeOnOrder ? "enabled" : "disabled"}`}>
                      <i
                        className={`fa-regular ${row?.notifyMeOnOrder ? "fa-bell" : "fa-bell-slash"}`}
                        style={{ fontSize: "11px" }}
                      ></i>
                    </div>
                  </AppTooltip>
                </div>
              </div>
            </div>
          </div>
        );
      },
    },
    {
      headerName: t("Rank"),
      field: "classificationRank",
      title: "Rank",
      width: 250,
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        return (
          <div className="flex flex-col gap-1">
            <div>
              <span className="fw-bolder">{t("classification")}:</span>{" "}
              <span>{row?.classificationRank ? CurrencyFormat(row?.classificationRank) : "-"}</span>
            </div>
            <div>
              <span className="fw-bolder">{t("displayGroup")}:</span>{" "}
              <span>{row?.displayGroupRanks ? CurrencyFormat(row?.displayGroupRanks) : "-"}</span>
            </div>
          </div>
        );
      },
    },
    {
      headerName: t("performanceLast30Days"),
      field: "performanceMail",
      title: "Performance Last 30 Days",
      width: 250,
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      cellRenderer: (params) => {
        if (params.value === undefined || params.value === null) return null;
        return (
          <div className="text-wrap" style={{ whiteSpace: "normal", wordBreak: "break-word", overflowWrap: "break-word", lineHeight: "1.4" }}>
            {params.value} {t("Emails")}
          </div>
        );
      },
    },
    {
      headerName: t("Base Price"),
      field: "basePrice",
      title: "Base Price",
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        return (
          <InlineEditPopup
            value={Number(row?.basePrice ?? 0)}
            formatter={(v) => CurrencyCode(v)}
            title={t("Base Price")}
            currency={currencyCode}
            onSave={async (newPrice) => await updatePriceHandler(row, "basePrice", newPrice)}
            disabled={!PermissionCheck(SYSTEM_PAGES.PRODUCT_LIST, PAGE_ACTIONS.UPDATE)}
          />
        );
      },
    },
    {
      headerName: t("Selling Price"),
      field: "sellingPrice",
      title: "Selling Price",
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        return (
          <InlineEditPopup
            value={Number(row?.sellingPrice ?? 0)}
            formatter={(v) => CurrencyCode(v)}
            title={t("Selling Price")}
            currency={currencyCode}
            onSave={async (newPrice) => await updatePriceHandler(row, "sellingPrice", newPrice)}
            disabled={!PermissionCheck(SYSTEM_PAGES.PRODUCT_LIST, PAGE_ACTIONS.UPDATE)}
            min={1}
          />
        );
      },
    },
    {
      headerName: t("Maximum Retail Price (MRP)"),
      field: "maximumRetailPrice",
      title: "Maximum Retail Price (MRP)",
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        return (
          <InlineEditPopup
            value={Number(row?.maximumRetailPrice ?? 0)}
            formatter={(v) => CurrencyCode(v)}
            title={t("Maximum Retail Price (MRP)")}
            currency={currencyCode}
            onSave={async (newPrice) => await updatePriceHandler(row, "maximumRetailPrice", newPrice)}
            disabled={!PermissionCheck(SYSTEM_PAGES.PRODUCT_LIST, PAGE_ACTIONS.UPDATE)}
            min={1}
          />
        );
      },
    },
  ], [isMobile, t, currencyCode, pendingAPlusJobs]);


  const lastFetchParamsRef = useRef("");

  const ApiListing = async (page, perPage, searchApi, sortColumnApi, sortOrderApi, isReload = false) => {
    if (profileId?.value && selectedAdType) {
      if (isSpLoaded && !isSpConnected) {
        setTableData([]);
        setTotalRecords(0);
        setIsTableLoading(false);
        return [];
      }

      const pageNoVal = page || currentPage;
      const perPageVal = perPage || rowsPerPage;
      const searchNameVal = searchApi ?? debouncedSearch;
      const sortColumnVal = sortColumnApi ?? sortColumn;
      const sortOrderVal = sortOrderApi ?? sortOrder;

      const requestSignature = JSON.stringify({
        profileId: profileId.value,
        selectedAdType,
        pageNo: pageNoVal,
        perPage: perPageVal,
        searchName: searchNameVal,
        status: status || "",
        notify: notify || "",
        sortColumn: sortColumnVal || "",
        sortOrder: sortOrderVal || "",
        isFavorite: showFavoritesOnly,
        minPrice: minPrice || "",
        maxPrice: maxPrice || "",
        startDate: startDate || "",
        endDate: endDate || "",
        advancedSort: advancedSort || {}
      });

      if (!isReload && lastFetchParamsRef.current === requestSignature) {
        return tableData;
      }

      lastFetchParamsRef.current = requestSignature;
      setIsTableLoading(true);
      const data = {
        pageNo: pageNoVal,
        perPage: perPageVal,
        profileId: profileId.value,
        searchName: searchNameVal,
        status: status,
        notifyMeOnOrder: notify,
        sortColumn: sortColumnVal,
        sortOrder: sortOrderVal,
        isFavorite: showFavoritesOnly,
        minPrice,
        maxPrice,
        startDate,
        endDate,
        advancedSort,
      };
      try {
        const e = await ApiGetSPProduct(data);
        if (e?.isSuccess) {
          setTableData(e?.products || []);
          setTotalRecords(e?.totalRecords);
          setcurrentPage(e?.currentPageNo || 1);
          return e?.products || [];
        }
      } catch (e) {
        lastFetchParamsRef.current = "";
        setIsTableLoading(false);
        Toast.error(t("Something went wrong"));
      } finally {
        setTimeout(() => setIsTableLoading(false), 500);
      }
    }
    return [];
  };

  useEffect(() => {
    lastFetchParamsRef.current = "";
  }, [profileId?.value]);

  // Debounced effect for range filters and search to avoid too many API calls
  useEffect(() => {
    if (!isFilterReady) return;

    const timer = setTimeout(() => {
      const params = new URLSearchParams(location?.search);
      const searchParam = params.get("search") ?? "";
      if (searchParam) {
        const searchTerm = Buffer.from(searchParam, "base64").toString("utf8");
        setSearch(searchTerm);
        ApiListing(1, rowsPerPage, searchTerm);
        return;
      }
      ApiListing(1, rowsPerPage, debouncedSearch);
    }, 400);

    return () => clearTimeout(timer);
  }, [
    isFilterReady,
    profileId?.value,
    selectedAdType,
    status,
    notify,
    location.search,
    showFavoritesOnly,
    advancedSort,
    minPrice,
    maxPrice,
    startDate,
    endDate,
    debouncedSearch
  ]);

  const fetchPendingAPlusBatchJobs = useCallback(async () => {
    // API CALL REMOVED AS REQUESTED
  }, [profileId?.value, isSpLoaded, isSpConnected]);

  useEffect(() => {
    fetchPendingAPlusBatchJobs();
  }, [fetchPendingAPlusBatchJobs]);

  // Keep re-checking as long as anything is tracked at all — not just while
  // something is still generating. A job that's already COMPLETED still needs
  // to be re-verified periodically (e.g. it could get published from another
  // tab/session), and stopping the interval once nothing is "generating" meant
  // this never polled again after the last job finished, leaving stale state
  // until a full page reload.
  useEffect(() => {
    if (pendingAPlusJobs.size === 0) return;
    const interval = setInterval(fetchPendingAPlusBatchJobs, 120000);
    return () => clearInterval(interval);
  }, [pendingAPlusJobs.size, fetchPendingAPlusBatchJobs]);

  useEffect(() => {
    if (tableData?.length > 0 && isRightSideBar) {
      const data = tableData.find((item) => item._id === isRightSideBar);
      if (data) {
        setReviewRequestEnable(data.reviewRequestEnable);
        setNotifyMeOnOrder(data.notifyMeOnOrder ?? false);
        setNotifyOnLowStock(data.notifyOnLowStock ?? false);
        setRightSideData(data);
        setReviewRequestDelay(data?.reviewRequestDelay || 0);
      }
    }
  }, [tableData, isRightSideBar]);

  const reviewRequestDelayHandler = (id) => {
    ApiChangeProductSetting({
      reviewRequestDelay,
      reviewRequestEnable,
      notifyMeOnOrder,
      notifyOnLowStock
    }, id)
      .then((res) => {
        if (res.isSuccess) {
          Toast.success(res.message);
          ApiListing();
        } else {
          Toast.error(res.message || "error");
        }
      })
      .catch((err) => {
        Toast.error(err.message || "Something went wrong");
      });
  };

  const updatePriceHandler = (row, field, newVal) => {
    dispatch(handleLoader(true));
    const data = {
      profileId: profileId.value,
      sku: row?.sku,
      [field]: newVal
    };

    ApiUpdateProductPrice(data)
      .then((res) => {
        dispatch(handleLoader(false));
        if (res.isSuccess) {
          Toast.success(res.message || t("Price updated successfully"));
          ApiListing();
        } else {
          Toast.error(res.message || t("Something went wrong"));
        }
      })
      .catch((err) => {
        dispatch(handleLoader(false));
        Toast.error(err.message || t("Something went wrong"));
      });
  };

  const handleSelectProductType = (values) => {
    setShowProductTypeModal(false);

    navigate(`/product-list/schema/${values?.productType?.value}`, {
      state: {
        marketplace_id: values?.marketplaceId,
        language_tag: values?.languageTag?.value,
        asinData: values?.asinData,
      }
    });
  };

  const handlePageChange = (page) => {
    setcurrentPage(page);
    ApiListing(page, rowsPerPage);
  };

  const handlePerRowsChange = (newPerPage) => {
    setRowsPerPage(newPerPage);
    ApiListing(currentPage, newPerPage);
  };

  const handleSortChanged = (e) => {
    const columnState = e.api.getColumnState();
    const sortedColumn = columnState.find((s) => s.sort !== null);
    if (sortedColumn) {
      const { colId, sort } = sortedColumn;
      setSortColumn(colId);
      setSortOrder(sort);
      ApiListing(currentPage, rowsPerPage, undefined, colId, sort);
    } else {
      setSortColumn(null);
      setSortOrder(null);
      ApiListing(currentPage, rowsPerPage, undefined, null, null);
    }
  };

  const CreateAPlusContent = (product, options = {}) => {
    setCreating(true);
    const generateImageOption = typeof options === 'boolean' ? options : (options?.generateImageOption ?? true);
    const type = typeof options === 'object' && options?.type ? options.type : "basic";
    const prompt = typeof options === 'object' && options?.prompt ? options.prompt : "";
    const targetAsin = (typeof options === 'object' && options?.asin) ? options.asin : product?.asin;

    const payload = {
      asin: targetAsin,
      type: type,
      prompt: prompt,
      generateImageOption: generateImageOption,
      profileId: profileId?.value
    };

    ApiCreateAPlusContent(payload)
      .then(async (res) => {
        if (res.isSuccess) {
          Toast.success(res.message || t("A+ Content Created Successfully."));
          if (res.isBatch) {
            // Generation continues in the background — nothing to view yet.
            // A notification will arrive once it's ready for review.
            setAPlusModal({ open: false, mode: "create", product: null });
            setPendingAPlusJobs((prev) => {
              const next = new Map(prev);
              next.set(targetAsin, {
                jobId: res.data?.jobId,
                status: res.data?.status || "PENDING",
                generatedImages: res.data?.generatedImages || [],
              });
              return next;
            });
            ApiListing(currentPage, rowsPerPage, undefined, undefined, undefined, true);
          } else {
            const freshList = await ApiListing(currentPage, rowsPerPage, undefined, undefined, undefined, true);
            const freshProduct = freshList.find((p) => p.asin === product?.asin || p._id === product?._id);
            const refKey = res.data?.contentReferenceKey || res.contentReferenceKey || freshProduct?.contentReferenceKey;
            setAPlusModal({
              open: true,
              mode: "view",
              product: { ...(freshProduct || product), contentReferenceKey: refKey }
            });
          }
        } else {
          Toast.error(res.message || "Something went wrong");
        }
        setCreating(false);
      })
      .catch((err) => {
        setCreating(false);
        Toast.error(err.message || "Something went wrong");
      });
  }

  const EditAPlusContent = (product, contentReferenceKey, generateImageOption = true) => {
    setEditing(true);
    ApiUpdateAPlusContent({ asin: product?.asin, profileId: profileId?.value, contentReferenceKey: product?.contentReferenceKey, generateImageOption })
      .then(async (res) => {
        if (res?.isSuccess) {
          Toast.success(res?.message || t("A+ Content Updated Successfully."));
          const freshList = await ApiListing(currentPage, rowsPerPage, undefined, undefined, undefined, true);
          const freshProduct = freshList.find((p) => p.asin === product?.asin || p._id === product?._id);
          setAPlusModal({ open: true, mode: "view", product: freshProduct || product });
        } else {
          Toast.error(res?.message || "Something went wrong");
        }
        setEditing(false);
      })
      .catch((err) => {
        setEditing(false);
        Toast.error(err?.message || "Something went wrong");
      });
  };

  const ApproveContent = (product, contentReferenceKey) => {
    setApproving(true);
    ApiSubmitForApproveAPlusContent({ profileId: profileId?.value, contentReferenceKey })
      .then(async (res) => {
        if (res?.isSuccess) {
          Toast.success(res?.message || t("Content Submitted for Approval."));
          const freshList = await ApiListing(currentPage, rowsPerPage, undefined, undefined, undefined, true);
          const freshProduct = freshList.find((p) => p.asin === product?.asin || p._id === product?._id);
          setAPlusModal({ open: true, mode: "view", product: freshProduct || product });
        } else {
          Toast.error(res?.message || "Something went wrong");
        }
        setApproving(false);
      })
      .catch((err) => {
        setApproving(false);
        Toast.error(err?.message || "Something went wrong");
      });
  }

  const PublishBatchAPlusContent = (product, jobId) => {
    setPublishingBatch(true);
    ApiPublishAPlusBatchJob({ jobId, profileId: profileId?.value })
      .then(async (res) => {
        if (res?.isSuccess) {
          Toast.success(res?.message || t("A+ Content published to Amazon successfully."));
          setAPlusModal({ open: false, mode: "create", product: null });
          setPendingAPlusJobs((prev) => {
            const next = new Map(prev);
            next.delete(product?.asin);
            return next;
          });
          ApiListing(currentPage, rowsPerPage, undefined, undefined, undefined, true);
        } else {
          Toast.error(res?.message || "Something went wrong");
        }
        setPublishingBatch(false);
      })
      .catch((err) => {
        setPublishingBatch(false);
        Toast.error(err?.message || "Something went wrong");
      });
  }

  return (
    <div className="product-list-tracking-container">
      <Filter
        name={"Product List"}
        nameShow={false}
        dateShow={false}
        profileShow={true}
      />
      <div className="middle_container" id="productList">
        {!isSpConnected && isSpLoaded ? (
          <SpAccountNotConnected feature={t("SP Products")} />
        ) : (
          <div className="data_content data_content_btn" style={{ width: "100%", marginTop: 0, border: "none", background: "transparent", boxShadow: "none" }}>
          <div
            id="product-list-filters"
            className={`glass-sticky-header dash-filter-bar ${!isMobile ? "sticky-top" : ""}`}
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              flexWrap: "wrap",
              columnGap: 12,
              rowGap: 10,
              padding: isMobile ? "10px 16px" : "10px 24px",
              zIndex: 90,
              top: 0,
              marginLeft: 0,
              marginRight: 0,
              marginTop: "-10px",
              marginBottom: "20px",
            }}
          >
            {/* ROW 1: Filters */}
            <div className="flex" style={{ gap: 12, width: isMobile ? "100%" : "auto" }}>
              <div style={{ flex: isMobile ? 1 : "initial" }}>
                <Select
                  value={notify === "" || notify === undefined ? "__all_notify" : String(notify)}
                  onValueChange={(val) => setNotify(val === "__all_notify" ? "" : val)}
                >
                  <SelectTrigger className="h-10 text-[13px] font-medium bg-white dark:bg-transparent border-slate-300 dark:border-slate-700 rounded-md shadow-sm w-full min-w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all_notify">{t("All (Notify)")}</SelectItem>
                    <SelectItem value="true">{t("Notify on Orders")}</SelectItem>
                    <SelectItem value="false">{t("Don't Notify")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div style={{ flex: isMobile ? 1 : "initial" }}>
                <Select
                  value={status === "" || status === undefined ? "__all_status" : String(status)}
                  onValueChange={(val) => setStatus(val === "__all_status" ? "" : val)}
                >
                  <SelectTrigger className="h-10 text-[13px] font-medium bg-white dark:bg-transparent border-slate-300 dark:border-slate-700 rounded-md shadow-sm w-full min-w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all_status">{t("All Status")}</SelectItem>
                    <SelectItem value="true">{t("Enabled")}</SelectItem>
                    <SelectItem value="false">{t("Disabled")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* ROW 2: Additional Actions */}
            <div className="flex" style={{ gap: 10, width: isMobile ? "100%" : "auto" }}>
              <div style={{ flex: isMobile ? 1 : "initial" }}>
                <Button
                  variant="outline"
                  onClick={() => setShowAdvanceFilters(!showAdvanceFilters)}
                  className="h-10 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 dark:bg-transparent dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 px-4 font-medium rounded-md shadow-sm w-full flex items-center justify-center gap-[6px]"
                >
                  {showAdvanceFilters ? <FilterX className="h-4 w-4" /> : <FilterIcon className="h-4 w-4" />}
                  <span>{t("Filters")}</span>
                </Button>
              </div>
            </div>
          </div>

          {showAdvanceFilters && (
            <div
              className="advanced-filters-row flex flex-wrap items-center justify-between gap-3 mb-3"
              style={{
                padding: "12px 20px",
                borderRadius: "12px",
                background: "var(--glass-bg, rgba(255,255,255,0.85))",
                border: "var(--glass-border, 1px solid rgba(203,213,225,0.3))",
                backdropFilter: "blur(12px)",
                boxShadow: "var(--glass-shadow, 0 2px 12px rgba(0,0,0,0.04))",
              }}
            >
              <div className="flex items-center gap-3 flex-wrap">
                {/* Price Range */}
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.06em", color: "var(--text-secondary)", textTransform: "uppercase" }}>{t("Price")}</span>
                  <div className="pl-adv-input-wrap">
                    <span className="pl-adv-input-prefix">{currencyCode || '$'}</span>
                    <Input
                      type="number"
                      className="pl-adv-input h-8 border-0 shadow-none focus-visible:ring-0 px-0 bg-transparent"
                      placeholder={t("Min")}
                      value={minPrice}
                      onChange={(e) => setMinPrice(e.target.value)}
                    />
                  </div>
                  <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>—</span>
                  <div className="pl-adv-input-wrap">
                    <span className="pl-adv-input-prefix">{currencyCode || '$'}</span>
                    <Input
                      type="number"
                      className="pl-adv-input h-8 border-0 shadow-none focus-visible:ring-0 px-0 bg-transparent"
                      placeholder={t("Max")}
                      value={maxPrice}
                      onChange={(e) => setMaxPrice(e.target.value)}
                    />
                  </div>
                </div>

                <div className="vr hidden md:block" style={{ height: "22px", opacity: 0.2 }}></div>

                {/* Listing Date */}
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.06em", color: "var(--text-secondary)", textTransform: "uppercase" }}>{t("Listing Date")}</span>
                  <DateRangePicker
                    className="w-full sm:w-[260px]"
                    ranges={predefinedRanges}
                    format="yyyy-MM-dd"
                    placeholder={t("Select Date Range")}
                    cleanable={true}
                    value={startDate && endDate ? [new Date(startDate), new Date(endDate)] : null}
                    onChange={(val) => {
                      if (val && val.length === 2) {
                        setStartDate(moment(val[0]).format("YYYY-MM-DD"));
                        setEndDate(moment(val[1]).format("YYYY-MM-DD"));
                      } else {
                        setStartDate("");
                        setEndDate("");
                      }
                    }}
                    placement="bottomEnd"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Sort */}
                <span style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.06em", color: "var(--text-secondary)", textTransform: "uppercase" }}>{t("SortBy")}</span>
                <Select
                  value={advancedSort || ""}
                  onValueChange={(val) => setAdvancedSort(val === "__default" ? "" : val)}
                >
                  <SelectTrigger className="h-[36px] min-w-[160px] text-[13px] font-medium bg-white dark:bg-[#1e293b] border-slate-200 dark:border-slate-700 rounded-lg shadow-sm">
                    <SelectValue placeholder={t("Select")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__default">{t("Standard")}</SelectItem>
                    <SelectItem value="bestSellers">{t("Top Selling (Total Orders)")}</SelectItem>
                    <SelectItem value="newestArrivals">{t("Newest Arrivals")}</SelectItem>
                    <SelectItem value="highestDiscount">{t("Highest Discount")}</SelectItem>
                    <SelectItem value="stockLowToHigh">{t("Stock: Low to High")}</SelectItem>
                    <SelectItem value="stockHighToLow">{t("Stock: High to Low")}</SelectItem>
                  </SelectContent>
                </Select>

                <div style={{ width: "1px", height: "22px", background: "var(--glass-border-color, rgba(0,0,0,0.1))" }}></div>

                {/* Clear All */}
                <Button
                  variant="outline"
                  className="btn flex items-center gap-1 hover:bg-red-500/10"
                  style={{ height: "36px", borderRadius: "8px", border: "1px solid rgba(239,68,68,0.5)", background: "transparent", color: "#ef4444", fontSize: "13px", fontWeight: "600", padding: "0 14px", transition: "all 0.2s" }}
                  onClick={() => {
                    setMinPrice(""); setMaxPrice("");
                    setStartDate(""); setEndDate(""); setAdvancedSort(""); setSearch("");
                    setDebouncedSearch("");
                    setStatus(""); setNotify(""); setShowFavoritesOnly(false);
                    setcurrentPage(1);
                    ApiListing(1, rowsPerPage, "", undefined, undefined, true);
                  }}
                >
                  <FilterX className="h-4 w-4" />
                  {t("ClearAll")}
                </Button>
              </div>
            </div>
          )}
          <div className="glass-grid-container overflow-hidden">
            <div
              className="data_model_btn camapgin_btn"
              style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "flex-start",
                flexWrap: "wrap",
                overflowX: "auto",
                gap: 10,
                padding: isMobile ? "10px 14px" : "12px 24px",
              }}
            >
              <div style={{ flex: "0 0 auto" }}>
                <h5 className="m-0 font-bold whitespace-nowrap">{t("productList")}</h5>
              </div>

              {/* Right-aligned filters group */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginLeft: "auto", justifyContent: "flex-end", flex: "1 1 auto", width: isNarrow ? "100%" : undefined }}>
                {/* Favourites Toggle */}
                <Button
                  id="product-list-favorites"
                  variant="outline"
                  onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                  className="customize-button h-[36px] !bg-white !border !border-slate-300 !text-slate-700 hover:!bg-slate-50 dark:!bg-transparent dark:!border-slate-700 dark:!text-slate-300 dark:hover:!bg-slate-800 px-4 font-medium rounded-md shadow-sm flex items-center justify-center gap-1.5"
                  style={{ flexGrow: isMobile ? 1 : 0 }}
                >
                  {showFavoritesOnly ? <Star className="h-4 w-4 text-amber-500 fill-amber-500" /> : <Star className="h-4 w-4" />}
                  {t("Favourites")}
                </Button>

                {/* Search */}
                <div id="product-list-search" className="search_option m-0 flex items-center" style={{ position: "relative", flex: "1 1 auto", minWidth: 200, maxWidth: isNarrow ? "100%" : 320, width: isNarrow ? "100%" : undefined, height: "36px" }}>
                  <Input
                    type="text"
                    placeholder={t("searchHere")}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        setDebouncedSearch(search);
                        setcurrentPage(1);
                        ApiListing(1, rowsPerPage, search, undefined, undefined, true);
                      }
                    }}
                    className="flex-grow w-full h-[36px] border-0 focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent shadow-none px-0"
                    style={{ paddingRight: search ? "30px" : "10px" }}
                  />
                  {search && (
                    <MdOutlineClose
                      onClick={() => {
                        setSearch("");
                        setDebouncedSearch("");
                        setcurrentPage(1);
                        ApiListing(1, rowsPerPage, "", undefined, undefined, true);
                      }}
                      style={{
                        position: "absolute",
                        right: "10px",
                        cursor: "pointer",
                        color: "var(--text-secondary)",
                        fontSize: "18px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: 0.7,
                        transition: "opacity 0.2s"
                      }}
                      onMouseEnter={(e) => e.target.style.opacity = 1}
                      onMouseLeave={(e) => e.target.style.opacity = 0.7}
                    />
                  )}
                </div>

                {/* Bulk Price Upload */}
                {PermissionCheck(SYSTEM_PAGES.PRODUCT_LIST, PAGE_ACTIONS.UPDATE) && (
                  <Button
                    id="product-list-bulk-price-upload"
                    onClick={() => setShowBulkPriceModal(true)}
                    className="customize-button clicked m-0 gap-0 btn-campaign-primary"
                    style={{ flexGrow: isMobile ? 1 : 0, whiteSpace: "nowrap" }}
                  >
                    <Upload style={{ fontSize: 16, marginRight: 4 }} className="h-4 w-4" />
                    {t("Bulk Price Update")}
                  </Button>
                )}

                {/* Add Product */}
                {PermissionCheck(SYSTEM_PAGES.PRODUCT_LIST, PAGE_ACTIONS.CREATE) && (
                  <Button
                    id="product-list-add-product"
                    onClick={() => setShowProductTypeModal(true)}
                    className="customize-button clicked m-0 gap-0 btn-campaign-primary"
                    style={{ flexGrow: isMobile ? 1 : 0, whiteSpace: "nowrap" }}
                  >
                    <Plus style={{ fontSize: 16, marginRight: 4 }} className="h-4 w-4" />
                    {t("addProduct")}
                  </Button>
                )}
              </div>
            </div>

            {PermissionCheck(SYSTEM_PAGES.PRODUCT_LIST, PAGE_ACTIONS.VIEW_ONLY) && (
              <div id="product-list-main-table" className="data_table position-relative w-full max-w-full">
                <AgTable
                  ref={gridRef}
                  tableId="productList-main-table"
                  height={"70vh"}
                  rowHeight={120}
                  loading={!isFilterReady || isTableLoading}
                  onRefresh={() => ApiListing(currentPage, rowsPerPage, undefined, undefined, undefined, true)}
                  rowData={tableData}
                  columnDefs={columns}
                  totalRecords={totalRecords ?? 0}
                  perPage={rowsPerPage}
                  currentPage={currentPage}
                  onPageChange={handlePageChange}
                  onPerPageChange={handlePerRowsChange}
                  onSortChanged={handleSortChanged}
                  suppressRowTransform={true}
                  paginationOptions={paginationRowsPerPageOptions}
                  isCustomSaveColumns={true}
                  customSaveColumnName={"Product List"}
                  handleSaveColumns={undefined}
                />
              </div>
            )}
          </div>
        </div>
        )}
        <Sheet open={Boolean(isRightSideBar)} onOpenChange={(open) => { if (!open) setIsRightSideBar(null); }}>
          <SheetContent hideCloseButton={true} className="w-full sm:max-w-[450px] p-0 h-full border-l border-slate-200 dark:border-slate-850 shadow-2xl bg-[#f8fafc] dark:bg-slate-950 flex flex-col">
            {rightSideData && (
              <div id="product-list-drawer" className="h-full flex flex-col bg-[#f8fafc] dark:bg-slate-950">
                <div className="glass-card drawer-card-override border-0 h-full m-0 rounded-0 flex flex-col" style={{ height: "100%" }}>
                  <div className="card-header flex justify-between items-center bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-white/10" style={{ padding: "14px 20px" }}>
                    <h5 className="m-0 font-bold text-slate-900 dark:text-slate-100" style={{ fontSize: "16px" }}>{t("productDetails")}</h5>
                    <Button
                      variant="ghost"
                      size="icon"
                      id="product-list-drawer-close"
                      className="h-[28px] w-[28px] rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 p-0 flex items-center justify-center"
                      onClick={() => setIsRightSideBar(null)}
                    >
                      <i className="fa-solid fa-xmark" style={{ fontSize: "14px" }}></i>
                    </Button>
                  </div>
                  <div className="card-body flex flex-col gap-5" style={{ padding: "24px", overflowY: "auto", flex: 1 }}>

                    {/* Hero Product Section */}
                    <div className="flex flex-col items-center bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-white/10 rounded-2xl shadow-sm p-4 text-center">
                      <div className="w-28 h-28 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-100 dark:border-white/5 flex items-center justify-center p-2 mb-3 shadow-inner">
                        <img
                          src={rightSideData?.imageURL}
                          alt="Product"
                          className="max-h-full max-w-full object-contain"
                        />
                      </div>

                      <h6 className="font-bold text-slate-900 dark:text-slate-100 text-sm leading-snug mb-3 max-h-12 overflow-hidden text-ellipsis line-clamp-2 px-1">
                        {rightSideData?.itemName || t("Unnamed Product")}
                      </h6>

                      <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${rightSideData?.notifyMeOnOrder
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                        : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                        }`}>
                        <i className={`fa-regular ${rightSideData?.notifyMeOnOrder ? "fa-bell" : "fa-bell-slash"}`}></i>
                        <span>
                          {rightSideData?.notifyMeOnOrder ? t("Notify When Order Placed") : t("Notification Disabled")}
                        </span>
                      </div>
                    </div>

                    {/* Metadata Grid */}
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="bg-white dark:bg-slate-900/30 p-3 rounded-xl border border-slate-200 dark:border-white/5">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block mb-0.5">{t("asins")}</span>
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate block" title={rightSideData?.asin}>
                          {rightSideData?.asin || "-"}
                        </span>
                      </div>
                      <div className="bg-white dark:bg-slate-900/30 p-3 rounded-xl border border-slate-200 dark:border-white/5">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block mb-0.5">{t("SKU")}</span>
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate block" title={rightSideData?.sku}>
                          {rightSideData?.sku || "-"}
                        </span>
                      </div>
                      <div className="col-span-2 bg-white dark:bg-slate-900/30 p-3 rounded-xl border border-slate-200 dark:border-white/5">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block mb-0.5">{t("Type")}</span>
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate block" title={rightSideData?.productType}>
                          {rightSideData?.productType || "-"}
                        </span>
                      </div>
                    </div>

                    {/* Settings Control Block */}
                    <div className="bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-white/10 rounded-2xl p-4 flex flex-col gap-1 shadow-sm text-slate-800 dark:text-slate-100">

                      <div className="flex flex-row justify-between items-center py-2.5 border-b border-slate-100 dark:border-white/5">
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer" htmlFor="notifyMeOnOrder">
                          {t("NotifyWhenOrderPlaced")}
                        </label>
                        <Switch
                          id="notifyMeOnOrder"
                          checked={notifyMeOnOrder}
                          onCheckedChange={setNotifyMeOnOrder}
                          disabled={!PermissionCheck(SYSTEM_PAGES.PRODUCT_LIST, PAGE_ACTIONS.UPDATE)}
                        />
                      </div>

                      <div className="flex flex-row justify-between items-center py-2.5 border-b border-slate-100 dark:border-white/5">
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer" htmlFor="notifyOnLowStock">
                          {t("notifyOnLowStock")}
                        </label>
                        <Switch
                          id="notifyOnLowStock"
                          checked={notifyOnLowStock}
                          onCheckedChange={setNotifyOnLowStock}
                          disabled={!PermissionCheck(SYSTEM_PAGES.PRODUCT_LIST, PAGE_ACTIONS.UPDATE)}
                        />
                      </div>

                      <div className="flex flex-row justify-between items-center py-2.5 border-b border-slate-100 dark:border-white/5">
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer" htmlFor="reviewRequestSwitch">
                          {t("ReviewRequest")}
                        </label>
                        <Switch
                          id="reviewRequestSwitch"
                          checked={reviewRequestEnable}
                          onCheckedChange={setReviewRequestEnable}
                          disabled={!PermissionCheck(SYSTEM_PAGES.PRODUCT_LIST, PAGE_ACTIONS.UPDATE)}
                        />
                      </div>

                      <div className="flex items-center justify-between py-2.5 mb-1">
                        <label htmlFor="reviewDelay" className="text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer mb-0">
                          {t("ReviewRequestDaysDelay")}
                        </label>
                        <Input
                          type="number"
                          className="w-20 text-center h-8 font-semibold text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg focus:ring-2 focus:ring-[var(--accent-primary)] focus:ring-opacity-20"
                          id="reviewDelay"
                          min="0"
                          value={reviewRequestDelay}
                          onChange={(e) => setReviewRequestDelay(e.target.value)}
                          disabled={!PermissionCheck(SYSTEM_PAGES.PRODUCT_LIST, PAGE_ACTIONS.UPDATE)}
                        />
                      </div>

                      {/* Save Button */}
                      {PermissionCheck(SYSTEM_PAGES.PRODUCT_LIST, PAGE_ACTIONS.UPDATE) && (
                        <div className="text-end mt-2">
                          <Button
                            style={{
                              background: 'linear-gradient(135deg, var(--accent-primary) 0%, #3CBBF2 100%)',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '8px',
                              fontSize: '12.5px',
                              fontWeight: '600',
                              padding: '8px 20px',
                              cursor: 'pointer',
                              transition: 'all 0.22s ease',
                              boxShadow: '0 4px 12px rgba(35, 116, 242, 0.22)'
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.transform = 'translateY(-1px)';
                              e.currentTarget.style.boxShadow = '0 6px 16px rgba(35, 116, 242, 0.35)';
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.transform = 'none';
                              e.currentTarget.style.boxShadow = '0 4px 12px rgba(35, 116, 242, 0.22)';
                            }}
                            onClick={() => reviewRequestDelayHandler(rightSideData?._id)}
                          >
                            {t("save")}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>

        <SelectProductTypeModal
          show={showProductTypeModal}
          onClose={() => setShowProductTypeModal(false)}
          onSelect={handleSelectProductType}
        />

        <BulkPriceUploadModal
          show={showBulkPriceModal}
          onClose={() => setShowBulkPriceModal(false)}
          onSuccess={() => ApiListing(currentPage, rowsPerPage, search)}
        />

        <ListingOptimizationModal
          show={showAIModal}
          onClose={() => setShowAIModal(false)}
          product={rightSideData}
          profileId={profileId?.value}
          onSuccess={() => ApiListing(currentPage, rowsPerPage, search)}
        />

        <CompetitorModal
          isOpen={modalState.open}
          onClose={() => setModalState({ open: false, asin: null })}
          profileId={profileId?.value}
          asin={modalState.asin}
        />

        <APlusContentModal
          isOpen={aPlusModal?.open}
          onClose={() => setAPlusModal({ open: false, mode: "create", product: null })}
          mode={aPlusModal.mode}
          product={aPlusModal.product}
          profileId={profileId?.value}
          isCreating={isCreating}
          isEditing={isEditing}
          isApproving={isApproving}
          isPublishingBatch={isPublishingBatch}
          onCreateWithAI={CreateAPlusContent}
          onEditWithAI={EditAPlusContent}
          onApproveContent={ApproveContent}
          onPublishBatchJob={PublishBatchAPlusContent}
          onRegenerateReview={(product) => setAPlusModal({ open: true, mode: "create", product })}
        />
      </div>
    </div>
  );
}

export default ProductList;
