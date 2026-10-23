import { SYSTEM_PAGES, PAGE_ACTIONS } from "src/common/constants";
import React, { useContext, useState, useEffect, useRef, useCallback, useMemo } from "react";
import ReactDOM from "react-dom";
import Filter from "../../../helper/filter/Filter";
import AgTable from "../../../common/grid/AgTable";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../../../components/ui/dialog";
import { ProfileContext } from "../../../helper/usecontext/useContext";
import { Toast, handleLoader, useDispatch, useNavigate } from "../../../helper/links/Link";
import success from "../../../assets/images/success.svg";
import { ApiCronJobSchedularList, ApiCronJobActive, ApiCreateCronJob, ApiUpdateCronJob, ApiManuallyRunCronJob } from "../../../api-wrapper/cronJob/ApiCrobJob";
import { AiOutlinePlus, AiFillDelete } from "react-icons/ai";
import { MdOutlineClose } from "react-icons/md";
import { PermissionCheck } from "../../../helper/permission/PermissionCheck";
import { useTranslation } from 'react-i18next';
import { firstPageRows, paginationRowsPerPageOptions } from "../../../helper/table/TableStyle";
import { CustomModal } from "../../../helper/modal/CustomModal";

import { Card, CardHeader, CardTitle, CardContent } from "../../../components/ui/card";
import { Switch } from "../../../components/ui/switch";
import { Input } from "../../../components/ui/input";
import {
  Select as ShadcnSelect,
  SelectTrigger as ShadcnSelectTrigger,
  SelectValue as ShadcnSelectValue,
  SelectContent as ShadcnSelectContent,
  SelectItem as ShadcnSelectItem
} from "../../../components/ui/select";
import { AppTooltip } from "../../../components/ui/AppTooltip";

// Portal-based tooltip immune to AG-Grid CSS transform offsets

function CronJobSchedular() {
  const { t } = useTranslation();

  let { profileId, selectedAdType } = useContext(ProfileContext);

  const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");

  useEffect(() => {
    const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    const observer = new MutationObserver(handle);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  const [arg, setArg] = useState({ pageNo: 1, perPage: firstPageRows });
  const [perPage, setPerPage] = useState(firstPageRows);
  const [totalRecords, settotalRecords] = useState();
  const [data, setData] = useState([]);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [tableData, setTableData] = useState([]);
  const [loadingGrid, setLoadingGrid] = useState(false);
  const [searchName, setSearchName] = useState("");
  const [debouncedSearchName, setDebouncedSearchName] = useState("");
  const [type, settype] = useState("");
  const [activeData, setactiveData] = useState("");

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchName(searchName);
    }, 350);
    return () => clearTimeout(handler);
  }, [searchName]);
  const [showCronJobModal, setShowCronJobModal] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  const [cronJob, setCronJob] = useState({
    id: "",
    cronName: "",
    cronDescription: "",
    frequency: "",
    dates: "",
    days: "",
    times: "",
    interval: "",
    hours: "",
    minutes: "",
  });

  const monthDates = Array.from({ length: 31 }, (_, i) => i + 1);
  const hours = Array.from({ length: 12 }, (_, i) => i + 1);
  const minutesOrSeconds = Array.from({ length: 60 }, (_, i) => i + 1);

  const [isManuallyRun] = useState(["Best Performer Report", "Keyword Analysis Report"]);
  const [runningCrons, setRunningCrons] = useState([]);

  const [statusConfirm, setStatusConfirm] = useState(null);

  const [searchType, setsearchType] = useState([
    { value: "", label: `${t("allType")}` },
    { value: "Campaign", label: `${t("campaign")}` },
    { value: "AdGroup", label: `${t("adGroup")}` },
    { value: "ProductAds", label: `${t("productAds")}` },
    { value: "Keyword", label: `${t("keywords")}` },
    { value: "Products", label: `${t("products")}` },
    { value: "Placement", label: `${t("placements")}` },
    { value: "Targeting", label: `${t("targeting")}` },
  ]);
  const [isActive, setisActive] = useState([
    { value: "", label: `${t("allStatus")}` },
    { value: true, label: `${t("active")}` },
    { value: false, label: `${t("inactive")}` },
  ]);
  const [selectedDays, setSelectedDays] = useState([]);
  const [dateData, setDateData] = useState([""]);
  const [timeData, setTimeData] = useState([""]);
  const allDays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const frequency = [
    { value: "Daily", label: t("daily") },
    { value: "Weekly", label: t("weekly") },
    { value: "Monthly", label: t("monthly") },
    { value: "Every_X_Seconds", label: t("every_x_seconds") },
    { value: "Every_X_Minutes", label: t("every_x_minutes") },
    { value: "Every_X_Hours", label: t("every_x_hours") },
    { value: "Every_Hour_At_Minute", label: t("every_hour_at_minute") },
  ];

  const gridRef = useRef(null);

  useEffect(() => {
    if (profileId?.value && selectedAdType) {
      getCronJobList();
    }
  }, [profileId?.value, selectedAdType, debouncedSearchName, activeData, type]);

  const getCronJobList = async (argOverride = {}) => {
    const data = {
      fieldName: "lastRun",
      sortType: "DESC",
      search: argOverride?.hasOwnProperty("searchName") ? argOverride.searchName : debouncedSearchName,
      isActive: argOverride?.hasOwnProperty("isActive") ? argOverride.isActive : activeData,
      type: argOverride?.hasOwnProperty("type") ? argOverride.type : type,
      ...arg,
      ...argOverride,
      profileId: profileId.value,
    };
    setLoadingGrid(true);
    try {
      const [e] = await Promise.all([
        ApiCronJobSchedularList(data),
        new Promise(resolve => setTimeout(resolve, 300))
      ]);
      if (e?.isSuccess) {
        dispatch(handleLoader(false));
        setTableData(e.data);
        settotalRecords(e.totalRecords);
        setData(e);
      } else {
        Toast.error(e?.message);
      }
    } catch (err) {
      Toast.error(t("Something went wrong"));
    } finally {
      setLoadingGrid(false);
    }
  };

  const handleManualRun = async (cronName) => {
    if (runningCrons.includes(cronName) || !profileId?.value || !selectedAdType) return;

    setRunningCrons((prev) => [...prev, cronName]);

    try {
      const res = await ApiManuallyRunCronJob({ cronName, profileId: profileId.value });
      if (res?.isSuccess) Toast.success(res?.message || "Cron job executed successfully");
      else Toast.error(res?.message || "Failed to execute cron job");
    } catch (error) {
      Toast.error(error.message || "Something went wrong");
    } finally {
      setRunningCrons((prev) => prev.filter((c) => c !== cronName));
    }
  };

  const columns = [
    {
      headerName: "",
      field: "cronId",
      title: "Action",
      maxWidth: 60,
      sortable: false,
      resizable: false,
      cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" },
      cellRenderer: (params) => {
        const row = params.data;
        if (!row || !isManuallyRun?.includes(row?.cronName)) return null;
        const isRunning = runningCrons.includes(row.cronName);
        const hasUpdatePermission = PermissionCheck(SYSTEM_PAGES.CRON_JOB_SCHEDULER, PAGE_ACTIONS.UPDATE);
        const isDisabled = isRunning || !hasUpdatePermission;
        return (
          <div style={{ padding: "8px 0" }}>
            <AppTooltip text={!hasUpdatePermission ? t("You don't have permission to update") : (isRunning ? t("Running...") : t("Run master cron manually"))}>
              <button
                disabled={isDisabled}
                onClick={() => {
                  if (hasUpdatePermission) handleManualRun(row.cronName);
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  border: isDark ? "1px solid rgba(59, 130, 246, 0.3)" : "none",
                  background: isDisabled
                    ? (isDark ? "rgba(255,255,255,0.05)" : "#f1f5f9")
                    : (isDark ? "rgba(59, 130, 246, 0.15)" : "#EFF6FF"),
                  color: isDisabled
                    ? (isDark ? "#475569" : "#94a3b8")
                    : (isDark ? "#60a5fa" : "#1a56db"),
                  cursor: isDisabled ? "not-allowed" : "pointer",
                  transition: "all 0.2s ease",
                  opacity: hasUpdatePermission ? 1 : 0.6
                }}
              >
                {isRunning
                  ? <i className="fa fa-circle-notch fa-spin" style={{ fontSize: 12 }}></i>
                  : <i className="fa fa-play" style={{ fontSize: 10, marginLeft: 2 }}></i>
                }
              </button>
            </AppTooltip>
          </div>
        );
      },
    },
    {
      headerName: t("cronName"),
      field: "cronName",
      title: "Cron Name",
      width: 200,
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      cellRenderer: (params) => {
        return (
          <div style={{ padding: "8px 4px" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: isDark ? "#f8fafc" : "#1e293b" }}>
              {params.value}
            </span>
          </div>
        );
      }
    },
    {
      headerName: t("cronDescription"),
      field: "cronDescription",
      title: "Cron Description",
      width: 550,
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      cellRenderer: (params) => {
        return (
          <div style={{ padding: "8px 4px", fontSize: 12, color: isDark ? "#94a3b8" : "#475569", lineHeight: 1.5 }}>
            {params.value || <span style={{ color: isDark ? "#475569" : "#CBD5E1" }}>—</span>}
          </div>
        );
      }
    },
    {
      headerName: t("isactive"),
      field: "isActive",
      title: "Is Active",
      width: 100,
      sortable: false,
      resizable: false,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        const hasUpdatePermission = PermissionCheck(SYSTEM_PAGES.CRON_JOB_SCHEDULER, PAGE_ACTIONS.UPDATE);
        return (
          <div className="flex items-center justify-center h-full" style={{ padding: "8px 0" }}>
            <AppTooltip text={!hasUpdatePermission ? t("You don't have permission to update") : ""}>
              <div>
                <Switch
                  disabled={!hasUpdatePermission}
                  checked={row.isActive}
                  onCheckedChange={(checked) => {
                    if (!hasUpdatePermission) return;
                    const fakeEvent = { target: { checked } };
                    statusHandler(fakeEvent, row.cronId, profileId, row.cronName);
                  }}
                />
              </div>
            </AppTooltip>
          </div>
        );
      },
    },
    {
      headerName: t("status"),
      field: "status",
      title: "Status",
      width: 130,
      sortable: true,
      resizable: true,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        const status = row.status ? row.status.toUpperCase() : "—";

        let bg = isDark ? "#1e293b" : "#F1F5F9";
        let color = isDark ? "#cbd5e1" : "#475569";
        let border = isDark ? "#334155" : "#E2E8F0";

        if (status === "SUCCESS" || status === "COMPLETED") {
          bg = isDark ? "rgba(34, 197, 94, 0.15)" : "#F0FDF4";
          color = isDark ? "#4ade80" : "#15803D";
          border = isDark ? "rgba(34, 197, 94, 0.3)" : "#86EFAC";
        } else if (status === "PENDING") {
          bg = isDark ? "rgba(245, 158, 11, 0.15)" : "#FFFBEB";
          color = isDark ? "#fbbf24" : "#B45309";
          border = isDark ? "rgba(245, 158, 11, 0.3)" : "#FDE68A";
        } else if (status === "FAILED") {
          bg = isDark ? "rgba(239, 68, 68, 0.15)" : "#FFF1F2";
          color = isDark ? "#f87171" : "#BE123C";
          border = isDark ? "rgba(239, 68, 68, 0.3)" : "#FECDD3";
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
    {
      headerName: t("lastrun"),
      field: "lastRun",
      title: "Last Run",
      width: 220,
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      cellRenderer: (params) => {
        if (!params.value) return <span style={{ color: isDark ? "#475569" : "#CBD5E1", padding: "8px 4px", display: "block" }}>—</span>;

        const parts = params.value.split(" ");
        const datePart = parts[0] || "";
        const timePart = parts.slice(1).join(" ") || "";

        return (
          <div className="flex items-center" style={{ padding: "8px 4px" }}>
            {success && <img src={success} className="mr-2" style={{ width: 14, height: 14 }} alt="success" />}
            <div className="flex flex-col" style={{ lineHeight: 1.3 }}>
              <span style={{ fontSize: 12, fontWeight: 550, color: isDark ? "#e2e8f0" : "#334155" }}>{datePart}</span>
              {timePart && <span style={{ fontSize: 10, color: isDark ? "#94a3b8" : "#64748b" }}>{timePart}</span>}
            </div>
          </div>
        );
      },
    },
    {
      headerName: t("nextrun"),
      field: "nextRun",
      title: "Next Run",
      width: 220,
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      cellRenderer: (params) => {
        if (!params.value) return <span style={{ color: isDark ? "#475569" : "#CBD5E1", padding: "8px 4px", display: "block" }}>—</span>;

        const parts = params.value.split(" ");
        const datePart = parts[0] || "";
        const timePart = parts.slice(1).join(" ") || "";

        return (
          <div style={{ padding: "8px 4px", display: "flex", flexDirection: "column", lineHeight: 1.3 }}>
            <span style={{ fontSize: 12, fontWeight: 550, color: isDark ? "#e2e8f0" : "#334155" }}>{datePart}</span>
            {timePart && <span style={{ fontSize: 10, color: isDark ? "#94a3b8" : "#64748b" }}>{timePart}</span>}
          </div>
        );
      },
    },
  ];

  const statusHandler = (event, id, profileId, cronName) => {
    setStatusConfirm({
      isActive: event.target.checked,
      cronId: id,
      cronName,
      profileId: profileId.value,
    });
  };

  const executeStatusChange = async () => {
    if (!statusConfirm) return;
    try {
      const res = await ApiCronJobActive({
        isActive: statusConfirm.isActive,
        cronId: statusConfirm.cronId,
        profileId: statusConfirm.profileId,
      });
      if (res.isSuccess) {
        Toast.success(res.message || "Status updated successfully.");
        getCronJobList({ search: searchName });
      } else {
        Toast.error(res.message || "Failed to update status");
      }
    } catch (err) {
      Toast.error(err.message || "Something went wrong");
    } finally {
      setStatusConfirm(null);
    }
  };

  const handlePageChange = (page) => {
    setArg({
      pageNo: page,
      perPage: perPage
    })
    getCronJobList({ pageNo: page, perPage: perPage });
  };

  const handlePerRowsChange = (newPerPage) => {
    setPerPage(newPerPage);
    setArg({ pageNo: 1, perPage: newPerPage });
    getCronJobList({ pageNo: 1, perPage: newPerPage });
  };

  const handleSortChanged = (e) => {
    const sortModel = e.columns;
    if (!sortModel || sortModel.length === 0) return;
    const { colId, sortDef: { direction: sort } } = sortModel?.reverse()?.[0];
    getCronJobList({ fieldName: colId, ...(sort && { sortType: sort === "asc" ? "ASC" : "DESC" }), ...arg });
  };

  const handleSearch = (e) => {
    setSearchName(e.target.value);
  };

  const handleClose = () => {
    setCronJob({
      id: "",
      cronName: "",
      cronDescription: ""
    });
    setShowCronJobModal(false);
  }

  const handleTimeChange = (index, e) => {
    if (timeData.includes(e.target.value)) return Toast.error(t("This time is already selected. Choose another time."));

    let arr = timeData
    arr[index] = e.target.value
    setTimeData([...arr])
  };

  const handleAddTimeField = () => {
    setTimeData([...timeData, ""]);
  };

  const handleRemoveTimeField = (index) => {
    let arr = timeData
    arr.splice(index, 1)
    setTimeData([...arr])
  };

  const handleDateChange = (index, e) => {
    let arr = [...dateData];
    arr[index] = e.target.value;
    setDateData(arr);
  };

  const handleAddDateField = () => {
    setDateData([...dateData, ""]);
  };

  const handleRemoveDateField = (index) => {
    let arr = [...dateData];
    arr.splice(index, 1);
    setDateData(arr);
  };


  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === "frequency") {
      // Reset all dynamic fields when frequency changes
      setCronJob((prev) => ({ ...prev, frequency: value, interval: "", hours: "", minutes: "", dates: "", days: "", times: "" }));

      // Reset arrays
      setSelectedDays([]);
      setDateData([""]);
      setTimeData([""]);
      return;
    }

    setCronJob((prev) => ({
      ...prev,
      [name]: value,
    }));


  };

  const handleSubmit = (e) => {
    e.preventDefault();

    // ---------- VALIDATION ----------
    const { frequency } = cronJob;

    if (!cronJob.cronName.trim()) {
      return Toast.error(t("Cron Job Name is required"));
    }

    if (!frequency) {
      return Toast.error(t("Select a Frequency"));
    }

    if (["Every_X_Minutes", "Every_X_Seconds", "Every_X_Hours"].includes(frequency)) {
      if (!cronJob.interval) return Toast.error(t("Interval is required"));
    }

    if (frequency === "Every_Hour_At_Minute") {
      if (!cronJob.hours) return Toast.error(t("Hours is required"));
      if (!cronJob.minutes) return Toast.error(t("Minutes is required"));
    }

    if (frequency === "Daily" || frequency === "Weekly" || frequency === "Monthly") {
      if (timeData.length === 0 || !timeData[0]) return Toast.error(t("At least one time is required"));
    }

    if (frequency === "Monthly") {
      if (dateData.length === 0 || !dateData[0]) return Toast.error(t("At least one date is required"));
    }

    if (frequency === "Weekly") {
      if (selectedDays.length === 0) return Toast.error(t("Select at least one day"));
    }

    // ---------- ---------- ----------

    if (cronJob.cronName) {
      cronJob.profileId = profileId.value;
      cronJob.days = selectedDays?.filter(d => d);
      cronJob.dates = dateData?.filter(d => d);
      cronJob.times = timeData?.filter(t => t);

      if (cronJob.id) {
        ApiUpdateCronJob(cronJob)
          .then((res) => {
            if (res.isSuccess) {
              Toast.success(res.message || "Cron Job added successfully.");
              handleClose();
              getCronJobList({ search: searchName, ...arg });
            } else {
              Toast.error(res.message);
            }
          })
          .catch((err) => {
            Toast.error(err.message || "Something went wrong");
          });
      }
      else {
        ApiCreateCronJob(cronJob)
          .then((res) => {
            if (res.isSuccess) {
              Toast.success(res.message || "Cron Job added successfully.");
              handleClose();
              getCronJobList({ search: searchName, ...arg });
            } else {
              Toast.error(res.message);
            }
          })
          .catch((err) => {
            Toast.error(err.message || "Something went wrong");
          });
      }
    }
  }

  return (
    <>
      <style>{`
        #cron-history-btn.customize-button {
          height: 40px !important;
        }
        [data-theme="dark"] #cron-search input {
          color: #f8fafc !important;
          background-color: #1e293b !important;
          border: 1px solid #334155 !important;
        }
        [data-theme="dark"] #cron-search input::placeholder {
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
        <div className="data_content data_content_btn glass-grid-container h-maxContent">
          <div className="camapgin_btn flex flex-wrap justify-between items-center gap-3 pt-4 pb-2 px-6 w-full max-w-full box-border relative z-30">
            <div className={`flex items-center ${isMobile ? "w-full justify-between" : ""}`}>
              <CardTitle className="m-0 flex items-center cron-title-bar" style={{ fontSize: 14, color: isDark ? "#cbd5e1e0" : "#0F172A" }}>
                {t("cronJobScheduler")}
                {totalRecords ? (
                  <span className="ml-2 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700">
                    {totalRecords.toLocaleString()} JOBS
                  </span>
                ) : ""}
              </CardTitle>
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-2 ml-auto" style={{ width: isMobile ? "100%" : "auto" }}>
                {PermissionCheck(SYSTEM_PAGES.CRON_JOB_SCHEDULER, PAGE_ACTIONS.VIEW_ONLY) && (
                  <button
                    id="cron-history-btn"
                    onClick={() => navigate("/cron-history")}
                    className="customize-button m-0 gap-0"
                    style={{ height: "40px", whiteSpace: "nowrap" }}
                  >
                    {t("History")}
                  </button>
                )}

                <div id="cron-search" className="relative" style={{ flex: isMobile ? "1 1 100%" : "0 0 240px", width: isMobile ? "100%" : "240px" }}>
                  <Input
                    type="text"
                    placeholder={t("searchHere")}
                    value={searchName}
                    onChange={(e) => handleSearch(e)}
                    className="w-full h-10"
                    style={{
                      fontSize: "13px",
                      fontFamily: "inherit",
                      backgroundColor: isDark ? "#1e293b" : "#fff",
                      borderColor: isDark ? "#334155" : "#ced4da",
                      color: isDark ? "#f8fafc" : "#1e293b",
                      paddingRight: searchName ? "35px" : "12px",
                      minWidth: 0,
                      maxWidth: "100%",
                      boxSizing: "border-box"
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
                <div id="cron-type-filter" style={{ flex: isMobile ? "1 1 100%" : "0 0 150px", width: isMobile ? "100%" : "150px" }}>
                  <ShadcnSelect
                    value={type === "" || type === undefined ? "all" : type}
                    onValueChange={(val) => {
                      const typeVal = val === "all" ? "" : val;
                      settype(typeVal);
                      setArg({ pageNo: 1, perPage });
                    }}
                  >
                    <ShadcnSelectTrigger
                      className="w-full h-10 px-3 transition-colors duration-200"
                      style={{
                        backgroundColor: isDark ? "#1e293b" : "#fff",
                        borderColor: isDark ? "#334155" : "#ced4da",
                        color: isDark ? "#f8fafc" : "#1e293b",
                        fontSize: "13px",
                        fontFamily: "inherit",
                        minWidth: 0,
                        maxWidth: "100%",
                        boxSizing: "border-box"
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
                <div id="cron-status-filter" style={{ flex: isMobile ? "1 1 100%" : "0 0 150px", width: isMobile ? "100%" : "150px" }}>
                  <ShadcnSelect
                    value={activeData === "" || activeData === undefined ? "all" : String(activeData)}
                    onValueChange={(val) => {
                      const isActiveVal = val === "all" ? "" : val === "true";
                      setactiveData(isActiveVal);
                      setArg({ pageNo: 1, perPage });
                    }}
                  >
                    <ShadcnSelectTrigger
                      className="w-full h-10 px-3 transition-colors duration-200"
                      style={{
                        backgroundColor: isDark ? "#1e293b" : "#fff",
                        borderColor: isDark ? "#334155" : "#ced4da",
                        color: isDark ? "#f8fafc" : "#1e293b",
                        fontSize: "13px",
                        fontFamily: "inherit",
                        minWidth: 0,
                        maxWidth: "100%",
                        boxSizing: "border-box"
                      }}
                    >
                      <ShadcnSelectValue placeholder={t("allStatus")} />
                    </ShadcnSelectTrigger>
                    <ShadcnSelectContent
                      style={{
                        backgroundColor: isDark ? "#1e293b" : "#fff",
                        borderColor: isDark ? "#334155" : "#e2e8f0",
                        color: isDark ? "#f8fafc" : "#1e293b",
                        fontFamily: "inherit",
                      }}
                    >
                      <ShadcnSelectItem value="all" style={{ fontSize: "13px", fontFamily: "inherit" }}>{t("allStatus")}</ShadcnSelectItem>
                      <ShadcnSelectItem value="true" style={{ fontSize: "13px", fontFamily: "inherit" }}>{t("active")}</ShadcnSelectItem>
                      <ShadcnSelectItem value="false" style={{ fontSize: "13px", fontFamily: "inherit" }}>{t("inactive")}</ShadcnSelectItem>
                    </ShadcnSelectContent>
                  </ShadcnSelect>
                </div>
            </div>
          </div>
          <div className="p-0">
            <div className="data_table" style={{ padding: "0 24px 24px 24px" }}>
              <AgTable ref={gridRef}
                tableId="cronJob-main-table"
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
                customSaveColumnName={"Cron Job Schedular"}
                loading={loadingGrid}
                onRefresh={() => getCronJobList(arg)}
              />
            </div>
          </div>
        </div>

        <Dialog open={showCronJobModal} onOpenChange={(open) => !open && handleClose()}>
          <DialogContent
            className="sm:max-w-[1000px] premium-modal modal-content p-0 flex flex-col max-h-[90vh] overflow-hidden"
            onInteractOutside={(e) => e.preventDefault()}
            onEscapeKeyDown={(e) => e.preventDefault()}
          >
            <DialogHeader className="modal-header border-b-0 p-4 pb-0">
              <DialogTitle className="modal-title">{cronJob?._id ? t("editCronJob") : t("addCronJob")}</DialogTitle>
            </DialogHeader>

            <div className="overflow-y-auto flex-1 p-6">

              <div className="row mb-3">
                <div className="col-12">
                  <label className="form-label fw-medium">
                    {t("cronJobname")}
                  </label>
                  <input
                    type="text"
                    name="cronName"
                    value={cronJob.cronName}
                    onChange={handleChange}
                    className="form-control"
                  />
                </div>
              </div>

              <div className="row mb-3">
                <div className="col-12">
                  <label className="form-label fw-medium">
                    {t("cronDescription")}
                  </label>
                  <textarea
                    name="cronDescription"
                    value={cronJob.cronDescription}
                    onChange={handleChange}
                    className="form-control"
                    maxLength={2000}
                  ></textarea>
                </div>
              </div>

              <div className="row mb-3">
                <div className="col-12">
                  <label className="form-label fw-medium">
                    {t("frequency")}
                  </label>
                  <select
                    name="frequency"
                    value={cronJob.frequency}
                    onChange={handleChange}
                    className="form-control"
                  >
                    <option hidden>{t('select')}</option>
                    {frequency.map((el, i) => (
                      <option key={i.label} value={el.value}>
                        {el.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {["Monthly"].includes(cronJob.frequency) && (
                <div className="my-3">
                  <div className="row my-2">
                    <div className="col-11">
                      <label>{t("Dates")} :</label>
                    </div>
                    <div className="col-1 text-end">
                      <AiOutlinePlus
                        size={22}
                        className="plus_icon text-success"
                        onClick={handleAddDateField}
                      />
                    </div>
                  </div>

                  <div className="row">
                    {dateData?.map((element, index) => (
                      <div className="col-xl-4 col-lg-6 col-12" key={index}>
                        <div className="flex gap-3 justify-between w-full">
                          <div className="mb-2 w-full">

                            <select
                              className="form-control w-full"
                              value={element}
                              onChange={(e) => handleDateChange(index, e)}
                            >
                              <option hidden>{t("select")}</option>
                              {monthDates.map((day) => (
                                <option key={day} value={day} disabled={dateData.includes(`${day}`)}>{day}</option>
                              ))}
                            </select>

                          </div>

                          <div className="minus_icon mb-2">
                            {index !== 0 && (
                              <AiFillDelete size={22} className="icon cursor-pointer text-danger" onClick={() => handleRemoveDateField(index)} />
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {["Weekly"].includes(cronJob.frequency) && (
                <div className="mb-3">
                  <div className="row mt-2">
                    <div className="col-12">
                      <label>{t("Days")}</label>
                    </div>
                  </div>

                  <div className="row my-2">
                    <div className="col-12">
                      {/* 'All' option */}
                      <label className="mr-3">
                        <input
                          type="checkbox"
                          value="All"
                          checked={selectedDays?.length === allDays.length}
                          onChange={(e) => setSelectedDays(e.target.checked ? allDays : [])}
                        />{" "}
                        {t("All")}
                      </label>

                      {/* Individual days */}
                      {allDays.map((day) => (
                        <label key={day} className="mr-3">
                          <input
                            type="checkbox"
                            value={day}
                            checked={selectedDays?.includes(day)}
                            onChange={(e) => setSelectedDays((prev) => [...prev, day].filter(d => !e.target.checked ? d !== day : true))}
                          />{" "}
                          {t(day)}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {["Daily", "Weekly", "Monthly"].includes(cronJob.frequency) && (
                <div className="mb-3 new_rule">
                  {/* -------------- Time ------------- */}
                  <div className="row mt-2">
                    <div className="col-11">
                      <label>{t("Times")} :</label>
                    </div>
                    <div className="col-1 text-end">
                      <AiOutlinePlus size={22} className="plus_icon" onClick={() => handleAddTimeField()} />
                    </div>
                  </div>
                  <div className="row">
                    {
                      timeData?.map((element, index) => {
                        return (
                          <>
                            <div className='col-xl-4 col-lg-6 col-12'>
                              <div className='flex gap-3 justify-between w-full'>
                                <div className="mb-2 w-full">
                                  <input
                                    type="time"
                                    className="form_rule w-full"
                                    placeholder={t("Value")}
                                    onChange={(e) => handleTimeChange(index, e)}
                                    value={element}
                                    id={`mainRuleData-${index}`}
                                    name={`mainRuleData-${index}`}
                                  />
                                </div>

                                <div className="minus_icon className mb-2">
                                  {
                                    index != 0 &&
                                    <AiFillDelete size={22} className="icon cursor-pointer" onClick={() => handleRemoveTimeField(index)} />
                                  }

                                </div>
                              </div>
                            </div>
                          </>
                        )
                      })
                    }
                  </div>
                </div>
              )}

              {["Every_X_Seconds", "Every_X_Minutes", "Every_X_Hours"].includes(cronJob.frequency) && (
                <div className="row mb-3">
                  <div className="col-12">
                    <label className="form-label fw-medium">
                      {t("interval")}
                    </label>

                    <select
                      name="interval"
                      value={cronJob.interval}
                      onChange={handleChange}
                      className="form-control"
                    >
                      <option value="">{t("select")}</option>
                      {[...(["Every_X_Seconds", "Every_X_Minutes"]?.includes(cronJob.frequency) ? minutesOrSeconds : hours)].map((num) => <option key={num} value={num}>{num}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {["Every_Hour_At_Minute"].includes(cronJob.frequency) && (
                <div className="row mb-3">
                  <div className="col-6">
                    <label className="form-label fw-medium">
                      {t("Hours")}
                    </label>
                    <select name="hours" value={cronJob.hours} onChange={handleChange} className="form-control">
                      <option value="">{t("select")}</option>
                      {hours.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>

                  <div className="col-6">
                    <label className="form-label fw-medium">
                      {t("Minutes")}
                    </label>
                    <select name="minutes" value={cronJob.minutes} onChange={handleChange} className="form-control">
                      <option value="">{t("select")}</option>
                      {minutesOrSeconds.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                </div>
              )}

            </div>

            <DialogFooter className="border-t border-slate-200 dark:border-slate-700 pt-4 mt-4">
              <div className="w-full flex justify-end gap-2">
                <button
                  type="button"
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 font-semibold text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                  onClick={handleClose}
                >
                  {t("close")}
                </button>
                <button
                  type="button"
                  className="px-5 py-2 rounded-lg bg-gradient-to-r from-[#1A9FD4] to-[#2374F2] text-white font-semibold text-sm shadow-md shadow-blue-500/15 hover:opacity-95"
                  onClick={handleSubmit}
                >
                  {t("submit")}
                </button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <CustomModal
          show={!!statusConfirm}
          onHide={() => setStatusConfirm(null)}
          title={statusConfirm?.isActive ? t("Activate Cron Job") : t("Deactivate Cron Job")}
          subtitle={statusConfirm?.cronName}
          icon={statusConfirm?.isActive ? "check_circle_outline" : "pause_circle_outline"}
          iconVariant={statusConfirm?.isActive ? "success" : "warning"}
          message={statusConfirm?.isActive ? `You are about to <span class="cm-highlight">activate</span> the cron job <span class="cm-highlight">${statusConfirm?.cronName}</span>. It will start running on its configured schedule immediately.` : `You are about to <span class="cm-highlight">deactivate</span> the cron job <span class="cm-highlight">${statusConfirm?.cronName}</span>. It will stop running until re-activated.`}
          alertText={statusConfirm?.isActive ? "This cron job will begin executing on its next scheduled time." : "Deactivating will pause all scheduled executions for this job."}
          alertVariant={statusConfirm?.isActive ? "info" : "warning"}
          closeOnBackdrop={false}
          actions={[
            { label: t("Cancel"), cancel: true, icon: "close", onClick: () => setStatusConfirm(null) },
            { label: statusConfirm?.isActive ? t("Activate") : t("Deactivate"), variant: statusConfirm?.isActive ? "success" : "warning", icon: statusConfirm?.isActive ? "check_circle_outline" : "pause_circle_outline", onClick: executeStatusChange },
          ]}
        />
      </div>
    </>
  );
}

export default CronJobSchedular;
