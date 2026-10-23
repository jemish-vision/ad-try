import React, { useContext, useState, useEffect, useMemo } from "react";
import { ProfileContext } from "../../../helper/usecontext/useContext";
import {
    ApiGetWarehouseInventorySummary,
    ApiGetWarehouseInventoryLedger,
    ApiSyncWarehouseInventory
} from "../../../api-wrapper/inventoryManagement/ApiInventoryManagement";
import Toast from "../../../common/helper/toast/Toast";
import {
    Warehouse,
    Building2,
    MapPin,
    RefreshCw,
    Search,
    Filter,
    ArrowUpRight,
    ArrowDownRight,
    CheckCircle2,
    AlertTriangle,
    Clock,
    History,
    Boxes,
    Eye,
    X,
    Layers,
    ShieldCheck,
    Truck,
    TrendingUp,
    ChevronRight
} from "lucide-react";
import moment from "moment";

export default function WarehouseInventory() {
    const { profileId } = useContext(ProfileContext);

    // Data States
    const [loading, setLoading] = useState(false);
    const [stockData, setStockData] = useState([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedFC, setSelectedFC] = useState("ALL");
    const [selectedState, setSelectedState] = useState("ALL");
    const [selectedDisposition, setSelectedDisposition] = useState("ALL");
    const [selectedStatus, setSelectedStatus] = useState("ALL");

    // History Modal State
    const [selectedItemForHistory, setSelectedItemForHistory] = useState(null);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyLedger, setHistoryLedger] = useState([]);

    // Sync Modal State
    const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [syncStartDate, setSyncStartDate] = useState(moment().subtract(6, "months").format("YYYY-MM-DD"));

    // Fetch warehouse stock summary
    const fetchWarehouseSummary = async () => {
        if (!profileId) return;
        setLoading(true);
        try {
            const res = await ApiGetWarehouseInventorySummary({
                profileId: Number(profileId)
            });
            if (res && res.success) {
                setStockData(res.data || []);
            } else {
                setStockData([]);
            }
        } catch (err) {
            console.error("Error fetching warehouse summary:", err);
            Toast.error("Failed to load warehouse inventory summary");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (profileId) {
            fetchWarehouseSummary();
        }
    }, [profileId]);

    // Fetch chronological ledger for a specific product & warehouse
    const openLedgerModal = async (item) => {
        setSelectedItemForHistory(item);
        setHistoryLoading(true);
        try {
            const res = await ApiGetWarehouseInventoryLedger({
                profileId: Number(profileId),
                fnsku: item.fnsku,
                sku: item.sku,
                fulfillmentCenter: item.fulfillmentCenter,
                disposition: item.disposition
            });
            if (res && res.success) {
                setHistoryLedger(res.data || []);
            } else {
                setHistoryLedger([]);
            }
        } catch (err) {
            console.error("Error fetching ledger history:", err);
            Toast.error("Failed to load warehouse ledger history");
        } finally {
            setHistoryLoading(false);
        }
    };

    // Trigger on-demand sync or recalculation
    const handleTriggerSync = async (recalculateOnly = false) => {
        setSyncing(true);
        try {
            const payload = {
                profileId: Number(profileId),
                recalculateOnly: Boolean(recalculateOnly),
                ...(recalculateOnly ? {} : { startDate: syncStartDate })
            };
            const res = await ApiSyncWarehouseInventory(payload);
            if (res && res.success) {
                Toast.success(res.message || "Sync operation started successfully");
                setIsSyncModalOpen(false);
                setTimeout(() => fetchWarehouseSummary(), 2000);
            } else {
                Toast.error(res?.message || "Sync operation failed");
            }
        } catch (err) {
            console.error("Sync trigger error:", err);
            Toast.error("Failed to trigger warehouse sync");
        } finally {
            setSyncing(false);
        }
    };

    // Filter Options
    const uniqueFCs = useMemo(() => {
        const set = new Set(stockData.map(d => d.fulfillmentCenter).filter(Boolean));
        return Array.from(set).sort();
    }, [stockData]);

    const uniqueStates = useMemo(() => {
        const set = new Set(stockData.map(d => d.state).filter(Boolean));
        return Array.from(set).sort();
    }, [stockData]);

    const uniqueDispositions = useMemo(() => {
        const set = new Set(stockData.map(d => d.disposition).filter(Boolean));
        return Array.from(set).sort();
    }, [stockData]);

    // Filtered Table Data
    const filteredData = useMemo(() => {
        return stockData.filter(item => {
            const q = searchQuery.toLowerCase().trim();
            const matchesSearch =
                !q ||
                (item.title && item.title.toLowerCase().includes(q)) ||
                (item.sku && item.sku.toLowerCase().includes(q)) ||
                (item.asin && item.asin.toLowerCase().includes(q)) ||
                (item.fnsku && item.fnsku.toLowerCase().includes(q)) ||
                (item.fulfillmentCenter && item.fulfillmentCenter.toLowerCase().includes(q)) ||
                (item.city && item.city.toLowerCase().includes(q)) ||
                (item.state && item.state.toLowerCase().includes(q));

            const matchesFC = selectedFC === "ALL" || item.fulfillmentCenter === selectedFC;
            const matchesState = selectedState === "ALL" || item.state === selectedState;
            const matchesDisposition = selectedDisposition === "ALL" || item.disposition === selectedDisposition;
            const matchesStatus = selectedStatus === "ALL" || item.reconciliationStatus === selectedStatus;

            return matchesSearch && matchesFC && matchesState && matchesDisposition && matchesStatus;
        });
    }, [stockData, searchQuery, selectedFC, selectedState, selectedDisposition, selectedStatus]);

    // Aggregate Summary Cards Metrics
    const metrics = useMemo(() => {
        const totalUnits = stockData.reduce((acc, curr) => acc + (curr.calculatedEndingBalance || 0), 0);
        const uniqueProducts = new Set(stockData.map(d => d.fnsku)).size;
        const activeFCs = new Set(stockData.map(d => d.fulfillmentCenter)).size;
        const matchedCount = stockData.filter(d => d.reconciliationStatus === "MATCHED").length;
        const matchedRate = stockData.length > 0 ? Math.round((matchedCount / stockData.length) * 100) : 100;

        return {
            totalUnits,
            uniqueProducts,
            activeFCs,
            matchedRate
        };
    }, [stockData]);

    return (
        <div className="p-4 md:p-6 space-y-6 max-w-full overflow-x-hidden font-sans">
            {/* Page Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-sm">
                <div>
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-blue-50 dark:bg-blue-950/50 rounded-xl text-blue-600 dark:text-blue-400">
                            <Warehouse className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                                Warehouse Inventory & Reconciliation
                            </h1>
                            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                                Amazon-reconciled inventory breakdown across fulfillment centers with chronological movement auditing.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2.5">
                    <button
                        onClick={() => fetchWarehouseSummary()}
                        disabled={loading}
                        className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-zinc-300 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-xl transition shadow-xs"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                        Refresh
                    </button>

                    <button
                        onClick={() => setIsSyncModalOpen(true)}
                        className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition shadow-xs"
                    >
                        <Layers className="w-3.5 h-3.5" />
                        Sync / Recalculate
                    </button>
                </div>
            </div>

            {/* Metrics Overview Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-xs flex items-center justify-between">
                    <div>
                        <p className="text-xs font-medium text-slate-500 dark:text-zinc-400">Total Warehouse Stock</p>
                        <h3 className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">
                            {metrics.totalUnits.toLocaleString()}
                        </h3>
                        <p className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mt-0.5">
                            <TrendingUp className="w-3 h-3" /> Across all Amazon fulfillment centers
                        </p>
                    </div>
                    <div className="p-3 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-xl">
                        <Boxes className="w-6 h-6" />
                    </div>
                </div>

                <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-xs flex items-center justify-between">
                    <div>
                        <p className="text-xs font-medium text-slate-500 dark:text-zinc-400">Active Fulfillment Centers</p>
                        <h3 className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">
                            {metrics.activeFCs} <span className="text-xs font-normal text-slate-400">FCs</span>
                        </h3>
                        <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                            Mapped to cities & states
                        </p>
                    </div>
                    <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-xl">
                        <Building2 className="w-6 h-6" />
                    </div>
                </div>

                <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-xs flex items-center justify-between">
                    <div>
                        <p className="text-xs font-medium text-slate-500 dark:text-zinc-400">Tracked Products / FNSKUs</p>
                        <h3 className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">
                            {metrics.uniqueProducts}
                        </h3>
                        <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                            Unique catalog identities
                        </p>
                    </div>
                    <div className="p-3 bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 rounded-xl">
                        <Layers className="w-6 h-6" />
                    </div>
                </div>

                <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-xs flex items-center justify-between">
                    <div>
                        <p className="text-xs font-medium text-slate-500 dark:text-zinc-400">Reconciliation Rate</p>
                        <h3 className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">
                            {metrics.matchedRate}%
                        </h3>
                        <p className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mt-0.5">
                            <ShieldCheck className="w-3 h-3" /> Amazon Ledger Verified
                        </p>
                    </div>
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-xl">
                        <CheckCircle2 className="w-6 h-6" />
                    </div>
                </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-xs space-y-3">
                <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
                    {/* Search Input */}
                    <div className="relative w-full md:w-80">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search Product, SKU, ASIN, FC..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700/80 focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
                        />
                        {searchQuery && (
                            <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>

                    {/* Filter Selects */}
                    <div className="flex flex-wrap gap-2.5 items-center w-full md:w-auto">
                        {/* FC Filter */}
                        <select
                            value={selectedFC}
                            onChange={(e) => setSelectedFC(e.target.value)}
                            className="px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-800 dark:text-zinc-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="ALL">All Warehouses ({uniqueFCs.length})</option>
                            {uniqueFCs.map(fc => (
                                <option key={fc} value={fc}>{fc}</option>
                            ))}
                        </select>

                        {/* State Filter */}
                        <select
                            value={selectedState}
                            onChange={(e) => setSelectedState(e.target.value)}
                            className="px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-800 dark:text-zinc-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="ALL">All States ({uniqueStates.length})</option>
                            {uniqueStates.map(st => (
                                <option key={st} value={st}>{st}</option>
                            ))}
                        </select>

                        {/* Disposition Filter */}
                        <select
                            value={selectedDisposition}
                            onChange={(e) => setSelectedDisposition(e.target.value)}
                            className="px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-800 dark:text-zinc-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="ALL">All Dispositions</option>
                            {uniqueDispositions.map(disp => (
                                <option key={disp} value={disp}>{disp}</option>
                            ))}
                        </select>

                        {/* Reconciliation Status Filter */}
                        <select
                            value={selectedStatus}
                            onChange={(e) => setSelectedStatus(e.target.value)}
                            className="px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-800 dark:text-zinc-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="ALL">All Statuses</option>
                            <option value="MATCHED">Matched</option>
                            <option value="MISMATCH">Discrepancy</option>
                            <option value="PENDING_RECONCILIATION">Pending</option>
                        </select>

                        {(selectedFC !== "ALL" || selectedState !== "ALL" || selectedDisposition !== "ALL" || selectedStatus !== "ALL" || searchQuery) && (
                            <button
                                onClick={() => {
                                    setSelectedFC("ALL");
                                    setSelectedState("ALL");
                                    setSelectedDisposition("ALL");
                                    setSelectedStatus("ALL");
                                    setSearchQuery("");
                                }}
                                className="px-2.5 py-2 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition"
                            >
                                Reset
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Main Warehouse Inventory Table */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-slate-700 dark:text-zinc-300">
                        <thead className="text-[11px] uppercase tracking-wider bg-slate-50 dark:bg-zinc-800/60 text-slate-500 dark:text-zinc-400 border-b border-slate-200 dark:border-zinc-800">
                            <tr>
                                <th className="px-4 py-3 font-semibold">Product & Identifier</th>
                                <th className="px-4 py-3 font-semibold">Warehouse (FC)</th>
                                <th className="px-4 py-3 font-semibold">Location</th>
                                <th className="px-3 py-3 font-semibold text-right">Opening</th>
                                <th className="px-3 py-3 font-semibold text-right">Inbound (+)</th>
                                <th className="px-3 py-3 font-semibold text-right">Orders (-)</th>
                                <th className="px-3 py-3 font-semibold text-right">Returns (+)</th>
                                <th className="px-3 py-3 font-semibold text-right">Transfers</th>
                                <th className="px-3 py-3 font-semibold text-right">Ending Qty</th>
                                <th className="px-4 py-3 font-semibold text-center">Status</th>
                                <th className="px-4 py-3 font-semibold text-center">Confidence</th>
                                <th className="px-4 py-3 font-semibold text-center">Audit</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/60 font-medium">
                            {loading ? (
                                <tr>
                                    <td colSpan="12" className="px-4 py-12 text-center text-slate-400">
                                        <div className="flex flex-col items-center justify-center gap-2">
                                            <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
                                            <span>Loading warehouse inventory data...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredData.length === 0 ? (
                                <tr>
                                    <td colSpan="12" className="px-4 py-12 text-center text-slate-400">
                                        <div className="flex flex-col items-center justify-center gap-2">
                                            <Boxes className="w-8 h-8 text-slate-300 dark:text-zinc-600" />
                                            <p className="text-sm font-semibold text-slate-600 dark:text-zinc-300">No warehouse inventory records found</p>
                                            <p className="text-xs text-slate-400">Try adjusting your filters or run a backfill sync.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredData.map((row, idx) => (
                                    <tr key={`${row.fnsku}_${row.fulfillmentCenter}_${row.disposition}_${idx}`} className="hover:bg-slate-50/80 dark:hover:bg-zinc-800/40 transition">
                                        {/* Product Info */}
                                        <td className="px-4 py-3 max-w-xs">
                                            <div className="font-semibold text-slate-900 dark:text-white truncate" title={row.title}>
                                                {row.title || row.sku}
                                            </div>
                                            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                                                <span className="bg-slate-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded font-mono font-bold text-slate-700 dark:text-zinc-300">
                                                    {row.fnsku}
                                                </span>
                                                <span>·</span>
                                                <span className="font-mono text-[10px]">{row.sku}</span>
                                            </div>
                                        </td>

                                        {/* FC */}
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-1.5">
                                                <span className="px-2 py-0.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-bold font-mono text-xs">
                                                    {row.fulfillmentCenter}
                                                </span>
                                                <span className="text-[11px] text-slate-400 dark:text-zinc-500 font-normal">
                                                    {row.disposition !== "SELLABLE" && `(${row.disposition})`}
                                                </span>
                                            </div>
                                        </td>

                                        {/* Location */}
                                        <td className="px-4 py-3">
                                            <div className="text-slate-800 dark:text-zinc-200 font-medium">{row.city}</div>
                                            <div className="text-[11px] text-slate-400 dark:text-zinc-500">{row.state}, {row.country}</div>
                                        </td>

                                        {/* Opening */}
                                        <td className="px-3 py-3 text-right font-mono text-slate-600 dark:text-zinc-400">
                                            {row.openingBalance}
                                        </td>

                                        {/* Inbound */}
                                        <td className="px-3 py-3 text-right font-mono text-emerald-600 dark:text-emerald-400">
                                            {row.receipts > 0 ? `+${row.receipts}` : "0"}
                                        </td>

                                        {/* Orders / Shipments */}
                                        <td className="px-3 py-3 text-right font-mono text-rose-600 dark:text-rose-400">
                                            {row.shipments !== 0 ? row.shipments : "0"}
                                        </td>

                                        {/* Returns */}
                                        <td className="px-3 py-3 text-right font-mono text-amber-600 dark:text-amber-400">
                                            {row.customerReturns > 0 ? `+${row.customerReturns}` : "0"}
                                        </td>

                                        {/* Transfers */}
                                        <td className="px-3 py-3 text-right font-mono text-indigo-600 dark:text-indigo-400">
                                            {row.transfersIn + row.transfersOut !== 0 ? (row.transfersIn + row.transfersOut) : "0"}
                                        </td>

                                        {/* Ending Qty */}
                                        <td className="px-3 py-3 text-right">
                                            <span className={`font-bold font-mono text-sm px-2 py-0.5 rounded-lg ${
                                                row.calculatedEndingBalance > 0
                                                    ? "text-slate-900 dark:text-white bg-slate-100 dark:bg-zinc-800"
                                                    : row.calculatedEndingBalance < 0
                                                    ? "text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50"
                                                    : "text-slate-400 bg-slate-50 dark:bg-zinc-800/40"
                                            }`}>
                                                {row.calculatedEndingBalance}
                                            </span>
                                        </td>

                                        {/* Status */}
                                        <td className="px-4 py-3 text-center">
                                            {row.reconciliationStatus === "MATCHED" ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40">
                                                    <CheckCircle2 className="w-3 h-3" /> MATCHED
                                                </span>
                                            ) : row.reconciliationStatus === "MISMATCH" ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40">
                                                    <AlertTriangle className="w-3 h-3" /> DIFF ({row.difference})
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400">
                                                    <Clock className="w-3 h-3" /> PENDING
                                                </span>
                                            )}
                                        </td>

                                        {/* Confidence */}
                                        <td className="px-4 py-3 text-center">
                                            <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-medium font-mono ${
                                                row.baselineConfidence === "AMAZON_VERIFIED"
                                                    ? "bg-emerald-100/80 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300"
                                                    : "bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300"
                                            }`}>
                                                {row.baselineConfidence}
                                            </span>
                                        </td>

                                        {/* Action Audit */}
                                        <td className="px-4 py-3 text-center">
                                            <button
                                                onClick={() => openLedgerModal(row)}
                                                className="p-1.5 text-slate-500 hover:text-blue-600 dark:text-zinc-400 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded-lg transition"
                                                title="View Historical Ledger"
                                            >
                                                <History className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Historical Ledger Audit Drawer / Modal */}
            {selectedItemForHistory && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
                    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-2xl max-w-4xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-zinc-800">
                            <div>
                                <div className="flex items-center gap-2">
                                    <History className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                    <h2 className="text-base font-bold text-slate-900 dark:text-white">
                                        Warehouse Movement Ledger History
                                    </h2>
                                </div>
                                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                                    Product: <span className="font-semibold text-slate-700 dark:text-zinc-300">{selectedItemForHistory.title || selectedItemForHistory.sku}</span> · FC: <span className="font-mono font-bold text-blue-600">{selectedItemForHistory.fulfillmentCenter}</span> ({selectedItemForHistory.city})
                                </p>
                            </div>
                            <button
                                onClick={() => setSelectedItemForHistory(null)}
                                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 transition"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="overflow-y-auto p-6 flex-1">
                            {historyLoading ? (
                                <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-400">
                                    <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
                                    <span className="text-xs">Loading historical movements...</span>
                                </div>
                            ) : historyLedger.length === 0 ? (
                                <div className="text-center py-12 text-slate-400 text-xs">
                                    No transaction movements recorded for this warehouse yet.
                                </div>
                            ) : (
                                <table className="w-full text-left text-xs text-slate-700 dark:text-zinc-300">
                                    <thead className="text-[11px] uppercase bg-slate-50 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 border-b border-slate-200 dark:border-zinc-700">
                                        <tr>
                                            <th className="px-3 py-2.5 font-semibold">Date</th>
                                            <th className="px-3 py-2.5 font-semibold text-right">Opening</th>
                                            <th className="px-3 py-2.5 font-semibold text-right">Receipts (+)</th>
                                            <th className="px-3 py-2.5 font-semibold text-right">Orders (-)</th>
                                            <th className="px-3 py-2.5 font-semibold text-right">Returns (+)</th>
                                            <th className="px-3 py-2.5 font-semibold text-right">Transfers</th>
                                            <th className="px-3 py-2.5 font-semibold text-right">Adjustments</th>
                                            <th className="px-3 py-2.5 font-semibold text-right">Ending Balance</th>
                                            <th className="px-3 py-2.5 font-semibold text-center">Confidence</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-zinc-800 font-mono">
                                        {historyLedger.map((row, hIdx) => (
                                            <tr key={`h_${row.date}_${hIdx}`} className="hover:bg-slate-50 dark:hover:bg-zinc-800/50">
                                                <td className="px-3 py-2.5 font-sans font-medium text-slate-800 dark:text-zinc-200">
                                                    {row.date}
                                                </td>
                                                <td className="px-3 py-2.5 text-right text-slate-500">
                                                    {row.openingBalance}
                                                </td>
                                                <td className="px-3 py-2.5 text-right text-emerald-600">
                                                    {row.receipts > 0 ? `+${row.receipts}` : "0"}
                                                </td>
                                                <td className="px-3 py-2.5 text-right text-rose-600">
                                                    {row.shipments !== 0 ? row.shipments : "0"}
                                                </td>
                                                <td className="px-3 py-2.5 text-right text-amber-600">
                                                    {row.customerReturns > 0 ? `+${row.customerReturns}` : "0"}
                                                </td>
                                                <td className="px-3 py-2.5 text-right text-indigo-600">
                                                    {row.transfersIn + row.transfersOut !== 0 ? (row.transfersIn + row.transfersOut) : "0"}
                                                </td>
                                                <td className="px-3 py-2.5 text-right text-slate-600">
                                                    {row.adjustments !== 0 ? row.adjustments : "0"}
                                                </td>
                                                <td className="px-3 py-2.5 text-right font-bold text-slate-900 dark:text-white">
                                                    {row.calculatedEndingBalance}
                                                </td>
                                                <td className="px-3 py-2.5 text-center font-sans">
                                                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300">
                                                        {row.baselineConfidence}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="px-6 py-3 bg-slate-50 dark:bg-zinc-800/50 border-t border-slate-200 dark:border-zinc-800 flex justify-end">
                            <button
                                onClick={() => setSelectedItemForHistory(null)}
                                className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl hover:bg-slate-100 transition"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Sync & Recalculate Modal */}
            {isSyncModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
                    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-zinc-800">
                            <div className="flex items-center gap-2">
                                <Layers className="w-5 h-5 text-blue-600" />
                                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                                    Sync Warehouse Inventory
                                </h3>
                            </div>
                            <button onClick={() => setIsSyncModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="py-4 space-y-4 text-xs text-slate-600 dark:text-zinc-300">
                            <div>
                                <label className="block font-semibold mb-1">Historical Backfill Start Date</label>
                                <input
                                    type="date"
                                    value={syncStartDate}
                                    onChange={(e) => setSyncStartDate(e.target.value)}
                                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-800 dark:text-zinc-200"
                                />
                                <p className="text-[11px] text-slate-400 mt-1">
                                    Amazon SP-API retains detailed ledger data for up to 18 months.
                                </p>
                            </div>

                            <div className="p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/40 rounded-xl space-y-1">
                                <p className="font-semibold text-blue-900 dark:text-blue-300">Fast Recalculation</p>
                                <p className="text-[11px] text-blue-700 dark:text-blue-400">
                                    If raw events are already in MongoDB, recalculate balances instantly without calling Amazon SP-API.
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-zinc-800">
                            <button
                                onClick={() => handleTriggerSync(true)}
                                disabled={syncing}
                                className="px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-zinc-300 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 rounded-xl transition"
                            >
                                Recalculate Only
                            </button>
                            <button
                                onClick={() => handleTriggerSync(false)}
                                disabled={syncing}
                                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition"
                            >
                                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
                                {syncing ? "Syncing..." : "Start Amazon Sync"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
