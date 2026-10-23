import { SYSTEM_PAGES, PAGE_ACTIONS } from "src/common/constants";
import { t } from "i18next";
import { useEffect, useState, useRef, useCallback } from "react";
import ReactDOM from "react-dom";
import { useTranslation } from "react-i18next";
import AgTable from "../../../common/grid/AgTable";

import Toast from "../../../common/helper/toast/Toast";
import Filter from "../../../helper/filter/Filter";
import { CustomModal } from "../../../helper/modal/CustomModal";
import { Switch } from "../../../components/ui/switch";
import EditPackageModal from "./EditPackageModal";
import { firstPageRows, paginationRowsPerPageOptions } from "../../../helper/table/TableStyle";

import {
  ApiPackageList,
  ApiCreatePackage,
  ApiUpdatePackage,
  ApiDeletePackage,
  ApiChangeStatusPackage,
} from "../../../api-wrapper/ApiPackages";
import { PermissionCheck } from "../../../helper/permission/PermissionCheck";
import { Button } from "../../../components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "src/components/ui/card";
import { AppTooltip } from "../../../components/ui/AppTooltip";

// Portal-based tooltip immune to AG-Grid CSS transform offsets

const Packages = () => {
  const { t } = useTranslation();
  const [packages, setPackages] = useState([]);
  const [openModal, setOpenModal] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(null);
  const [replacementPlanId, setReplacementPlanId] = useState("");

  const [isDark, setIsDark] = useState(document.documentElement.getAttribute("data-theme") === "dark");

  useEffect(() => {
    const handle = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    const observer = new MutationObserver(handle);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  const gridRef = useRef(null);

  const [loadingGrid, setLoadingGrid] = useState(false);

  /* -------------------- API LIST -------------------- */
  const fetchPackages = async (skip = false) => {
    setLoadingGrid(true);
    try {
      const res = await ApiPackageList(undefined, skip);
      if (res?.isSuccess) {
        setPackages(res.data);
      } else {
        Toast.error(res.message);
      }
    } catch {
      Toast.error(t("Something went wrong"));
    } finally {
      setLoadingGrid(false);
    }
  };

  useEffect(() => {
    fetchPackages();
  }, []);

  /* -------------------- SAVE -------------------- */
  const savePackage = async (data) => {
    try {
      const apiCall = data.packageId ? ApiUpdatePackage : ApiCreatePackage;
      const res = await apiCall(data);
      if (res?.isSuccess) {
        Toast.success(res.message);
        setOpenModal(false);
        fetchPackages();
      } else {
        Toast.error(res.message);
      }
    } catch {
      Toast.error(t("Something went wrong"));
    }
  };

  /* -------------------- DELETE -------------------- */
  const deleteHandler = async () => {
    try {
      const res = await ApiDeletePackage({ 
        packageId: showDeleteModal?._id, 
        newPlanId: replacementPlanId 
      });
      if (res?.isSuccess) {
        Toast.success(res.message);
        fetchPackages();
      } else {
        Toast.error(res.message);
      }
    } catch {
      Toast.error(t("Something went wrong"));
    } finally {
      setShowDeleteModal(null);
      setReplacementPlanId("");
    }
  };

  /* -------------------- STATUS TOGGLE -------------------- */
  const toggleStatus = async (row) => {
    try {
      const res = await ApiChangeStatusPackage({ packageId: row?._id, isActive: !row.isActive });
      if (res?.isSuccess) {
        Toast.success(res.message ?? "Status updated");
        fetchPackages();
      } else {
        Toast.error(res.message);
      }
    } catch {
      Toast.error(t("Something went wrong"));
    }
  };

  /* -------------------- TABLE COLUMNS -------------------- */
  const columns = [
    ...(PermissionCheck(SYSTEM_PAGES.PLANS, PAGE_ACTIONS.UPDATE) || PermissionCheck(SYSTEM_PAGES.PLANS, PAGE_ACTIONS.REMOVE) ? [
      {
        headerName: t("Action"),
        field: "action",
        title: t("Action"),
        width: 110,
        sortable: false,
        resizable: false,
        cellRenderer: (params) => {
          const row = params.data;
          if (!row) return null;
          return (
            <div className="action_container gap-2 flex items-center" style={{ height: "100%" }}>
              {PermissionCheck(SYSTEM_PAGES.PLANS, PAGE_ACTIONS.UPDATE) && (
                <AppTooltip text={t("Edit Plan")}>
                  <i
                    className="fa fa-pencil cursor-pointer"
                    onClick={() => { setSelectedPackage(row); setOpenModal(true); }}
                  />
                </AppTooltip>
              )}
              {PermissionCheck(SYSTEM_PAGES.PLANS, PAGE_ACTIONS.REMOVE) && (
                <AppTooltip text={t("Delete Plan")}>
                  <i
                    className="fa fa-trash cursor-pointer"
                    onClick={() => setShowDeleteModal(row)}
                  />
                </AppTooltip>
              )}
            </div>
          );
        },
      },
    ] : []),
    ...(PermissionCheck(SYSTEM_PAGES.PLANS, PAGE_ACTIONS.UPDATE) ? [
      {
        headerName: t("Status"),
        field: "isActive",
        title: t("Status"),
        width: 100,
        sortable: false,
        resizable: false,
        cellRenderer: (params) => {
          const row = params.data;
          if (!row) return null;
          return (
            <div className="flex items-center" style={{ height: "100%" }}>
              <div className="flex items-center justify-center w-full h-full pt-[3px]">
                <Switch
                  checked={row.isActive}
                  onCheckedChange={() => toggleStatus(row)}
                />
              </div>
            </div>
          );
        },
      },
    ] : []),
    ...(PermissionCheck(SYSTEM_PAGES.PLANS, PAGE_ACTIONS.UPDATE) ? [
      {
        headerName: t("Public"),
        field: "isPublic",
        title: t("Public"),
        width: 100,
        sortable: false,
        resizable: false,
        cellRenderer: (params) => {
          const row = params.data;
          if (!row) return null;
          return (
            <div className="flex items-center" style={{ height: "100%" }}>
              <div className="flex items-center justify-center w-full h-full pt-[3px]">
                {row.isPublic !== false ? (
                  <span className="text-green-500 font-bold text-xs"><i className="fa fa-globe mr-1" /> {t("Public")}</span>
                ) : (
                  <span className="text-gray-500 font-bold text-xs"><i className="fa fa-lock mr-1" /> {t("Private")}</span>
                )}
              </div>
            </div>
          );
        },
      },
    ] : []),
    {
      headerName: t("Plan Name"),
      field: "name",
      title: t("Plan Name"),
      minWidth: 180,
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
      cellRenderer: (params) => <span className={`fw-bold ${isDark ? "text-light" : "text-dark"}`}>{params.value}</span>
    },
    {
      headerName: t("Monthly / Yearly Price"),
      field: "price",
      title: t("Monthly / Yearly Price"),
      minWidth: 160,
      sortable: true,
      resizable: true,
      cellRenderer: (params) => {
        const row = params.data;
        if (!row) return null;
        const monthly = row.monthlyPrice !== undefined ? row.monthlyPrice : row.price;
        const yearly = row.yearlyPrice || 0;
        return (
          <div className="flex flex-col justify-center py-1">
            <div className="flex gap-1 items-baseline">
              <span className={`fw-bold ${isDark ? "text-light" : "text-dark"}`}>{monthly ?? 0}</span>
              <span className={isDark ? "text-gray-500" : "text-secondary"} style={{ fontSize: "11px" }}>{row.currency ?? "INR"} / mo</span>
            </div>
            {yearly > 0 && (
              <div className="flex gap-1 items-baseline text-xs text-blue-500 font-semibold">
                <span>{yearly}</span>
                <span style={{ fontSize: "10px" }}>{row.currency ?? "INR"} / yr</span>
              </div>
            )}
          </div>
        );
      },
    },
    {
      headerName: t("Trial Days"),
      field: "trialDays",
      title: t("Trial Days"),
      minWidth: 120,
      sortable: true,
      resizable: true,
      cellRenderer: (params) => <span className={`fw-semibold ${isDark ? "text-light" : "text-dark"}`}>{params.value || 0}</span>,
    },
    {
      headerName: t("Amazon Connection"),
      field: "allowAmazonConnection",
      title: t("Amazon Connection"),
      minWidth: 160,
      sortable: false,
      resizable: true,
      cellRenderer: (params) => <span className={`fw-semibold ${isDark ? "text-gray-500" : "text-secondary"}`}>{params.data?.amazonConnectLimit !== undefined ? params.data.amazonConnectLimit : (params.value ?? 0)}</span>
    },
    {
      headerName: t("Profile Limit"),
      field: "profileLimit",
      title: t("Profile Limit"),
      minWidth: 130,
      sortable: false,
      resizable: true,
      cellRenderer: (params) => <span className={`fw-semibold ${isDark ? "text-gray-400" : "text-secondary"}`}>{params.value || 0}</span>
    },
    {
      headerName: t("Invites Limit"),
      field: "numberOfInvites",
      title: t("Invites Limit"),
      minWidth: 130,
      sortable: false,
      resizable: true,
      cellRenderer: (params) => <span className={`fw-semibold ${isDark ? "text-gray-400" : "text-secondary"}`}>{params.value || 0}</span>
    },
  ];

  return (
    <>
      <Filter
        name={t("Subscription Plans")}
        nameShow={false}
        dateShow={false}
        profileShow={false}
      />

      <div className="middle_container budget_container">
        <div className="data_content data_content_btn glass-grid-container h-maxContent" style={{ marginTop: "12px" }}>
          <div className="camapgin_btn flex flex-wrap justify-between items-center gap-3 pt-4 pb-2 px-6">
            <div className="flex items-center">
              <CardTitle className="m-0 flex items-center cron-title-bar" style={{ fontSize: 14, color: isDark ? "#cbd5e1e0" : "#0F172A" }}>
                {t("Subscription Plans")}
              </CardTitle>
            </div>

            {PermissionCheck(SYSTEM_PAGES.PLANS, PAGE_ACTIONS.CREATE) && (
              <div id="packages-add-btn" className="flex items-center">
                <Button
                  onClick={() => {
                    setSelectedPackage(null);
                    setOpenModal(true);
                  }}
                  className="h-9 px-4 rounded-md font-semibold text-white transition-all hover:opacity-90 flex items-center gap-2"
                  style={{
                    background: "linear-gradient(135deg, #2374F2, #1A9FD4)",
                    fontSize: "12px",
                  }}
                >
                  <i className="fa fa-plus" />
                  {t("Add Plan")}
                </Button>
              </div>
            )}
          </div>

          <div className="p-0">
            <div className="data_table">
              <AgTable ref={gridRef}
                tableId="packages-main-table"
                loading={loadingGrid}
                onRefresh={() => fetchPackages(true)}
                rowData={packages}
                columnDefs={columns}
                totalRecords={packages?.length ?? 0}
                perPage={packages?.length ?? firstPageRows}
                currentPage={1}
                onPageChange={() => { }}
                onPerPageChange={() => { }}
                onSortChanged={() => { }}
                paginationOptions={paginationRowsPerPageOptions}
                isCustomSaveColumns={true}
                customSaveColumnName={"Subscription Plans"}
                handleSaveColumns={undefined}
              />
            </div>
          </div>
        </div>

        {/* Add / Edit */}
        <EditPackageModal
          open={openModal}
          onClose={() => setOpenModal(false)}
          plan={selectedPackage}
          onSave={savePackage}
        />

        {/* Delete */}
        <CustomModal
          show={!!showDeleteModal}
          onHide={() => { setShowDeleteModal(null); setReplacementPlanId(""); }}
          title={t("Delete Plan")}
          subtitle={showDeleteModal?.name}
          icon="delete"
          iconVariant="danger"
          message={`Are you sure you want to delete <span class="cm-highlight">${showDeleteModal?.name}</span>?`}
          actions={[
            { label: t("Cancel"), cancel: true, icon: "close", onClick: () => { setShowDeleteModal(null); setReplacementPlanId(""); } },
            { 
              label: t("Delete"), 
              variant: "danger", 
              icon: "delete", 
              onClick: deleteHandler,
              disabled: packages.filter(p => p._id !== showDeleteModal?._id).length > 0 && !replacementPlanId
            },
          ]}
        >
          {packages.filter(p => p._id !== showDeleteModal?._id).length > 0 && (
            <div className="mt-4 text-left w-full">
              <label className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                {t("Assign users to a new plan")} <span className="text-red-500">*</span>
              </label>
              <select
                className="w-full p-2 border rounded-md dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                value={replacementPlanId}
                onChange={(e) => setReplacementPlanId(e.target.value)}
              >
                <option value="">{t("Select a replacement plan...")}</option>
                {packages.filter(p => p._id !== showDeleteModal?._id).map(p => (
                  <option key={p._id} value={p._id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}
        </CustomModal>
      </div>
    </>
  );
};

export default Packages;
