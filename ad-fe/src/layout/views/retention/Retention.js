import { useTranslation } from "react-i18next";
import { t } from "i18next";
import Toast from "../../../common/helper/toast/Toast";
import {
  ApiGetAllRetention,
  ApiDeleteRetention,
  ApiChangeStatusRetention,
} from "../../../api-wrapper/ApiRetention";
import Filter from "../../../helper/filter/Filter";
import { useEffect, useState, useRef } from "react";
import AgTable from "../../../common/grid/AgTable";
import { CustomModal } from "../../../helper/modal/CustomModal";
import { firstPageRows, paginationRowsPerPageOptions } from "../../../helper/table/TableStyle";
import { PermissionCheck } from "../../../helper/permission/PermissionCheck";
import EditRetentionModal from "./EditRetentionModal";
import { MdOutlineClose } from "react-icons/md";
import moment from "moment";

const Retention = () => {
  const { t } = useTranslation();
  const [arg, setArg] = useState({ pageNo: 1, perPage: firstPageRows });
  const [perPage, setPerPage] = useState(firstPageRows);

  const [retentionList, setRetentionList] = useState([]);
  const [gridResponseData, setGridResponseData] = useState([]);
  const [searchName, setSearchName] = useState("");
  const [debouncedSearchName, setDebouncedSearchName] = useState("");
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

  const [isDark, setIsDark] = useState(
    document.documentElement.getAttribute("data-theme") === "dark"
  );

  useEffect(() => {
    const handle = () =>
      setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    const observer = new MutationObserver(handle);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const [openEditModal, setOpenEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(null);
  const [selectedRetention, setSelectedRetention] = useState(null);

  const gridRef = useRef(null);
  const [loadingGrid, setLoadingGrid] = useState(false);

  const ApiListing = async (extraArgs = {}) => {
    setLoadingGrid(true);
    const payload = {
      pageNo: arg.pageNo,
      perPage: arg.perPage,
      searchName: searchName,
      fieldName: "days",
      sortType: "ASC",
      ...extraArgs,
    };

    await ApiGetAllRetention(payload, true)
      .then((res) => {
        if (res.isSuccess) {
          setRetentionList(res.data || []);
          setGridResponseData(res);
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
      ApiListing({ searchName: debouncedSearchName, pageNo: 1 });
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
    const {
      colId,
      sortDef: { direction: sort },
    } = sortModel?.reverse()?.[0];
    ApiListing({
      fieldName: colId,
      ...(sort && { sortType: sort === "asc" ? "ASC" : "DESC" }),
      ...arg,
    });
  };

  const handleGridReady = (params) => {
    try {
      params.api.sizeColumnsToFit();
    } catch (e) {}
  };

  const handleGridSizeChanged = (params) => {
    try {
      params.api.sizeColumnsToFit();
    } catch (e) {}
  };

  const statusToggleHandler = async (row) => {
    if (!PermissionCheck("Retention", "Update")) return;
    await ApiChangeStatusRetention({ id: row._id, isActive: !row.isActive })
      .then((res) => {
        if (res?.isSuccess) {
          Toast.success(res?.message);
          ApiListing();
        } else {
          Toast.error(res?.message);
        }
      })
      .catch(() => Toast.error(t("Something went wrong")));
  };

  const deleteHandler = async () => {
    await ApiDeleteRetention({ id: showDeleteModal?._id })
      .then((res) => {
        if (res?.isSuccess) {
          Toast.success(res?.message);
          setShowDeleteModal(null);
          ApiListing();
        } else {
          Toast.error(res?.message);
        }
      })
      .catch(() => Toast.error(t("Something went wrong")));
  };

  const columns = [
    ...(PermissionCheck("Retention", "Update") || PermissionCheck("Retention", "Remove")
      ? [
          {
            headerName: t("Action"),
            field: "action",
            title: t("Action"),
            width: 110,
            minWidth: 100,
            flex: 0.8,
            sortable: false,
            resizable: true,
            cellRenderer: (params) => {
              const row = params.data;
              if (!row) return null;
              return (
                <div className="action_container gap-2 flex items-center">
                  {PermissionCheck("Retention", "Update") && (
                    <i
                      className="fa fa-pencil cursor-pointer"
                      title={t("Edit Retention")}
                      onClick={() => {
                        setSelectedRetention(row);
                        setOpenEditModal(true);
                      }}
                    />
                  )}
                  {PermissionCheck("Retention", "Remove") && (
                    <i
                      className="fa fa-trash cursor-pointer text-red-500"
                      title={t("Delete Retention")}
                      onClick={() => setShowDeleteModal(row)}
                    />
                  )}
                </div>
              );
            },
          },
        ]
      : []),
    {
      headerName: t("Retention Days"),
      field: "days",
      title: t("Retention Days"),
      flex: 1.5,
      minWidth: 140,
      sortable: true,
      resizable: true,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        return (
          <span className="font-semibold text-slate-800 dark:text-slate-100">
            {row.days} {t("Days")}
          </span>
        );
      },
    },
    {
      headerName: t("Label"),
      field: "label",
      title: t("Label"),
      flex: 2,
      minWidth: 180,
      sortable: true,
      resizable: true,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        return <span>{row.label || `${row.days} Days`}</span>;
      },
    },
    {
      headerName: t("Status"),
      field: "isActive",
      title: t("Status"),
      flex: 1.2,
      minWidth: 130,
      sortable: true,
      resizable: true,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        const active = row.isActive;
        return (
          <span
            onClick={() => statusToggleHandler(row)}
            className={`cursor-pointer px-2.5 py-1 text-[12px] font-medium rounded-full transition-all inline-flex items-center gap-1 ${
              active
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800"
                : "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-300 dark:border-rose-800"
            }`}
            title={t("Click to toggle status")}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                active ? "bg-emerald-500" : "bg-rose-500"
              }`}
            />
            {active ? t("Active") : t("Inactive")}
          </span>
        );
      },
    },
    {
      headerName: t("Created At"),
      field: "createdAt",
      title: t("Created At"),
      flex: 2,
      minWidth: 180,
      sortable: true,
      resizable: true,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row?.createdAt) return "-";
        return (
          <span className="text-slate-500 dark:text-slate-400">
            {moment(row.createdAt).format("DD MMM YYYY, hh:mm A")}
          </span>
        );
      },
    },
  ];

  return (
    <>
      <Filter
        name={"Retention"}
        nameShow={false}
        dateShow={false}
        profileShow={true}
      />
      <div className="middle_container budget_container">
        <div className="glass-grid-container overflow-hidden">
          <div
            className={`data_model_btn camapgin_btn flex-wrap flex ${
              isMobile ? "flex-col" : "flex-row"
            } items-center justify-between gap-3 p-3`}
            style={{
              padding: "12px 24px",
              borderBottom: isDark ? "1px solid #334155" : "none",
              backgroundColor: isDark ? "rgba(255,255,255,0.02)" : "transparent",
            }}
          >
            <div
              className={`flex items-center ${
                isMobile ? "w-full justify-between" : ""
              }`}
            >
              <h5
                className="m-0 font-bold"
                style={{ color: isDark ? "#f8fafc" : "#1e293b" }}
              >
                {t("Retention Settings")}
              </h5>
            </div>

            <div
              className={`flex ${
                isMobile ? "flex-col w-full" : "flex-row items-center"
              } gap-2`}
            >
              <div
                className={`flex ${
                  isMobile ? "flex-row flex-wrap w-full" : "flex-row items-center"
                } gap-2`}
              >
                <div
                  id="retention-search"
                  className="search_option m-0"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    position: "relative",
                    width: isMobile ? "100%" : "auto",
                    minWidth: isMobile ? "100%" : "220px",
                    flexGrow: 1,
                    backgroundColor: isDark ? "#1e293b" : "#fff",
                    border: isDark ? "1px solid #334155" : "1px solid #cbd5e1",
                  }}
                >
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
                      paddingRight: searchName ? "30px" : "10px",
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
                        transition: "opacity 0.2s",
                      }}
                      onMouseEnter={(e) => (e.target.style.opacity = 1)}
                      onMouseLeave={(e) => (e.target.style.opacity = 0.7)}
                    />
                  )}
                </div>

                {PermissionCheck("Retention", "Create") && (
                  <button
                    id="retention-add-btn"
                    className="improve add_btn m-0 gap-0"
                    onClick={() => {
                      setSelectedRetention(null);
                      setOpenEditModal(true);
                    }}
                    style={{
                      height: "40px",
                      whiteSpace: "nowrap",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {t("Add Retention")}
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="data_table" style={{ padding: "0 14px 14px 14px" }}>
            <AgTable
              onRefresh={ApiListing} ref={gridRef}
              tableId="retention-main-table"
              height={"60vh"}
              loading={loadingGrid}
              rowData={retentionList}
              columnDefs={columns}
              totalRecords={gridResponseData?.totalRecords ?? 0}
              perPage={perPage}
              currentPage={arg.pageNo}
              onPageChange={handlePageChange}
              onPerPageChange={handlePerRowsChange}
              onSortChanged={handleSortChanged}
              onGridReady={handleGridReady}
              onGridSizeChanged={handleGridSizeChanged}
              paginationOptions={paginationRowsPerPageOptions}
              isCustomSaveColumns={false}
            />
          </div>
        </div>

        <EditRetentionModal
          open={openEditModal}
          onClose={() => {
            setOpenEditModal(false);
            ApiListing();
          }}
          retentionData={selectedRetention}
        />

        <CustomModal
          show={!!showDeleteModal?._id}
          onHide={() => setShowDeleteModal(null)}
          title={t("Delete Retention")}
          icon="delete"
          iconVariant="danger"
          message={`Are you sure you want to permanently delete retention option <b>${showDeleteModal?.days} Days (${showDeleteModal?.label})</b>?<br/> This action cannot be undone.`}
          actions={[
            { label: t("Cancel"), onClick: () => setShowDeleteModal(null), cancel: true },
            { label: t("Delete"), onClick: deleteHandler, variant: "danger", icon: "delete" },
          ]}
        />
      </div>
    </>
  );
};

export default Retention;
