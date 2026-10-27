import { SYSTEM_PAGES, PAGE_ACTIONS } from "src/common/constants";
import React, { useEffect, useState, useContext, useMemo, useRef, useCallback } from "react";
import AgTable from "../../../common/grid/AgTable";
import { ShadcnDateRangePicker as DateRangePicker } from "../../../components/ui/date-range-picker";
import { predefinedRanges } from "../../../common/helper/calendarValues/calendarValues";
import {
  ApiViewCampaign,
  ApiAmazonGetKeywordById,
  ApiGetCampaignDataTable,
  ApiCampaignChartListing,
  ApiHistory,
  ApiCampainListing,
} from "../../../api-wrapper/campaign/ApiCampaign";
import { ApiSearchTermCampaign } from "../../../api-wrapper/search-term/ApiSearchTerm";
import { ProfileContext } from "../../../helper/usecontext/useContext";
import moment from "moment-timezone";
import { Accordion } from "../../../components/ui/accordion";
import { handleLoader, Toast } from "../../../helper/links/Link";
import CurrencyCode from "../../../helper/currencyCode/CurrencyCode";
import { useAccordionButton } from "../../../components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../../../components/ui/dialog";
import { Card, CardHeader, CardContent } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "../../../components/ui/select";
import { useTranslation } from "react-i18next";
import { useDispatch } from "react-redux";
import CurrencyFormat from "../../../helper/currencyCode/CurrencyFormat";
import { PermissionCheck } from "../../../helper/permission/PermissionCheck";
import { firstPageRows, paginationRowsPerPageOptions } from "../../../helper/table/TableStyle";
import InlineEditPopup from "../../../helper/modal/InlineEditPopup";
import { ApiUpdatePlacementBid } from "../../../api-wrapper/placement/ApiPlacement";
import Chart from "../../../helper/charts/Chart";
import AdGroupsSection from "./Campagin/AdGroupsSection";
import TargetingSection from "./Campagin/TargetingSection";
import { Search, History } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Breadcrumb from "../../../common/components/Breadcrumb";
import { FiClock, FiUser } from "react-icons/fi";
import openCampaignViewInNewTab from "../../../utility/campaignNavigation";
import { formatAmazonChangeType, isAdGroupLevelChange } from "../../../utility/targetingUtils";

function ViewCampaign(props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  let { profileId, today, selectedAdType, currencyCode } = useContext(ProfileContext);
  const dispatch = useDispatch();

  const { campaignDate, campaignDetails, viewPress } = props;
  const [date, setDate] = useState([]);
  const [status, setStatus] = useState("");
  const [searchTermStatus, setSearchTermStatus] = useState("");
  const [keywordStatus, setKeywordStatus] = useState("");
  const [productAds, setProductAds] = useState([]);
  const [keywordId, setKeywordId] = useState();
  const [campaignData, setCampaignData] = useState();
  const [weekData, setweekData] = useState([]);
  const [type, settype] = useState(0);
  const [activeEventKey, setActiveEventKey] = useState("0");
  const [bidValue, setBidValue] = useState("");
  const [error, setError] = useState("");
  const [currency, setCurrency] = useState("₹");
  const [perPage, setPerPage] = useState(firstPageRows);
  const [historyData, setHistoryData] = useState();
  const [historyLoading, setHistoryLoading] = useState(false);
  const [grpData, setGrpData] = useState();
  const [activeAccordionKeys, setActiveAccordionKeys] = useState(["0"]);
  const [campaignInfo, setCampaignInfo] = useState(null);

  useEffect(() => {
    if (viewPress && profileId?.value && (campaignDetails?.campaignId || campaignDetails?.name)) {
      const data = {
        profileId: profileId.value,
        searchName: campaignDetails?.name || "",
        ...(campaignDetails?.campaignId && {
          filteredCampaignIds: [Number(campaignDetails.campaignId) || campaignDetails.campaignId],
        }),
        pageNo: 1,
        perPage: 10,
      };
      ApiCampainListing(data)
        .then((res) => {
          if (res?.isSuccess && res?.getCampaign?.length > 0) {
            const match =
              res.getCampaign.find(
                (c) =>
                  (campaignDetails?.campaignId && String(c.campaignId) === String(campaignDetails?.campaignId)) ||
                  (campaignDetails?.name && c.name?.toLowerCase() === campaignDetails?.name?.toLowerCase())
              ) || res.getCampaign[0];
            if (match) {
              setCampaignInfo(match);
            }
          }
        })
        .catch(() => {});
    }
  }, [viewPress, profileId?.value, campaignDetails?.campaignId, campaignDetails?.name]);

  const effectiveCampaignDetails = useMemo(() => {
    return {
      ...(campaignInfo || {}),
      ...(campaignDetails || {}),
      campaignId: campaignDetails?.campaignId || campaignInfo?.campaignId,
      name: campaignDetails?.name || campaignInfo?.name,
      startDate: campaignDetails?.startDate || campaignInfo?.startDate,
      endDate: campaignDetails?.endDate || campaignInfo?.endDate,
      budget:
        campaignDetails?.budget !== undefined && campaignDetails?.budget !== null && campaignDetails?.budget !== 0
          ? campaignDetails.budget
          : (campaignInfo?.budget ?? campaignDetails?.budget ?? 0),
      budgetType: campaignDetails?.budgetType || campaignInfo?.budgetType || "",
      targetingType: campaignDetails?.targetingType || campaignInfo?.targetingType || "",
      status: campaignDetails?.status || campaignInfo?.status || "",
      type: campaignDetails?.type || campaignInfo?.type || "",
    };
  }, [campaignDetails, campaignInfo]);

  const effectiveCampaignId = effectiveCampaignDetails?.campaignId;

  // Row selection state
  const [selectedRows, setSelectedRows] = useState([]);
  const [selectAll, setSelectAll] = useState(false);
  const [showBidModal, setShowBidModal] = useState(false);

  // AG Grid refs
  const adGroupGridRef = useRef(null);
  const searchTermGridRef = useRef(null);
  const placementGridRef = useRef(null);
  const historyGridRef = useRef(null);
  const keywordGridRef = useRef(null);
  const productAdsGridRef = useRef(null);

  // Pagination state for AG Grid tables
  const [adGroupArg, setAdGroupArg] = useState({ pageNo: 1, perPage: firstPageRows });
  const [searchTermArg, setSearchTermArg] = useState({ pageNo: 1, perPage: firstPageRows });
  const [historyArg, setHistoryArg] = useState({ pageNo: 1, perPage: firstPageRows });
  const [historyDateOption, setHistoryDateOption] = useState("all");

  const sumOfValues = useMemo(() => {
    return {
      impressions: campaignData?.[0]?.totalImpressions,
      spend: campaignData?.[0]?.totalSpend,
      orders: campaignData?.[0]?.totalOrders,
      sales: campaignData?.[0]?.totalSales,
      clicks: campaignData?.[0]?.totalClicks,
      cpc: campaignData?.[0]?.totalCpc,
      acos: campaignData?.[0]?.totalAcos,
      roas: campaignData?.[0]?.totalRoas,
    };
  }, [campaignData, t]);

  const [chartData, setChartData] = useState([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [totalsLoading, setTotalsLoading] = useState(false);
  const [weekLoading, setWeekLoading] = useState(false);
  const weekRequestIdRef = useRef(0);

  useEffect(() => {
    if (campaignDate) {
      setDate(campaignDate);
    } else if (today) {
      setDate([new Date(today), new Date(today)]);
    }
  }, [campaignDate, today]);

  const [viewKeyWordData, setViewKeywordData] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleAdGroupClick = (row) => {
    window.open(`https://www.amazon.in/${row?.asin ?? row?.sku}/dp/${row?.asin ?? row?.sku}`, "_blank");
  };

  // placement
  const [placementData, setplacementData] = useState();

  const updatePlacementBid = async (campaignId, placement, newBid) => {
    const payload = {
      profileId: profileId?.value,
      campaignIds: [campaignId],
      ...(Boolean(placement === "Top of Search") && { topOfSearchBid: newBid }),
      ...(Boolean(placement === "Rest of Search") && { restOfSearchBid: newBid }),
      ...(Boolean(placement === "Product pages") && { productPageBid: newBid }),
    };
    await ApiUpdatePlacementBid(payload)
      .then(async (e) => {
        if (e?.isSuccess) {
          Toast.success(e?.message);
          getData();
        } else {
          Toast.error(e?.message);
        }
      })
      .catch(() => Toast.error(t("Something went wrong")));
  };

  // ─── AG Grid Column Definitions ───────────────────────────────────────────

  const placementColumns = useMemo(() => [
    {
      headerName: t("placement"),
      field: "placement",
      width: 140,
      pinned: "left",
      lockPinned: true,
      wrapText: true,
      autoHeight: true,
    },
    {
      headerName: t("bid Adjustment"),
      field: "placementModifier",
      width: 160,
      wrapText: true,
      autoHeight: true,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        return (
          <InlineEditPopup
            value={Number(row.placementModifier ?? "")}
            formatter={(v) => CurrencyFormat(v)}
            title={t("Bid")}
            currency={currencyCode}
            onSave={async (newBid) => await updatePlacementBid(row?.campaignId, row?.placement, newBid)}
            append={"%"}
            disabled={!PermissionCheck(SYSTEM_PAGES.CAMPAIGNS, PAGE_ACTIONS.UPDATE)}
          />
        );
      },
    },
    {
      headerName: t("spend"),
      field: "spend",
      cellRenderer: (params) => CurrencyCode(params.value),
    },
    {
      headerName: t("sales"),
      field: "sales",
      cellRenderer: (params) => CurrencyCode(params.value),
    },
    {
      headerName: t("acos"),
      field: "acos",
      cellRenderer: (params) => `${params.value}%`,
    },
    { headerName: t("roas"), field: "roas" },
    {
      headerName: t("Orders"),
      field: "orders",
      cellRenderer: (params) => CurrencyFormat(params.value ?? 0),
    },
    {
      headerName: t("impressions"),
      field: "impressions",
      cellRenderer: (params) => CurrencyFormat(params.value ?? 0),
    },
    {
      headerName: t("cpc"),
      field: "cpc",
      cellRenderer: (params) => CurrencyCode(params.value),
    },
    {
      headerName: t("clicks"),
      field: "clicks",
      cellRenderer: (params) => CurrencyFormat(params.value ?? 0),
    },
    {
      headerName: t("units"),
      field: "orders",
      cellRenderer: (params) => CurrencyFormat(params.value ?? 0),
    },
    { headerName: t("conversion"), field: "conversion" },
    {
      headerName: t("cvr"),
      field: "cvr",
      cellRenderer: (params) => `${params.value}%`,
    },
    {
      headerName: t("ctr"),
      field: "ctr",
      cellRenderer: (params) => `${params.value}%`,
    },
    {
      headerName: t("bidStartegy"),
      field: "bidStrategy",
      width: 200,
      cellRenderer: (params) => params.value || "-",
    },
  ], [t, currencyCode]);

  const adGroupColumns = useMemo(() => [
    // {
    //   headerName: "",
    //   field: "adGroupId",
    //   maxWidth: 50,
    //   pinned: "left",
    //   lockPinned: true,
    //   suppressMovable: true,
    //   headerComponent: () => (
    //     <div className="flex items-center justify-center" style={{ width: "100%" }}>
    //       <StyledCheckbox
    //         checked={selectAll}
    //         onChange={(e) => {
    //           if (e.target.checked) {
    //             setSelectedRows((grpData ?? []).map(row => row?.adGroupId).filter(Boolean));
    //             setSelectAll(true);
    //           } else {
    //             setSelectedRows([]);
    //             setSelectAll(false);
    //           }
    //         }}
    //       />
    //     </div>
    //   ),
    //   cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" },
    //   cellRenderer: (params) => {
    //     const row = params.data;
    //     if (!row?.adGroupId) return null;
    //     return (
    //       <StyledCheckbox
    //         checked={selectedRows.includes(row?.adGroupId)}
    //         onChange={(e) => {
    //           const rowId = row?.adGroupId;
    //           if (e.target.checked && rowId) {
    //             setSelectedRows(prev => [...prev, rowId]);
    //           } else {
    //             setSelectedRows(prev => prev.filter(id => id !== rowId));
    //             setSelectAll(false);
    //           }
    //         }}
    //       />
    //     );
    //   },
    // },
    {
      headerName: t("ads"),
      field: "name",
      width: 450,
      pinned: "left",
      lockPinned: true,
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        const statusClass =
          row.status === " " ? "cancelled"
            : row.status === "PAUSED" ? "pending"
              : row.status === "ENABLED" ? "completed"
                : row.status === "ARCHIVED" ? "archived" : "";
        return (
          <div
            className="flex items-center gap-3"
            style={{ color: "blue", padding: "10px 0", cursor: "pointer" }}
            onClick={() => {
              handleAdGroupClick(row);
              setKeywordId(row.adGroupId);
            }}
          >
            <img alt={row?.productName} src={row?.imageUrl} />
            <div className="campaignStatus w-full flex justify-start items-center pl-3">
              {!row?.isTotalRow && <div className={`customStatus ${statusClass}`}></div>}
              <div className="customTitle pl-3">
                <p className="product-name">{row?.productName}</p>
                {!row.total && <p className="m-0 text-black mt-2">{row.amount ? CurrencyCode(row.amount) : "-"}</p>}
                {row.total && <p className="text-black">{`${t("total")}:`} {row.total}</p>}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      headerName: `${t("sku")}/${t("asins")}`,
      field: "sku",
      width: 200,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      cellRenderer: (params) => {
        const row = params.data;
        return (
          <div onClick={() => handleAdGroupClick(row)} style={{ cursor: "pointer" }}>
            <p>{row?.sku}</p>
            <p>{row?.asin || "-"}</p>
          </div>
        );
      },
    },
    {
      headerName: t("spend"),
      field: "totalSpend",
      sortable: true,
      resizable: true,
      cellRenderer: (params) => {
        const row = params.data;
        return (
          <div onClick={() => { handleAdGroupClick(row); setKeywordId(row.adGroupId); }} style={{ cursor: "pointer" }}>
            {row?.totalSpend ? CurrencyCode(row.totalSpend) : "-"}
          </div>
        );
      },
    },
    {
      headerName: t("Orders"),
      field: "totalOrders",
      sortable: true,
      resizable: true,
      cellRenderer: (params) => {
        const row = params.data;
        return (
          <div onClick={() => { handleAdGroupClick(row); setKeywordId(row.adGroupId); }} style={{ cursor: "pointer" }}>
            {row?.totalOrders || "-"}
          </div>
        );
      },
    },
    {
      headerName: t("sales"),
      field: "totalSales",
      sortable: true,
      resizable: true,
      cellRenderer: (params) => {
        const row = params.data;
        return (
          <div onClick={() => { handleAdGroupClick(row); setKeywordId(row.adGroupId); }} style={{ cursor: "pointer" }}>
            {row?.totalSales ? CurrencyCode(row.totalSales) : "-"}
          </div>
        );
      },
    },
    {
      headerName: t("roas"),
      field: "totalRoas",
      sortable: true,
      resizable: true,
      cellRenderer: (params) => {
        const row = params.data;
        return (
          <div onClick={() => { handleAdGroupClick(row); setKeywordId(row.adGroupId); }} style={{ cursor: "pointer" }}>
            {row?.totalRoas || "-"}
          </div>
        );
      },
    },
  ], [t, selectedRows, selectAll, grpData]);

  const searchTermColumns = useMemo(() => [
    {
      headerName: t("customerSearchTerm"),
      field: "productName",
      width: 350,
      pinned: "left",
      lockPinned: true,
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        return (
          <div className="flex items-center gap-3" style={{ color: "blue", padding: "10px 0" }}>
            <div>
              {row?.isTotalRow ? (
                <b className="text-dark">{row?.productName}</b>
              ) : (
                <>
                  <p className="text-dark">{row?.productName}</p>
                  <b className="m-0 text-black">
                    {(row.searchTerm !== row.productName) ? `${t("asins")}:` : ""}
                    {row.searchTerm !== row.productName ? ` ${row?.searchTerm}`.toUpperCase() : ""}
                  </b>
                </>
              )}
            </div>
          </div>
        );
      },
    },
    {
      headerName: t("impressions"),
      field: "totalImpressions",
      width: 140,
      sortable: true,
      resizable: true,
      cellRenderer: (params) => CurrencyFormat(params.value ?? 0) || "-",
    },
    {
      headerName: t("clicks"),
      field: "totalClicks",
      sortable: true,
      resizable: true,
      cellRenderer: (params) => CurrencyFormat(params.value ?? 0) || "-",
    },
    {
      headerName: t("sales"),
      field: "totalSales",
      sortable: true,
      resizable: true,
      cellRenderer: (params) => params.value ? CurrencyCode(params.value) : "-",
    },
    {
      headerName: t("Orders"),
      field: "totalOrders",
      width: 110,
      sortable: true,
      resizable: true,
      cellRenderer: (params) => CurrencyFormat(params.value ?? 0) || "-",
    },
    {
      headerName: t("spend"),
      field: "totalSpend",
      sortable: true,
      resizable: true,
      cellRenderer: (params) => params.value ? CurrencyCode(params.value) : "-",
    },
    {
      headerName: t("acos"),
      field: "totalAcos",
      sortable: true,
      resizable: true,
      cellRenderer: (params) => `${params.value}%` || "-",
    },
    {
      headerName: t("roas"),
      field: "totalRoas",
      sortable: true,
      resizable: true,
      cellRenderer: (params) => `${params.value}` || "-",
    },
    {
      headerName: t("ctr"),
      field: "totalCtr",
      sortable: true,
      resizable: true,
      cellRenderer: (params) => `${params.value}%` || "-",
    },
    {
      headerName: t("cpc"),
      field: "totalCpc",
      sortable: true,
      resizable: true,
      cellRenderer: (params) => params.value ? CurrencyCode(params.value) : "-",
    },
    {
      headerName: t("conversionRate"),
      field: "totalCvr",
      width: 180,
      sortable: true,
      resizable: true,
      cellRenderer: (params) => `${params.value}%` || "-",
    },
  ], [t]);

  const keywordColumns = useMemo(() => [
    {
      headerName: t("keywordName"),
      field: "keywordName",
      width: 150,
      pinned: "left",
      lockPinned: true,
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        const statusClass =
          row.status === " " ? "cancelled"
            : row.status === "PAUSED" ? "pending"
              : row.status === "ENABLED" ? "completed"
                : row.status === "ARCHIVED" ? "archived" : null;
        return (
          <div className="campaignStatus w-full flex justify-between items-center">
            {!row?.isTotalRow && <div className={`customStatus ${statusClass}`}></div>}
            <div className="customTitle pl-2">{row.keywordName}</div>
          </div>
        );
      },
    },
    { headerName: t("bid"), field: "bid", cellRenderer: (params) => params.value || "-" },
    {
      headerName: t("spend"),
      field: "totalSpend",
      sortable: true,
      resizable: true,
      cellRenderer: (params) => CurrencyCode(params.value) || "-",
    },
    {
      headerName: t("sales"),
      field: "totalSales",
      sortable: true,
      resizable: true,
      cellRenderer: (params) => CurrencyCode(params.value) || "-",
    },
    {
      headerName: t("acos"),
      field: "totalAcos",
      sortable: true,
      resizable: true,
      cellRenderer: (params) => `${params.value}%` || "-",
    },
    {
      headerName: t("roas"),
      field: "totalRoas",
      sortable: true,
      resizable: true,
      cellRenderer: (params) => `${params.value}` || "-",
    },
    {
      headerName: t("Orders"),
      field: "orders",
      sortable: true,
      resizable: true,
      cellRenderer: (params) => CurrencyFormat(params.value ?? 0) || "-",
    },
    {
      headerName: t("impressions"),
      field: "totalImpressions",
      width: 120,
      resizable: true,
      cellRenderer: (params) => CurrencyFormat(params.value ?? 0) || "-",
    },
    {
      headerName: t("cpc"),
      field: "totalCpc",
      resizable: true,
      cellRenderer: (params) => CurrencyCode(params.value) || "-",
    },
    {
      headerName: t("clicks"),
      field: "totalClicks",
      resizable: true,
      cellRenderer: (params) => CurrencyFormat(params.value ?? 0) || "-",
    },
  ], [t]);

  const productColumns = useMemo(() => [
    {
      headerName: t("adType"),
      field: "adType",
      width: 150,
      pinned: "left",
      lockPinned: true,
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        const statusClass =
          row.status === " " ? "cancelled"
            : row.status === "PAUSED" ? "pending"
              : row.status === "ENABLED" ? "completed"
                : row.status === "ARCHIVED" ? "archived" : null;
        return (
          <div className="campaignStatus w-full flex justify-between items-center">
            {!row?.isTotalRow && <div className={`customStatus ${statusClass}`}></div>}
            <div className="customTitle pl-2">{row.adType}</div>
          </div>
        );
      },
    },
    {
      headerName: t("bid"),
      field: "bid",
      cellRenderer: (params) => params.value ? CurrencyCode(params.value) : "-",
    },
    { headerName: t("sku"), field: "sku", sortable: true, resizable: true, cellRenderer: (params) => params.value || "-" },
    { headerName: t("asins"), field: "asins", sortable: true, resizable: true, cellRenderer: (params) => params.value || "-" },
    {
      headerName: t("sales"),
      field: "totalSales",
      sortable: true,
      resizable: true,
      cellRenderer: (params) => params.value ? CurrencyCode(params.value) : "-",
    },
    {
      headerName: t("acos"),
      field: "totalAcos",
      sortable: true,
      resizable: true,
      cellRenderer: (params) => `${params.value}%` || "-",
    },
    {
      headerName: t("roas"),
      field: "totalRoas",
      sortable: true,
      resizable: true,
      cellRenderer: (params) => `${params.value}` || "-",
    },
    {
      headerName: t("Orders"),
      field: "orders",
      sortable: true,
      resizable: true,
      cellRenderer: (params) => CurrencyFormat(params.value ?? 0) || "-",
    },
    {
      headerName: t("impressions"),
      field: "totalImpressions",
      resizable: true,
      cellRenderer: (params) => CurrencyFormat(params.value ?? 0) || "-",
    },
    {
      headerName: t("cpc"),
      field: "totalCpc",
      resizable: true,
      cellRenderer: (params) => params.value ? CurrencyCode(params.value) : "-",
    },
    {
      headerName: t("clicks"),
      field: "totalClicks",
      resizable: true,
      cellRenderer: (params) => CurrencyFormat(params.value ?? 0) || "-",
    },
  ], [t]);

  const historyColumns = useMemo(() => [
    {
      headerName: t("Change level", "Change level"),
      field: "campaignDetails.name",
      colId: "changeLevel",
      title: "Change Level",
      minWidth: 260,
      flex: 1.6,
      sortable: true,
      resizable: true,
      wrapText: true,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        const campaignName = row?.campaignDetails?.name || row?.campaignName || effectiveCampaignDetails?.name || "";
        const campaignId = row?.campaignDetails?.campaignId || row?.campaignId || effectiveCampaignId || row?.changeLevel;
        const adGroupName = row?.adGroupDetails?.name || row?.adGroupName || "";
        const isAdGroup = isAdGroupLevelChange(row);
        const primaryAdGroup = adGroupName || (row?.adGroupId ? `AdGroup #${row.adGroupId}` : "") || campaignName;

        return (
          <div className="flex flex-col justify-center h-full w-full min-w-0 leading-tight py-1">
            {isAdGroup && (primaryAdGroup || campaignName) ? (
              <div className="flex flex-col gap-0.5 min-w-0">
                {/* Line 1: Ad group: <name> */}
                <div className="flex items-center min-w-0 text-[12px] font-semibold">
                  <span className="text-slate-500 dark:text-slate-400 mr-1 flex-shrink-0 font-medium">
                    {t("Ad Group")}:
                  </span>
                  <span
                    className="truncate cursor-pointer text-sky-600 dark:text-[#38bdf8] hover:underline font-semibold"
                    title={primaryAdGroup}
                    onClick={(e) => {
                      e.stopPropagation();
                      openCampaignViewInNewTab(row, campaignName, { campaignId });
                    }}
                  >
                    {primaryAdGroup}
                  </span>
                </div>
                {/* Line 2: Campaign: <name> */}
                {campaignName && (
                  <div className="flex items-center min-w-0 text-[11px]">
                    <span className="text-slate-400 dark:text-slate-500 mr-1 flex-shrink-0">
                      {t("Campaign")}:
                    </span>
                    <span
                      className="truncate cursor-pointer text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 hover:underline"
                      title={campaignName}
                      onClick={(e) => {
                        e.stopPropagation();
                        openCampaignViewInNewTab(row, campaignName, { campaignId });
                      }}
                    >
                      {campaignName}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              /* Campaign Level: Campaign: <name> */
              <div className="flex items-center min-w-0 text-[12px]">
                <span className="text-slate-500 dark:text-slate-400 mr-1 flex-shrink-0 font-medium">
                  {t("Campaign")}:
                </span>
                <span
                  className="truncate cursor-pointer text-sky-600 dark:text-[#38bdf8] hover:underline font-semibold"
                  title={campaignName}
                  onClick={(e) => {
                    e.stopPropagation();
                    openCampaignViewInNewTab(row, campaignName, { campaignId });
                  }}
                >
                  {campaignName}
                </span>
              </div>
            )}
          </div>
        );
      },
    },
    {
      headerName: t("Change type", "Change type"),
      field: "changeType",
      colId: "changeType",
      title: "Change Type",
      minWidth: 240,
      flex: 1.8,
      sortable: true,
      resizable: true,
      wrapText: true,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        const text = formatAmazonChangeType(row);
        return (
          <div className="flex items-center h-full w-full min-w-0 py-1">
            <span
              className="truncate text-[12px] font-medium text-slate-800 dark:text-slate-200"
              title={text}
            >
              {text}
            </span>
          </div>
        );
      },
    },
    {
      headerName: t("From"),
      field: "oldValue",
      title: "From",
      minWidth: 90,
      flex: 0.8,
      sortable: true,
      resizable: true,
      wrapText: true,
      cellRenderer: (params) => {
        const val = params.value;
        if (val === undefined || val === null || val === "—" || val === "") {
          return (
            <div className="flex items-center h-full">
              <span className="text-slate-400">—</span>
            </div>
          );
        }
        const formatted = !isNaN(Number(val)) ? CurrencyFormat(val) : val;
        return (
          <div className="flex items-center h-full">
            <span className="font-semibold text-rose-600 dark:text-rose-400 font-mono text-[12px] truncate" title={formatted}>
              {formatted}
            </span>
          </div>
        );
      },
    },
    {
      headerName: t("To"),
      field: "newValue",
      title: "To",
      minWidth: 90,
      flex: 0.8,
      sortable: true,
      resizable: true,
      wrapText: true,
      cellRenderer: (params) => {
        const val = params.value;
        if (val === undefined || val === null || val === "—" || val === "") {
          return (
            <div className="flex items-center h-full">
              <span className="text-slate-400">—</span>
            </div>
          );
        }
        const formatted = !isNaN(Number(val)) ? CurrencyFormat(val) : val;
        return (
          <div className="flex items-center h-full">
            <span className="font-semibold text-emerald-600 dark:text-emerald-400 font-mono text-[12px] truncate" title={formatted}>
              {formatted}
            </span>
          </div>
        );
      },
    },
    {
      headerName: t("Triggered From", "Triggered From"),
      field: "triggerSource",
      title: "Triggered From",
      minWidth: 135,
      flex: 1.1,
      sortable: true,
      resizable: true,
      wrapText: true,
      cellRenderer: (params) => {
        const row = params.data;
        const source = row?.triggerSource || (
          row?.updatedFrom === "Amazon Stream" || row?.source === "AMAZON_SQS" || row?.source === "AMAZON_API"
            ? "Amazon API"
            : (row?.changeType || "").toLowerCase().match(/dayparting/)
              ? "Dayparting"
              : (row?.changeType || "").toLowerCase().match(/rule|cron job/)
                ? "Rule"
                : (row?.changeType || "").toLowerCase().match(/recommendation/)
                  ? "Recommendation"
                  : "Manual"
        );

        let bg = "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800/60";
        let dotColor = "bg-blue-600 dark:bg-blue-400";
        let label = "Manual";

        if (source === "Amazon API" || source === "Amazon SQS") {
          bg = "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/60";
          dotColor = "bg-amber-500 dark:bg-amber-400";
          label = "Amazon API";
        } else if (source === "Rule") {
          bg = "bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800/60";
          dotColor = "bg-purple-500 dark:bg-purple-400";
          label = "Rule";
        } else if (source === "Dayparting") {
          bg = "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800/60";
          dotColor = "bg-indigo-500 dark:bg-indigo-400";
          label = "Dayparting";
        } else if (source === "Recommendation") {
          bg = "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/60";
          dotColor = "bg-emerald-500 dark:bg-emerald-400";
          label = "Recommendation";
        }

        return (
          <div className="flex items-center h-full">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide border ${bg}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
              {t(label)}
            </span>
          </div>
        );
      },
    },
    {
      headerName: t("updatedFrom"),
      field: "updatedFrom",
      title: "Updated From",
      minWidth: 110,
      flex: 1,
      sortable: true,
      resizable: true,
      wrapText: true,
      cellRenderer: (params) => {
        if (!params.value) return null;
        return (
          <div className="flex items-center h-full">
            <span className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded text-[11px] font-semibold">
              {params.value}
            </span>
          </div>
        );
      },
    },
    {
      headerName: t("dateAndTime"),
      field: "createdAt",
      title: "Date And Time",
      minWidth: 165,
      flex: 1.3,
      sortable: true,
      resizable: true,
      wrapText: true,
      cellRenderer: (params) => {
        if (!params.value) return <div className="flex items-center h-full"><span className="text-slate-400">—</span></div>;
        const formatted = moment(params.value).format("DD/MM/YYYY hh:mm:ss A");
        const parts = formatted.split(" ");
        const datePart = parts[0] || "";
        const timePart = parts.slice(1).join(" ") || "";
        return (
          <div className="flex flex-col justify-center h-full leading-tight py-1">
            <div className="flex items-center gap-1.5">
              <FiClock className="text-slate-400 flex-shrink-0" size={12} />
              <span className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">{datePart}</span>
            </div>
            {timePart && <span className="text-[10px] text-slate-400 pl-[18px]">{timePart}</span>}
          </div>
        );
      },
    },
  ], [t, effectiveCampaignDetails?.name, effectiveCampaignId]);

  // ─── Data State ───────────────────────────────────────────────────────────

  const [searchTermData, setSearchTermData] = useState();
  const [searchTermLoading, setSearchTermLoading] = useState(false);
  const [grpRowsPerPage, setGrpRowRowsPerPage] = useState(firstPageRows);
  const [searchTermRowsPerPage, setSearchTermRowsPerPage] = useState(firstPageRows);
  const [grpTotalRecords, setgrpTotalRecords] = useState(0);
  const [searchTermTotalRecords, setSearchTermTotalRecords] = useState(0);
  const [grpCurrentPage, setgrpCurrentPage] = useState(1);
  const [searchTermCurrentPage, setSearchTermCurrentPage] = useState(1);
  const [keywordData, setkeywordData] = useState();
  const [keyRowsPerPage, setkeyRowRowsPerPage] = useState(firstPageRows);
  const [keyTotalRecords, setkeyTotalRecords] = useState(0);
  const [keyCurrentPage, setkeyCurrentPage] = useState(1);
  const [weekRender, setweekRender] = useState(false);
  const [productFlag, setProductFlag] = useState(false);
  const [productRowsPerPage, setproductRowRowsPerPage] = useState(firstPageRows);
  const [productTotalRecords, setproductTotalRecords] = useState(0);
  const [productCurrentPage, setproductCurrentPage] = useState(1);
  const [productStatus, setProductStatus] = useState();

  // ─── API Calls ─────────────────────────────────────────────────────────────

  const fromDateStr = date?.[0] ? moment(date[0]).format("YYYY-MM-DD") : (today ? moment(today).format("YYYY-MM-DD") : "");
  const toDateStr = date?.[1] ? moment(date[1]).format("YYYY-MM-DD") : (today ? moment(today).format("YYYY-MM-DD") : "");

  const HistoryList = async (args = {}) => {
    if (profileId?.value && selectedAdType && (effectiveCampaignId || effectiveCampaignDetails?.name)) {
      setHistoryLoading(true);
      const activeDateOption = args?.dateOption || historyDateOption;
      const data = {
        ...(activeDateOption === "selected" && {
          fromDate: fromDateStr,
          toDate: toDateStr,
        }),
        profileId: profileId?.value,
        ...(effectiveCampaignId && { campaignId: Number(effectiveCampaignId) || effectiveCampaignId }),
        ...(effectiveCampaignDetails?.name && !effectiveCampaignId && { searchName: effectiveCampaignDetails?.name }),
        pageNo: args?.pageNo || historyArg.pageNo,
        perPage: args?.perPage || perPage,
        ...args,
      };
      await ApiHistory(data)
        .then((e) => {
          if (e?.isSuccess) {
            setHistoryData(e);
          } else {
            Toast.error(e?.message);
          }
        })
        .catch(() => Toast.error(t("Something went wrong")))
        .finally(() => {
          setHistoryLoading(false);
        });
    }
  };

  const getData = (GrpPage, GrpPerPage, keyPage, keyPerPage) => {
    if (profileId?.value && selectedAdType && fromDateStr && effectiveCampaignId) {
      setTotalsLoading(true);
      const data = {
        profileId: profileId.value,
        fromDate: fromDateStr,
        toDate: toDateStr,
        keywordPageNo: keyPage || keyCurrentPage,
        keywordPerPage: keyPerPage || keyRowsPerPage,
        adGroupPageNo: GrpPage || grpCurrentPage,
        adGroupPerPage: GrpPerPage || grpRowsPerPage,
        status: status,
      };
      ApiViewCampaign(effectiveCampaignId, data)
        .then((res) => {
          if (res?.isSuccess) {
            setGrpData(res.getAdGroupsData);
            setCampaignData(res.getCampaignData);
            setgrpTotalRecords(res.totalAdGroupData);
            setkeyTotalRecords(res.totalKeywordData);
            if (res?.getPlacementData?.[0]?.placementsData) {
              setplacementData(res.getPlacementData[0].placementsData);
              setActiveEventKey("0");
            }
          }
        })
        .catch(() => { })
        .finally(() => {
          setTotalsLoading(false);
        });
    }
  };

  const getSearchTermData = (searchTermPage, searchTermPerPage, ...args) => {
    if (profileId?.value && selectedAdType && fromDateStr && effectiveCampaignId) {
      setSearchTermLoading(true);
      const data = {
        profileId: profileId.value,
        fromDate: fromDateStr,
        toDate: toDateStr,
        searchTermPageNo: searchTermPage || searchTermCurrentPage,
        searchTermPerPage: searchTermPerPage || searchTermRowsPerPage,
        status: searchTermStatus,
        fieldName: 'totalSales',
        sortType: 'DESC',
        ...args?.[0],
      };
      // This campaign belongs to one ad type; when opened from the combined
      // "All" view, pin that type so the per-type search-term collection is
      // queried (otherwise the request would fall back to SP for SB/SD).
      const rowAdType = campaignDetails?.adType;
      const stOptions = ["SP", "SB", "SD"].includes(rowAdType)
        ? { headers: { adType: rowAdType } }
        : {};
      ApiSearchTermCampaign(effectiveCampaignId, data, stOptions)
        .then((res) => {
          if (res?.isSuccess) {
            if (res?.totalRow && res?.getSearchTermData?.length) {
              setSearchTermData([...res?.getSearchTermData, { ...res?.totalRow, isTotalRow: true }]);
            } else {
              setSearchTermData(res.getSearchTermData);
            }
            setSearchTermTotalRecords(res.totalSearchTermData);
          }
        })
        .catch(() => { })
        .finally(() => {
          setSearchTermLoading(false);
        });
    }
  };

  const getCampaignChatData = async () => {
    if (!profileId?.value || !effectiveCampaignId || !fromDateStr) return;
    setChartLoading(true);
    const data = {
      profileId: profileId?.value,
      status: status,
      type: selectedAdType?.value || selectedAdType || effectiveCampaignDetails?.type || "SP",
      fromDate: fromDateStr,
      toDate: toDateStr,
      campaignId: effectiveCampaignId,
      filteredCampaignIds: [effectiveCampaignId],
    };
    await ApiCampaignChartListing(data)
      .then((e) => {
        if (e?.isSuccess) {
          setChartData(e?.data);
          dispatch(handleLoader(false));
        } else {
          Toast.error(e?.message);
        }
      })
      .catch(() => Toast.error(t("Something went wrong")))
      .finally(() => {
        setChartLoading(false);
      });
  };

  const getWeekData = (typeVal = type) => {
    if (profileId?.value && selectedAdType && fromDateStr && effectiveCampaignId) {
      const currentReqId = ++weekRequestIdRef.current;
      setWeekLoading(true);
      const data = {
        profileId: profileId.value,
        fromDate: fromDateStr,
        toDate: toDateStr,
        type: typeVal,
      };
      ApiGetCampaignDataTable(effectiveCampaignId, data)
        .then((res) => {
          if (currentReqId === weekRequestIdRef.current) {
            if (res?.isSuccess) {
              setweekData(res.dataTable || []);
              if (!placementData) setActiveEventKey("1");
            } else {
              setweekData([]);
            }
          }
        })
        .catch(() => {
          if (currentReqId === weekRequestIdRef.current) {
            setweekData([]);
          }
        })
        .finally(() => {
          if (currentReqId === weekRequestIdRef.current) {
            setWeekLoading(false);
          }
        });
    }
  };

  useEffect(() => {
    if (viewPress && profileId?.value && effectiveCampaignId && fromDateStr) {
      getCampaignChatData();
    }
  }, [viewPress, profileId?.value, selectedAdType, fromDateStr, toDateStr, status, effectiveCampaignId]);

  useEffect(() => {
    if (viewPress && profileId?.value && effectiveCampaignId && fromDateStr && activeAccordionKeys.includes("1") && activeEventKey === "1") {
      getWeekData();
    }
  }, [viewPress, activeAccordionKeys, activeEventKey, profileId?.value, selectedAdType, type, fromDateStr, toDateStr, effectiveCampaignId]);

  useEffect(() => {
    if (viewPress && profileId?.value && effectiveCampaignId && fromDateStr) {
      getData();
    }
  }, [viewPress, fromDateStr, toDateStr, profileId?.value, selectedAdType, status, effectiveCampaignId]);

  useEffect(() => {
    if (viewPress && profileId?.value && (effectiveCampaignId || effectiveCampaignDetails?.name) && fromDateStr && activeAccordionKeys.includes("6")) {
      HistoryList({ pageNo: historyArg.pageNo, perPage, dateOption: historyDateOption });
    }
  }, [
    viewPress,
    activeAccordionKeys,
    historyDateOption === "selected" ? `${fromDateStr}-${toDateStr}` : null,
    historyDateOption,
    profileId?.value,
    selectedAdType,
    effectiveCampaignId,
    effectiveCampaignDetails?.name,
  ]);

  useEffect(() => {
    if (viewPress && profileId?.value && effectiveCampaignId && fromDateStr && activeAccordionKeys.includes("3")) {
      getSearchTermData();
    }
  }, [viewPress, activeAccordionKeys, fromDateStr, toDateStr, profileId?.value, selectedAdType, searchTermStatus, effectiveCampaignId]);

  // ─── Memoised derived data ────────────────────────────────────────────────

  const summaryAdGroupData = useMemo(() => {
    if (!grpData || grpData?.length === 0) return null;
    return grpData?.reduce(
      (acc, row) => ({
        totalSpend: acc.totalSpend + (row.totalSpend || 0),
        totalOrders: acc.totalOrders + (row.totalOrders || 0),
        totalSales: acc.totalSales + (row.totalSales || 0),
        totalRoas: acc.totalRoas + (row.totalRoas || 0),
      }),
      { totalSpend: 0, totalOrders: 0, totalSales: 0, totalRoas: 0 }
    );
  }, [grpData]);

  const adGrouptableData = useMemo(() => {
    if (!summaryAdGroupData) return grpData;
    const summaryRow = {
      total: grpTotalRecords ?? 0,
      status: "",
      totalSpend: summaryAdGroupData?.totalSpend ?? "",
      totalOrders: summaryAdGroupData?.totalOrders || "-",
      totalSales: summaryAdGroupData?.totalSales ?? "",
      totalRoas: summaryAdGroupData?.totalRoas || "-",
    };
    return [summaryRow, ...(grpData ?? [])];
  }, [summaryAdGroupData, grpData]);

  const tableData = useMemo(() => searchTermData, [searchTermData]);

  // ─── Sort handlers ────────────────────────────────────────────────────────

  const handleSearchTermSortChanged = (e) => {
    const sortModel = e.columns;
    if (!sortModel || sortModel.length === 0) return;
    const { colId, sortDef: { direction: sort } } = sortModel?.reverse()?.[0];
    getSearchTermData(searchTermCurrentPage, searchTermRowsPerPage, { fieldName: colId, ...(sort && { sortType: sort === "asc" ? "ASC" : "DESC" }) });
  };

  // ─── Misc handlers ────────────────────────────────────────────────────────

  const handleToggle = (eventKey) => setActiveEventKey(eventKey);

  function CustomToggle({ children, eventKey, activeEventKey, onToggle }) {
    const isActive = eventKey === activeEventKey;
    const decoratedOnClick = useAccordionButton(eventKey);
    return (
      <Button
        variant={isActive ? "default" : "outline"}
        className={`me-2 ${isActive ? "bg-blue-600 hover:bg-blue-700 text-white" : ""}`}
        onClick={() => { decoratedOnClick(); onToggle(eventKey); }}
      >
        {children}
      </Button>
    );
  }

  const handlePerRowsChange = async (perPage, pageNo) => {
    setPerPage(perPage);
    await HistoryList({ pageNo, perPage });
  };

  const handleAction = (action) => {
    if (action === "adjust-bid") setShowBidModal(true);
  };

  const handleSave = async () => {
    const numericValue = parseFloat(bidValue);
    if (isNaN(numericValue) || numericValue < 1) {
      setError(`Bid must be at least ${currency}1.00`);
      return;
    }
    setShowBidModal(false);
  };

  const handleAccordionSelect = useCallback((eventKey) => {
    if (Array.isArray(eventKey)) {
      setActiveAccordionKeys(eventKey.map(String));
      return;
    }
    if (eventKey === null || eventKey === undefined) return;

    const keyStr = String(eventKey);
    setActiveAccordionKeys((prev) => {
      const currentKeys = Array.isArray(prev) ? prev.map(String) : [];
      if (currentKeys.includes(keyStr)) {
        return currentKeys.filter((k) => k !== keyStr);
      } else {
        return [...currentKeys, keyStr];
      }
    });
  }, []);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="middle_container">
      <div id="view-campaign" className="mb-[50px]">
        {/* ── Breadcrumb ── */}
        <div className="mb-3 px-1">
          <Breadcrumb
            paths={[
              { label: t("Campaigns"), link: "/campaigns" },
              { label: campaignData?.[0]?.name || effectiveCampaignDetails?.name || t("View Campaign") }
            ]}
            onBack={() => {
              if (props.handleBack) {
                props.handleBack();
              } else if (props.setViewPress) {
                props.setViewPress(false);
              } else {
                navigate("/campaigns");
              }
            }}
          />
        </div>

        {/* ── STICKY CAMPAIGN HEADER ── */}
        <div
          id="view-campaign-header"
          className={`glass-sticky-header ${!isMobile ? "sticky-top" : ""}`}
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            flexWrap: "wrap",
            columnGap: 12,
            rowGap: 10,
            padding: isMobile ? "12px 16px" : "12px 24px",
            zIndex: 90,
            marginLeft: 0,
            marginRight: 0,
            marginTop: "-10px",
            marginBottom: "20px",
          }}
        >
          <div className="w-full flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h5 className="font-semibold text-base m-0 text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <span className="text-slate-500 dark:text-slate-400 font-medium">{t("campaigns")}:</span>
                <span className="font-bold text-slate-900 dark:text-white text-capitalize">{campaignData?.[0]?.name || effectiveCampaignDetails?.name}</span>
              </h5>
              <div className="filTypeBox">
                <DateRangePicker
                  className="w-full sm:w-[260px]"
                  ranges={predefinedRanges}
                  value={date}
                  placeholder={t("Select Date")}
                  onChange={(e) => setDate(e)}
                  format="yyyy-MM-dd"
                  placement="bottomEnd"
                  cleanable={false}
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center text-slate-600 dark:text-slate-300 text-xs gap-3.5 mt-1">
              <div className="flex items-center">
                <span className="font-semibold mr-1.5 text-slate-700 dark:text-slate-300">{t("status")}:</span>
                <div className={`${(campaignData?.[0]?.status || effectiveCampaignDetails?.status) === "PAUSED" ? "pending"
                  : (campaignData?.[0]?.status || effectiveCampaignDetails?.status) === "ENABLED" ? "completed"
                    : (campaignData?.[0]?.status || effectiveCampaignDetails?.status) === "ARCHIVED" ? "archived"
                      : (campaignData?.[0]?.status || effectiveCampaignDetails?.status) === "OUT_OF_BUDGET" ? "outOfBudget"
                        : null
                  } status text-capitalize`}>
                  {campaignData?.[0]?.status || effectiveCampaignDetails?.status}
                </div>
              </div>
              <div className="flex items-center">
                <span className="font-semibold mr-1.5 text-slate-700 dark:text-slate-300">{t("Type")}:</span>
                <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-white border border-slate-300 dark:border-slate-700 shadow-xs capitalize">
                  {campaignData?.[0]?.type || effectiveCampaignDetails?.type}
                </span>
              </div>
              <div className="flex items-center">
                <span className="font-semibold mr-1.5 text-slate-700 dark:text-slate-300">{t("Schedule")}:</span>
                <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-white border border-slate-300 dark:border-slate-700 shadow-xs">
                  {(campaignData?.[0]?.startDate || effectiveCampaignDetails?.startDate) ? (
                    `${moment(campaignData?.[0]?.startDate || effectiveCampaignDetails?.startDate).format("MMM DD, YYYY")} - ${
                      Boolean(campaignData?.[0]?.endDate || effectiveCampaignDetails?.endDate)
                        ? moment(campaignData?.[0]?.endDate || effectiveCampaignDetails?.endDate).format("MMM DD, YYYY")
                        : "No end date"
                    }`
                  ) : (
                    "No schedule available"
                  )}
                </span>
              </div>
              <div className="flex items-center">
                <span className="font-semibold mr-1.5 text-slate-700 dark:text-slate-300">{t("Budget")}:</span>
                <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-white border border-slate-300 dark:border-slate-700 shadow-xs capitalize">
                  {CurrencyCode(campaignData?.[0]?.budget ?? effectiveCampaignDetails?.budget ?? 0)}
                  {(campaignData?.[0]?.budgetType || effectiveCampaignDetails?.budgetType)
                    ? ` - ${campaignData?.[0]?.budgetType || effectiveCampaignDetails?.budgetType}`
                    : ""}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── KPI Cards + Chart ── */}
        <Chart chartLoading={chartLoading} isTotalsLoading={totalsLoading} chartData={chartData} totalRow={sumOfValues} id="view-campaign-chart" />

        {/* ── Accordions ── */}
        <Accordion
          activeKey={activeAccordionKeys}
          alwaysOpen
          className="view-campaign-accordion"
          onSelect={handleAccordionSelect}
        >

          {/* Ad Groups */}
          <Accordion.Item eventKey="0">
            <Accordion.Header>{t("Ad groups")}</Accordion.Header>
            <Accordion.Body className="p-0">
              <AdGroupsSection
                campaignDetails={effectiveCampaignDetails}
                date={date}
                viewPress={viewPress}
              />
            </Accordion.Body>
          </Accordion.Item>

          {/* Placements */}
          <Accordion.Item eventKey="1">
            <Accordion.Header>{t("placements")}</Accordion.Header>
            <Accordion.Body className="p-0">
              <div className="w-full overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex flex-row gap-2 space-y-0">
                  <Button
                    type="button"
                    variant={activeEventKey === "0" ? "default" : "outline"}
                    className={`me-2 ${activeEventKey === "0" ? "bg-blue-600 hover:bg-blue-700 text-white" : ""}`}
                    onClick={() => setActiveEventKey("0")}
                  >
                    {t("Placements") || "Placements"}
                  </Button>
                  <Button
                    type="button"
                    variant={activeEventKey === "1" ? "default" : "outline"}
                    className={`me-2 ${activeEventKey === "1" ? "bg-blue-600 hover:bg-blue-700 text-white" : ""}`}
                    onClick={() => setActiveEventKey("1")}
                  >
                    {t("weeklyPlacementMetric")}
                  </Button>
                </div>

                {/* Placements AG Grid */}
                {activeEventKey === "0" && (
                  <div className="data_table" id="placement-table">
                    <AgTable
                      ref={placementGridRef}
                      tableId="placement-table"
                      rowData={placementData ?? []}
                      columnDefs={placementColumns}
                      totalRecords={placementData?.length ?? 0}
                      perPage={placementData?.length ?? 10}
                      currentPage={1}
                      paginationOptions={paginationRowsPerPageOptions}
                      height="auto"
                      minHeight="auto"
                      domLayout="autoHeight"
                      showPagination={false}
                    />
                  </div>
                )}

                {/* Weekly Table */}
                {activeEventKey === "1" && (
                  <div className="p-4">
                    <div className="data_table weekData_table">
                      <div className="week_filter flex items-center gap-2">
                        {[{ label: t("day"), val: 0 }, { label: t("week"), val: 1 }, { label: t("month"), val: 2 }].map(({ label, val }) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => {
                              if (type !== val) {
                                setweekData([]);
                                settype(val);
                              }
                            }}
                            className={type === val ? "active" : ""}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <div
                        className="weekly_table overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl mt-3 shadow-sm bg-white dark:bg-slate-900"
                        style={{ maxHeight: "450px", overflowY: "auto", overflowX: "auto" }}
                      >
                        <table className="w-full text-sm text-left text-slate-500 dark:text-slate-400 border-collapse">
                          <thead className="sticky top-0 z-10 text-xs text-slate-700 dark:text-slate-300 uppercase bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-800 font-semibold shadow-sm">
                            <tr>
                              <th className="px-4 py-3.5 text-center whitespace-nowrap bg-slate-100/50 dark:bg-slate-800 border-r border-slate-200 dark:border-slate-800">{type === 0 ? t("day") : type === 1 ? t("week") : t("month")}</th>
                              {[t("spend"), t("sales"), t("acos"), t("roas"), t("Orders"), t("impressions"), t("cpc"), t("clicks"), t("units"), t("conversion"), t("cvr"), t("ctr"), t("costPerOrder"), t("avgSalesPrice")].map(h => (
                                <th key={h} className="px-4 py-3.5 text-center whitespace-nowrap border-r border-slate-200 dark:border-slate-800 last:border-r-0">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                            {weekLoading ? (
                              <tr>
                                <td colSpan={15} className="px-4 py-16 text-center">
                                  <div className="flex flex-col items-center justify-center gap-3">
                                    <i className="fa-solid fa-circle-notch fa-spin text-3xl text-[#1A9FD4]" />
                                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{t("Loading data...")}</span>
                                  </div>
                                </td>
                              </tr>
                            ) : !weekData?.length ? (
                              <tr>
                                <td colSpan={15} className="px-4 py-10 text-center text-slate-500 dark:text-slate-400 font-medium">
                                  {t("No data available")}
                                </td>
                              </tr>
                            ) : (
                              weekData.map((el, i) => (
                                <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                                  <td className="px-4 py-3 text-center font-bold text-slate-900 dark:text-white whitespace-nowrap bg-slate-50/30 dark:bg-slate-800/30 border-r border-slate-200 dark:border-slate-800">
                                    {type === 1 || type === 2 ? (
                                      <span>
                                        {moment(el.fromDate).isValid() ? moment(el.fromDate).format("DD-MM-YYYY") : "-"}<br />
                                        {moment(el.toDate).isValid() ? moment(el.toDate).format("DD-MM-YYYY") : "-"}
                                      </span>
                                    ) : (
                                      moment(el.fromDate || el.toDate || el.reportDate).isValid()
                                        ? moment(el.fromDate || el.toDate || el.reportDate).format("DD-MM-YYYY")
                                        : "-"
                                    )}
                                  </td>
                                  <td className="px-4 py-3 text-center whitespace-nowrap border-r border-slate-200 dark:border-slate-800">{CurrencyCode(el.spend)}</td>
                                  <td className="px-4 py-3 text-center whitespace-nowrap border-r border-slate-200 dark:border-slate-800">{CurrencyCode(el.sales)}</td>
                                  <td className="px-4 py-3 text-center whitespace-nowrap border-r border-slate-200 dark:border-slate-800">{el.acos != null ? `${el.acos}%` : "-"}</td>
                                  <td className="px-4 py-3 text-center whitespace-nowrap border-r border-slate-200 dark:border-slate-800">{el.roas != null ? el.roas : "-"}</td>
                                  <td className="px-4 py-3 text-center whitespace-nowrap border-r border-slate-200 dark:border-slate-800">{CurrencyFormat(el?.orders ?? 0)}</td>
                                  <td className="px-4 py-3 text-center whitespace-nowrap border-r border-slate-200 dark:border-slate-800">{CurrencyFormat(el?.impressions ?? 0)}</td>
                                  <td className="px-4 py-3 text-center whitespace-nowrap border-r border-slate-200 dark:border-slate-800">{CurrencyCode(el.cpc)}</td>
                                  <td className="px-4 py-3 text-center whitespace-nowrap border-r border-slate-200 dark:border-slate-800">{CurrencyFormat(el?.clicks ?? 0)}</td>
                                  <td className="px-4 py-3 text-center whitespace-nowrap border-r border-slate-200 dark:border-slate-800">{CurrencyFormat(el?.units ?? el?.orders ?? 0)}</td>
                                  <td className="px-4 py-3 text-center whitespace-nowrap border-r border-slate-200 dark:border-slate-800">{el.conversion != null ? el.conversion : "-"}</td>
                                  <td className="px-4 py-3 text-center whitespace-nowrap border-r border-slate-200 dark:border-slate-800">{el.cvr != null ? `${el.cvr}%` : "-"}</td>
                                  <td className="px-4 py-3 text-center whitespace-nowrap border-r border-slate-200 dark:border-slate-800">{el.ctr != null ? `${el.ctr}%` : "-"}</td>
                                  <td className="px-4 py-3 text-center whitespace-nowrap border-r border-slate-200 dark:border-slate-800">{CurrencyCode(el.costPerOrder)}</td>
                                  <td className="px-4 py-3 text-center whitespace-nowrap">{CurrencyCode(el.avgSalesPrice)}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </Accordion.Body>
          </Accordion.Item>

          {/* Targeting Section */}
          <Accordion.Item eventKey="2">
            <Accordion.Header>{t("targeting")}</Accordion.Header>
            <Accordion.Body className="p-0">
              <TargetingSection
                campaignDetails={effectiveCampaignDetails}
                date={date}
                viewPress={viewPress}
              />
            </Accordion.Body>
          </Accordion.Item>

          {/* Search Terms AG Grid */}
          <Accordion.Item eventKey="3">
            <Accordion.Header>{t("searchTerm")}</Accordion.Header>
            <Accordion.Body className="p-0">
              <div className="w-full overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                      <Search className="w-4 h-4" />
                    </div>
                    <div>
                      <h5 className="text-base font-bold text-slate-800 dark:text-slate-100 m-0">
                        {t("searchTerm")}
                      </h5>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {searchTermTotalRecords || 0} {(searchTermTotalRecords || 0) === 1 ? t("record") : t("records")}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="data_table" id="searchterm-view-table">
                  <AgTable
                    ref={searchTermGridRef}
                    tableId="searchterm-view-table"
                    loading={searchTermLoading}
                    isLoading={searchTermLoading}
                    rowData={tableData}
                    columnDefs={searchTermColumns}
                    totalRecords={searchTermTotalRecords || 0}
                    perPage={searchTermRowsPerPage}
                    currentPage={searchTermCurrentPage}
                    onPageChange={(page) => {
                      setSearchTermCurrentPage(page);
                      getSearchTermData(page, searchTermRowsPerPage);
                    }}
                    onPerPageChange={(newPerPage) => {
                      setSearchTermRowsPerPage(newPerPage);
                      getSearchTermData(searchTermCurrentPage, newPerPage);
                    }}
                    onSortChanged={handleSearchTermSortChanged}
                    paginationOptions={paginationRowsPerPageOptions}
                  />
                </div>
              </div>
            </Accordion.Body>
          </Accordion.Item>

          {/* Keywords AG Grid */}
          {viewKeyWordData && (
            <Accordion.Item eventKey="4">
              <Accordion.Header>{t("keywords")}</Accordion.Header>
              <Accordion.Body className="p-0">
                <div className="w-full overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
                    <div><h5 className="text-base font-bold text-slate-800 dark:text-slate-100 m-0">{t("keywords")}</h5></div>
                    <div className="fil campaign_first">
                      <select
                        name="portfolio"
                        onChange={(e) => {
                          handleAdGroupClick({ status: e?.target?.value });
                          setKeywordStatus(e?.target?.value);
                        }}
                        value={keywordStatus}
                      >
                        <option value="">{t("allStatus")}</option>
                        <option value="ENABLED">{t("enabled")}</option>
                        <option value="PAUSED">{t("paused")}</option>
                        <option value="ENDED">{t("ended")}</option>
                        <option value="ARCHIVED">{t("archived")}</option>
                      </select>
                    </div>
                  </div>
                  <div className="data_table" id="keyword-view-table">
                    <AgTable
                      ref={keywordGridRef}
                      tableId="keyword-view-table"
                      rowData={keywordData}
                      columnDefs={keywordColumns}
                      totalRecords={keyTotalRecords || 0}
                      perPage={keyRowsPerPage}
                      currentPage={keyCurrentPage}
                      onPageChange={(page) => {
                        setkeyCurrentPage(page);
                      }}
                      onPerPageChange={(newPerPage) => {
                        setkeyRowRowsPerPage(newPerPage);
                      }}
                      paginationOptions={paginationRowsPerPageOptions}
                    />
                  </div>
                </div>
              </Accordion.Body>
            </Accordion.Item>
          )}

          {/* Product Ads AG Grid */}
          {productFlag && (
            <Accordion.Item eventKey="5">
              <Accordion.Header>{t("productAds")}</Accordion.Header>
              <Accordion.Body className="p-0">
                <div className="w-full overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
                    <div><h5 className="text-base font-bold text-slate-800 dark:text-slate-100 m-0">{t("productAds")}</h5></div>
                    <div className="fil campaign_first">
                      <select
                        name="portfolio"
                        onChange={(e) => setProductStatus(e?.target?.value)}
                        value={productStatus}
                      >
                        <option value="">{t("allStatus")}</option>
                        <option value="ENABLED">{t("enabled")}</option>
                        <option value="PAUSED">{t("paused")}</option>
                        <option value="ENDED">{t("ended")}</option>
                        <option value="ARCHIVED">{t("archived")}</option>
                      </select>
                    </div>
                  </div>
                  <div className="data_table" id="productads-view-table">
                    <AgTable
                      ref={productAdsGridRef}
                      tableId="productads-view-table"
                      rowData={productAds}
                      columnDefs={productColumns}
                      totalRecords={productTotalRecords || 0}
                      perPage={productRowsPerPage}
                      currentPage={productCurrentPage}
                      onPageChange={(page) => setproductCurrentPage(page)}
                      onPerPageChange={(newPerPage) => setproductRowRowsPerPage(newPerPage)}
                      paginationOptions={paginationRowsPerPageOptions}
                    />
                  </div>
                </div>
              </Accordion.Body>
            </Accordion.Item>
          )}

          {/* History AG Grid */}
          <Accordion.Item eventKey="6">
            <Accordion.Header>{t("History")}</Accordion.Header>
            <Accordion.Body className="p-0">
              <div className="w-full overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                      <History className="w-4 h-4" />
                    </div>
                    <div>
                      <h5 className="text-base font-bold text-slate-800 dark:text-slate-100 m-0">
                        {t("History")}
                      </h5>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {historyData?.totalRecords ?? 0} {(historyData?.totalRecords ?? 0) === 1 ? t("record") : t("records")}
                      </span>
                    </div>
                  </div>
                  <div className="w-[190px]">
                    <Select
                      value={historyDateOption}
                      onValueChange={(val) => {
                        setHistoryDateOption(val);
                        setHistoryArg(prev => ({ ...prev, pageNo: 1 }));
                      }}
                    >
                      <SelectTrigger className="h-[34px] text-xs font-semibold bg-white dark:bg-[#1e293b] border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100 rounded-lg shadow-sm">
                        <SelectValue placeholder={t("Select Date Range")} />
                      </SelectTrigger>
                      <SelectContent className="z-[99999]">
                        <SelectItem value="all">{t("Lifetime / All Time")}</SelectItem>
                        <SelectItem value="selected">{t("Selected Date Range")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div id="history-view-table" className="data_table">
                  <AgTable
                    ref={historyGridRef}
                    tableId="history-view-table"
                    loading={historyLoading}
                    isLoading={historyLoading}
                    rowData={historyData?.data}
                    columnDefs={historyColumns}
                    totalRecords={historyData?.totalRecords ?? 0}
                    perPage={perPage}
                    currentPage={historyArg.pageNo}
                    onPageChange={async (pageNo) => {
                      setHistoryArg(prev => ({ ...prev, pageNo }));
                      await HistoryList({ pageNo, perPage });
                    }}
                    onPerPageChange={async (newPerPage) => {
                      setHistoryArg({ pageNo: 1, perPage: newPerPage });
                      setPerPage(newPerPage);
                      await HistoryList({ pageNo: 1, perPage: newPerPage });
                    }}
                    paginationOptions={paginationRowsPerPageOptions}
                  />
                </div>
              </div>
            </Accordion.Body>
          </Accordion.Item>
        </Accordion>
      </div>

      {/* Adjust Bid Modal */}
      <Dialog open={showBidModal} onOpenChange={(open) => !open && setShowBidModal(false)}>
        <DialogContent className="max-w-lg p-6">
          <DialogHeader className="border-b border-slate-200 dark:border-slate-700 pb-3 flex flex-row items-center justify-between">
            <DialogTitle className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Adjust bid
            </DialogTitle>
            <span className="text-sky-600 dark:text-sky-400 text-sm font-semibold m-0">
              Selected: {selectedRows.length} {selectedRows.length === 1 ? "row" : "rows"}
            </span>
          </DialogHeader>
          <div className="py-4">
            <div className="flex items-center gap-2 mb-1">
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                <option value="₹">₹ - Rupees</option>
                <option value="$">$ - Dollars</option>
              </select>
              <input
                type="number"
                min="0"
                value={bidValue}
                onChange={(e) => { setBidValue(e.target.value); if (error) setError(""); }}
                placeholder={t("Enter bid")}
                className={`border rounded px-3 py-2 text-sm w-[120px] bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 ${error ? 'border-red-500' : 'border-slate-300 dark:border-slate-700'}`}
              />
            </div>
            {error && (
              <div className="text-red-500 text-xs mt-1 flex items-center gap-1">
                <i className="bi bi-exclamation-circle-fill"></i>
                {error}
              </div>
            )}
          </div>
          <DialogFooter className="border-t border-slate-200 dark:border-slate-700 pt-3 flex justify-end gap-2">
            <button
              type="button"
              className="px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              onClick={() => setShowBidModal(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#1A9FD4] to-[#2374F2] text-white font-semibold text-sm shadow-md shadow-blue-500/15 hover:opacity-95 disabled:opacity-50"
              onClick={handleSave}
              disabled={!!error}
            >
              Save changes
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ViewCampaign;