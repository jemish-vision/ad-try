import { useTranslation } from "react-i18next";
import { t } from "i18next";
import Toast from "../../../common/helper/toast/Toast";
import { ApiGetAllRoles, ApiDeleteRole } from "../../../api-wrapper/ApiRoles";
import { useEffect, useState, useRef } from "react";
import AgTable from "../../../common/grid/AgTable";
import Filter from "../../../helper/filter/Filter";
import EditAdminRoleModal from "./EditAdminRoleModal";
import { firstPageRows, paginationRowsPerPageOptions } from "../../../helper/table/TableStyle";
import { MdOutlineClose } from "react-icons/md";
import { Input } from "../../../components/ui/input";
import { Button } from "../../../components/ui/button";
import { CustomModal } from "../../../helper/modal/CustomModal";
import { CardTitle } from "src/components/ui/card";
import { SYSTEM_PAGES, PAGE_ACTIONS } from "src/common/constants";
import { PermissionCheck } from "../../../helper/permission/PermissionCheck";
import { useDispatch } from "react-redux";
import { handleLoader } from "../../../common/redux/action";

const AdminRoles = () => {
  const { t } = useTranslation();
  const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");

  useEffect(() => {
    const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    const observer = new MutationObserver(handle);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  const [arg, setArg] = useState({ pageNo: 1, perPage: firstPageRows });
  const [perPage, setPerPage] = useState(firstPageRows);
  const [roleList, setRoleList] = useState([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [searchName, setSearchName] = useState("");
  const [debouncedSearchName, setDebouncedSearchName] = useState("");
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [loadingGrid, setLoadingGrid] = useState(false);
  const dispatch = useDispatch();

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const [openEditModal, setOpenEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(null);
  const [selectedRole, setSelectedRole] = useState(null);
  const gridRef = useRef(null);

  const ApiListing = async (extraArgs = {}) => {
    const payload = {
      pageNo: arg.pageNo,
      perPage: arg.perPage,
      searchName: searchName,
      fieldName: "createdAt",
      sortType: "DESC",
      ...extraArgs
    };

    setLoadingGrid(true);
    try {
      const [res] = await Promise.all([
        ApiGetAllRoles(payload),
        new Promise(resolve => setTimeout(resolve, 300))
      ]);
      if (res?.isSuccess) {
        dispatch(handleLoader(false));
        let filtered = res.data || [];
        if (payload.searchName) {
          const q = payload.searchName.toLowerCase().trim();
          filtered = filtered.filter(r =>
            (r.roleName || "").toLowerCase().includes(q) ||
            (r.organizationId?.organizationName || "").toLowerCase().includes(q)
          );
        }
        setRoleList(filtered);
        setTotalRecords(filtered.length);
      } else {
        Toast.error(res?.message || t("Failed to fetch roles"));
      }
    } catch (err) {
      Toast.error(t("Something went wrong"));
    } finally {
      setLoadingGrid(false);
    }
  };

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const res = await ApiDeleteRole({ id: showDeleteModal?._id });
    if (res?.isSuccess) {
      Toast.success(res?.message || t("Role deleted successfully."));
      ApiListing();
    } else {
      Toast.error(res?.message || t("Failed to delete role."));
    }
  };

  const columns = [
    ...(PermissionCheck(SYSTEM_PAGES.ROLE, PAGE_ACTIONS.UPDATE) || PermissionCheck(SYSTEM_PAGES.ROLE, PAGE_ACTIONS.REMOVE) ? [
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
          const isSystemRole = ["owner", "admin", "manager", "client", "super admin", "super_admin"].includes((row.roleName || "").toLowerCase()) && !row.organizationId;
          return (
            <div className="action_container gap-2 flex items-center">
              {(!isSystemRole || row.organizationId) && (
                <>
                  {PermissionCheck(SYSTEM_PAGES.ROLE, PAGE_ACTIONS.UPDATE) && (
                    <i
                      className="fa fa-pencil cursor-pointer text-slate-600 hover:text-blue-500 dark:text-slate-300 dark:hover:text-blue-400 transition-colors"
                      title={t("Edit Role")}
                      onClick={() => { setSelectedRole(row); setOpenEditModal(true); }}
                    />
                  )}
                  {PermissionCheck(SYSTEM_PAGES.ROLE, PAGE_ACTIONS.REMOVE) && (
                    <i
                      className="fa fa-trash cursor-pointer text-slate-600 hover:text-red-500 dark:text-slate-300 dark:hover:text-red-400 transition-colors"
                      title={t("Delete Role")}
                      onClick={() => setShowDeleteModal(row)}
                    />
                  )}
                </>
              )}
              {isSystemRole && (
                <span className="text-[11px] text-slate-400 italic">{t("System")}</span>
              )}
            </div>
          );
        },
      }
    ] : []),
    {
      headerName: t("Role Name"),
      field: "roleName",
      title: "Role Name",
      minWidth: 200,
      sortable: true,
      resizable: true,
      cellRenderer: (params) => {
        return (
          <span className="font-semibold text-slate-800 dark:text-slate-100">
            {params.value || "-"}
          </span>
        );
      }
    },
    {
      headerName: t("Organization"),
      field: "organizationId.organizationName",
      title: "Organization",
      minWidth: 220,
      sortable: true,
      resizable: true,
      cellRenderer: (params) => {
        const org = params.data?.organizationId;
        if (!org || !org.organizationName) {
          return (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {t("System / Global")}
            </span>
          );
        }
        return (
          <span className="font-semibold text-blue-600 dark:text-blue-400">
            {org.organizationName}
          </span>
        );
      }
    },
    {
      headerName: t("Created At"),
      field: "createdAt",
      title: "Created At",
      minWidth: 180,
      sortable: true,
      resizable: true,
      cellRenderer: (params) => {
        if (!params?.data?.createdAt) return "-";
        const date = new Date(params.data.createdAt);
        return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
      }
    }
  ];

  return (
    <>
      <Filter
        name={t("Admin Roles")}
        nameShow={false}
        dateShow={false}
        profileShow={true}
      />
      <div className="flex flex-col gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden glass-grid-container">
          <div className="camapgin_btn flex flex-wrap justify-between items-center gap-3 pt-4 pb-2 px-6">
            <div className="flex items-center">
              <CardTitle className="m-0 flex items-center cron-title-bar" style={{ fontSize: 14, fontWeight: 700, color: isDark ? "#f8fafc" : "#0F172A" }}>
                {t("Roles")}
              </CardTitle>
            </div>

            <div className="flex items-center gap-3">
              <div id="roles-search" className="relative flex items-center" style={{ width: isMobile ? "100%" : "240px" }}>
                <Input
                  type="text"
                  placeholder={t("Search roles or organizations...")}
                  value={searchName}
                  onChange={(e) => setSearchName(e.target.value)}
                  className="shadcn-search-input pr-8 text-xs h-9"
                />
                {searchName && (
                  <MdOutlineClose
                    onClick={() => setSearchName("")}
                    className="absolute right-2.5 cursor-pointer opacity-70 hover:opacity-100 dark:text-slate-300"
                    style={{ fontSize: "16px" }}
                  />
                )}
              </div>

              {PermissionCheck(SYSTEM_PAGES.ROLE, PAGE_ACTIONS.CREATE) && (
                <div id="roles-add-btn" className="flex items-center">
                  <Button
                    onClick={() => { setSelectedRole(null); setOpenEditModal(true); }}
                    className="h-9 px-4 rounded-md font-semibold text-white transition-all hover:opacity-90 flex items-center gap-2"
                    style={{
                      background: "linear-gradient(135deg, #2374F2, #1A9FD4)",
                      fontSize: "12px",
                    }}
                  >
                    <i className="fa fa-plus" />
                    {t("Add Role")}
                  </Button>
                </div>
              )}
            </div>
          </div>
          <div id="admin-roles-main-table" className="data_table position-relative w-full max-w-full">
            <AgTable
              onRefresh={ApiListing} ref={gridRef}
              tableId="admin-roles-main-table"
              height={"65vh"}
              rowData={roleList}
              columnDefs={columns}
              totalRecords={totalRecords}
              perPage={perPage}
              currentPage={arg.pageNo}
              onPageChange={handlePageChange}
              onPerPageChange={handlePerRowsChange}
              onSortChanged={handleSortChanged}
              paginationOptions={paginationRowsPerPageOptions}
              isCustomSaveColumns={true}
              customSaveColumnName={"AdminRoles"}
              handleSaveColumns={undefined}
              loading={loadingGrid}
            />
          </div>
        </div>

        <EditAdminRoleModal
          open={openEditModal}
          onClose={() => { setOpenEditModal(false); ApiListing(); }}
          role={selectedRole}
          onSave={() => ApiListing()}
        />

        <CustomModal
          show={!!showDeleteModal?._id}
          onHide={() => setShowDeleteModal(null)}
          title={t("Delete Role")}
          subtitle={t("Permanent action")}
          icon="delete"
          iconVariant="danger"
          message={`You are about to <span class="cm-highlight">permanently delete</span> <span class="cm-highlight">${showDeleteModal?.roleName}</span>.`}
          alertText="This action cannot be undone. Any users assigned this role will lose their permissions."
          alertVariant="danger"
          closeOnBackdrop={false}
          actions={[
            { label: t("Cancel"), cancel: true, icon: "close", onClick: () => setShowDeleteModal(null) },
            { label: t("Delete"), variant: "danger", icon: "delete", onClick: () => { deleteHandler(); setShowDeleteModal(null); } },
          ]}
        />
      </div>
    </>
  );
};

export default AdminRoles;
