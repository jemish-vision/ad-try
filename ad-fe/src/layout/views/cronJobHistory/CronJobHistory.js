import { SYSTEM_PAGES, PAGE_ACTIONS } from "src/common/constants";
import React, { useContext, useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Filter from "../../../helper/filter/Filter";
import AgTable from "../../../common/grid/AgTable";
import { ProfileContext } from "../../../helper/usecontext/useContext";
import moment from "moment-timezone";
import { handleLoader, Toast, useDispatch } from "../../../helper/links/Link";
import { ShadcnDateRangePicker as DateRangePicker } from "../../../components/ui/date-range-picker";
import { predefinedRanges } from "../../../common/helper/calendarValues/calendarValues";
import { PermissionCheck } from '../../../helper/permission/PermissionCheck';
import { ApiCronJobHistoryList } from "../../../api-wrapper/cronJob/ApiCrobJob";
import { useTranslation } from 'react-i18next';
import { firstPageRows, paginationRowsPerPageOptions } from "../../../helper/table/TableStyle";
import Breadcrumb from "../../../common/components/Breadcrumb";
import { MdOutlineClose } from "react-icons/md";
import { Card, CardHeader, CardTitle, CardContent } from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import {
  Select as ShadcnSelect,
  SelectTrigger as ShadcnSelectTrigger,
  SelectValue as ShadcnSelectValue,
  SelectContent as ShadcnSelectContent,
  SelectItem as ShadcnSelectItem
} from "../../../components/ui/select";

function CronJobHistory() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  let { profileId, selectedAdType, selectedDate, setSelectedDate } = useContext(ProfileContext);
  const [date, setDate] = useState([new Date(moment().startOf("month")), new Date()]);

  useEffect(() => {
    if (selectedDate && Array.isArray(selectedDate) && selectedDate.length >= 2) {
      setDate([moment(selectedDate[0]).toDate(), moment(selectedDate[1]).toDate()]);
    }
  }, [selectedDate]);
  const [arg, setArg] = useState({ pageNo: 1, perPage: firstPageRows });
  const [perPage, setPerPage] = useState(firstPageRows);
  const [data, setData] = useState([]);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const [searchType] = useState([
    { value: "", label: `${t("allType")}` },
    { value: "Campaign", label: `${t("campaign")}` },
    { value: "AdGroups", label: `${t("adGroup")}` },
    { value: "ProductAds", label: `${t("productAds")}` },
    { value: "Keywords", label: `${t("keywords")}` },
    { value: "Products", label: `${t("products")}` },
    { value: "Placements", label: `${t("placements")}` },
    { value: "Targeting", label: `${t("targeting")}` },
  ]);
  const [tableData, setTableData] = useState([]);
  const [searchName, setSearchName] = useState('');
  const [debouncedSearchName, setDebouncedSearchName] = useState('');

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchName(searchName);
    }, 350);
    return () => clearTimeout(handler);
  }, [searchName]);

  const [type, setType] = useState("");

  const gridRef = useRef(null);
  const dispatch = useDispatch();

  const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");
  useEffect(() => {
    const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    window.addEventListener("themeChanged", handle);
    return () => window.removeEventListener("themeChanged", handle);
  }, []);

  useEffect(() => {
    if (profileId.value && selectedAdType) {
      getCronJobHistoryList(arg);
    }
  }, [profileId.value, selectedAdType, date, type, debouncedSearchName]);

  const getCronJobHistoryList = async (argOverride) => {
    dispatch(handleLoader(true));
    const data = {
      fromDate: moment(date?.[0]).format("YYYY-MM-DD"),
      toDate: moment(date?.[1]).format("YYYY-MM-DD"),
      profileId: profileId.value,
      search: argOverride?.hasOwnProperty("searchName") ? argOverride.searchName : debouncedSearchName,
      type: type,
      fieldName: "createdAt",
      sortType: "DESC",
      ...arg,
      ...argOverride,
    };
    await ApiCronJobHistoryList(data)
      .then((e) => {
        if (e?.isSuccess) {
          dispatch(handleLoader(false));
          setTableData(e.data);
          setData(e);
        } else {
          dispatch(handleLoader(false));
          Toast.error(e?.message);
        }
      })
      .catch(() => {
        dispatch(handleLoader(false));
        Toast.error(t("Something went wrong"));
      });
  };

  const columns = [
    {
      headerName: t("cronName"),
      field: "cronName",
      title: "Cron Name",
      flex: 1,
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      cellRenderer: (params) => {
        return (
          <div style={{ padding: "8px 4px" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: isDark ? "#f8fafc" : "#475569" }}>
              {params.value || "-"}
            </span>
          </div>
        );
      },
    },
    {
      headerName: t("Created At"),
      field: "createdAt",
      title: "Created Date",
      width: 220,
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      cellRenderer: (params) => {
        if (!params.value) return <span style={{ color: isDark ? "#94a3b8" : "#64748b", padding: "8px 4px", display: "block" }}>—</span>;
        const formatted = moment(params.value).format("DD/MM/YYYY hh:mm:ss A");
        const parts = formatted.split(" ");
        const datePart = parts[0] || "";
        const timePart = parts.slice(1).join(" ") || "";
        return (
          <div style={{ padding: "8px 4px", display: "flex", flexDirection: "column", lineHeight: 1.3 }}>
            <span style={{ fontSize: 12, fontWeight: 550, color: isDark ? "#f8fafc" : "#475569" }}>{datePart}</span>
            {timePart && <span style={{ fontSize: 10, color: isDark ? "#94a3b8" : "#64748b" }}>{timePart}</span>}
          </div>
        );
      },
    },
    {
      headerName: t("Last Updated At"),
      field: "updatedAt",
      title: "Last Updated Date",
      width: 220,
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      cellRenderer: (params) => {
        if (!params.value) return <span style={{ color: isDark ? "#94a3b8" : "#64748b", padding: "8px 4px", display: "block" }}>—</span>;
        const formatted = moment(params.value).format("DD/MM/YYYY hh:mm:ss A");
        const parts = formatted.split(" ");
        const datePart = parts[0] || "";
        const timePart = parts.slice(1).join(" ") || "";
        return (
          <div style={{ padding: "8px 4px", display: "flex", flexDirection: "column", lineHeight: 1.3 }}>
            <span style={{ fontSize: 12, fontWeight: 550, color: isDark ? "#f8fafc" : "#475569" }}>{datePart}</span>
            {timePart && <span style={{ fontSize: 10, color: isDark ? "#94a3b8" : "#64748b" }}>{timePart}</span>}
          </div>
        );
      },
    },
    {
      headerName: t("status"),
      field: "status",
      title: "Status",
      width: 150,
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        const status = row.status ? row.status.toUpperCase() : "—";

        let bg = isDark ? "rgba(255,255,255,0.06)" : "#F1F5F9";
        let color = isDark ? "rgba(255,255,255,0.60)" : "#475569";
        let border = isDark ? "rgba(255,255,255,0.10)" : "#E2E8F0";

        if (status === "SUCCESS" || status === "COMPLETED") {
          bg = isDark ? "rgba(62,207,168,0.12)" : "#F0FDF4";
          color = isDark ? "#3ECFA8" : "#15803D";
          border = isDark ? "rgba(62,207,168,0.25)" : "#86EFAC";
        } else if (status === "PENDING") {
          bg = isDark ? "rgba(240,176,74,0.12)" : "#FFFBEB";
          color = isDark ? "#F0B04A" : "#B45309";
          border = isDark ? "rgba(240,176,74,0.25)" : "#FDE68A";
        } else if (status === "FAILED") {
          bg = isDark ? "rgba(240,112,112,0.12)" : "#FFF1F2";
          color = isDark ? "#F07070" : "#BE123C";
          border = isDark ? "rgba(240,112,112,0.25)" : "#FECDD3";
        }

        return (
          <div style={{ padding: "8px 4px" }}>
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
              {status}
            </span>
          </div>
        );
      },
    },
  ];

  const handleSearch = (e) => {
    setSearchName(e.target.value);
  };

  const handlePageChange = (page) => {
    setArg({ pageNo: page, perPage: perPage });
    getCronJobHistoryList({ pageNo: page, perPage: perPage });
  };

  const handlePerRowsChange = (newPerPage) => {
    setPerPage(newPerPage);
    setArg({ pageNo: 1, perPage: newPerPage });
    getCronJobHistoryList({ pageNo: 1, perPage: newPerPage });
  };

  const handleSortChanged = (e) => {
    const sortModel = e.columns;
    if (!sortModel || sortModel.length === 0) return;
    const { colId, sortDef: { direction: sort } } = sortModel?.reverse()?.[0];
    getCronJobHistoryList({ fieldName: colId, ...(sort && { sortType: sort === "asc" ? "ASC" : "DESC" }), ...arg });
  };

  return (
    <>
      <style>{`
        [data-theme="dark"] #cron-history-search input {
          color: #f8fafc !important;
          background-color: #1e293b !important;
          border: 1px solid #334155 !important;
        }
        [data-theme="dark"] #cron-history-search input::placeholder {
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
      <Filter
        name={"Cron Job Scheduler"}
        nameShow={false}
        dateShow={false}
        profileShow={true}
      />
      <div className="middle_container budget_container">
        <div className="mb-4">
          <Breadcrumb
            paths={[
              { label: "Cron Job Scheduler", link: "/cron-schedular" },
              { label: "History" }
            ]}
            onBack={() => navigate("/cron-schedular")} />
        </div>
        <Card
          className="overflow-hidden"
          style={{
            backgroundColor: isDark ? "#1e293b" : "#fff",
            borderColor: isDark ? "#334155" : "#e2e8f0",
          }}
        >
          <CardHeader
            className="border-b space-y-0"
            style={{
              padding: isMobile ? "10px 14px" : "12px 24px",
              display: "flex",
              flexDirection: isMobile ? "column" : "row",
              alignItems: isMobile ? "flex-start" : "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 12,
              borderBottomColor: isDark ? "#334155" : "#e2e8f0",
              backgroundColor: isDark ? "rgba(255,255,255,0.02)" : "transparent",
            }}
          >
            <div className={`flex items-center ${isMobile ? "w-full justify-between" : ""}`}>
              <CardTitle className="m-0 flex items-center cron-title-bar" style={{ fontSize: 15, color: isDark ? "#f8fafc" : "#1E293B" }}>
                {t("cronjobhistory")}
                {data?.totalRecords ? (
                  <span className="ml-2 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700">
                    {data.totalRecords.toLocaleString()} RUNS
                  </span>
                ) : ""}
              </CardTitle>
            </div>

            <div className={`flex ${isMobile ? "flex-col w-full" : "flex-row items-center"} gap-2`}>
              <div className={`flex ${isMobile ? "flex-row flex-wrap w-full" : "flex-row items-center"} gap-2`}>
                <div id="cron-history-search" style={{ position: "relative", width: isMobile ? "100%" : "auto", minWidth: isMobile ? "100%" : "320px", flexGrow: 1 }}>
                  <Input
                    type="text"
                    placeholder={t("searchHere")}
                    value={searchName}
                    onChange={(e) => handleSearch(e)}
                    className="w-full"
                    style={{
                      height: "40px",
                      marginTop: "0px",
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

                <div id="cron-history-type-filter" style={{ width: isMobile ? "100%" : "auto", flexGrow: isMobile ? 1 : 0 }}>
                  <ShadcnSelect
                    value={type === "" || type === undefined ? "all" : type}
                    onValueChange={(val) => {
                      const typeVal = val === "all" ? "" : val;
                      setType(typeVal);
                    }}
                  >
                    <ShadcnSelectTrigger
                      className="w-full h-10 px-3 transition-colors duration-200"
                      style={{
                        width: isMobile ? "100%" : 200,
                        backgroundColor: isDark ? "#1e293b" : "#fff",
                        borderColor: isDark ? "#334155" : "#ced4da",
                        color: isDark ? "#f8fafc" : "#1e293b",
                        fontSize: "13px",
                        fontFamily: "inherit",
                        marginTop: "0px",
                      }}
                    >
                      <ShadcnSelectValue placeholder={t("allType")} />
                    </ShadcnSelectTrigger>
                    <ShadcnSelectContent
                      style={{
                        backgroundColor: isDark ? "#1e293b" : "#fff",
                        borderColor: isDark ? "#334155" : "#e2e8f0",
                        color: isDark ? "#f8fafc" : "#1e293b",
                        fontFamily: "inherit",
                      }}
                    >
                      {searchType.map((opt) => (
                        <ShadcnSelectItem
                          key={opt.value}
                          value={opt.value === "" ? "all" : opt.value}
                          style={{ fontSize: "13px", fontFamily: "inherit" }}
                        >
                          {opt.label}
                        </ShadcnSelectItem>
                      ))}
                    </ShadcnSelectContent>
                  </ShadcnSelect>
                </div>

                <div id="cron-history-date-picker" style={{ width: isMobile ? "100%" : "auto", flexGrow: isMobile ? 1 : 0 }}>
                  <DateRangePicker
                    className="w-full sm:w-[260px]"
                    ranges={predefinedRanges}
                    value={date}
                    placeholder={t("Select Date")}
                    onChange={(val) => setDate(val)}
                    placement="bottomEnd"
                    format="yyyy-MM-dd"
                    cleanable={false}
                    style={{ width: isMobile ? "100%" : "250px", height: "40px", borderRadius: "8px" }}
                  />
                </div>
              </div>
            </div>
          </CardHeader>

          {PermissionCheck(SYSTEM_PAGES.CRON_JOB_HISTORY, PAGE_ACTIONS.VIEW_ONLY) && (
            <CardContent className="p-0">
              <div className="data_table" style={{ padding: "14px" }}>
                <AgTable ref={gridRef}
                  tableId="cronJobHistory-main-table"
                  height={"70vh"}
                  rowData={tableData}
                  columnDefs={columns}
                  totalRecords={data?.totalRecords ?? 0}
                  perPage={perPage}
                  currentPage={arg.pageNo}
                  onPageChange={handlePageChange}
                  onPerPageChange={handlePerRowsChange}
                  onSortChanged={handleSortChanged}
                  paginationOptions={paginationRowsPerPageOptions}
                  isCustomSaveColumns={true}
                  customSaveColumnName={"Cron Job History"}
                  handleSaveColumns={undefined}
                />
              </div>
            </CardContent>
          )}
        </Card>
      </div>
    </>
  );
}

export default CronJobHistory;