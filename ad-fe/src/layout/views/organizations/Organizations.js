import React, { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import Filter from "../../../helper/filter/Filter";
import AgTable from "../../../common/grid/AgTable";
import { Input } from "../../../components/ui/input";
import { MdOutlineClose } from "react-icons/md";
import { ApiGetSuperAdminOrganizations } from "../../../api-wrapper/ApiOrganization";
import EditOrganizationModal from "./EditOrganizationModal";
import OrganizationUsersModal from "./OrganizationUsersModal";
import PendingSyncProfilesModal from "./PendingSyncProfilesModal";
import { firstPageRows, paginationRowsPerPageOptions } from "../../../helper/table/TableStyle";
import { CardTitle } from "src/components/ui/card";
import { AppTooltip } from "../../../components/ui/AppTooltip";

const Organizations = () => {
  const { t } = useTranslation();
  const [orgList, setOrgList] = useState([]);
  const [filteredList, setFilteredList] = useState([]);
  const [searchName, setSearchName] = useState("");
  const [perPage, setPerPage] = useState(firstPageRows);
  const [pageNo, setPageNo] = useState(1);
  const gridRef = useRef(null);

  const [openEditModal, setOpenEditModal] = useState(false);
  const [selectedOrgForEdit, setSelectedOrgForEdit] = useState(null);

  const [openUsersModal, setOpenUsersModal] = useState(false);
  const [selectedOrgForUsers, setSelectedOrgForUsers] = useState(null);

  const [openSyncModal, setOpenSyncModal] = useState(false);
  const [selectedOrgForSync, setSelectedOrgForSync] = useState(null);
  const [loadingGrid, setLoadingGrid] = useState(false);

  const fetchOrganizations = async (skip = false) => {
    setLoadingGrid(true);
    try {
      const res = await ApiGetSuperAdminOrganizations(skip);
      if (res && res.isSuccess && Array.isArray(res.data)) {
        setOrgList(res.data);
      } else {
        setOrgList([]);
      }
    } catch (err) {
      console.error("Error loading organizations:", err);
    } finally {
      setLoadingGrid(false);
    }
  };

  useEffect(() => {
    fetchOrganizations();
  }, []);

  useEffect(() => {
    if (!searchName.trim()) {
      setFilteredList(orgList);
    } else {
      const q = searchName.toLowerCase();
      const filtered = orgList.filter(
        (org) =>
          (org.organizationName && org.organizationName.toLowerCase().includes(q)) ||
          (org.ownerName && org.ownerName.toLowerCase().includes(q)) ||
          (org.ownerEmail && org.ownerEmail.toLowerCase().includes(q)) ||
          (org.packageName && org.packageName.toLowerCase().includes(q))
      );
      setFilteredList(filtered);
    }
  }, [searchName, orgList]);

  const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return "-";
      return d.toLocaleDateString("en-US", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch {
      return "-";
    }
  };

  const columns = React.useMemo(() => [
    {
      headerName: "Action",
      field: "action",
      title: "Action",
      width: 140,
      sortable: false,
      resizable: false,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        return (
          <div className="action_container gap-2 flex items-center justify-center py-1.5">
            <AppTooltip text={t("Edit Organization (Plan, Start Date, End Date)")}>
              <i
                id={params.node.rowIndex === 0 ? "orgs-edit-btn" : undefined}
                className="fa fa-pencil cursor-pointer"
                onClick={() => {
                  setSelectedOrgForEdit(row);
                  setOpenEditModal(true);
                }}
              />
            </AppTooltip>
            <AppTooltip text={t("View Users & Login as User inside Organization")}>
              <i
                id={params.node.rowIndex === 0 ? "orgs-users-btn" : undefined}
                className="fa fa-users cursor-pointer"
                onClick={() => {
                  setSelectedOrgForUsers(row);
                  setOpenUsersModal(true);
                }}
              />
            </AppTooltip>
            {row.hasPendingSync && (
              <AppTooltip text={t("Pending Sync Setup Requests - Play Cron")}>
                <i
                  className="fa fa-play cursor-pointer"
                  onClick={() => {
                    setSelectedOrgForSync(row);
                    setOpenSyncModal(true);
                  }}
                />
              </AppTooltip>
            )}
          </div>
        );
      },
    },
    {
      headerName: t("Organization Name"),
      field: "organizationName",
      title: t("Organization Name"),
      minWidth: 200,
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return "-";
        return (
          <div className="flex items-center gap-2 font-bold py-1 text-slate-800 dark:text-slate-100">
            <span>{row.organizationName}</span>
            {row.isTrialActive && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 whitespace-nowrap">
                {t("Trial")}
              </span>
            )}
          </div>
        );
      },
    },
    {
      headerName: t("Owner (Admin)"),
      field: "ownerName",
      title: t("Owner (Admin)"),
      minWidth: 220,
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row || (!row.ownerName && !row.ownerEmail)) return "-";
        return (
          <div className="flex flex-col py-1">
            <span className="font-semibold text-slate-800 dark:text-slate-100 text-xs">
              {row.ownerName || "-"}
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              {row.ownerEmail || "-"}
            </span>
          </div>
        );
      },
    },
    {
      headerName: t("Company & Phone"),
      field: "ownerCompany",
      title: t("Company & Phone"),
      minWidth: 180,
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row || (!row.ownerCompany && !row.ownerPhone)) return "-";
        return (
          <div className="flex flex-col py-1">
            <span className="font-medium text-slate-800 dark:text-slate-100 text-xs">
              {row.ownerCompany || "-"}
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              {row.ownerPhone || "-"}
            </span>
          </div>
        );
      },
    },
    {
      headerName: t("Subscription Plan"),
      field: "packageName",
      title: t("Subscription Plan"),
      minWidth: 160,
      sortable: true,
      resizable: true,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return "-";
        return (
          <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800/40">
            {row.packageName || "No Plan"}
          </span>
        );
      },
    },
    {
      headerName: t("Start Date"),
      field: "startDate",
      title: t("Start Date"),
      minWidth: 130,
      sortable: true,
      resizable: true,
      cellRenderer: (params) => formatDate(params.data?.startDate),
    },
    {
      headerName: t("End Date"),
      field: "endDate",
      title: t("End Date"),
      minWidth: 130,
      sortable: true,
      resizable: true,
      cellRenderer: (params) => formatDate(params.data?.endDate),
    },
    {
      headerName: t("Users Count"),
      field: "usersList",
      title: t("Users Count"),
      minWidth: 150,
      sortable: false,
      resizable: true,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        const count = row.usersList?.length || 0;
        return (
          <button
            type="button"
            id={params.node.rowIndex === 0 ? "orgs-users-count-btn" : undefined}
            onClick={() => {
              setSelectedOrgForUsers(row);
              setOpenUsersModal(true);
            }}
            className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 font-semibold transition-all flex items-center gap-1.5 shadow-2xs text-[11px] cursor-pointer"
          >
            <i className="fa fa-users text-blue-600 dark:text-blue-400" />
            <span>
              {count} {count === 1 ? "User" : "Users"}
            </span>
          </button>
        );
      },
    },
  ], [t]);

  return (
    <>
      <Filter name={"Organizations"} nameShow={false} dateShow={false} profileShow={true} />
      <div className="middle_container">
        <div className="data_content data_content_btn glass-grid-container h-maxContent">
          <div className="camapgin_btn flex flex-wrap justify-between items-center gap-3 pt-4 pb-2 px-6 border-b dark:border-slate-800 border-slate-200">
            <div className="flex items-center gap-3">
              <CardTitle className="m-0 flex items-center cron-title-bar" style={{ fontSize: 14, color: document.documentElement.getAttribute("data-theme") === "dark" ? "#cbd5e1e0" : "#0F172A" }}>
                {t("Organizations")}
              </CardTitle>
            </div>

            <div className="flex items-center gap-3">
              <div id="orgs-search" className="relative flex items-center w-full sm:w-[240px]">
                <Input
                  type="text"
                  placeholder={t("searchHere")}
                  value={searchName}
                  onChange={(e) => setSearchName(e.target.value)}
                  className="shadcn-search-input pr-8 text-xs"
                />
                {searchName && (
                  <MdOutlineClose
                    onClick={() => setSearchName("")}
                    className="absolute right-2.5 cursor-pointer opacity-70 hover:opacity-100 dark:text-slate-300 text-base"
                  />
                )}
              </div>
            </div>
          </div>

          <div className="table_section overflow-hidden p-3">
            <AgTable ref={gridRef}
              tableId="orgs-main-table"
              height={"55vh"}
              loading={loadingGrid}
              onRefresh={() => fetchOrganizations(true)}
              rowData={filteredList}
              columnDefs={columns}
              totalRecords={filteredList.length}
              perPage={perPage}
              currentPage={pageNo}
              onPageChange={(p) => setPageNo(p)}
              onPerPageChange={(s) => setPerPage(s)}
              paginationOptions={paginationRowsPerPageOptions}
            />
          </div>
        </div>
      </div>

      <EditOrganizationModal
        open={openEditModal}
        setOpen={setOpenEditModal}
        organization={selectedOrgForEdit}
        onSuccess={fetchOrganizations}
      />

      <OrganizationUsersModal
        open={openUsersModal}
        setOpen={setOpenUsersModal}
        organization={selectedOrgForUsers}
      />

      <PendingSyncProfilesModal
        open={openSyncModal}
        setOpen={setOpenSyncModal}
        organization={selectedOrgForSync}
        onSuccess={fetchOrganizations}
      />
    </>
  );
};

export default Organizations;
