import { useTranslation } from "react-i18next";
import { t } from "i18next";
import Toast from "../../../common/helper/toast/Toast";
import { APIGetMasterCronList, ApiCreateMasterCronJob, ApiUpdateMasterCronJob } from "../../../api-wrapper/ApiCronJob";
import Filter from "../../../helper/filter/Filter";
import { useEffect, useState, useRef } from "react";
import AgTable from "../../../common/grid/AgTable";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { AiFillDelete, AiOutlinePlus } from "react-icons/ai";
import { MdOutlineClose } from "react-icons/md";
import { firstPageRows, paginationRowsPerPageOptions } from "../../../helper/table/TableStyle";

const CronJob = () => {
  const { t } = useTranslation();

  const [arg, setArg] = useState({ pageNo: 1, perPage: firstPageRows });
  const [perPage, setPerPage] = useState(firstPageRows);
  const [searchName, setSearchName] = useState("");
  const [debouncedSearchName, setDebouncedSearchName] = useState("");
  const [cronList, setCronList] = useState([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [showCronJobModal, setShowCronJobModal] = useState(false);
  const [cronJob, setCronJob] = useState({
    id: "",
    cronName: "",
    cronDescription: "",
    frequency: "",
    dates: "",
    days: "",
    times: "",
    interval: "",
    hours: [""],
    minutes: "",
  });

  const monthDates = Array.from({ length: 31 }, (_, i) => i + 1);
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutesOrSeconds = Array.from({ length: 60 }, (_, i) => i);

  const [selectedDays, setSelectedDays] = useState([]);
  const [dateData, setDateData] = useState([""]);
  const [timeData, setTimeData] = useState([""]);
  const allDays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

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
  const frequency = [
    { value: "Daily", label: t("daily") },
    { value: "Weekly", label: t("weekly") },
    { value: "Monthly", label: t("monthly") },
    { value: "Every_X_Seconds", label: t("every_x_seconds") },
    { value: "Every_X_Minutes", label: t("every_x_minutes") },
    { value: "Every_X_Hours", label: t("every_x_hours") },
    { value: "Every_Hour_At_Minute", label: t("every_hour_at_minute") },
    { value: "X_Hours_at_X_Minute", label: t("x_hours_at_x_minute") },
  ];

  const gridRef = useRef(null);
  const [loadingGrid, setLoadingGrid] = useState(false);

  const ApiListing = async (extraArgs = {}) => {
    setLoadingGrid(true);
    const payload = {
      search: searchName,
      pageNo: arg.pageNo,
      perPage: arg.perPage,
      fieldName: "cronName",
      sortType: "DESC",
      ...extraArgs
    };

    await APIGetMasterCronList(payload, true)
      .then((res) => {
        if (res.isSuccess) {
          setCronList(res.data);
          setTotalRecords(res.totalRecords)
        } else {
          Toast.error(res.message);
        }
      })
      .catch(() => {
        Toast.error(t("Something went wrong"));
      })
      .finally(() => setLoadingGrid(false));
  };

  useEffect(() => {
    ApiListing();
  }, []);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchName(searchName);
    }, 350);
    return () => clearTimeout(handler);
  }, [searchName]);

  useEffect(() => {
    if (debouncedSearchName !== undefined) {
      ApiListing({ search: debouncedSearchName });
    }
  }, [debouncedSearchName]);

  const handlePageChange = (page) => {
    setArg((prev) => ({ ...prev, pageNo: page }));
    ApiListing({ pageNo: page });
  };

  const handlePerRowsChange = (newPerPage) => {
    setPerPage(newPerPage);
    setArg({ pageNo: 1, perPage: newPerPage });
    ApiListing({ pageNo: 1, perPage: newPerPage });
  };

  const handleSortChanged = (e) => {
    const sortModel = e.columns;
    if (!sortModel || sortModel.length === 0) return;
    const { colId, sortDef: { direction: sort } } = sortModel?.reverse()?.[0];
    ApiListing({ fieldName: colId, ...(sort && { sortType: sort === "asc" ? "ASC" : "DESC" }), ...arg });
  };

  const getCronShortDescription = (row) => {
    if (!row) return "—";
    const { frequency, interval, hours, minutes, dates, days, times } = row;
    if (!frequency) return "—";

    const formatDays = (daysArr) => {
      if (!daysArr || !daysArr.length) return "—";
      return daysArr.map(d => d.slice(0, 3)).join(", ");
    };

    switch (frequency) {
      case "Daily":
        return `Daily at ${times && times.length ? times.join(", ") : "—"}`;
      case "Weekly":
        return `Weekly on ${formatDays(days)} at ${times && times.length ? times.join(", ") : "—"}`;
      case "Monthly":
        return `Monthly on day ${dates && dates.length ? dates.join(", ") : "—"} at ${times && times.length ? times.join(", ") : "—"}`;
      case "Every_X_Seconds":
        return Number(interval) === 1 ? "Every second" : `Every ${interval || "X"} seconds`;
      case "Every_X_Minutes":
        return Number(interval) === 1 ? "Every minute" : `Every ${interval || "X"} minutes`;
      case "Every_X_Hours":
        return Number(interval) === 1 ? "Every hour" : `Every ${interval || "X"} hours`;
      case "Every_Hour_At_Minute":
        return `Every hour at minute ${minutes !== undefined && minutes !== null ? minutes : "—"}`;
      case "X_Hours_at_X_Minute": {
        const hrs = hours && hours.length ? hours.join(", ") : "—";
        return `At hour(s) [${hrs}] at minute ${minutes !== undefined && minutes !== null ? minutes : "—"}`;
      }
      default:
        return frequency.replace(/_/g, " ");
    }
  };

  const columns = [
    {
      headerName: "Action",
      field: "action",
      title: "Action",
      width: 80,
      sortable: false,
      resizable: false,
      cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" },
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        return (
          <div className="action_container flex items-center" style={{ height: "100%" }}>
            <i
              className="fa fa-pencil cursor-pointer"
              title={t("Edit master cron job")}
              onClick={() => {
                setCronJob({
                  id: row._id,
                  cronName: row.cronName,
                  cronDescription: row.cronDescription,
                  frequency: row.frequency,
                  dates: row.dates,
                  days: row.days,
                  times: row.times,
                  interval: row.interval,
                  hours: row?.hours ?? [],
                  minutes: row.minutes,
                });
                setSelectedDays(row?.days ?? []);
                setDateData(row?.dates?.length ? row?.dates : [""]);
                setTimeData(row?.times?.length ? row?.times : [""]);
                setShowCronJobModal(true);
              }}
            />
          </div>
        );
      },
    },
    {
      headerName: t("Cron Name"),
      field: "cronName",
      title: t("Cron Name"),
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
      headerName: t("Cron Description"),
      field: "cronDescription",
      title: t("Cron Description"),
      width: 400,
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
      headerName: t("Status"),
      field: "isActive",
      title: t("Status"),
      width: 120,
      sortable: false,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      cellRenderer: (params) => {
        const isActiveVal = params.value === true;
        const bg = isActiveVal ? (isDark ? "rgba(34, 197, 94, 0.15)" : "#F0FDF4") : (isDark ? "#1e293b" : "#F1F5F9");
        const color = isActiveVal ? (isDark ? "#4ade80" : "#15803D") : (isDark ? "#cbd5e1" : "#475569");
        const border = isActiveVal ? (isDark ? "rgba(34, 197, 94, 0.3)" : "#86EFAC") : (isDark ? "#334155" : "#E2E8F0");
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
              {isActiveVal ? t("Active") : t("Inactive")}
            </span>
          </div>
        );
      },
    },
    {
      headerName: t("Cron Expression"),
      field: "cronExpression",
      title: t("Cron Expression"),
      width: 200,
      sortable: false,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      cellRenderer: (params) => {
        if (!params.value) return <span style={{ color: isDark ? "#475569" : "#CBD5E1", padding: "8px 4px", display: "block" }}>—</span>;
        return (
          <div style={{ padding: "8px 4px" }}>
            <code style={{
              fontFamily: "monospace",
              fontSize: "11px",
              background: isDark ? "#1e293b" : "#F8FAFC",
              padding: "3px 8px",
              border: `1px solid ${isDark ? "#334155" : "#E2E8F0"}`,
              borderRadius: "4px",
              color: isDark ? "#f8fafc" : "#0f172a",
              fontWeight: "500"
            }}>
              {params.value}
            </code>
          </div>
        );
      }
    },
    {
      headerName: t("Short Description"),
      field: "shortDescription",
      title: t("Short Description"),
      width: 250,
      sortable: false,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      cellRenderer: (params) => {
        const row = params.data;
        const desc = getCronShortDescription(row);
        return (
          <div style={{ padding: "8px 4px", fontSize: 12, color: isDark ? "#cbd5e1" : "#475569" }}>
            {desc}
          </div>
        );
      }
    },
  ];

  const handleDayClick = (day) => {
    if (selectedDays.includes(day)) {
      setSelectedDays(selectedDays.filter((d) => d !== day));
    } else {
      setSelectedDays([...selectedDays, day]);
    }
  };

  const handleClose = () => {
    setCronJob({
      id: "",
      cronName: "",
      cronDescription: "",
      frequency: "",
      dates: "",
      days: "",
      times: "",
      interval: "",
      hours: [""],
      minutes: "",
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
      setCronJob((prev) => ({ ...prev, frequency: value, interval: "", hours: [""], minutes: "", dates: "", days: "", times: "" }));

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
    cronJob.days = selectedDays?.filter(d => d);
    cronJob.dates = dateData?.filter(d => d);
    cronJob.times = timeData?.filter(t => t);
    cronJob.hours = cronJob.hours.filter(h => h);

    if (!cronJob.cronName.trim()) {
      return Toast.error(t("Cron Job Name is required"));
    }

    if (!frequency) {
      return Toast.error(t("Select a Frequency"));
    }

    if (["Every_X_Minutes", "Every_X_Seconds", "Every_X_Hours"].includes(frequency)) {
      if (!cronJob.interval) return Toast.error(t("Interval is required"));
    }

    if (["Every_Hour_At_Minute", "X_Hours_at_X_Minute"].includes(frequency)) {
      if (cronJob?.hours?.length === 0) return Toast.error(t("Hours is required"));
      if (!cronJob.minutes) return Toast.error(t("Minutes is required"));
    }

    if (frequency === "Daily" || frequency === "Weekly" || frequency === "Monthly") {
      if (cronJob?.times?.length === 0) return Toast.error(t("At least one time is required"));
    }

    if (frequency === "Monthly") {
      if (cronJob?.dates?.length === 0) return Toast.error(t("At least one date is required"));
    }

    if (frequency === "Weekly") {
      if (cronJob?.days?.length === 0) return Toast.error(t("Select at least one day"));
    }

    // ---------- ---------- ----------

    if (cronJob.cronName) {
      if (cronJob.id) {
        ApiUpdateMasterCronJob(cronJob)
          .then((res) => {
            if (res.isSuccess) {
              Toast.success(res.message || "Cron Job updated successfully.");
              handleClose();
              ApiListing({ ...arg });
            } else {
              Toast.error(res.message);
            }
          })
          .catch((err) => {
            Toast.error(err.message || "Something went wrong");
          });
      }
      else {
        ApiCreateMasterCronJob(cronJob)
          .then((res) => {
            if (res.isSuccess) {
              Toast.success(res.message || "Cron Job added successfully.");
              handleClose();
              ApiListing({ ...arg });
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
      <Filter
        name={"Cron Jobs"}
        nameShow={false}
        dateShow={false}
        profileShow={true}
      />
      <div className="middle_container budget_container">
        <div className="glass-grid-container overflow-hidden">
          <div className="data_model_btn camapgin_btn flex-wrap flex items-center justify-between gap-3 p-3" style={{
            padding: "12px 24px",
            borderBottom: isDark ? "1px solid #334155" : "none",
            backgroundColor: isDark ? "rgba(255,255,255,0.02)" : "transparent"
          }}>
            <div className={`flex items-center ${isMobile ? "w-full justify-between" : ""}`}>
              <h5 className="m-0" style={{ color: isDark ? "#f8fafc" : "#1e293b", fontWeight: 700 }}>
                {t("Cron Jobs")}
              </h5>
            </div>

            <div className={`flex ${isMobile ? "flex-col w-full" : "flex-row items-center"} gap-2`}>
              <div className={`flex ${isMobile ? "flex-row flex-wrap w-full" : "flex-row items-center"} gap-2`}>
                <div id="cronjob-search" className="search_option m-0" style={{
                  display: "flex",
                  alignItems: "center",
                  position: "relative",
                  width: isMobile ? "100%" : "auto",
                  minWidth: isMobile ? "100%" : "220px",
                  flexGrow: 1,
                  backgroundColor: isDark ? "#1e293b" : "#fff",
                  border: isDark ? "1px solid #334155" : "1px solid #cbd5e1"
                }}>
                  <Input
                    type="text"
                    placeholder={t("searchHere")}
                    value={searchName}
                    onChange={(e) => setSearchName(e.target.value)}
                    className="form-control dark:!bg-white/5 dark:!border-white/10 dark:!text-white"
                    style={{
                      width: "100%",
                      height: "40px",
                      backgroundColor: "transparent",
                      color: isDark ? "#f8fafc" : "#1e293b",
                      border: "none",
                      paddingRight: searchName ? "30px" : "10px"
                    }}
                  />
                  {searchName && (
                    <MdOutlineClose
                      onClick={() => setSearchName("")}
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

                <div id="cronjob-add-btn">
                  <button
                    className="improve add_btn m-0 gap-0"
                    type="button"
                    onClick={() => setShowCronJobModal(true)}
                    style={{
                      height: "40px",
                      whiteSpace: "nowrap",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center"
                    }}
                  >
                    <i className="fa fa-plus mr-1" style={{ fontSize: 13 }}></i>
                    {t("Add Cron Job")}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="data_table" style={{ padding: "0 14px 14px 14px" }}>
            <AgTable
              onRefresh={ApiListing} ref={gridRef}
              tableId="cronJob-master-table"
              height={"60vh"}
              loading={loadingGrid}
              rowData={cronList}
              columnDefs={columns}
              totalRecords={totalRecords ?? 0}
              perPage={perPage}
              currentPage={arg.pageNo}
              onPageChange={handlePageChange}
              onPerPageChange={handlePerRowsChange}
              onSortChanged={handleSortChanged}
              paginationOptions={paginationRowsPerPageOptions}
              isCustomSaveColumns={true}
              customSaveColumnName={"Admin Cron Jobs"}
              handleSaveColumns={undefined}
            />
          </div>
        </div>

        <Dialog open={showCronJobModal} onOpenChange={(isOpen) => { if (!isOpen) handleClose(); }}>
          <DialogContent 
              className="sm:max-w-[1000px] premium-modal modal-content p-0 flex flex-col max-h-[90vh] overflow-hidden" 
              onInteractOutside={(e) => e.preventDefault()} 
              onEscapeKeyDown={(e) => e.preventDefault()}
              id="cronjob-modal"
          >
            <DialogHeader className="modal-header border-b-0 p-4 pb-0">
              <DialogTitle className="modal-title">
                  {cronJob.id ? t("editCronJob") : t("addCronJob")}
              </DialogTitle>
            </DialogHeader>

            <div className="overflow-y-auto flex-1 p-6">

              <div className="grid grid-cols-1 mb-4">
                <div id="cronjob-name-field">
                  <label className="text-[13px] font-semibold text-[#475569] dark:text-[#cbd5e1] mb-[6px] block">
                    {t("cronJobname")}
                  </label>
                  <Input
                    type="text"
                    name="cronName"
                    value={cronJob.cronName}
                    onChange={handleChange}
                    className="form-control dark:!bg-white/5 dark:!border-white/10 dark:!text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 mb-4">
                <div id="cronjob-desc-field">
                  <label className="text-[13px] font-semibold text-[#475569] dark:text-[#cbd5e1] mb-[6px] block">
                    {t("cronDescription")}
                  </label>
                  <textarea
                    name="cronDescription"
                    value={cronJob.cronDescription}
                    onChange={handleChange}
                    className="w-full form-control dark:!bg-white/5 dark:!border-white/10 dark:!text-white"
                    maxLength={2000}
                  ></textarea>
                </div>
              </div>

              <div className="grid grid-cols-1 mb-4">
                <div id="cronjob-freq-field">
                  <label className="text-[13px] font-semibold text-[#475569] dark:text-[#cbd5e1] mb-[6px] block">
                    {t("frequency")}
                  </label>
                  <Select value={cronJob.frequency} onValueChange={(val) => handleChange({ target: { name: "frequency", value: val } })}>
                    <SelectTrigger className="w-full form-control dark:!bg-white/5 dark:!border-white/10 dark:!text-white">
                      <SelectValue placeholder={t('select')} />
                    </SelectTrigger>
                    <SelectContent>
                      {frequency.map((el, i) => (
                        <SelectItem key={i.label} value={el.value}>
                          {el.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

            {["Monthly"].includes(cronJob.frequency) && (
              <div className="mb-4">
                <div className="flex justify-between items-center my-2">
                  <div>
                    <label className="text-[13px] font-semibold text-[#475569] dark:text-[#cbd5e1]">{t("Dates")} :</label>
                  </div>
                  <div>
                    <AiOutlinePlus
                      size={22}
                      className="plus_icon text-success cursor-pointer"
                      onClick={handleAddDateField}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  {dateData?.map((item, index) => {
                    return (
                      <div className="flex items-center gap-2 mb-2 w-full sm:w-[30%]" key={index}>
                        <Select value={item} onValueChange={(val) => handleDateChange(index, { target: { value: val } })}>
                          <SelectTrigger className="w-full form-control dark:!bg-white/5 dark:!border-white/10 dark:!text-white">
                            <SelectValue placeholder={t("Select Date")} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">{t("Select Date")}</SelectItem>
                            {monthDates.map((date) => (
                              <SelectItem key={date} value={date}>
                                {date}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {dateData?.length > 1 && (
                          <AiFillDelete
                            size={20}
                            className="delete_icon text-danger cursor-pointer flex-shrink-0"
                            onClick={() => handleRemoveDateField(index)}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {["Weekly"].includes(cronJob.frequency) && (
              <div className="mb-4">
                <label className="text-[13px] font-semibold text-[#475569] dark:text-[#cbd5e1]">{t("Days")} :</label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {allDays.map((day) => {
                    const isSelected = selectedDays.includes(day);
                    return (
                      <Button
                        key={day}
                        type="button"
                        onClick={() => handleDayClick(day)}
                        variant="outline"
                        className={`h-9 px-4 ${isSelected ? "btn-premium-primary" : "btn-premium-secondary"}`}
                      >
                        {day}
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}

            {["Daily", "Weekly", "Monthly"].includes(cronJob.frequency) && (
              <div className="mb-4">
                <div className="flex justify-between items-center my-2">
                  <div>
                    <label className="text-[13px] font-semibold text-[#475569] dark:text-[#cbd5e1]">{t("Times")} :</label>
                  </div>
                  <div>
                    <AiOutlinePlus
                      size={22}
                      className="plus_icon text-success cursor-pointer"
                      onClick={handleAddTimeField}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  {timeData?.map((item, index) => {
                    return (
                      <div className="flex items-center gap-2 mb-2 w-full sm:w-[30%]" key={index}>
                        <Input
                          type="time"
                          className="form-control dark:!bg-white/5 dark:!border-white/10 dark:!text-white"
                          value={item}
                          onChange={(e) => handleTimeChange(index, e)}
                        />
                        {timeData?.length > 1 && (
                          <AiFillDelete
                            size={20}
                            className="delete_icon text-danger cursor-pointer flex-shrink-0"
                            onClick={() => handleRemoveTimeField(index)}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {["Every_X_Seconds", "Every_X_Minutes", "Every_X_Hours"].includes(cronJob.frequency) && (
              <div className="grid grid-cols-1 mb-4">
                <div>
                  <label className="text-[13px] font-semibold text-[#475569] dark:text-[#cbd5e1] mb-[6px] block">{t("Interval")}</label>
                  <Input
                    type="number"
                    min="1"
                    name="interval"
                    value={cronJob.interval}
                    onChange={handleChange}
                    className="form-control dark:!bg-white/5 dark:!border-white/10 dark:!text-white"
                  />
                </div>
              </div>
            )}

            {["Every_Hour_At_Minute"].includes(cronJob.frequency) && (
              <div className="grid grid-cols-1 mb-4">
                <div>
                  <label className="text-[13px] font-semibold text-[#475569] dark:text-[#cbd5e1] mb-[6px] block">{t("Minutes")}</label>
                  <Select value={cronJob.minutes} onValueChange={(val) => handleChange({ target: { name: "minutes", value: val } })}>
                    <SelectTrigger className="form-control dark:!bg-white/5 dark:!border-white/10 dark:!text-white">
                      <SelectValue placeholder={t("select")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">{t("select")}</SelectItem>
                      {minutesOrSeconds.map((m) => (<SelectItem key={m} value={m}>{m}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {["X_Hours_at_X_Minute"].includes(cronJob.frequency) && (
              <div className="mb-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <div>
                        <label className="text-[13px] font-semibold text-[#475569] dark:text-[#cbd5e1]">{t("Hours")} :</label>
                      </div>
                      <div>
                        <AiOutlinePlus
                          size={22}
                          className="plus_icon text-success cursor-pointer"
                          onClick={() => setCronJob((prev) => ({ ...prev, hours: [...prev?.hours, ""] }))}
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      {cronJob.hours?.map((item, index) => {
                        return (
                          <div className="flex items-center gap-2 mb-2" key={index}>
                            <Select value={item} onValueChange={(val) => setCronJob(prev => ({ ...prev, hours: prev?.hours?.map((h, i) => (i === index ? val : h)) }))}>
                              <SelectTrigger className="w-full form-control dark:!bg-white/5 dark:!border-white/10 dark:!text-white">
                                <SelectValue placeholder={t("selectHour")} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="">{t("selectHour")}</SelectItem>
                                {hours.map((hour) => (
                                  <SelectItem key={hour} value={hour}>
                                    {hour}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {cronJob.hours?.length > 1 && (
                              <AiFillDelete
                                size={20}
                                className="delete_icon text-danger cursor-pointer flex-shrink-0"
                                onClick={() => setCronJob(prev => ({ ...prev, hours: prev?.hours?.filter((_, i) => i !== index) }))}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="text-[13px] font-semibold text-[#475569] dark:text-[#cbd5e1] mb-[6px] block">{t("Minutes")}</label>
                    <Select value={cronJob.minutes} onValueChange={(val) => handleChange({ target: { name: "minutes", value: val } })}>
                      <SelectTrigger className="w-full form-control dark:!bg-white/5 dark:!border-white/10 dark:!text-white">
                        <SelectValue placeholder={t("select")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">{t("select")}</SelectItem>
                        {minutesOrSeconds.map((m) => (<SelectItem key={m} value={m}>{m}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}

            </div>

            <div className="cm-footer border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-4 flex justify-end gap-2 shrink-0">
              <Button
                id="cronjob-close-btn"
                variant="outline"
                className="btn-premium-secondary"
                type="button"
                onClick={handleClose}
              >
                {t("close")}
              </Button>
              <Button id="cronjob-submit-btn" type="button" className="btn-premium-primary" onClick={handleSubmit}>
                {t("submit")}
              </Button>
            </div>

          </DialogContent>
        </Dialog>

      </div>
    </>
  );
};

export default CronJob;
