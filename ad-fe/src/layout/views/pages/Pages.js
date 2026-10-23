import { t } from "i18next";
import Toast from "../../../common/helper/toast/Toast";
import Filter from "../../../helper/filter/Filter";
import { useEffect, useState, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Switch } from "../../../components/ui/switch";
import AgTable from "../../../common/grid/AgTable";
import { firstPageRows, paginationRowsPerPageOptions } from "../../../helper/table/TableStyle";
import { ApiGetAllPages, ApiCreatePages, ApiUpdatePages, ApiRemovePages, ApiStatusChangePages } from "../../../api-wrapper/ApiPages";
import { CustomModal } from "../../../helper/modal/CustomModal";
import { MdOutlineClose } from "react-icons/md";
import { AppTooltip } from "../../../components/ui/AppTooltip";

// ─── Add / Edit Page Modal ────────────────────────────────────────────────────
const PageFormModal = ({ show, onClose, onSave, selectedPage }) => {
  const isEdit = !!selectedPage;
  const [form, setForm] = useState({ pageSlug: "", pageName: "", displayName: "", order: 0 });

  useEffect(() => {
    if (selectedPage) {
      setForm({
        pageSlug: selectedPage.pageSlug || selectedPage.pageId || "",
        pageName: selectedPage.pageName || "",
        displayName: selectedPage.displayName || "",
        order: selectedPage.order !== undefined ? selectedPage.order : 0,
      });
    } else {
      setForm({ pageSlug: "", pageName: "", displayName: "", order: 0 });
    }
  }, [selectedPage, show]);

  const handleSubmit = () => {
    if (!form.pageSlug.trim()) return Toast.error(t("Page slug is required"));
    if (!form.pageName.trim()) return Toast.error(t("Page name is required"));
    if (!form.displayName.trim()) return Toast.error(t("Display name is required"));
    onSave(isEdit ? { ...form, order: Number(form.order) || 0, _id: selectedPage._id, id: selectedPage._id } : { ...form, order: Number(form.order) || 0 });
  };

  return (
    <Dialog open={show} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent 
        className="sm:max-w-[600px] premium-modal modal-content p-0 flex flex-col max-h-[90vh] overflow-hidden"
        onInteractOutside={(e) => e.preventDefault()} 
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="modal-header border-b-0 p-4 pb-0">
          <DialogTitle className="modal-title">{isEdit ? t("Edit Page") : t("Add Page")}</DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto flex-1 p-6">
          <div id="page-slug-field" className="mb-3">
            <label className="mb-2 block font-semibold text-sm text-slate-800 dark:text-slate-200">
              {t("Page Slug")} <span className="text-red-500">*</span>
            </label>
            <Input
              type="text"
              placeholder={t("Enter page slug")}
              value={form.pageSlug}
              onChange={(e) => setForm((p) => ({ ...p, pageSlug: e.target.value }))}
            />
          </div>
          <div id="page-name-field" className="mb-3">
            <label className="mb-2 block font-semibold text-sm text-slate-800 dark:text-slate-200">
              {t("Page Name")} <span className="text-red-500">*</span>
            </label>
            <Input
              type="text"
              placeholder={t("Enter page name")}
              value={form.pageName}
              onChange={(e) => setForm((p) => ({ ...p, pageName: e.target.value }))}
            />
          </div>
          <div id="display-name-field" className="mb-3">
            <label className="mb-2 block font-semibold text-sm text-slate-800 dark:text-slate-200">
              {t("Display Name")} <span className="text-red-500">*</span>
            </label>
            <Input
              type="text"
              placeholder={t("Enter display name")}
              value={form.displayName}
              onChange={(e) => setForm((p) => ({ ...p, displayName: e.target.value }))}
            />
          </div>
          <div id="order-field" className="mb-3">
            <label className="mb-2 block font-semibold text-sm text-slate-800 dark:text-slate-200">
              {t("Order")}
            </label>
            <Input
              type="number"
              placeholder={t("Enter order number")}
              value={form.order}
              onChange={(e) => setForm((p) => ({ ...p, order: e.target.value }))}
            />
          </div>
        </div>
        <DialogFooter style={{ borderTop: "1px solid var(--glass-border, rgba(148, 163, 184, 0.15))", padding: "12px 24px" }}>
          <div className="w-full flex justify-end gap-2">
            <button type="button" id="page-cancel-btn" className="btn-premium-secondary" onClick={onClose}>
              {t("Cancel")}
            </button>
            <button type="button" id="page-save-btn" className="btn-premium-primary" onClick={handleSubmit}>
              {isEdit ? t("Update") : t("Save")}
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ─── Main Pages Component ─────────────────────────────────────────────────────
const Pages = () => {
  const [arg, setArg] = useState({ pageNo: 1, perPage: firstPageRows });
  const [perPage, setPerPage] = useState(firstPageRows);

  const [pageList, setPageList] = useState([]);
  const [pagesData, setPagesData] = useState([]);
  const [searchName, setSearchName] = useState("");
  const [debouncedSearchName, setDebouncedSearchName] = useState("");
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [isSearching, setIsSearching] = useState(false);
  const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");

  useEffect(() => {
    const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    const observer = new MutationObserver(handle);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchName(searchName);
    }, 350);
    return () => clearTimeout(handler);
  }, [searchName]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const [openFormModal, setOpenFormModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState({ show: false, row: null, loading: false });
  const [statusModal, setStatusModal] = useState({ show: false, row: null, loading: false, newStatus: false });
  const [selectedPage, setSelectedPage] = useState(null);

  const gridRef = useRef(null);

  const ApiListing = async (extraArgs = {}) => {
    const payload = {
      pageNo: arg.pageNo,
      perPage: arg.perPage,
      search: debouncedSearchName,
      fieldName: "order",
      sortType: 1,
      ...extraArgs,
    };

    setIsSearching(true);
    await ApiGetAllPages(payload, true)
      .then((res) => {
        if (res?.isSuccess) {
          setPageList(res.data);
          setPagesData(res);
        } else {
          Toast.error(res?.message || t("Failed to fetch pages"));
        }
      })
      .catch(() => Toast.error(t("Something went wrong")))
      .finally(() => setIsSearching(false));
  };

  useEffect(() => {
    if (debouncedSearchName !== undefined) {
      setArg((prev) => ({ ...prev, pageNo: 1 }));
      ApiListing({ search: debouncedSearchName, pageNo: 1 });
    }
  }, [debouncedSearchName]);

  useEffect(() => {
    ApiListing();
  }, []);

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
    ApiListing({
      fieldName: colId,
      ...(sort && { sortType: sort === "asc" ? 1 : -1 }),
      ...arg,
    });
  };

  const handleSave = async (data) => {
    const isEdit = !!data._id || (selectedPage && !!selectedPage._id);
    const apiFn = isEdit ? ApiUpdatePages : ApiCreatePages;
    await apiFn(data)
      .then((res) => {
        if (res?.isSuccess) {
          Toast.success(res.message);
          setOpenFormModal(false);
          setSelectedPage(null);
          ApiListing();
        } else Toast.error(res?.message);
      })
      .catch(() => Toast.error(t("Something went wrong")));
  };

  const handleDelete = async () => {
    setDeleteModal((prev) => ({ ...prev, loading: true }));
    await ApiRemovePages({ _id: deleteModal.row?._id, pageId: deleteModal.row?._id })
      .then((res) => {
        if (res?.isSuccess) {
          Toast.success(res.message);
          setDeleteModal({ show: false, row: null, loading: false });
          ApiListing();
        } else {
          Toast.error(res?.message);
          setDeleteModal((prev) => ({ ...prev, loading: false }));
        }
      })
      .catch(() => {
        Toast.error(t("Something went wrong"));
        setDeleteModal((prev) => ({ ...prev, loading: false }));
      });
  };

  const handleStatusChange = async (row) => {
    setStatusModal({
      show: true,
      row: row,
      loading: false,
      newStatus: !row.isActive
    });
  };

  const confirmStatusChange = async () => {
    setStatusModal((prev) => ({ ...prev, loading: true }));
    await ApiStatusChangePages({ _id: statusModal.row._id, pageId: statusModal.row._id })
      .then((res) => {
        if (res?.isSuccess) {
          Toast.success(res.message);
          setStatusModal({ show: false, row: null, loading: false, newStatus: false });
          ApiListing();
        } else {
          Toast.error(res?.message);
          setStatusModal((prev) => ({ ...prev, loading: false }));
        }
      })
      .catch(() => {
        Toast.error(t("Something went wrong"));
        setStatusModal((prev) => ({ ...prev, loading: false }));
      });
  };

  const columns = [
    {
      headerName: t("PAGE SLUG"),
      field: "pageSlug",
      title: t("PAGE SLUG"),
      minWidth: 180,
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        return (
          <div style={{ display: "flex", alignItems: "center", padding: "10px 8px" }}>
            <span style={{ color: "var(--text-primary)", fontWeight: "600", fontSize: "13px" }}>
              {row.pageSlug || row.pageId}
            </span>
          </div>
        );
      },
    },
    {
      headerName: t("PAGE NAME"),
      field: "pageName",
      title: t("PAGE NAME"),
      minWidth: 200,
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        return (
          <div style={{ display: "flex", alignItems: "center", padding: "10px 8px" }}>
            <span style={{ color: "var(--text-primary)", fontWeight: "600", fontSize: "13px" }}>
              {row.pageName}
            </span>
          </div>
        );
      },
    },
    {
      headerName: t("DISPLAY NAME"),
      field: "displayName",
      title: t("DISPLAY NAME"),
      minWidth: 200,
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        return (
          <div style={{ display: "flex", alignItems: "center", padding: "10px 8px" }}>
            <span style={{ color: "#64748b", fontSize: "13px" }}>
              {row.displayName}
            </span>
          </div>
        );
      },
    },
    {
      headerName: t("ORDER"),
      field: "order",
      title: t("ORDER"),
      minWidth: 110,
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        return (
          <div style={{ display: "flex", alignItems: "center", padding: "10px 8px" }}>
            <span style={{ color: "var(--text-primary)", fontWeight: "600", fontSize: "13px" }}>
              {row.order ?? 0}
            </span>
          </div>
        );
      },
    },
    {
      headerName: t("STATUS"),
      field: "isActive",
      title: t("STATUS"),
      minWidth: 120,
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        return (
          <div style={{ display: "flex", alignItems: "center", padding: "10px 8px" }}>
            <div id={params.node.rowIndex === 0 ? "page-status-toggle" : undefined} className="m-0 flex items-center">
              <Switch
                checked={row.isActive}
                onCheckedChange={() => handleStatusChange(row)}
              />
            </div>
          </div>
        );
      },
    },
    {
      headerName: t("SETTING"),
      field: "setting",
      title: t("SETTING"),
      minWidth: 50,
      sortable: false,
      resizable: true,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        return (
          <div className="action_container gap-3" style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", padding: "10px 12px" }}>
            <AppTooltip text={t("Edit Page")}>
              <i
                id={params.node.rowIndex === 0 ? "page-edit-btn" : undefined}
                className="fa fa-pencil cursor-pointer"
                onClick={() => { setSelectedPage(row); setOpenFormModal(true); }}
              />
            </AppTooltip>
            <AppTooltip text={t("Delete Page")}>
              <i
                id={params.node.rowIndex === 0 ? "page-delete-btn" : undefined}
                className="fa fa-trash cursor-pointer"
                onClick={() => setDeleteModal({ show: true, row, loading: false })}
              />
            </AppTooltip>
          </div>
        );
      },
    },
  ];

  return (
    <>
      <Filter
        name={"Pages"}
        nameShow={false}
        dateShow={false}
        profileShow={true}
      />

      <div className="middle_container">
        <div className="glass-grid-container overflow-hidden">
          <div className="data_model_btn camapgin_btn" style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px 24px",
            gap: "12px",
            borderBottom: "1px solid rgba(148, 163, 184, 0.15)",
          }}>
            <div className="flex items-center">
              <h5 style={{ fontWeight: 700, margin: 0, fontSize: "18px", color: "var(--text-primary)" }}>
                {t("Pages")}
                {isSearching && <i className="fa fa-spinner fa-spin ml-2 text-gray-500" style={{ fontSize: "14px" }} />}
              </h5>
            </div>

            <div className={`flex ${isMobile ? "flex-col w-full" : "flex-row items-center"} gap-2`}>
              <div id="pages-search" className="search_option m-0" style={{
                display: "flex",
                alignItems: "center",
                position: "relative",
                width: isMobile ? "100%" : "auto",
                minWidth: isMobile ? "100%" : "220px",
                flexGrow: 1,
                backgroundColor: isDark ? "#1e293b" : "#fff",
                border: isDark ? "1px solid #334155" : "1px solid #cbd5e1"
              }}>
                <Input type="text"
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

              <div id="pages-add-btn">
                <button
                  onClick={() => {
                    setSelectedPage(null);
                    setOpenFormModal(true);
                  }}
                  className="improve add_btn m-0 gap-0"
                  style={{
                    height: "40px",
                    whiteSpace: "nowrap",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "0 18px"
                  }}
                >
                  <i className="fa fa-plus mr-1" style={{ fontSize: 13 }} />
                  {t("Add Page")}
                </button>
              </div>
            </div>
          </div>

          <div className="data_table" style={{ padding: "0 14px 14px 14px" }}>
            <AgTable
              onRefresh={ApiListing} ref={gridRef}
              tableId="pages-main-table"
              height={"60vh"}
              loading={isSearching}
              rowData={pageList}
              columnDefs={columns}
              totalRecords={pagesData?.totalRecords ?? 0}
              perPage={perPage}
              currentPage={arg.pageNo}
              onPageChange={handlePageChange}
              onPerPageChange={handlePerRowsChange}
              onSortChanged={handleSortChanged}
              paginationOptions={paginationRowsPerPageOptions}
              isCustomSaveColumns={true}
              customSaveColumnName={"Pages"}
              handleSaveColumns={undefined}
            />
          </div>
        </div>
      </div>

      <PageFormModal
        show={openFormModal}
        onClose={() => { setOpenFormModal(false); setSelectedPage(null); }}
        onSave={handleSave}
        selectedPage={selectedPage}
      />

      <CustomModal
        show={deleteModal.show}
        onHide={() => setDeleteModal({ show: false, row: null, loading: false })}
        title={t("Delete Page")}
        subtitle={deleteModal.row?.pageName}
        icon="delete_outline"
        iconVariant="danger"
        message={t("Are you sure you want to delete this page? This will also remove all associated page actions and cannot be undone.")}
        alertText={t("This action is permanent and cannot be reversed.")}
        alertVariant="danger"
        actions={[
          {
            label: deleteModal.loading ? t("Deleting...") : t("Yes, Delete"),
            variant: "danger",
            icon: "delete_outline",
            onClick: handleDelete,
            disabled: deleteModal.loading,
          },
          {
            label: t("Cancel"),
            cancel: true,
            onClick: () => setDeleteModal({ show: false, row: null, loading: false }),
            disabled: deleteModal.loading,
          },
        ]}
      />

      <CustomModal
        show={statusModal.show}
        onHide={() => setStatusModal({ show: false, row: null, loading: false, newStatus: false })}
        title={statusModal.newStatus ? t("Activate Page") : t("Deactivate Page")}
        subtitle={statusModal.row?.pageName}
        icon={statusModal.newStatus ? "check_circle_outline" : "block"}
        iconVariant={statusModal.newStatus ? "success" : "primary"}
        message={statusModal.newStatus ? t("Are you sure you want to activate this page?") : t("Are you sure you want to deactivate this page?")}
        alertText={statusModal.newStatus ? t("The page will be visible and accessible to users.") : t("The page will be hidden and inaccessible to users.")}
        alertVariant={statusModal.newStatus ? "success" : "primary"}
        actions={[
          {
            label: statusModal.loading ? t("Processing...") : statusModal.newStatus ? t("Yes, Activate") : t("Yes, Deactivate"),
            variant: statusModal.newStatus ? "success" : "primary",
            icon: statusModal.newStatus ? "check_circle_outline" : "block",
            onClick: confirmStatusChange,
            disabled: statusModal.loading,
          },
          {
            label: t("Cancel"),
            cancel: true,
            onClick: () => setStatusModal({ show: false, row: null, loading: false, newStatus: false }),
            disabled: statusModal.loading,
          },
        ]}
      />
    </>
  );
};

export default Pages;