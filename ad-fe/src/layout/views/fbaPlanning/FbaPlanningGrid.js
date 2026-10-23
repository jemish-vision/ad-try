import React, { useRef, useMemo, useState, useContext, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from "react-i18next";
import { SYSTEM_PAGES, PAGE_ACTIONS } from "src/common/constants";
import { PermissionCheck } from "../../../helper/permission/PermissionCheck";
import AgTable from "../../../common/grid/AgTable";
import { FiSettings } from "react-icons/fi";
import { ProfileContext } from "../../../helper/usecontext/useContext";
import FbaPlanningSettings from "./FbaPlanningSettings";
import WarehousePlanningModal from "./WarehousePlanningModal";
import WarehousePlanningAccordion from "./WarehousePlanningAccordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { Button } from "../../../components/ui/button";
import { ChevronDown as ExpandMoreIcon } from "lucide-react";
import { AppTooltip } from "../../../components/ui/AppTooltip";

const P = {
    primary: "#1A9FD4",
    neutral100: "#F1F5F9",
    neutral200: "#E2E8F0",
    neutral400: "#94A3B8",
    neutral600: "#475569",
    neutral800: "#1E293B",
    danger: "#E74C3C",
    warning: "#F59E0B",
    success: "#16A34A",
    info: "#0EA5E9"
};

const TAG_LABEL = {
    "URGENT": "URGENT: Ship Immediately",
    "PLAN_SHIPMENT": "Prepare Shipment Now",
    "OVERSTOCK": "Overstock Risk",
    "HEALTHY": "Healthy Inventory",
    "NO_SALES": "No Sales",
}

// Portal-based tooltip immune to AG-Grid CSS transform offsets

const CustomHeader = (props) => {
    const { displayName, tooltipText, enableSorting, progressSort } = props;
    const [currentSort, setCurrentSort] = useState(props.column.getSort());

    React.useEffect(() => {
        const onSortChanged = () => {
            setCurrentSort(props.column.getSort());
        };
        props.column.addEventListener('sortChanged', onSortChanged);
        return () => props.column.removeEventListener('sortChanged', onSortChanged);
    }, [props.column]);

    const handleClick = (e) => {
        if (enableSorting) {
            progressSort(e.shiftKey);
        }
    };

    return (
        <div className="flex items-center justify-between w-full" style={{ fontFamily: "Inter", overflow: "hidden" }}>
            <div className="flex items-center"
                onClick={handleClick}
                style={{ gap: 6, cursor: enableSorting ? "pointer" : "default", overflow: "hidden", flex: 1, minWidth: 0 }}
            >
                <span
                    style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        color: "#ffffff",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        fontFamily: "Inter"
                    }}
                >
                    {displayName}
                </span>
                {enableSorting && currentSort === 'asc' && (
                    <span style={{ color: "#ffffff", fontSize: 10, flexShrink: 0 }}>▲</span>
                )}
                {enableSorting && currentSort === 'desc' && (
                    <span style={{ color: "#ffffff", fontSize: 10, flexShrink: 0 }}>▼</span>
                )}
            </div>
            {tooltipText && (
                <AppTooltip text={tooltipText}>
                    <i
                        className="fa-solid fa-circle-info ml-1"
                        style={{ fontSize: 13, color: '#fff', cursor: 'help', flexShrink: 0 }}
                        onClick={(e) => e.stopPropagation()}
                    />
                </AppTooltip>
            )}
        </div>
    );
};

const FbaPlanningGrid = ({
    rowData,
    totalRecords,
    loading,
    currentPage,
    rowsPerPage,
    onPageChange,
    onPerPageChange,
    onSortChanged,
    selectedStatus,
    setSelectedStatus,
    statusOptions,
    isDark,
    refreshData
}) => {
    const { t } = useTranslation();
    const { profileId } = useContext(ProfileContext);
    const gridRef = useRef(null);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [warehouseModalOpen, setWarehouseModalOpen] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

    React.useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 1024);
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    const columns = useMemo(() => [
        {
            width: 45,
            maxWidth: 45,
            minWidth: 45,
            pinned: !isMobile ? "left" : false,
            lockPinned: !isMobile,
            suppressMovable: true,
            sortable: false,
            resizable: false,
            cellRenderer: "agGroupCellRenderer",
            cellRendererParams: {
                suppressCount: true,
                innerRenderer: () => null,
            },
        },
        {
            headerName: t("Product Details"),
            field: "productName",
            title: "Product Details",
            minWidth: 400,
            flex: 2,
            wrapText: true,
            autoHeight: true,
            headerComponent: CustomHeader,
            cellRenderer: (params) => {
                const row = params.data;
                if (!row) return null;

                return (
                    <div id={"fba-first-target-" + params.node.rowIndex} className="flex items-center py-2 h-full">
                        <div className="rounded border flex items-center justify-center overflow-hidden mr-3 shrink-0"
                            style={{
                                width: 54, minWidth: 54, height: 54,
                                background: isDark ? "rgba(255,255,255,0.05)" : "#fff",
                                borderColor: isDark ? "var(--glass-border-color)" : "#dee2e6"
                            }}>
                            {row.imageURL ? (
                                <img src={row.imageURL} alt="p" style={{ maxWidth: '90%', maxHeight: '90%', objectFit: 'contain' }} />
                            ) : (
                                <i className="fa-regular fa-image text-gray-500" style={{ fontSize: 20 }}></i>
                            )}
                        </div>
                        <div className="flex flex-col justify-center" style={{ minWidth: 0, lineHeight: '1.4' }}>
                            <span className="font-bold mb-0.5 truncate" style={{ fontSize: 13, color: isDark ? "var(--text-primary)" : P.neutral800 }} title={row.productName}>
                                {row.productName}
                            </span>
                            <div className="flex flex-wrap items-center" style={{ fontSize: 11, color: isDark ? "var(--text-secondary)" : P.neutral600, columnGap: '16px', rowGap: '2px' }}>
                                <span><strong style={{ color: isDark ? "var(--text-primary)" : P.neutral400 }}>SKU:</strong> {row.sku}</span>
                                <span><strong style={{ color: isDark ? "var(--text-primary)" : P.neutral400 }}>ASIN:</strong> {row.asin}</span>
                            </div>
                        </div>
                    </div>
                );
            }
        },
        {
            headerName: t("Current Stock"),
            field: "availableInventory",
            title: "Current Stock",
            width: 140,
            headerComponent: CustomHeader,
            cellRenderer: (params) => {
                const row = params.data;
                if (!row) return null;
                return (
                    <div className="flex flex-col justify-center h-full">
                        <div className="font-bold" style={{ color: isDark ? "var(--text-primary)" : "#1e293b", fontSize: 14 }}>{row.availableInventory || 0}</div>
                        <div style={{ fontSize: 10, color: isDark ? "var(--text-secondary)" : P.neutral400, whiteSpace: 'nowrap' }}>
                            In: {row.inboundStock || 0} | Res: {row.reservedStock || 0}
                        </div>
                    </div>
                );
            }
        },
        {
            headerName: t("ADS"),
            field: "salesPerDay",
            title: "ADS",
            width: 120,
            headerComponent: CustomHeader,
            headerComponentParams: {
                tooltipText: t("Average Daily Sales - The average number of units sold per day over the selected period.")
            },
            cellRenderer: (params) => {
                const row = params.data;
                if (!row) return null;
                return (
                    <div className="flex flex-col justify-center h-full">
                        <div className="font-bold" style={{ color: isDark ? "var(--text-primary)" : "#1e293b" }}>{row.salesPerDay || 0}</div>
                        <div style={{ fontSize: 10, color: isDark ? "var(--text-secondary)" : P.neutral400 }}>{t("Avg Units / Day")}</div>
                    </div>
                );
            }
        },
        {
            headerName: t("DOI"),
            field: "doi",
            title: "Days of Inventory",
            width: 110,
            headerComponent: CustomHeader,
            headerComponentParams: {
                tooltipText: t("Days of Inventory - How many days your current available stock will last based on your Average Daily Sales.")
            },
            cellRenderer: (params) => {
                const row = params.data;
                if (!row) return null;
                const doi = row.doi || 0;
                let color = isDark ? "var(--text-primary)" : P.neutral800;
                if (doi < 15) color = P.danger;
                else if (doi < 30) color = P.warning;

                return (
                    <div className="flex items-center h-full">
                        <div className="font-bold" style={{ color, fontSize: 14 }}>{doi}</div>
                        <span className="ml-1" style={{ fontSize: 10, color: isDark ? "var(--text-secondary)" : P.neutral400, marginTop: 2 }}>{t("Days")}</span>
                    </div>
                );
            }
        },
        {
            headerName: t("Forecast Status"),
            field: "inventoryForecastStatus",
            title: "Forecast Status",
            width: 160,
            headerComponent: CustomHeader,
            headerComponentParams: {
                tooltipText: t("Forecast Status - The inventory health status based on stock levels, lead times, and sales velocity.")
            },
            cellRenderer: (params) => {
                const status = params.value;
                if (!status) return null;

                let bg = isDark ? "rgba(255, 255, 255, 0.05)" : "#f1f5f9", text = isDark ? "rgba(255, 255, 255, 0.8)" : "#475569", icon = "fa-circle-check";
                if (status === "URGENT") { bg = isDark ? "rgba(239, 68, 68, 0.15)" : "#fee2e2"; text = isDark ? "#f87171" : "#ef4444"; icon = "fa-circle-exclamation"; }
                else if (status === "PLAN_SHIPMENT") { bg = isDark ? "rgba(245, 158, 11, 0.15)" : "#fef3c7"; text = isDark ? "#fbbf24" : "#d97706"; icon = "fa-truck-fast"; }
                else if (status === "OVERSTOCK") { bg = isDark ? "rgba(139, 92, 246, 0.15)" : "#e0f2fe"; text = isDark ? "#a78bfa" : "#0ea5e9"; icon = "fa-boxes-stacked"; }
                else if (status === "HEALTHY") { bg = isDark ? "rgba(16, 185, 129, 0.15)" : "#dcfce7"; text = isDark ? "#34d399" : "#16a34a"; icon = "fa-circle-check"; }
                else if (status === "NO_SALES") { bg = isDark ? "rgba(255, 255, 255, 0.03)" : "#f8fafc"; text = isDark ? "rgba(255, 255, 255, 0.5)" : "#94a3b8"; icon = "fa-circle-minus"; }

                return (
                    <div className="flex items-center h-full">
                        <span className="badge flex items-center gap-1" style={{
                            backgroundColor: bg, color: text,
                            fontWeight: 700, fontSize: 10,
                            padding: "6px 10px", borderRadius: 6,
                            textTransform: 'uppercase', letterSpacing: '0.3px',
                            border: isDark ? "1px solid rgba(255,255,255,0.05)" : "none"
                        }}>
                            <i className={`fa-solid ${icon}`} style={{ fontSize: 10 }}></i>
                            {TAG_LABEL[status] ? t(TAG_LABEL[status]) : status.replace(/_/g, ' ')}
                        </span>
                    </div>
                );
            }
        },
        {
            headerName: t("Reorder Point"),
            field: "reorderPoint",
            title: "Reorder Point",
            width: 135,
            headerComponent: CustomHeader,
            headerComponentParams: {
                tooltipText: t("Reorder Point - The inventory level that triggers a restock request. If your stock is below this, reorder soon.")
            },
            cellRenderer: (params) => (
                <div className="flex items-center h-full font-bold" style={{ color: isDark ? "var(--text-primary)" : "#1e293b" }}>
                    {params.value || 0}
                </div>
            )
        },
        {
            headerName: t("Recommended"),
            field: "recommendedShipmentQty",
            title: "Recommended Qty",
            width: 145,
            headerComponent: CustomHeader,
            headerComponentParams: {
                tooltipText: t("Recommended Qty - The suggested number of units to ship or order to maintain optimal inventory levels.")
            },
            cellRenderer: (params) => {
                const val = params.value || 0;
                return (
                    <div className="flex items-center h-full">
                        <div className="font-bold px-3 py-1 rounded" style={{
                            backgroundColor: val > 0 ? (isDark ? "rgba(60, 187, 242, 0.15)" : "#E0F4FD") : 'transparent',
                            color: val > 0 ? (isDark ? "#2374F2" : "#1A9FD4") : (isDark ? "rgba(255, 255, 255, 0.4)" : "#94a3b8"),
                            fontSize: 14
                        }}>
                            {val}
                        </div>
                    </div>
                );
            }
        },
        ...(PermissionCheck(SYSTEM_PAGES.FBA_PLANNING, PAGE_ACTIONS.UPDATE) || PermissionCheck(SYSTEM_PAGES.FBA_PLANNING, PAGE_ACTIONS.REMOVE) ? [
            {
                headerName: t("Actions"),
                width: 80,
                pinned: 'right',
                headerComponent: CustomHeader,
                cellRenderer: (params) => {
                    const isCustom = params.data.isCustomSetting;
                    return (
                        <div className="flex items-center justify-center h-full">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="p-0 flex items-center justify-center w-8 h-8 rounded-full transition-all duration-200"
                                style={{
                                    background: isCustom ? (isDark ? "rgba(245, 158, 11, 0.15)" : "#fff7ed") : (isDark ? "rgba(255,255,255,0.05)" : `${P.primary}08`),
                                    color: isCustom ? '#f59e0b' : (isDark ? "#2374F2" : P.primary),
                                    border: isCustom ? (isDark ? "1px solid rgba(245, 158, 11, 0.3)" : "1px solid #fed7aa") : "none",
                                    boxShadow: isCustom ? '0 1px 2px rgba(245, 158, 11, 0.1)' : 'none'
                                }}
                                title={isCustom ? t("Custom Product Settings Active") : t("Configure Product Settings")}
                                onClick={() => {
                                    setSelectedProduct({
                                        asin: params.data.asin,
                                        sku: params.data.sku,
                                        productName: params.data.productName,
                                        isCustomSetting: params.data.isCustomSetting
                                    });
                                    setWarehouseModalOpen(true);
                                }}
                            >
                                <FiSettings size={16} />
                            </Button>
                        </div>
                    );
                }
            }
        ] : [])
    ], [t, isDark, isMobile]);

    // ── Detail cell renderer (Warehouse-wise inline expansion) ─────────────
    const detailCellRenderer = useCallback(
        (params) => (
            <div
                style={{
                    padding: "12px 20px",
                    background: isDark ? "rgba(15, 23, 42, 0.5)" : "#f8fafc",
                }}
            >
                <WarehousePlanningAccordion
                    data={params?.data}
                    profileId={profileId?.value ?? profileId}
                    isDark={isDark}
                    onUpdated={refreshData}
                    onOpenSettings={() => {
                        setSelectedProduct({
                            asin: params?.data?.asin,
                            sku: params?.data?.sku,
                            productName: params?.data?.productName,
                            isCustomSetting: params?.data?.isCustomSetting
                        });
                        setWarehouseModalOpen(true);
                    }}
                />
            </div>
        ),
        [profileId, isDark, refreshData]
    );

    const detailCellRendererParams = useMemo(() => ({ detailGridOptions: {} }), []);

    return (
        <div className="glass-grid-container overflow-hidden mt-4">
            {/* Grid Header with Local Filters */}
            <div
                className="data_model_btn camapgin_btn flex flex-col md:flex-row md:items-center justify-between gap-3"
                style={{
                    padding: isMobile ? "10px 16px" : "12px 24px",
                    width: "100%",
                }}
            >
                <div className="flex items-center gap-2">
                    <h6 className="m-0 font-bold" style={{ color: isDark ? "var(--text-primary)" : "#1e293b", fontSize: 15 }}>{t("Inventory Details")}</h6>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
                        {totalRecords} {t("Items")}
                    </span>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-2 md:gap-3">
                    <div style={{ width: "100%" }}>
                        <Select
                            value={selectedStatus === null || selectedStatus === undefined || selectedStatus === "" ? "__all_status" : selectedStatus}
                            onValueChange={(val) => setSelectedStatus(val === "__all_status" ? null : val)}
                        >
                            <SelectTrigger className="h-[38px] text-[13px] font-medium bg-white dark:bg-transparent border-slate-300 dark:border-slate-700 rounded-md shadow-sm w-full min-w-[160px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__all_status">{t("All Statuses")}</SelectItem>
                                <SelectItem value="URGENT">{t("URGENT")}</SelectItem>
                                <SelectItem value="PLAN_SHIPMENT">{t("PLAN_SHIPMENT")}</SelectItem>
                                <SelectItem value="OVERSTOCK">{t("OVERSTOCK")}</SelectItem>
                                <SelectItem value="HEALTHY">{t("HEALTHY")}</SelectItem>
                                <SelectItem value="NO_SALES">{t("NO SALES")}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {PermissionCheck(SYSTEM_PAGES.FBA_PLANNING, PAGE_ACTIONS.UPDATE) && (
                        <Button
                            variant="outline"
                            className="flex items-center justify-center gap-2 fba-settings-btn w-full w-sm-auto px-4 h-[38px] font-semibold text-[13px] rounded-lg transition-all duration-200"
                            style={{
                                backgroundColor: isDark ? "rgba(255, 255, 255, 0.05)" : `${P.primary}08`,
                                borderColor: isDark ? "var(--glass-border-color)" : `${P.primary}40`,
                                color: isDark ? "#2374F2" : P.primary,
                                boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                            }}
                            id="fba-configure-planning"
                            onClick={() => {
                                setSelectedProduct(null);
                                setSettingsOpen(true);
                            }}
                            title={t("Adjust Global Lead Times & Buffer Days")}
                        >
                            <FiSettings size={18} />
                            <span>{t("Configure Planning")}</span>
                        </Button>
                    )}
                </div>
            </div>

            <div id="fba-planning-grid" className="data_table position-relative" style={{ padding: "0 24px 24px 24px" }}>
                <AgTable
                    onRefresh={refreshData} ref={gridRef}
                    tableId=""
                    height="700px"
                    rowHeight={75}
                    rowData={rowData}
                    columnDefs={columns}
                    totalRecords={totalRecords}
                    perPage={rowsPerPage}
                    currentPage={currentPage}
                    onPageChange={onPageChange}
                    onPerPageChange={onPerPageChange}
                    onSortChanged={onSortChanged}
                    loading={loading}
                    isCustomSaveColumns={true}
                    customSaveColumnName="FBA Planning Grid"
                    detailCellRenderer={detailCellRenderer}
                    detailCellRendererParams={detailCellRendererParams}
                    detailRowAutoHeight={true}
                />
            </div>

            <WarehousePlanningModal
                open={warehouseModalOpen}
                onClose={() => {
                    setWarehouseModalOpen(false);
                    setSelectedProduct(null);
                }}
                profileId={profileId?.value ?? profileId}
                product={selectedProduct}
                onSaveSuccess={refreshData}
                isDark={isDark}
            />

            <FbaPlanningSettings
                open={settingsOpen}
                onClose={() => {
                    setSettingsOpen(false);
                    setSelectedProduct(null);
                }}
                profileId={profileId?.value ?? profileId}
                asin={selectedProduct?.asin}
                sku={selectedProduct?.sku}
                productName={selectedProduct?.productName}
                isCustomSetting={selectedProduct?.isCustomSetting}
                onSaveSuccess={refreshData}
                isDark={isDark}
            />
        </div>
    );
};

export default FbaPlanningGrid;
