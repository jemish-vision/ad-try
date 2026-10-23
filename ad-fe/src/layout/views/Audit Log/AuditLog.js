import { SYSTEM_PAGES, PAGE_ACTIONS } from "src/common/constants";
import { useContext, useState, useEffect, useRef, useMemo } from "react";
import Filter from "../../../helper/filter/Filter";
import AgTable from "../../../common/grid/AgTable";
import { ProfileContext } from "../../../helper/usecontext/useContext";
import moment from "moment-timezone";
import { Toast } from "../../../helper/links/Link";
import { ShadcnDateRangePicker as DateRangePicker } from "../../../components/ui/date-range-picker";
import { predefinedRanges } from "../../../common/helper/calendarValues/calendarValues";
import { ApiAditLogListing } from "../../../api-wrapper/auditLog/ApiAuditLog";
import { useTranslation } from "react-i18next";
import { PermissionCheck } from "../../../helper/permission/PermissionCheck";
import { useParams } from "react-router-dom";
import { firstPageRows, paginationRowsPerPageOptions } from "../../../helper/table/TableStyle";
import { handleLoader } from "../../../common/redux/action";
import { useDispatch } from "react-redux";
import MetadataModal from "./MetadataModal";
import { MdOutlineClose } from "react-icons/md";
import { Card, CardHeader, CardTitle, CardContent } from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import { MultiSelect } from "../../../components/ui/multi-select";


const TYPE_OPTIONS = [
  {
    label: "User Activity",
    options: [
      { value: "USER_LOGIN", label: "User Login" },
      { value: "USER_LOGOUT", label: "User Logout" },
      { value: "GOOGLE_USER_LOGIN", label: "Google User Login" },
      { value: "PASSWORD_CHANGE", label: "Password Change" },
    ],
  },
  {
    label: "Amazon Ads Config",
    options: [
      { value: "CONFIG_CONNECT", label: "Config Connect" },
      { value: "CONFIG_RECONNECT", label: "Config Reconnect" },
      { value: "CONFIG_DISCONNECT", label: "Config Disconnect" },
    ],
  },
  {
    label: "Seller Config",
    options: [
      { value: "SELLER_CONFIG_CONNECT", label: "Seller Config Connect" },
      { value: "SELLER_CONFIG_RECONNECT", label: "Seller Config Reconnect" },
      { value: "SELLER_CONFIG_DISCONNECT", label: "Seller Config Disconnect" },
      { value: "SELLER_CONFIG_SUBSCRIPTIONS", label: "Seller Config Subscriptions" },
    ],
  },
  {
    label: "Security",
    options: [
      { value: "CSRF_ATTEMPT_EXPIRE", label: "CSRF Attempt Expire" },
      { value: "CSRF_ATTEMPT_INVALID", label: "CSRF Attempt Invalid" },
    ],
  },
  {
    label: "Placement Rules",
    options: [
      { value: "PLACEMENT_RULE_CREATION", label: "Placement Rule Creation" },
      { value: "PLACEMENT_RULE_UPDATE", label: "Placement Rule Update" },
      { value: "PLACEMENT_RULE_DELETION", label: "Placement Rule Deletion" },
      { value: "PLACEMENT_RULE_STATUS_CHANGE", label: "Placement Rule Status Change" },
    ],
  },
  {
    label: "Budget Rules",
    options: [
      { value: "BUDGET_RULE_CREATION", label: "Budget Rule Creation" },
      { value: "BUDGET_RULE_UPDATE", label: "Budget Rule Update" },
      { value: "BUDGET_RULE_DELETION", label: "Budget Rule Deletion" },
      { value: "BUDGET_RULE_STATUS_CHANGE", label: "Budget Rule Status Change" },
    ],
  },
  {
    label: "Targeting Rules",
    options: [
      { value: "TARGETING_RULE_CREATION", label: "Targeting Rule Creation" },
      { value: "TARGETING_RULE_UPDATE", label: "Targeting Rule Update" },
      { value: "TARGETING_RULE_DELETION", label: "Targeting Rule Deletion" },
      { value: "TARGETING_RULE_STATUS_CHANGE", label: "Targeting Rule Status Change" },
    ],
  },
  {
    label: "Search Term Rules",
    options: [
      { value: "SEARCH_TERM_RULE_CREATION", label: "Search Term Rule Creation" },
      { value: "SEARCH_TERM_RULE_UPDATE", label: "Search Term Rule Update" },
      { value: "SEARCH_TERM_RULE_DELETION", label: "Search Term Rule Deletion" },
      { value: "SEARCH_TERM_RULE_STATUS_CHANGE", label: "Search Term Rule Status Change" },
    ],
  },
  {
    label: "Dayparting Rules",
    options: [
      { value: "DAYPARTING_RULE_CREATION", label: "Dayparting Rule Creation" },
      { value: "DAYPARTING_RULE_UPDATE", label: "Dayparting Rule Update" },
      { value: "DAYPARTING_RULE_DELETION", label: "Dayparting Rule Deletion" },
      { value: "DAYPARTING_RULE_STATUS_CHANGE", label: "Dayparting Rule Status Change" },
    ],
  },
  {
    label: "Recommendation Rules",
    options: [
      { value: "RECOMMENDATION_RULE_CREATION", label: "Recommendation Rule Creation" },
      { value: "RECOMMENDATION_RULE_UPDATE", label: "Recommendation Rule Update" },
      { value: "RECOMMENDATION_RULE_DELETION", label: "Recommendation Rule Deletion" },
      { value: "RECOMMENDATION_RULE_STATUS_CHANGE", label: "Recommendation Rule Status Change" },
      { value: "RECOMMENDATION_APPLIED", label: "Recommendation Applied" },
      { value: "RECOMMENDATION_DISMISSED", label: "Recommendation Dismissed" },
    ],
  },
  {
    label: "Settings",
    options: [
      { value: "CRON_JOB_SETTINGS", label: "Cron Job Settings" },
      { value: "INVENTORY_SETTINGS", label: "Inventory Settings" },
      { value: "FBA_CONFIGURATION", label: "FBA Configuration" },
      { value: "REIMBURSEMENT_SETTINGS", label: "Reimbursement Settings" },
      { value: "RULES_SETTINGS", label: "Rules Settings" },
    ],
  },
  {
    label: "Campaign",
    options: [
      { value: "CAMPAIGN_CREATION", label: "Campaign Creation" },
      { value: "CAMPAIGN_BID_THRESHOLD", label: "Campaign Bid Threshold" },
      { value: "CAMPAIGN_NOTIFICATION_THRESHOLD", label: "Campaign Notification Threshold" },
      { value: "CAMPAIGN_PRODUCT_ELIGIBILITY_THRESHOLD", label: "Campaign Product Eligibility Threshold" },
    ],
  },
  {
    label: "Product",
    options: [
      { value: "PRODUCT_CREATION", label: "Product Creation" },
      { value: "PRODUCT_PRICE_UPDATE", label: "Product Price Update" },
      { value: "PRODUCT_NOTIFICATION_THRESHOLD", label: "Product Notification Threshold" },
    ],
  },
  {
    label: "Search Terms",
    options: [
      { value: "SEARCH_TERM_ADD_AS_KEYWORD", label: "Search Term Add as Keyword" },
      { value: "SEARCH_TERM_ADD_AS_NEGATIVE_KEYWORD", label: "Search Term Add as Negative Keyword" },
      { value: "SEARCH_TERM_REMOVED", label: "Search Term Removed" },
    ],
  },
];

// Color-coded pill style based on event category
const getEventStyle = (event = "", isDark = false) => {
  if (!event) return isDark ? { bg: "#1e293b", color: "#94a3b8", border: "#334155" } : { bg: "#F1F5F9", color: "#64748B", border: "#E2E8F0" };
  const e = event.toUpperCase();
  if (e.includes("LOGIN") || e.includes("LOGOUT") || e.includes("PASSWORD"))
    return isDark
      ? { bg: "rgba(59, 130, 246, 0.15)", color: "#60a5fa", border: "rgba(59, 130, 246, 0.3)" }
      : { bg: "#EFF6FF", color: "#1a56db", border: "#BFDBFE" };
  if (e.includes("CREATION"))
    return isDark
      ? { bg: "rgba(34, 197, 94, 0.15)", color: "#4ade80", border: "rgba(34, 197, 94, 0.3)" }
      : { bg: "#F0FDF4", color: "#15803D", border: "#86EFAC" };
  if (e.includes("DELETION") || e.includes("REMOVED") || e.includes("DISCONNECT"))
    return isDark
      ? { bg: "rgba(239, 68, 68, 0.15)", color: "#f87171", border: "rgba(239, 68, 68, 0.3)" }
      : { bg: "#FFF1F2", color: "#BE123C", border: "#FECDD3" };
  if (e.includes("UPDATE") || e.includes("CHANGE") || e.includes("RECONNECT"))
    return isDark
      ? { bg: "rgba(245, 158, 11, 0.15)", color: "#fbbf24", border: "rgba(245, 158, 11, 0.3)" }
      : { bg: "#FFFBEB", color: "#B45309", border: "#FDE68A" };
  if (e.includes("CSRF") || e.includes("SECURITY"))
    return isDark
      ? { bg: "rgba(168, 85, 247, 0.15)", color: "#c084fc", border: "rgba(168, 85, 247, 0.3)" }
      : { bg: "#FDF4FF", color: "#7E22CE", border: "#E9D5FF" };
  if (e.includes("APPLIED") || e.includes("SUBSCRIPTIONS"))
    return isDark
      ? { bg: "rgba(34, 197, 94, 0.15)", color: "#4ade80", border: "rgba(34, 197, 94, 0.3)" }
      : { bg: "#F0FDF4", color: "#15803D", border: "#86EFAC" };
  if (e.includes("DISMISSED"))
    return isDark
      ? { bg: "rgba(239, 68, 68, 0.15)", color: "#f87171", border: "rgba(239, 68, 68, 0.3)" }
      : { bg: "#FFF1F2", color: "#BE123C", border: "#FECDD3" };
  return isDark
    ? { bg: "#1e293b", color: "#cbd5e1", border: "#334155" }
    : { bg: "#F1F5F9", color: "#475569", border: "#E2E8F0" };
};

function AuditLog() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");

  useEffect(() => {
    const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    const observer = new MutationObserver(handle);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const { t } = useTranslation();
  const { campaignId } = useParams();
  const { profileId, selectedAdType, selectedDate, setSelectedDate } = useContext(ProfileContext);

  const [perPage, setPerPage] = useState(firstPageRows);
  const [arg, setArg] = useState({ pageNo: 1, perPage: firstPageRows });
  const [types, setTypes] = useState([]);

  const allOptions = useMemo(() => {
    const flat = [];
    TYPE_OPTIONS.forEach(group => {
      group.options.forEach(opt => {
        flat.push({ ...opt, label: t(opt.label), category: t(group.label) });
      });
    });
    return flat;
  }, [t]);
  const [auditLogData, setAuditLogData] = useState();
  const [date, setDate] = useState(() => {
    if (selectedDate && Array.isArray(selectedDate) && selectedDate.length >= 2) {
      return [moment(selectedDate[0]).toDate(), moment(selectedDate[1]).toDate()];
    }
    return [new Date(moment().startOf("month")), new Date()];
  });

  useEffect(() => {
    if (selectedDate && Array.isArray(selectedDate) && selectedDate.length >= 2) {
      const newDate = [moment(selectedDate[0]).toDate(), moment(selectedDate[1]).toDate()];
      if (newDate[0].getTime() !== date[0]?.getTime() || newDate[1].getTime() !== date[1]?.getTime()) {
        setDate(newDate);
      }
    }
  }, [selectedDate]);
  const [tableData, setTableData] = useState([]);
  const [loadingGrid, setLoadingGrid] = useState(false);
  const [searchName, setSearchName] = useState("");
  const [debouncedSearchName, setDebouncedSearchName] = useState("");

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchName(searchName);
    }, 350);
    return () => clearTimeout(handler);
  }, [searchName]);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState(null);

  const openModal = (row) => { setSelectedRow(row); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setSelectedRow(null); };

  const gridRef = useRef(null);
  const dispatch = useDispatch();

  const columns = [
    {
      headerName: t("Event"),
      field: "event",
      title: "Event",
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      minWidth: 200,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        const label = row?.event?.replaceAll("_", " ") ?? "";
        const { bg, color, border } = getEventStyle(row.event, isDark);
        return (
          <div style={{ padding: "10px 4px" }}>
            <span style={{
              display: "inline-block",
              fontSize: 11,
              fontWeight: 600,
              padding: "3px 10px",
              borderRadius: 20,
              background: bg,
              color,
              border: `1px solid ${border}`,
              lineHeight: 1.4,
            }}>
              {t(label) || label}
            </span>
          </div>
        );
      },
    },
    {
      headerName: t("Message"),
      field: "message",
      title: "Message",
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      flex: 1,
      minWidth: 240,
      cellRenderer: (params) => {
        const msg = params.data?.message;
        if (!msg) return <span style={{ color: "#CBD5E1", padding: "10px 4px", display: "block" }}>—</span>;
        return (
          <div style={{ padding: "10px 4px", fontSize: 12, color: isDark ? "#e2e8f0" : "#334155", lineHeight: 1.5 }}>
            {t(msg) || msg}
          </div>
        );
      },
    },
    {
      headerName: t("Details"),
      field: "metadata",
      title: "Details",
      sortable: false,
      resizable: true,
      width: 110,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row?.metadata) return <span style={{ color: "#CBD5E1", padding: "10px 4px", display: "block", fontSize: 12 }}>—</span>;
        return (
          <div style={{ padding: "10px 4px" }}>
            <button
              className="audit-log-view-btn"
              onClick={() => openModal(row)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontSize: 11,
                fontWeight: 600,
                color: isDark ? "#60a5fa" : "#1a56db",
                background: isDark ? "rgba(59, 130, 246, 0.15)" : "#EFF6FF",
                border: isDark ? "1px solid rgba(59, 130, 246, 0.3)" : "1px solid #BFDBFE",
                borderRadius: 6,
                padding: "4px 10px",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {t("View")}
            </button>
          </div>
        );
      },
    },
    {
      headerName: t("IP Address"),
      field: "ipAddress",
      title: "IP Address",
      sortable: true,
      resizable: true,
      width: 145,
      cellRenderer: (params) => {
        const val = params?.value;
        if (!val) return <span style={{ color: "#CBD5E1", padding: "10px 4px", display: "block", fontSize: 12 }}>—</span>;
        return (
          <div style={{ padding: "10px 4px" }}>
            <span style={{
              fontFamily: "monospace",
              fontSize: 12,
              background: isDark ? "#0f172a" : "#F8FAFC",
              border: isDark ? "1px solid #334155" : "1px solid #E2E8F0",
              borderRadius: 4,
              padding: "2px 7px",
              color: isDark ? "#e2e8f0" : "#475569",
            }}>
              {val}
            </span>
          </div>
        );
      },
    },
    {
      headerName: t("User Agent"),
      field: "userAgent",
      title: "User Agent",
      sortable: false,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      width: 200,
      cellRenderer: (params) => {
        const val = params?.value;
        if (!val) return <span style={{ color: "#CBD5E1", padding: "10px 4px", display: "block", fontSize: 12 }}>—</span>;
        return (
          <div style={{ padding: "10px 4px", fontSize: 11, color: isDark ? "#94a3b8" : "#64748B", lineHeight: 1.5, wordBreak: "break-word" }}>
            {val}
          </div>
        );
      },
    },
    {
      headerName: t("Date & Time"),
      field: "createdAt",
      title: "Date & Time",
      sortable: true,
      resizable: true,
      width: 155,
      cellRenderer: (params) => {
        if (!params?.value) return <span style={{ color: "#CBD5E1", padding: "10px 4px", display: "block", fontSize: 12 }}>—</span>;
        const m = moment(params.value);
        return (
          <div style={{ padding: "10px 4px" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: isDark ? "#f8fafc" : "#1E293B" }}>{m.format("MMM DD, YYYY")}</div>
            <div style={{ fontSize: 11, color: isDark ? "#94a3b8" : "#64748B", marginTop: 2 }}>{m.format("hh:mm:ss A")}</div>
          </div>
        );
      },
    },
  ];

  useEffect(() => {
    AuditLogList(arg);
  }, [date, profileId?.value, selectedAdType, types, debouncedSearchName]);

  const handlePageChange = (page) => {
    setArg({ pageNo: page, perPage });
    AuditLogList({ pageNo: page, perPage });
  };

  const handlePerRowsChange = (newPerPage) => {
    setPerPage(newPerPage);
    setArg({ pageNo: 1, perPage: newPerPage });
    AuditLogList({ pageNo: 1, perPage: newPerPage });
  };

  const AuditLogList = async (argOverride) => {
    if (!profileId?.value || !selectedAdType) return;
    const data = {
      fromDate: moment(date?.[0]).format("YYYY-MM-DD"),
      toDate: moment(date?.[1]).format("YYYY-MM-DD"),
      profileId: profileId.value,
      event: types,
      search: argOverride?.hasOwnProperty("searchName") ? argOverride.searchName : debouncedSearchName,
      ...argOverride,
    };
    setLoadingGrid(true);
    try {
      const [e] = await Promise.all([
        ApiAditLogListing(data),
        new Promise(resolve => setTimeout(resolve, 300))
      ]);
      if (e?.isSuccess) {
        dispatch(handleLoader(false));
        setTableData(e.data);
        setAuditLogData(e);
      } else {
        Toast.error(e?.message);
      }
    } catch (err) {
      Toast.error(t("Something went wrong"));
    } finally {
      setLoadingGrid(false);
    }
  };

  return (
    <>
      <Filter name={"Audit Log"} nameShow={false} dateShow={false} profileShow={true} />

      <style>{`
        [data-theme="dark"] #audit-log-search input {
          color: #f8fafc !important;
          background-color: #1e293b !important;
          border: 1px solid #334155 !important;
        }
        [data-theme="dark"] #audit-log-search input::placeholder {
          color: #94a3b8 !important;
        }
        .cron-title-bar {
          text-transform: uppercase !important;
          letter-spacing: 0.05em !important;
          font-weight: 700 !important;
          font-family: "Inter", sans-serif !important;
        }
        .cron-title-bar::before {
          content: "" !important;
          display: inline-block !important;
          width: 3px !important;
          height: 18px !important;
          border-radius: 1.5px !important;
          background: #1A5CC7 !important;
          margin-right: 8px !important;
          vertical-align: middle !important;
        }
        [data-theme="dark"] .cron-title-bar::before {
          background: #5B9CF6 !important;
        }
      `}</style>

      <div className="middle_container budget_container">
        <div className="data_content data_content_btn glass-grid-container h-maxContent">
          <div className="camapgin_btn flex flex-wrap justify-between items-center gap-3 pt-4 pb-2 px-6 w-full max-w-full box-border relative z-30">
            {/* Title */}
            <div className={`flex items-center ${isMobile ? "w-full justify-between" : ""}`}>
              <CardTitle className="m-0 flex items-center cron-title-bar" style={{ fontSize: 14, color: isDark ? "#cbd5e1e0" : "#0F172A" }}>
                {t("Audit Log")}
              </CardTitle>
            </div>

            {/* Controls */}
            <div className="flex flex-wrap items-center gap-3 mt-2 ml-auto" style={{ width: isMobile ? "100%" : "auto" }}>
              <div id="audit-log-type" className="relative z-30" style={{ flex: isMobile ? "1 1 100%" : "0 0 200px", width: isMobile ? "100%" : "200px" }}>
                <MultiSelect
                  options={allOptions}
                  value={types}
                  onChange={(val) => setTypes(val || [])}
                  placeholder={t("Filter by event type")}
                  className="bg-transparent h-10 w-full"
                  maxCount={1}
                />
              </div>

              <div id="audit-log-search" className="relative" style={{ flex: isMobile ? "1 1 100%" : "0 0 240px", width: isMobile ? "100%" : "240px" }}>
                <Input
                  type="text"
                  placeholder={t("searchHere")}
                  value={searchName}
                  onChange={(e) => setSearchName(e?.target?.value)}
                  className="w-full h-10 animate-none"
                  style={{
                    fontSize: "13px",
                    fontFamily: "inherit",
                    backgroundColor: isDark ? "#1e293b" : "#fff",
                    borderColor: isDark ? "#334155" : "#ced4da",
                    color: isDark ? "#f8fafc" : "#1e293b",
                    paddingRight: searchName ? "35px" : "12px",
                  }}
                />
                {searchName && (
                  <MdOutlineClose
                    onClick={() => setSearchName("")}
                    style={{
                      position: "absolute",
                      right: "10px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      cursor: "pointer",
                      color: "var(--text-secondary)",
                      fontSize: "18px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      opacity: 0.7,
                      transition: "opacity 0.2s",
                      zIndex: 10,
                    }}
                    onMouseEnter={(e) => e.target.style.opacity = 1}
                    onMouseLeave={(e) => e.target.style.opacity = 0.7}
                  />
                )}
              </div>

              <div id="audit-log-date-picker" style={{ flex: isMobile ? "1 1 100%" : "0 0 250px", width: isMobile ? "100%" : "250px" }}>
                <DateRangePicker
                  className="w-full"
                  ranges={predefinedRanges}
                  value={date}
                  placeholder={t("Select Date")}
                  onChange={(val) => setDate(val)}
                  placement="bottomEnd"
                  format="yyyy-MM-dd"
                  cleanable={false}
                  style={{ width: "100%", height: "40px" }}
                />
              </div>
            </div>
          </div>

          {PermissionCheck(SYSTEM_PAGES.AUDIT_LOG, PAGE_ACTIONS.VIEW_ONLY) && (
            <div className="p-0">
              <div id="audit-log" className="data_table" style={{ padding: "0 24px 24px 24px" }}>
                <AgTable ref={gridRef}
                  tableId="audit-log-main-table"
                  height={"68vh"}
                  rowData={tableData}
                  columnDefs={columns}
                  totalRecords={auditLogData?.totalRecords ?? 0}
                  perPage={perPage}
                  currentPage={arg.pageNo}
                  onPageChange={handlePageChange}
                  onPerPageChange={handlePerRowsChange}
                  onSortChanged={() => { }}
                  paginationOptions={paginationRowsPerPageOptions}
                  isCustomSaveColumns={true}
                  customSaveColumnName={"Audit Log"}
                  handleSaveColumns={undefined}
                  loading={loadingGrid}
                  onRefresh={() => AuditLogList(arg)}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <MetadataModal
        show={modalOpen}
        onHide={closeModal}
        event={selectedRow?.event}
        metadata={selectedRow?.metadata}
        isDark={isDark}
        extraFields={selectedRow ? {
          message: selectedRow.message,
          ipAddress: selectedRow.ipAddress,
          userAgent: selectedRow.userAgent,
          createdAt: selectedRow.createdAt,
        } : {}}
      />
    </>
  );
}

export default AuditLog;
