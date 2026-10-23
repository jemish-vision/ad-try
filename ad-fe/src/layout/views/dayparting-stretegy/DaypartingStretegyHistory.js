import { SYSTEM_PAGES, PAGE_ACTIONS } from "src/common/constants";
import React, { useContext, useState, useEffect, useRef, useMemo } from "react";
import Filter from "../../../helper/filter/Filter";
import AgTable from "../../../common/grid/AgTable";
import { ProfileContext } from "../../../helper/usecontext/useContext";
import moment from "moment-timezone";
import { handleLoader, Toast, useDispatch } from "../../../helper/links/Link";
import { ShadcnDateRangePicker as DateRangePicker } from "../../../components/ui/date-range-picker";
import { predefinedRanges } from "../../../common/helper/calendarValues/calendarValues";
import success from "../../../assets/images/success.svg";
import { PermissionCheck } from "../../../helper/permission/PermissionCheck";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { firstPageRows, paginationRowsPerPageOptions } from "../../../helper/table/TableStyle";
import { ApiRuleHistory } from "../../../api-wrapper/dayparting-stretegy/ApiDayParting";
import AffectedHistoryModel from "../../../helper/modal/AffectedHistoryModel";
import { ApigetCampaign } from "../../../api-wrapper/budgetRule/ApiBudgetRule";
import Breadcrumb from "../../../common/components/Breadcrumb";
import { FiList, FiSliders, FiTarget } from "react-icons/fi";
import { MdOutlineClose } from "react-icons/md";
import { Input } from "../../../components/ui/input";
import { Button } from "../../../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";

function DaypartingStretegyHistory() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  let { profileId, selectedAdType, selectedDate, setSelectedDate } = useContext(ProfileContext);

  const [date, setDate] = useState(() => {
    if (selectedDate && Array.isArray(selectedDate) && selectedDate.length >= 2) {
      return [moment(selectedDate[0]).toDate(), moment(selectedDate[1]).toDate()];
    }
    return [new Date(moment().startOf("month")), new Date()];
  });

  useEffect(() => {
    if (selectedDate && Array.isArray(selectedDate) && selectedDate.length >= 2) {
      setDate((prev) => {
        const newStart = moment(selectedDate[0]).toDate();
        const newEnd = moment(selectedDate[1]).toDate();
        if (prev[0]?.getTime() === newStart.getTime() && prev[1]?.getTime() === newEnd.getTime()) {
          return prev;
        }
        return [newStart, newEnd];
      });
    }
  }, [selectedDate]);
  const [perPage, setPerPage] = useState(firstPageRows);
  const [arg, setArg] = useState({ pageNo: 1, perPage: firstPageRows });
  const [tableData, setTableData] = useState([]);
  const [affectedFilter, setAffectedFilter] = useState("AFFECTED");
  const [searchName, setSearchName] = useState("");
  const [debouncedSearchName, setDebouncedSearchName] = useState("");

  const displayTableData = useMemo(() => {
    if (!affectedFilter || affectedFilter === "ALL") return tableData;
    const getCount = (obj) => {
      if (!obj) return 0;
      return Object.values(obj).reduce((sum, adTypeObj) => {
        return sum + (adTypeObj ? Object.keys(adTypeObj).length : 0);
      }, 0);
    };
    if (affectedFilter === "AFFECTED") {
      return (tableData || []).filter((row) => getCount(row.appliedBudget) > 0);
    }
    if (affectedFilter === "UNAFFECTED") {
      return (tableData || []).filter((row) => getCount(row.appliedBudget) === 0);
    }
    return tableData;
  }, [tableData, affectedFilter]);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchName(searchName);
    }, 350);
    return () => clearTimeout(handler);
  }, [searchName]);

  const [historyData, setHistoryData] = useState();
  const [showHistoryModal, setShowHistoryModal] = useState({ show: false, data: [] });
  const [campaignList, setCampaignList] = useState([]);

  const dispatch = useDispatch();
  const gridRef = useRef(null);

  const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");
  useEffect(() => {
    const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    window.addEventListener("themeChanged", handle);
    return () => window.removeEventListener("themeChanged", handle);
  }, []);

  const columns = useMemo(() => [
    // ── Run Date
    {
      headerName: t("runDate", "Run Date"),
      field: "executedAt",
      title: "Run Date",
      width: 180,
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      cellRenderer: (params) => {
        if (!params.value) return <span style={{ color: isDark ? "rgba(255,255,255,0.25)" : "#CBD5E1", padding: "8px 4px", display: "block" }}>—</span>;
        const formatted = moment(params.value).format("DD/MM/YYYY hh:mm:ss A");
        const parts = formatted.split(" ");
        const datePart = parts[0] || "";
        const timePart = parts.slice(1).join(" ") || "";
        return (
          <div style={{ padding: "8px 4px", display: "flex", flexDirection: "column", lineHeight: 1.3 }}>
            <span style={{ fontSize: 12, fontWeight: 550, color: "var(--text-primary)" }}>{datePart}</span>
            {timePart && <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>{timePart}</span>}
          </div>
        );
      },
    },

    // ── Rule Name
    {
      headerName: t("ruleName"),
      field: "ruleName",
      title: "Rule Name",
      width: 250,
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      cellRenderer: (params) => {
        if (!params.data) return null;
        return (
          <div style={{ padding: "8px 4px" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{params.value}</span>
          </div>
        );
      },
    },

    // ── Slot Executed
    {
      headerName: t("Time Slot"),
      field: "slot",
      title: "Time Slot",
      width: 150,
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        return (
          <div style={{ padding: "8px 4px" }}>
            <span style={{ fontSize: 12, fontWeight: 550, color: "var(--text-secondary)" }}>
              {row.startTime} - {row.endTime}
            </span>
          </div>
        );
      },
    },

    // ── Adjustment
    {
      headerName: t("Adjustment"),
      field: "multiplier",
      title: "Adjustment",
      width: 110,
      maxWidth: 110,
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      cellRenderer: (params) => {
        if (!params.data) return null;
        let display = "";
        if (params.data.bidChangeType === "PERCENTAGE") {
          const percentVal = Math.round((Number(params.value) - 1) * 100);
          display = `${percentVal > 0 ? "+" : ""}${percentVal}%`;
        } else {
          display = `${params.value}x`;
        }
        return (
          <div style={{ padding: "8px 4px" }}>
            <span style={{
              display: "inline-flex",
              alignItems: "center",
              backgroundColor: "var(--accent-primary-bg)",
              color: "var(--accent-primary)",
              padding: "3px 10px",
              borderRadius: "12px",
              fontSize: "11px",
              fontWeight: "700",
              border: "1px solid var(--accent-primary-border)",
            }}>
              {display}
            </span>
          </div>
        );
      },
    },

    // ── Status 
    {
      headerName: t("status"),
      field: "executionState",
      title: "Status",
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      maxWidth: 150,
      cellRenderer: (params) => {
        const e = params.data;
        if (!e) return null;
        const status = e.executionState ? e.executionState.toUpperCase() : "—";

        let bg = isDark ? "rgba(255,255,255,0.06)" : "#F1F5F9";
        let color = isDark ? "rgba(255,255,255,0.60)" : "#475569";
        let border = isDark ? "rgba(255,255,255,0.10)" : "#E2E8F0";

        if (status === "APPLIED" || status === "SUCCESS") {
          bg = isDark ? "rgba(62,207,168,0.12)" : "#F0FDF4";
          color = isDark ? "#3ECFA8" : "#15803D";
          border = isDark ? "rgba(62,207,168,0.25)" : "#86EFAC";
        } else if (status === "PENDING") {
          bg = isDark ? "rgba(240,176,74,0.12)" : "#FFFBEB";
          color = isDark ? "#F0B04A" : "#B45309";
          border = isDark ? "rgba(240,176,74,0.25)" : "#FDE68A";
        } else if (status === "FAILED" || status === "ERROR") {
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
            {e.error && <small className="text-danger block mt-1">{e.error}</small>}
          </div>
        );
      },
    },

    // ── Affected Budgets
    {
      headerName: t("Affected Budgets"),
      field: "affectedBudget",
      title: "Affected Budgets",
      sortable: false,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        const getCount = (obj) => {
          if (!obj) return 0;
          return Object.values(obj).reduce((sum, adTypeObj) => {
            return sum + (adTypeObj ? Object.keys(adTypeObj).length : 0);
          }, 0);
        };
        const count = getCount(row.appliedBudget);
        if (!count) {
          return <span className="text-gray-500">-</span>;
        }
        return (
          <div className="flex items-center h-full" style={{ padding: "8px 4px" }}>
            <span
              role="button"
              className="badge inline-flex items-center px-2 py-1 font-bold"
              style={{
                cursor: "pointer",
                borderRadius: "6px",
                fontSize: "11px",
                backgroundColor: "var(--accent-primary-bg)",
                color: "var(--accent-primary)",
                border: "1px solid var(--accent-primary-border)",
                transition: "all 0.2s ease",
                lineHeight: "1.2",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.setProperty("background-color", "var(--accent-primary)", "important");
                e.currentTarget.style.setProperty("color", "#ffffff", "important");
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.setProperty("background-color", "var(--accent-primary-bg)", "important");
                e.currentTarget.style.setProperty("color", "var(--accent-primary)", "important");
              }}
              onClick={() => handleShowDetailedHistory(row, 'BUDGET')}
            >
              <FiList size={12} className="mr-1" />
              {count} {Math.abs(count) === 1 ? t("Campaign", "Campaign") : t("Campaigns", "Campaigns")}
            </span>
          </div>
        );
      },
    },

    // ── Affected Placements
    {
      headerName: t("Affected Placements"),
      field: "affectedPlacement",
      title: "Affected Placements",
      sortable: false,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        const getCount = (obj) => {
          if (!obj) return 0;
          return Object.values(obj).reduce((sum, adTypeObj) => {
            return sum + (adTypeObj ? Object.keys(adTypeObj).length : 0);
          }, 0);
        };
        const count = getCount(row.appliedPlacementBid);
        if (!count) {
          return <span className="text-gray-500">-</span>;
        }
        return (
          <div className="flex items-center h-full" style={{ padding: "8px 4px" }}>
            <span
              role="button"
              className="badge inline-flex items-center px-2 py-1 font-bold"
              style={{
                cursor: "pointer",
                borderRadius: "6px",
                fontSize: "11px",
                backgroundColor: "var(--accent-primary-bg)",
                color: "var(--accent-primary)",
                border: "1px solid var(--accent-primary-border)",
                transition: "all 0.2s ease",
                lineHeight: "1.2",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.setProperty("background-color", "var(--accent-primary)", "important");
                e.currentTarget.style.setProperty("color", "#ffffff", "important");
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.setProperty("background-color", "var(--accent-primary-bg)", "important");
                e.currentTarget.style.setProperty("color", "var(--accent-primary)", "important");
              }}
              onClick={() => handleShowDetailedHistory(row, 'PLACEMENT')}
            >
              <FiSliders size={12} className="mr-1" />
              {count} {Math.abs(count) === 1 ? t("Placement", "Placement") : t("Placements", "Placements")}
            </span>
          </div>
        );
      },
    },

    // ── Affected Targets
    {
      headerName: t("Affected Targets"),
      field: "affectedTargets",
      title: "Affected Targets",
      sortable: false,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        const getCount = (obj) => {
          if (!obj) return 0;
          return Object.values(obj).reduce((sum, adTypeObj) => {
            return sum + (adTypeObj ? Object.keys(adTypeObj).length : 0);
          }, 0);
        };
        const count = getCount(row.appliedTargetingBid);
        if (!count) {
          return <span className="text-gray-500">-</span>;
        }
        return (
          <div className="flex items-center h-full" style={{ padding: "8px 4px" }}>
            <span
              role="button"
              className="badge inline-flex items-center px-2 py-1 font-bold"
              style={{
                cursor: "pointer",
                borderRadius: "6px",
                fontSize: "11px",
                backgroundColor: "var(--accent-primary-bg)",
                color: "var(--accent-primary)",
                border: "1px solid var(--accent-primary-border)",
                transition: "all 0.2s ease",
                lineHeight: "1.2",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.setProperty("background-color", "var(--accent-primary)", "important");
                e.currentTarget.style.setProperty("color", "#ffffff", "important");
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.setProperty("background-color", "var(--accent-primary-bg)", "important");
                e.currentTarget.style.setProperty("color", "var(--accent-primary)", "important");
              }}
              onClick={() => handleShowDetailedHistory(row, 'TARGET')}
            >
              <FiTarget size={12} className="mr-1" />
              {count} {Math.abs(count) === 1 ? t("Target", "Target") : t("Targets", "Targets")}
            </span>
          </div>
        );
      },
    },
  ], [t, isDark]);

  useEffect(() => {
    DaypartingRuleHistoryList({ ...arg, pageNo: 1, affectedFilter });
    getCampagin();
  }, [date, profileId.value, selectedAdType, debouncedSearchName, affectedFilter]);

  const getCampagin = () => {
    if (!profileId?.value) return;
    ApigetCampaign({ profileId: profileId?.value })
      .then((res) => {
        if (res.isSuccess) setCampaignList(res.data || []);
      })
      .catch((err) => console.log(err));
  };


  const handlePageChange = (page) => {
    setArg({
      pageNo: page,
      perPage: perPage
    })
    DaypartingRuleHistoryList({ pageNo: page, perPage: perPage });
  };

  const handleShowDetailedHistory = (row, fieldType) => {
    let transformed = [];
    let base = {};
    let applied = {};
    let changeKey = "";

    if (fieldType === 'BUDGET') {
      base = row.baseBudget || {};
      applied = row.appliedBudget || {};
      changeKey = "budget";
    } else if (fieldType === 'PLACEMENT') {
      base = row.basePlacementBid || {};
      applied = row.appliedPlacementBid || {};
      changeKey = "bidAdjustment";
    } else if (fieldType === 'TARGET') {
      base = row.baseTargetingBid || {};
      applied = row.appliedTargetingBid || {};
      changeKey = "bid";
    }

    const traverseAndPush = (appliedSource, baseSource, currentType, parentId) => {
      if (!appliedSource || typeof appliedSource !== 'object') return;

      Object.keys(appliedSource).forEach(key => {
        const val = appliedSource[key];
        const oldVal = baseSource ? baseSource[key] : null;

        if (['SP', 'SB', 'SD'].includes(key)) {
          // 1st level traversal: Ad Types
          traverseAndPush(val || {}, oldVal || {}, key, null);
        } else if (val && typeof val === 'object' && !val.hasOwnProperty('value') && !val.hasOwnProperty('name')) {
          // 2nd level traversal for Placements: { campaignId : { placementName : modifier } }
          traverseAndPush(val, oldVal || {}, currentType, key);
        } else {
          // LEAF NODE (campaignId, targetId, placementName)
          let finalOld = typeof oldVal === 'object' && oldVal !== null ? (oldVal.value ?? oldVal.modifier ?? 0) : oldVal;
          let finalNew = typeof val === 'object' && val !== null ? (val.value ?? val.modifier ?? val) : val;
          let itemName = typeof val === 'object' && val !== null ? (val.name ?? key) : key;

          let cId = parentId ? parentId : key;
          let pName = parentId ? key : "";

          // Only skip if explicitly no change AND execution was not a revert
          const isUnchanged = Number(finalOld) === Number(finalNew);
          const isReverted = row.executionState === "REVERTED";
          if (isUnchanged && !isReverted) return;

          // Determine the best name
          let finalName = itemName;
          let finalCampaignId = fieldType === 'TARGET' ? (typeof val === 'object' && val !== null ? val.campaignId : cId) : cId;

          let matchedCamp = null;
          if (fieldType === 'PLACEMENT' || fieldType === 'BUDGET' || fieldType === 'TARGET') {
            matchedCamp = campaignList.find(c => String(c.campaignId) === String(finalCampaignId));
            finalName = matchedCamp ? matchedCamp.name : finalCampaignId;
          }

          transformed.push({
            name: finalName,
            oldValue: typeof finalOld === 'object' ? JSON.stringify(finalOld) : finalOld,
            newValue: typeof finalNew === 'object' ? JSON.stringify(finalNew) : finalNew,
            changed: changeKey,
            type: currentType || "SP",
            ruleDate: moment(row.executedAt).format("YYYY-MM-DD"),
            ruleTime: moment(row.executedAt).format("hh:mm A"),
            campaignId: finalCampaignId,
            targetName: fieldType === 'TARGET' ? itemName : "",
            targetType: fieldType === 'TARGET' ? (typeof val === 'object' && val !== null ? val.targetType : "") : "",
            targetId: fieldType === 'TARGET' ? cId : "",
            placement: fieldType === 'PLACEMENT' ? pName : "",
            campaignAcos: matchedCamp?.acos,
            campaignRoas: matchedCamp?.roas,
            acos: matchedCamp?.acos,
            roas: matchedCamp?.roas,
          });
        }
      });
    };

    traverseAndPush(applied, base, "SP", null);

    // ── Hierarchical Grouping for Placements (Accordion Support)
    if (fieldType === 'PLACEMENT') {
      const grouped = transformed.reduce((acc, item) => {
        if (!acc[item.campaignId]) {
          acc[item.campaignId] = {
            ...item,
            isParent: true,
            placement: null, // Parent row doesn't show a specific placement
            children: []
          };
        }
        acc[item.campaignId].children.push(item);
        return acc;
      }, {});

      transformed = Object.values(grouped);
    }

    setShowHistoryModal({ show: true, data: transformed });
  };

  const handlePerRowsChange = async (newPerPage) => {
    setPerPage(newPerPage);
    setArg({
      pageNo: 1,
      perPage: newPerPage
    });
    DaypartingRuleHistoryList({ pageNo: 1, perPage: newPerPage });
  };

  const DaypartingRuleHistoryList = async (arg) => {
    if (profileId.value && selectedAdType) {
      dispatch(handleLoader(true));
      const currentAffectedFilter = arg?.affectedFilter !== undefined ? arg.affectedFilter : affectedFilter;
      const data = {
        fromDate: moment(date?.[0]).format("YYYY-MM-DD"),
        toDate: moment(date?.[1]).format("YYYY-MM-DD"),
        profileId: profileId.value,
        search: arg?.hasOwnProperty("search") ? arg.search : debouncedSearchName,
        affectedFilter: currentAffectedFilter,
        ...arg,
      };
      await ApiRuleHistory(data)
        .then((e) => {
          if (e?.isSuccess) {
            dispatch(handleLoader(false));
            setTableData(e.data);
            setHistoryData(e);
          } else {
            dispatch(handleLoader(false));
            Toast.error(e?.message);
          }
        })
        .catch((e) => {
          dispatch(handleLoader(false));
          Toast.error(t("Something went wrong"));
        });
    }
  };

  const handleSearch = (e) => {
    setSearchName(e.target.value);
  };

  return (
    <>
      <Filter
        name={"Dayparting Rule History"}
        nameShow={false}
        dateShow={false}
        profileShow={true}
      />
      <div className="middle_container budget_container">
        <div className="mb-4">
          <Breadcrumb
            paths={[
              { label: "Hourly Performance Tracking", link: "/hourly-performance-tracking" },
              { label: "History" }
            ]}
            onBack={() => navigate("/hourly-performance-tracking")} />
        </div>

        <div className="glass-grid-container overflow-hidden">
          <div className="data_model_btn camapgin_btn flex flex-row items-center justify-between gap-3 p-3 flex-wrap" style={{ padding: "12px 24px" }} id="dayparting-rule-history-filters">
            <div style={{ flex: "1 1 auto" }}>
              <h5 className="m-0 whitespace-nowrap font-bold uppercase">{t("Dayparting Rule History")}</h5>
            </div>
            <div className="flex items-center gap-3 mr-3 flex-wrap" style={{ flex: "1 1 auto", justifyContent: "flex-end" }}>
              <div className="relative flex items-center m-0" id="filter-search" style={{ flex: "1 1 200px", minWidth: "200px", maxWidth: "280px", height: "40px" }}>
                <Input
                  type="text"
                  placeholder={t("searchHere")}
                  value={searchName}
                  onChange={(e) => handleSearch(e)}
                  className="h-[38px] w-full pr-8"
                />
                {searchName && (
                  <MdOutlineClose
                    onClick={() => setSearchName("")}
                    className="absolute right-2.5 cursor-pointer text-slate-500 opacity-70 hover:opacity-100 transition-opacity"
                    size={18}
                  />
                )}
              </div>

              <div id="filter-affected-status" style={{ flex: "1 1 180px", minWidth: "170px", maxWidth: "220px", height: "40px" }}>
                <Select value={affectedFilter} onValueChange={(val) => setAffectedFilter(val)}>
                  <SelectTrigger className="h-[38px] w-full">
                    <SelectValue placeholder={t("Filter Changes")} />
                  </SelectTrigger>
                  <SelectContent className="z-[99999]">
                    <SelectItem value="ALL">{t("All", "All")}</SelectItem>
                    <SelectItem value="AFFECTED">{t("affectedChanges", "Affected Changes")}</SelectItem>
                    <SelectItem value="UNAFFECTED">{t("unaffectedChanges", "Unaffected Changes")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <DateRangePicker
                className="w-full sm:w-[260px] items-center"
                ranges={predefinedRanges}
                value={date}
                placeholder={t("Select Date")}
                onChange={(e) => setDate(e)}
                placement="bottomEnd"
                format="yyyy-MM-dd"
                cleanable={false}
                style={{ flex: "1 1 220px", minWidth: "200px", maxWidth: "260px", height: "40px" }}
              />
            </div>
          </div>
          {PermissionCheck(SYSTEM_PAGES.HOURLY_PERFORMANCE_TRACKING_HISTORY, PAGE_ACTIONS.VIEW_ONLY) && (
            <div className="data_table" style={{ padding: "0 14px 14px 14px" }}>
              <AgTable ref={gridRef}
                tableId="dayparting-rule-history-table"
                height={"70vh"}
                rowData={displayTableData}
                columnDefs={columns}
                totalRecords={historyData?.totalRecords || 0}
                perPage={perPage}
                currentPage={arg.pageNo}
                onPageChange={handlePageChange}
                onPerPageChange={handlePerRowsChange}
                paginationOptions={paginationRowsPerPageOptions}
                isCustomSaveColumns={true}
                customSaveColumnName={"Dayparting Rule History V2"}
                handleSaveColumns={undefined}
              />
            </div>
          )}
        </div>
      </div>
      <AffectedHistoryModel
        show={showHistoryModal.show}
        data={showHistoryModal.data}
        onClose={() => setShowHistoryModal({ show: false, data: [] })}
      />
    </>
  );
}

export default DaypartingStretegyHistory;
