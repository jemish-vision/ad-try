import { useTranslation } from "react-i18next";
import { SYSTEM_PAGES, PAGE_ACTIONS } from "src/common/constants";
import { t } from "i18next";
import Toast from "../../../common/helper/toast/Toast";
import { ApiDeleteRuleBlockedTime, ApiRuleBlockedTimeList } from "../../../api-wrapper/ApiRuleBlockedTime";
import Filter from "../../../helper/filter/Filter";
import { useEffect, useState, useRef } from "react";
import AgTable from "../../../common/grid/AgTable";
import { CustomModal } from "../../../helper/modal/CustomModal";
import { firstPageRows, paginationRowsPerPageOptions } from "../../../helper/table/TableStyle";
import { PermissionCheck } from "../../../helper/permission/PermissionCheck";
import EditRuleBlockedTimeModal from "./EditRuleBlockedTimeModal";
import { MdOutlineClose } from "react-icons/md";

const RuleBlockedTime = () => {
  const { t } = useTranslation();

  const [arg, setArg] = useState({ pageNo: 1, perPage: firstPageRows });
  const [perPage, setPerPage] = useState(firstPageRows);

  const [ruleBlockedTimeList, setRuleBlockedTimeList] = useState([]);
  const [groupsData, setGroupsData] = useState([]);
  const [searchName, setSearchName] = useState("");
  const [debouncedSearchName, setDebouncedSearchName] = useState("");
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

  const [openEditModal, setOpenEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(null);

  const [selectedRuleBlockedTime, setSelectedRuleBlockedTime] = useState(null);

  const gridRef = useRef(null);
  const [loadingGrid, setLoadingGrid] = useState(false);

  const ApiListing = async (extraArgs = {}) => {
    setLoadingGrid(true);
    const payload = {
      pageNo: arg.pageNo,
      perPage: arg.perPage,
      searchName: searchName,
      fieldName: "createdAt",
      sortType: "DESC",
      ...extraArgs
    };

    await ApiRuleBlockedTimeList(payload, true)
      .then((res) => {
        if (res.isSuccess) {
          setRuleBlockedTimeList(res.data);
          setGroupsData(res);
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
      ApiListing({ searchName: debouncedSearchName });
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

  const deleteHandler = async () => {
    await ApiDeleteRuleBlockedTime({ id: showDeleteModal?._id })
      .then((res) => {
        if (res?.isSuccess) {
          Toast.success(res?.message);
          ApiListing();
        } else Toast.error(res?.message);
      })
      .catch(() => Toast.error(t("Something went wrong")));
  }

  const columns = [
    ...(PermissionCheck(SYSTEM_PAGES.RULE_BLOCKED_TIME, PAGE_ACTIONS.UPDATE) || PermissionCheck(SYSTEM_PAGES.RULE_BLOCKED_TIME, PAGE_ACTIONS.REMOVE) ? [
      {
        headerName: t("Action"),
        field: "action",
        title: "Action",
        width: 120,
        sortable: false,
        resizable: false,
        cellRenderer: (params) => {
          const row = params.data;
          if (!row) return null;
          return (
            <div className="action_container gap-2">
              {PermissionCheck(SYSTEM_PAGES.RULE_BLOCKED_TIME, PAGE_ACTIONS.UPDATE) && (
                <i
                  className="fa fa-pencil cursor-pointer"
                  title={t("Edit Rule Blocked Time")}
                  onClick={() => { setSelectedRuleBlockedTime(row); setOpenEditModal(true); }}
                />
              )}
              {PermissionCheck(SYSTEM_PAGES.RULE_BLOCKED_TIME, PAGE_ACTIONS.REMOVE) && (
                <i className="fa fa-trash cursor-pointer" onClick={() => setShowDeleteModal(row)} />
              )}
            </div>
          );
        },
      },
    ] : []),
    {
      headerName: t("Start Time"),
      field: "startTime",
      title: "Start Time",
      flex: 1,
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
    },
    {
      headerName: t("End Time"),
      field: "endTime",
      title: "End Time",
      flex: 1,
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
    },
  ];

  return (
    <>
      <Filter
        name={"Rule Blocked Time"}
        nameShow={false}
        dateShow={false}
        profileShow={true}
      />
      <div className="middle_container budget_container">
        <div className="glass-grid-container overflow-hidden">
          <div className={`data_model_btn camapgin_btn flex-wrap flex ${isMobile ? "flex-col" : "flex-row"} items-center justify-between gap-3 p-3`} style={{
            padding: "12px 24px",
            borderBottom: isDark ? "1px solid #334155" : "none",
            backgroundColor: isDark ? "rgba(255,255,255,0.02)" : "transparent"
          }}>
            <div className={`flex items-center ${isMobile ? "w-full justify-between" : ""}`}>
              <h5 className="m-0 font-bold" style={{ color: isDark ? "#f8fafc" : "#1e293b" }}>{t("Rule Blocked Time")}</h5>
            </div>

            <div className={`flex ${isMobile ? "flex-col w-full" : "flex-row items-center"} gap-2`}>
              <div className={`flex ${isMobile ? "flex-row flex-wrap w-full" : "flex-row items-center"} gap-2`}>
                <div id="rule-blocked-search" className="search_option m-0" style={{
                  display: "flex",
                  alignItems: "center",
                  position: "relative",
                  width: isMobile ? "100%" : "auto",
                  minWidth: isMobile ? "100%" : "220px",
                  flexGrow: 1,
                  backgroundColor: isDark ? "#1e293b" : "#fff",
                  border: isDark ? "1px solid #334155" : "1px solid #cbd5e1"
                }}>
                  <input
                    type="text"
                    placeholder={t("searchHere")}
                    value={searchName}
                    onChange={(e) => setSearchName(e.target.value)}
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

                {PermissionCheck(SYSTEM_PAGES.RULE_BLOCKED_TIME, PAGE_ACTIONS.CREATE) && (
                  <button
                    id="rule-blocked-add-btn"
                    className="improve add_btn m-0 gap-0"
                    onClick={() => { setSelectedRuleBlockedTime(null); setOpenEditModal(true) }}
                    style={{
                      height: "40px",
                      whiteSpace: "nowrap",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center"
                    }}
                  >
                    {t("Add Rule Blocked Time")}
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="data_table" style={{ padding: "0 14px 14px 14px" }}>
            <AgTable
              onRefresh={ApiListing} ref={gridRef}
              tableId="ruleBlockedTime-main-table"
              height={"60vh"}
              loading={loadingGrid}
              rowData={ruleBlockedTimeList}
              columnDefs={columns}
              totalRecords={groupsData?.totalRecords ?? 0}
              perPage={perPage}
              currentPage={arg.pageNo}
              onPageChange={handlePageChange}
              onPerPageChange={handlePerRowsChange}
              onSortChanged={handleSortChanged}
              paginationOptions={paginationRowsPerPageOptions}
              isCustomSaveColumns={true}
              customSaveColumnName={"Rule Blocked Time"}
              handleSaveColumns={undefined}
            />
          </div>
        </div>

        <EditRuleBlockedTimeModal
          open={openEditModal}
          onClose={() => { setOpenEditModal(false); ApiListing(); }}
          ruleBlockedTime={selectedRuleBlockedTime}
        />

        <CustomModal
          show={!!showDeleteModal?._id}
          onHide={() => setShowDeleteModal(null)}
          title={t("Delete Rule Blocked Time")}
          icon="delete"
          iconVariant="danger"
          message={`Are you sure you want to permanently delete <b>(${showDeleteModal?.startTime} to ${showDeleteModal?.endTime})</b>?<br/> This action cannot be undone.`}
          actions={[
            { label: t("Cancel"), onClick: () => setShowDeleteModal(null), cancel: true },
            { label: t("Delete"), onClick: deleteHandler, variant: "danger", icon: "delete" }
          ]}
        />
      </div>
    </>
  );
};

export default RuleBlockedTime;
