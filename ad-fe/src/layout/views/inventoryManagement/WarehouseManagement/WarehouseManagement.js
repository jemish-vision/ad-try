import React, { useState, useEffect, useContext, useCallback } from "react";
import moment from "moment";
import { ProfileContext } from "../../../../helper/usecontext/useContext";
import {
  ApiGetFcCards,
  ApiGetFcGeoDistribution,
  ApiGetFcInventoryGrid,
  ApiGetFcStorageFees,
  ApiGetFcList,
  ApiGetWarehouseMasterList,
  ApiSaveWarehouseLocation,
} from "../../../../api-wrapper/inventoryManagement/ApiFcInventory";
import AgTable from "../../../../common/grid/AgTable";
import { AppTooltip } from "../../../../components/ui/AppTooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../components/ui/select";
import { Input } from "../../../../components/ui/input";
import { Button } from "../../../../components/ui/button";

const WarehouseManagement = () => {
  const {
    profileId,
    selectedConfig,
    storeDara,
    profileData,
    selectedDate,
  } = useContext(ProfileContext);

  const activeProfileId = React.useMemo(() => {
    let pId = profileId?.value ?? profileId;
    if (Array.isArray(pId)) {
      pId = pId.length > 0 ? pId[0] : null;
    }
    if (pId && typeof pId === "object" && pId.value) {
      pId = pId.value;
    }
    if (pId && !isNaN(Number(pId)) && Number(pId) > 0) {
      return Number(pId);
    }

    const candidates = [
      selectedConfig?.profile?.profileId,
      selectedConfig?.profileId,
      profileData?.profile?.profileId,
      profileData?.profileId,
      storeDara?.profile?.profileId,
      storeDara?.profileId,
    ];

    for (const c of candidates) {
      if (c && !isNaN(Number(c)) && Number(c) > 0) return Number(c);
    }

    try {
      const raw = localStorage.getItem("profile");
      if (raw) {
        const parsed = JSON.parse(raw);
        const p = parsed?.profile?.profileId || parsed?.profileId;
        if (p && !isNaN(Number(p)) && Number(p) > 0) return Number(p);
      }
    } catch (e) {}
    return null;
  }, [profileId, selectedConfig, profileData, storeDara]);

  const activeConfigId = React.useMemo(() => {
    const candidates = [
      selectedConfig?.config?.configId,
      selectedConfig?.config?._id,
      selectedConfig?.configId,
      selectedConfig?._id,
      selectedConfig?.profile?.configId,
      storeDara?.config?.configId,
      storeDara?.config?._id,
      storeDara?.configId,
      storeDara?._id,
      storeDara?.profile?.configId,
      profileData?.configId,
      profileData?._id,
    ];

    for (const c of candidates) {
      if (c && typeof c === "string" && c.trim()) return String(c).trim();
      if (c && typeof c === "object" && c._id) return String(c._id);
    }

    try {
      const raw = localStorage.getItem("profile");
      if (raw) {
        const parsed = JSON.parse(raw);
        const c =
          parsed?.config?.configId ||
          parsed?.config?._id ||
          parsed?.configId ||
          parsed?.profile?.configId ||
          parsed?._id;
        if (c) return String(c).trim();
      }
    } catch (e) {}
    return null;
  }, [selectedConfig, storeDara, profileData]);

  const activeDateString = React.useMemo(() => {
    if (selectedDate && Array.isArray(selectedDate) && selectedDate[1]) {
      return moment(selectedDate[1]).format("YYYY-MM-DD");
    }
    return moment().format("YYYY-MM-DD");
  }, [selectedDate]);

  const [activeSubTab, setActiveSubTab] = useState("LEDGER"); // "LEDGER" | "STORAGE_FEES" | "WAREHOUSE_MASTER"
  const [cardsData, setCardsData] = useState(null);
  const [geoData, setGeoData] = useState(null);
  const [fcList, setFcList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [resolvedReportDate, setResolvedReportDate] = useState(null);

  // Filters
  const [selectedFc, setSelectedFc] = useState("ALL");
  const [selectedDisposition, setSelectedDisposition] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [totalRecords, setTotalRecords] = useState(0);
  const [gridData, setGridData] = useState([]);

  // Storage Fees Data
  const [storageFeeData, setStorageFeeData] = useState([]);
  const [storageFeeSummary, setStorageFeeSummary] = useState(null);

  // Warehouse Master Data
  const [warehouseMasterData, setWarehouseMasterData] = useState([]);

  // Fetch KPI Cards
  const fetchCards = useCallback(async () => {
    if (!activeProfileId) return;
    try {
      const res = await ApiGetFcCards({
        profileId: activeProfileId,
        configId: activeConfigId,
        date: activeDateString,
      });
      if (res?.isSuccess) {
        setCardsData(res.data);
      }
    } catch (e) {
      console.error("Error fetching FC cards:", e);
    }
  }, [activeProfileId, activeConfigId, activeDateString]);

  // Fetch Geo Distribution
  const fetchGeoDistribution = useCallback(async () => {
    if (!activeProfileId) return;
    try {
      const res = await ApiGetFcGeoDistribution({
        profileId: activeProfileId,
        configId: activeConfigId,
        date: activeDateString,
      });
      if (res?.isSuccess) {
        setGeoData(res.data);
      }
    } catch (e) {
      console.error("Error fetching FC Geo distribution:", e);
    }
  }, [activeProfileId, activeConfigId, activeDateString]);

  // Fetch FC List for Dropdown
  const fetchFcDropdown = useCallback(async () => {
    if (!activeProfileId) return;
    try {
      const res = await ApiGetFcList({
        profileId: activeProfileId,
        configId: activeConfigId,
      });
      if (res?.isSuccess && Array.isArray(res.data)) {
        setFcList(res.data);
      }
    } catch (e) {
      console.error("Error fetching FC list:", e);
    }
  }, [activeProfileId, activeConfigId]);

  // Fetch Ledger Grid
  const fetchGrid = useCallback(async () => {
    if (!activeProfileId) return;
    setLoading(true);
    try {
      const res = await ApiGetFcInventoryGrid({
        profileId: activeProfileId,
        configId: activeConfigId,
        date: activeDateString,
        fcCode: selectedFc,
        disposition: selectedDisposition,
        search: searchQuery,
        page,
        limit: perPage,
      });
      if (res?.isSuccess) {
        setGridData(res.data?.items || []);
        setTotalRecords(res.data?.totalRecords || 0);
        setResolvedReportDate(res.data?.reportDate || null);
      }
    } catch (e) {
      console.error("Error fetching FC grid:", e);
    } finally {
      setLoading(false);
    }
  }, [activeProfileId, activeConfigId, activeDateString, selectedFc, selectedDisposition, searchQuery, page, perPage]);

  // Fetch Storage Fees
  const fetchStorageFees = useCallback(async () => {
    if (!activeProfileId) return;
    setLoading(true);
    try {
      // Storage fee month based on 16th cutoff rule (day <= 16: 2 months prior; day > 16: 1 month prior)
      const refMoment = moment(activeDateString);
      const targetMonth = refMoment.date() <= 16
        ? refMoment.clone().subtract(2, "months").format("YYYY-MM")
        : refMoment.clone().subtract(1, "months").format("YYYY-MM");
      const res = await ApiGetFcStorageFees({
        profileId: activeProfileId,
        configId: activeConfigId,
        monthYear: targetMonth,
        fcCode: selectedFc,
        page,
        limit: perPage,
      });
      if (res?.isSuccess) {
        setStorageFeeData(res.data?.items || []);
        setStorageFeeSummary(res.data?.summary || null);
        setTotalRecords(res.data?.totalRecords || 0);
      }
    } catch (e) {
      console.error("Error fetching FC storage fees:", e);
    } finally {
      setLoading(false);
    }
  }, [activeProfileId, activeConfigId, activeDateString, selectedFc, page, perPage]);

  // Fetch Master Warehouses List
  const fetchWarehouseMaster = useCallback(async () => {
    setLoading(true);
    try {
      const res = await ApiGetWarehouseMasterList({
        countryCode: "IN",
        search: searchQuery,
      });
      if (res?.isSuccess) {
        setWarehouseMasterData(res.data || []);
        setTotalRecords(res.data?.length || 0);
      }
    } catch (e) {
      console.error("Error fetching warehouse master list:", e);
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    fetchCards();
    fetchGeoDistribution();
    fetchFcDropdown();
  }, [fetchCards, fetchGeoDistribution, fetchFcDropdown]);

  useEffect(() => {
    if (activeSubTab === "LEDGER") {
      fetchGrid();
    } else if (activeSubTab === "STORAGE_FEES") {
      fetchStorageFees();
    } else if (activeSubTab === "WAREHOUSE_MASTER") {
      fetchWarehouseMaster();
    }
  }, [activeSubTab, fetchGrid, fetchStorageFees, fetchWarehouseMaster]);

  // Columns for Ledger Grid
  const ledgerColumns = [
    {
      headerName: "Fulfillment Center",
      field: "fcCode",
      width: 170,
      cellRenderer: (params) => {
        const row = params.data;
        return (
          <div className="flex flex-col py-1">
            <span className="font-semibold text-blue-600 dark:text-blue-400">{row.fcCode}</span>
            <span className="text-xs text-gray-500">{row.city ? `${row.city}, ${row.state}` : row.state || "Amazon FC"}</span>
          </div>
        );
      },
    },
    {
      headerName: "Product / ASIN / SKU",
      field: "asin",
      width: 250,
      cellRenderer: (params) => {
        const row = params.data;
        return (
          <div className="flex flex-col py-1 overflow-hidden">
            <span className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{row.title || row.sku}</span>
            <div className="flex gap-2 text-xs text-gray-500">
              <span>ASIN: <b className="text-gray-700 dark:text-gray-300">{row.asin}</b></span>
              <span>SKU: <b className="text-gray-700 dark:text-gray-300">{row.sku}</b></span>
            </div>
          </div>
        );
      },
    },
    {
      headerName: "Report Date",
      field: "reportDate",
      width: 130,
      cellRenderer: (params) => {
        const val = params.value || params.data?.reportDate;
        return (
          <div className="flex items-center gap-1.5 py-1">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/40">
              <i className="fa-regular fa-calendar text-[10px] mr-1" />
              {val ? moment(val).format("YYYY-MM-DD") : "-"}
            </span>
          </div>
        );
      },
    },
    {
      headerName: "Starting Stock",
      field: "startingWarehouseBalance",
      width: 135,
      cellRenderer: (p) => (
        <span className="font-semibold text-slate-700 dark:text-slate-300">
          {(p.value || 0).toLocaleString()}
        </span>
      ),
    },
    {
      headerName: "Ending Stock",
      field: "endingWarehouseBalance",
      width: 145,
      cellRenderer: (params) => (
        <div className="flex flex-col py-1">
          <span className="font-bold text-green-600 dark:text-green-400">
            {(params.value || 0).toLocaleString()}
          </span>
          {params.data?.reportDate && (
            <span className="text-[10px] text-gray-400">
              as of {moment(params.data.reportDate).format("MMM DD, YYYY")}
            </span>
          )}
        </div>
      ),
    },
    {
      headerName: "In-Transit (FC-to-FC)",
      field: "inTransitBetweenWarehouses",
      width: 160,
      cellRenderer: (params) => (
        <span className={`font-semibold ${params.value > 0 ? "text-amber-500" : "text-gray-400"}`}>
          {(params.value || 0).toLocaleString()}
        </span>
      ),
    },
    {
      headerName: "Receipts",
      field: "receipts",
      width: 110,
      valueFormatter: (p) => (p.value || 0).toLocaleString(),
    },
    {
      headerName: "Shipments",
      field: "customerShipments",
      width: 120,
      valueFormatter: (p) => (p.value || 0).toLocaleString(),
    },
    {
      headerName: "Cust Returns",
      field: "customerReturns",
      width: 125,
      cellRenderer: (params) => (
        <span className={params.value > 0 ? "text-red-500 font-medium" : "text-gray-400"}>
          {(params.value || 0).toLocaleString()}
        </span>
      ),
    },
    {
      headerName: "Unfulfillable",
      field: "unfulfillableBalance",
      width: 130,
      cellRenderer: (params) => (
        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${params.value > 0 ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" : "text-gray-400"}`}>
          {(params.value || 0).toLocaleString()}
        </span>
      ),
    },
  ];

  // Columns for Storage Fees
  const storageColumns = [
    {
      headerName: "Fulfillment Center",
      field: "fcCode",
      width: 160,
      cellRenderer: (p) => <span className="font-semibold text-blue-600">{p.value}</span>,
    },
    {
      headerName: "Product (ASIN / SKU)",
      field: "asin",
      width: 260,
      cellRenderer: (p) => (
        <div className="flex flex-col py-1">
          <span className="text-xs truncate font-medium">{p.data?.productName || p.data?.sku}</span>
          <span className="text-xs text-gray-500">ASIN: {p.data?.asin} | SKU: {p.data?.sku}</span>
        </div>
      ),
    },
    {
      headerName: "Avg Qty On Hand",
      field: "averageQuantityOnHand",
      width: 150,
      valueFormatter: (p) => Math.round(p.value || 0).toLocaleString(),
    },
    {
      headerName: "Pending Removal",
      field: "averageQuantityPendingRemoval",
      width: 150,
      valueFormatter: (p) => Math.round(p.value || 0).toLocaleString(),
    },
    {
      headerName: "Volume (Cu. Ft.)",
      field: "volumeCubicFeet",
      width: 150,
      valueFormatter: (p) => ((p.value || 0).toFixed(3)),
    },
    {
      headerName: "Est. Monthly Fee",
      field: "estimatedMonthlyStorageFee",
      width: 160,
      cellRenderer: (p) => (
        <span className="font-bold text-amber-600 dark:text-amber-400">
          ₹{(p.value || 0).toFixed(2)}
        </span>
      ),
    },
  ];

  // Columns for Warehouse Master Directory
  const masterColumns = [
    {
      headerName: "FC Code",
      field: "fcCode",
      width: 120,
      cellRenderer: (p) => (
        <span className="font-bold text-blue-600 dark:text-blue-400 px-2 py-1 rounded bg-blue-50 dark:bg-blue-950/50">
          {p.value}
        </span>
      ),
    },
    {
      headerName: "Warehouse Name",
      field: "fcName",
      width: 220,
    },
    {
      headerName: "City",
      field: "city",
      width: 150,
      cellRenderer: (p) => p.value || <span className="text-gray-400 italic">Not set</span>,
    },
    {
      headerName: "State",
      field: "state",
      width: 160,
      cellRenderer: (p) => p.value || <span className="text-gray-400 italic">Not set</span>,
    },
    {
      headerName: "Region / Zone",
      field: "region",
      width: 130,
      cellRenderer: (p) => (
        <span className="px-2 py-0.5 rounded text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
          {p.value || "Other"}
        </span>
      ),
    },
    {
      headerName: "Discovery Source",
      field: "source",
      width: 180,
      cellRenderer: (p) => {
        const source = p.value || "AUTO_DETECTED";
        let colorClass = "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300";
        if (source === "REPORT_LEDGER") colorClass = "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300";
        if (source === "REPORT_GST") colorClass = "bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300";
        if (source === "USER_OVERRIDE") colorClass = "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300";

        return (
          <span className={`px-2.5 py-1 rounded-full text-[11px] font-medium ${colorClass}`}>
            {source}
          </span>
        );
      },
    },
  ];

  return (
    <div className="warehouse-management-view w-full p-4 space-y-6">
      {/* ── Header Title & Sync Info ─────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-200 dark:border-gray-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <i className="fa-solid fa-warehouse text-blue-500" />
            Warehouse & Fulfillment Center Inventory
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Real-time FC-level inventory ledger, auto-discovered warehouses from reports, state distribution, and storage costs.
          </p>
        </div>

        {cardsData?.reportDate && (
          <div className="flex items-center gap-2 text-xs bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 px-3 py-1.5 rounded-lg border border-blue-200 dark:border-blue-900">
            <i className="fa-regular fa-clock" />
            <span>Latest Report Date: <b>{cardsData.reportDate}</b></span>
          </div>
        )}
      </div>

      {/* ── KPI Summary Cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Units */}
        <div className="p-4 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-blue-600 dark:text-blue-400 text-xl flex-shrink-0">
            <i className="fa-solid fa-boxes-stacked" />
          </div>
          <div>
            <div className="text-xs text-gray-500 font-medium">Total FC Units</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {(cardsData?.totalUnits || 0).toLocaleString()}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">Across {cardsData?.totalActiveWarehouses || 0} Fulfillment Centers</div>
          </div>
        </div>

        {/* Card 2: In-Transit FC to FC */}
        <div className="p-4 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center text-amber-600 dark:text-amber-400 text-xl flex-shrink-0">
            <i className="fa-solid fa-truck-ramp-box" />
          </div>
          <div>
            <div className="text-xs text-gray-500 font-medium">In-Transit Units</div>
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
              {(cardsData?.totalInTransitUnits || 0).toLocaleString()}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">Inter-Warehouse Transfers</div>
          </div>
        </div>

        {/* Card 3: Unfulfillable Stock */}
        <div className="p-4 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-rose-100 dark:bg-rose-900/50 flex items-center justify-center text-rose-600 dark:text-rose-400 text-xl flex-shrink-0">
            <i className="fa-solid fa-triangle-exclamation" />
          </div>
          <div>
            <div className="text-xs text-gray-500 font-medium">Unfulfillable Units</div>
            <div className="text-2xl font-bold text-rose-600 dark:text-rose-400">
              {(cardsData?.totalUnfulfillableUnits || 0).toLocaleString()}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">Damaged / Lost / Defective</div>
          </div>
        </div>

        {/* Card 4: Est Monthly Storage Fee */}
        <div className="p-4 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400 text-xl flex-shrink-0">
            <i className="fa-solid fa-indian-rupee-sign" />
          </div>
          <div>
            <div className="text-xs text-gray-500 font-medium">Est. Monthly Storage Fee</div>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              ₹{(cardsData?.estimatedMonthlyStorageFee || 0).toLocaleString()}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">Vol: {cardsData?.totalVolumeCft || 0} Cu. Ft.</div>
          </div>
        </div>
      </div>

      {/* ── Regional / State Geographic Distribution Preview ────────────── */}
      {geoData?.stateDistribution?.length > 0 && (
        <div className="p-5 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
              <i className="fa-solid fa-map-location-dot text-blue-500" />
              State-wise Warehouse Stock Distribution
            </h2>
            <span className="text-xs text-gray-400">Total States Active: {geoData.stateDistribution.length}</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {geoData.stateDistribution.map((st, idx) => (
              <div
                key={idx}
                className="p-3 rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/40 flex flex-col justify-between space-y-2 hover:border-blue-300 transition-colors"
              >
                <div className="flex justify-between items-start">
                  <span className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">{st.state}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-medium">
                    {st.region || "Zone"}
                  </span>
                </div>
                <div>
                  <div className="text-base font-bold text-blue-600 dark:text-blue-400">
                    {st.totalUnits.toLocaleString()} <span className="text-[10px] font-normal text-gray-500">units</span>
                  </div>
                  <div className="text-[11px] text-gray-400 flex justify-between mt-1">
                    <span>{st.warehouseCount} FC{st.warehouseCount > 1 ? "s" : ""}</span>
                    <span>{st.totalSkus} SKUs</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Tabs & Filter Bar ────────────────────────────────────────────── */}
      <div className="p-4 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          {/* Sub Tabs */}
          <div className="inline-flex p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
            <button
              onClick={() => setActiveSubTab("LEDGER")}
              className={`px-4 py-2 text-xs font-semibold rounded-md transition-all ${
                activeSubTab === "LEDGER"
                  ? "bg-white dark:bg-gray-900 text-blue-600 shadow-sm"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900"
              }`}
            >
              <i className="fa-solid fa-list-check mr-1.5" />
              FC Inventory Ledger
            </button>
            <button
              onClick={() => setActiveSubTab("STORAGE_FEES")}
              className={`px-4 py-2 text-xs font-semibold rounded-md transition-all ${
                activeSubTab === "STORAGE_FEES"
                  ? "bg-white dark:bg-gray-900 text-blue-600 shadow-sm"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900"
              }`}
            >
              <i className="fa-solid fa-coins mr-1.5" />
              Storage Fee Breakdown
            </button>
            <button
              onClick={() => setActiveSubTab("WAREHOUSE_MASTER")}
              className={`px-4 py-2 text-xs font-semibold rounded-md transition-all ${
                activeSubTab === "WAREHOUSE_MASTER"
                  ? "bg-white dark:bg-gray-900 text-blue-600 shadow-sm"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900"
              }`}
            >
              <i className="fa-solid fa-building-circle-check mr-1.5" />
              Warehouse Directory
            </button>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            {/* FC Dropdown Filter */}
            {activeSubTab !== "WAREHOUSE_MASTER" && (
              <div className="w-48">
                <Select value={selectedFc} onValueChange={(val) => { setSelectedFc(val); setPage(1); }}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="All Warehouses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Warehouses (FC)</SelectItem>
                    {fcList.map((fc) => (
                      <SelectItem key={fc.fcCode} value={fc.fcCode}>
                        {fc.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Disposition Filter (Ledger Only) */}
            {activeSubTab === "LEDGER" && (
              <div className="w-36">
                <Select value={selectedDisposition} onValueChange={(val) => { setSelectedDisposition(val); setPage(1); }}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Disposition" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Dispositions</SelectItem>
                    <SelectItem value="SELLABLE">Sellable</SelectItem>
                    <SelectItem value="CUSTOMER_DAMAGED">Customer Damaged</SelectItem>
                    <SelectItem value="DEFECTIVE">Defective</SelectItem>
                    <SelectItem value="CARRIER_DAMAGED">Carrier Damaged</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Search Input */}
            <div className="relative flex-1 sm:w-64">
              <Input
                type="text"
                placeholder={activeSubTab === "WAREHOUSE_MASTER" ? "Search FC Code, City, State..." : "Search ASIN, SKU, FC..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 text-xs pr-8"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-2.5 text-gray-400 hover:text-gray-600 text-xs"
                >
                  <i className="fa-solid fa-xmark" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Table Grid ───────────────────────────────────────────────────── */}
        <div className="w-full">
          <AgTable
            loading={loading}
            rowData={
              activeSubTab === "LEDGER"
                ? gridData
                : activeSubTab === "STORAGE_FEES"
                ? storageFeeData
                : warehouseMasterData
            }
            columnDefs={
              activeSubTab === "LEDGER"
                ? ledgerColumns
                : activeSubTab === "STORAGE_FEES"
                ? storageColumns
                : masterColumns
            }
            totalRecords={totalRecords}
            rowHeight={55}
            perPage={perPage}
            currentPage={page}
            onPageChange={(p) => setPage(p)}
            onPerPageChange={(pp) => { setPerPage(pp); setPage(1); }}
            isCustomSaveColumns={false}
          />
        </div>
      </div>
    </div>
  );
};

export default WarehouseManagement;
