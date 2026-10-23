import { useState, useEffect, useRef, useContext } from "react";
import AgTable from "../../../../common/grid/AgTable";
import { useTranslation } from "react-i18next";
import { firstPageRows, paginationRowsPerPageOptions } from "../../../../helper/table/TableStyle";
import AddPerformanceScoreRule from "./AddPerformanceScoreRule";
import { handleLoader, Toast, useDispatch } from "../../../../helper/links/Link";
import { ApiDeletePerformanceScoreSetting, ApiGetAllPerformanceScoreSetting } from "../../../../api-wrapper/campaign-setting/ApiDynamicPerformanceScore";
import { CustomModal } from "../../../../helper/modal/CustomModal";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../../components/ui/dialog";
import { Button } from "../../../../components/ui/button";
import { ProfileContext } from "../../../../helper/usecontext/useContext";
import { AppTooltip } from "../../../../components/ui/AppTooltip";
import { SYSTEM_PAGES, PAGE_ACTIONS } from "src/common/constants";
import { PermissionCheck } from "../../../../helper/permission/PermissionCheck";

const STATUS_BADGE = {
    Profitable: { color: "#10b981", dotColor: "#10b981", bg: "rgba(16, 185, 129, 0.08)" },
    "Break Even": { color: "#f59e0b", dotColor: "#f59e0b", bg: "rgba(245, 158, 11, 0.08)" },
    "Loss": { color: "#ef4444", dotColor: "#ef4444", bg: "rgba(239, 68, 68, 0.08)" },
};

const OPERATOR_LABEL = {
    LESS_THAN: "<",
    LESS_THAN_OR_EQUAL_TO: "≤",
    GREATER_THAN_OR_EQUAL_TO: "≥",
    GREATER_THAN: ">",
    EQUAL_TO: "=",
    NOT_EQUAL_TO: "≠",
    BETWEEN: "between",
};

// Portal-based tooltip immune to AG-Grid CSS transform offsets

function PerformanceScoreSetting({ targetACOS }) {
    const { t } = useTranslation();
    const dispatch = useDispatch();
    const gridRef = useRef(null);
    const { profileId } = useContext(ProfileContext);

    const [rows, setRows] = useState([]);
    const [totalRecords, setTotalRecords] = useState(0);
    const [arg, setArg] = useState({ pageNo: 1, perPage: firstPageRows });

    const [addModalFlag, setaddModalFlag] = useState(false);
    const [editId, setEditId] = useState(null);
    const [editData, setEditData] = useState(null);
    const [isTableLoading, setIsTableLoading] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState(null);

    // ── Condition renderer ───────────────────────────────────
    const conditionTextMaker = (el, index) => {
        const {
            conditionType,
            conditionOperator,
            conditionStringValue,
            conditionValue,
            conditionMaxValue,
            conditionValueType,
            useTargetAcos
        } = el;

        const opLabel = OPERATOR_LABEL[conditionOperator] || conditionOperator || "";
        const valueSuffix = conditionValueType === "Percentage" ? "%" : "";

        if (conditionStringValue) {
            return `${conditionType} = ${conditionStringValue} `;
        }

        if (conditionOperator === "BETWEEN") {
            return `${conditionType} between ${conditionValue}${valueSuffix} and ${conditionMaxValue}${valueSuffix} `;
        }

        const displayValue = useTargetAcos
            ? `Target ACOS (${targetACOS}%)`
            : `${conditionValue}${valueSuffix}`;

        return `${conditionType} ${opLabel} ${displayValue} `;
    };

    // ── Fetch ────────────────────────────────────────────────
    const getRule = async (params = arg) => {
        try {
            setIsTableLoading(true);
            const res = await ApiGetAllPerformanceScoreSetting({ profileId: profileId?.value, pageNo: params.pageNo, perPage: params.perPage }, { skipLoader: true });

            if (res?.isSuccess) {
                setRows(res.data || []);
                setTotalRecords(res.totalRecords || 0);
            } else {
                Toast.error(res?.message || "Failed to fetch rules");
            }
        } catch {
            Toast.error(t("Something went wrong"));
        } finally {
            setIsTableLoading(false);
        }
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (profileId?.value) {
            getRule();
        }
    }, [profileId?.value]);

    // ── Delete ───────────────────────────────────────────────
    const handleDelete = (row) => {
        setDeleteConfirm(row);
    };

    const executeDelete = async () => {
        if (!deleteConfirm) return;
        try {
            dispatch(handleLoader(true));
            const res = await ApiDeletePerformanceScoreSetting({ id: deleteConfirm?._id });
            if (res?.isSuccess) {
                Toast.success(res.message || "Deleted successfully");
                getRule(arg);
            } else {
                Toast.error(res?.message || "Delete failed");
            }
        } catch {
            Toast.error(t("Something went wrong"));
        } finally {
            dispatch(handleLoader(false));
            setDeleteConfirm(null);
        }
    };

    // ── Edit ─────────────────────────────────────────────────
    const handleEdit = (row) => {
        setEditId(row._id);
        setEditData(row);
        setaddModalFlag(true);
    };

    // ── Pagination ───────────────────────────────────────────
    const handlePageChange = (page) => {
        const updated = { ...arg, pageNo: page };
        setArg(updated);
        getRule(updated);
    };

    const handlePerRowsChange = (newPerPage) => {
        const updated = { pageNo: 1, perPage: newPerPage };
        setArg(updated);
        getRule(updated);
    };

    // ── Columns ──────────────────────────────────────────────
    const columns = [
        ...(PermissionCheck(SYSTEM_PAGES.CAMPAIGN_SETTING, PAGE_ACTIONS.UPDATE) || PermissionCheck(SYSTEM_PAGES.CAMPAIGN_SETTING, PAGE_ACTIONS.REMOVE) ? [{
            headerName: t("Action"),
            field: "action",
            title: "Action",
            width: 110,
            sortable: false,
            resizable: false,
            cellRenderer: (params) => {
                const row = params.data;
                if (!row) return null;
                return (
                    <div className="action_container gap-2 flex items-center" style={{ height: "100%" }}>
                        {PermissionCheck(SYSTEM_PAGES.CAMPAIGN_SETTING, PAGE_ACTIONS.UPDATE) && (
                            <AppTooltip text={t("Edit Rule")}>
                                <button
                                    onClick={() => handleEdit(row)}
                                    style={{
                                        background: "#eff6ff",
                                        border: "1px solid #dbeafe",
                                        borderRadius: "100px",
                                        color: "#2563eb",
                                        width: "32px",
                                        height: "32px",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        cursor: "pointer",
                                        transition: "all 0.15s ease"
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.background = "#dbeafe"; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.background = "#eff6ff"; }}
                                >
                                    <i className="fa fa-pencil" />
                                </button>
                            </AppTooltip>
                        )}
                        {PermissionCheck(SYSTEM_PAGES.CAMPAIGN_SETTING, PAGE_ACTIONS.REMOVE) && (
                            <AppTooltip text={t("Delete Rule")}>
                                <button
                                    onClick={() => handleDelete(row)}
                                    style={{
                                        background: "#fef2f2",
                                        border: "1px solid #fee2e2",
                                        borderRadius: "100px",
                                        color: "#ef4444",
                                        width: "32px",
                                        height: "32px",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        cursor: "pointer",
                                        transition: "all 0.15s ease"
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.background = "#fee2e2"; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.background = "#fef2f2"; }}
                                >
                                    <i className="fa fa-trash" />
                                </button>
                            </AppTooltip>
                        )}
                    </div>
                );
            },
        }] : []),
        {
            headerName: t("Score Name"),
            field: "scoreName",
            title: "Score Name",
            width: 200,
            sortable: true,
            resizable: true,
            cellRenderer: (params) => {
                const row = params.data;
                if (!row) return null;
                const style = STATUS_BADGE[row.scoreName] || { bg: "rgba(71, 85, 105, 0.08)", color: "#475569", dotColor: "#475569" };
                return (
                    <div className="flex items-center" style={{ height: "100%" }}>
                        <span style={{
                            backgroundColor: style.bg,
                            color: style.color,
                            borderRadius: "6px",
                            padding: "2px 8px 2px 6px",
                            fontSize: "11px",
                            fontWeight: "600",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            height: "22px",
                            lineHeight: "1"
                        }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: style.dotColor, display: "inline-block" }}></span>
                            {row.scoreName}
                        </span>
                    </div>
                );
            },
        },
        {
            headerName: t("Conditions"),
            field: "conditions",
            title: "Conditions",
            minWidth: 400,
            flex: 1,
            sortable: false,
            resizable: true,
            wrapText: true,
            autoHeight: true,
            cellRenderer: (params) => {
                const row = params.data;
                if (!row) return null;
                return (
                    <div className="flex flex-wrap items-center" style={{ gap: "8px 6px", padding: "8px 0", height: "100%" }}>
                        {row?.conditions?.map((el, index) => {
                            const conditionText = conditionTextMaker(el);
                            return (
                                <div key={index} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                                    {index !== 0 && (
                                        <span
                                            style={{
                                                fontSize: "9px",
                                                fontWeight: "700",
                                                textTransform: "uppercase",
                                                letterSpacing: "0.05em",
                                                color: el.queryOperator === "OR" ? "#d97706" : "#1A9FD4",
                                                background: el.queryOperator === "OR" ? "rgba(245, 158, 11, 0.08)" : "rgba(2, 70, 139, 0.08)",
                                                padding: "2px 6px",
                                                borderRadius: "4px",
                                                display: "inline-flex",
                                                alignItems: "center",
                                                height: "18px",
                                                lineHeight: "1"
                                            }}
                                        >
                                            {el.queryOperator}
                                        </span>
                                    )}
                                    <span className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded px-2 py-0.5 text-xs font-medium inline-flex items-center whitespace-nowrap h-[22px] shadow-sm">
                                        {conditionText}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                );
            },
        }
    ];

    return (
        <>
            {/* ── Section Header ── */}
            <div className="data_model_btn camapgin_btn flex justify-between items-center" style={{ padding: "12px 24px", borderBottom: "1px solid rgba(2, 70, 139, 0.08)", background: "transparent" }}>
                <div>
                    <h5 style={{ fontWeight: 700, color: "#0f172a", margin: 0 }}>{t("Dynamic Performance Score Setting")}</h5>
                </div>
                <div>
                    {PermissionCheck(SYSTEM_PAGES.CAMPAIGN_SETTING, PAGE_ACTIONS.CREATE) && (
                        <Button
                            id="performance-score-add-rule-btn"
                            className="customize-button h-[36px] bg-gradient-to-br from-[#1A9FD4] to-[#2374F2] !text-white hover:opacity-90 !border-0 whitespace-nowrap px-4 font-semibold shadow-sm flex items-center justify-center gap-1.5 m-0 gap-0"
                            onClick={() => {
                                setEditId(null);
                                setEditData(null);
                                setaddModalFlag(true);
                            }}
                        >
                            {t("Add Rule")}
                        </Button>
                    )}
                </div>
            </div>

            {/* ── Grid ── */}
            <div className="data_table" id="performance-score-table" style={{ padding: "0 24px 24px 24px" }}>
                <AgTable
                    onRefresh={getRule} ref={gridRef}
                    tableId="performance-score-table"
                    height={"220px"}
                    minHeight={"180px"}
                    isLoading={isTableLoading}
                    rowData={rows}
                    columnDefs={columns}
                    totalRecords={totalRecords}
                    perPage={arg.perPage}
                    currentPage={arg.pageNo}
                    onPageChange={handlePageChange}
                    onPerPageChange={handlePerRowsChange}
                    onSortChanged={() => { }}
                    paginationOptions={paginationRowsPerPageOptions}
                    isCustomSaveColumns={false}
                />
            </div>

            {/* ── Modal ── */}
            {/* ── Modal ── */}
            <Dialog open={addModalFlag} onOpenChange={(isOpen) => { if (!isOpen) setaddModalFlag(false); }}>
                <DialogContent
                    className="sm:max-w-[1000px] premium-modal modal-content p-0 flex flex-col max-h-[90vh] overflow-hidden bg-[#f8fafc] dark:bg-[#0f172a] gap-0"
                    onInteractOutside={(e) => e.preventDefault()}
                    onEscapeKeyDown={(e) => e.preventDefault()}
                >
                    <DialogHeader className="modal-header border-b-0 p-4 pb-0 shrink-0">
                        <DialogTitle className="text-xl font-bold text-slate-800 dark:text-white flex justify-between items-center w-full">
                            {editId ? t("Edit Performance Score Rule") : t("Dynamic Performance Score Setting")}
                        </DialogTitle>
                    </DialogHeader>

                    <div className="max-h-[80vh] overflow-y-auto flex-1 !p-0 modal-body" style={{ paddingBottom: "0px" }}>
                        <AddPerformanceScoreRule
                            setaddModalFlag={setaddModalFlag}
                            getRule={getRule}
                            editId={editId}
                            editData={editData}
                        />
                    </div>
                </DialogContent>
            </Dialog>

            <CustomModal
                show={!!deleteConfirm}
                onHide={() => setDeleteConfirm(null)}
                title={t("Delete Rule")}
                subtitle={t("Performance score setting")}
                icon="delete"
                iconVariant="danger"
                message={`You are about to permanently delete the rule <span class="cm-highlight">${deleteConfirm?.scoreName}</span>. All associated conditions will be removed.`}
                alertText="This action cannot be undone."
                alertVariant="danger"
                closeOnBackdrop={false}
                actions={[
                    { label: t("Cancel"), cancel: true, icon: "close", onClick: () => setDeleteConfirm(null) },
                    { label: t("Delete Rule"), variant: "danger", icon: "delete", onClick: executeDelete },
                ]}
            />
        </>
    );
}

export default PerformanceScoreSetting;