import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import moment from "moment";
import AgTable from "../../../common/grid/AgTable";
import Toast from "../../../common/helper/toast/Toast";
import Filter from "../../../helper/filter/Filter";
import { CustomModal } from "../../../helper/modal/CustomModal";
import { Switch } from "../../../components/ui/switch";
import { Button } from "../../../components/ui/button";
import { CardTitle } from "src/components/ui/card";
import { AppTooltip } from "../../../components/ui/AppTooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { paginationRowsPerPageOptions } from "../../../helper/table/TableStyle";
import { countryName, countryOptions, currencySymbol } from "../../../common/constants/countries";
import RegionModal from "./RegionModal";
import {
  ApiPricingRegionList,
  ApiCreatePricingRegion,
  ApiUpdatePricingRegion,
  ApiChangePricingRegionStatus,
  ApiDeletePricingRegion,
  ApiPreviewPricingCountry,
  ApiOrganizationBillingList,
  ApiUpdateOrganizationBilling,
  ApiDetectPricingCountry,
} from "../../../api-wrapper/ApiPricingRegions";

const fixedGrid = { resizable: true, sortable: false };
const GRID_AUTO_SIZE = { type: "fitGridWidth" };
const fitColumns = (p) => p?.api?.sizeColumnsToFit?.();
// Small lists: size the grid to its rows (no fixed 100vh grid with empty space), columns stretched to the width.
const HEADER_PX = 52;
const gridHeight = (rowHeights) => `${HEADER_PX + Math.max(rowHeights.reduce((a, b) => a + b, 0), 88) + 4}px`;
const regionRowPx = (r) => Math.max(46, (r.prices?.length || 0) * 20 + 18, Math.ceil((r.countries?.length || 0) / 14) * 26 + 14);
const compactGrid = {
  minHeight: "0",
  showPagination: false,
  autoSizeStrategy: GRID_AUTO_SIZE,
  onGridSizeChanged: fitColumns,
  onFirstDataRendered: fitColumns,
  suppressHorizontalScroll: true,
};

function CountryPicker({ value, onChange, placeholder, className = "w-[230px]" }) {
  const { i18n } = useTranslation();
  const options = useMemo(() => countryOptions(i18n.language), [i18n.language]);
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger className={`h-9 text-xs ${className}`}>
        <SelectValue placeholder={placeholder}>{value ? `${countryName(value, i18n.language)} (${value})` : placeholder}</SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-[300px]">
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const RegionalPricing = () => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [regions, setRegions] = useState([]);
  const [plans, setPlans] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [orgLoading, setOrgLoading] = useState(false);
  const [modal, setModal] = useState({ open: false, region: null });
  const [saving, setSaving] = useState(false);
  const [deleteRow, setDeleteRow] = useState(null);
  const [detected, setDetected] = useState(null);
  const [previewCountry, setPreviewCountry] = useState("");
  const [preview, setPreview] = useState(null);
  const [setCountryFor, setSetCountryFor] = useState(null);
  const [newCountry, setNewCountry] = useState("");
  const regionGrid = useRef(null);
  const orgGrid = useRef(null);

  const fetchRegions = useCallback(async (skip = false) => {
    setLoading(true);
    const res = await ApiPricingRegionList(skip);
    if (res?.isSuccess) {
      setRegions(res.data || []);
      setPlans(res.plans || []);
    } else Toast.error(res?.message || t("Something went wrong"));
    setLoading(false);
  }, [t]);

  const fetchOrgs = useCallback(async (skip = false) => {
    setOrgLoading(true);
    const res = await ApiOrganizationBillingList(skip);
    if (res?.isSuccess) setOrgs(res.data || []);
    setOrgLoading(false);
  }, []);

  useEffect(() => {
    fetchRegions();
    fetchOrgs(true);
    ApiDetectPricingCountry().then((res) => res?.isSuccess && setDetected(res.data));
  }, [fetchRegions, fetchOrgs]);

  useEffect(() => {
    if (!previewCountry) return;
    ApiPreviewPricingCountry({ country: previewCountry }).then((res) => setPreview(res?.isSuccess ? res.data : null));
  }, [previewCountry, regions]);

  const saveRegion = async (data) => {
    setSaving(true);
    const res = await (data.regionId ? ApiUpdatePricingRegion(data) : ApiCreatePricingRegion(data));
    setSaving(false);
    if (res?.isSuccess) {
      Toast.success(t(res.message));
      setModal({ open: false, region: null });
      fetchRegions(true);
    } else Toast.error(res?.message || t("Something went wrong"));
  };

  const toggleRegion = async (row) => {
    const res = await ApiChangePricingRegionStatus({ regionId: row._id, isActive: !row.isActive });
    if (res?.isSuccess) fetchRegions(true);
    else Toast.error(res?.message || t("Something went wrong"));
  };

  const confirmDelete = async () => {
    const res = await ApiDeletePricingRegion({ regionId: deleteRow?._id });
    setDeleteRow(null);
    if (res?.isSuccess) {
      Toast.success(t(res.message));
      fetchRegions(true);
    } else Toast.error(res?.message || t("Something went wrong"));
  };

  const updateOrg = async (organizationId, action, country) => {
    const res = await ApiUpdateOrganizationBilling({ organizationId, action, country });
    if (res?.isSuccess) {
      Toast.success(t(res.message));
      fetchOrgs(true);
    } else Toast.error(res?.message || t("Something went wrong"));
  };

  const regionColumns = useMemo(() => [
    {
      headerName: t("Action"), field: "action", width: 100, ...fixedGrid,
      cellRenderer: ({ data }) => data && (
        <div className="action_container gap-3 flex items-center h-full">
          <AppTooltip text={t("Edit")}><i className="fa fa-pencil cursor-pointer" onClick={() => setModal({ open: true, region: data })} /></AppTooltip>
          <AppTooltip text={t("Delete")}><i className="fa fa-trash cursor-pointer" onClick={() => setDeleteRow(data)} /></AppTooltip>
        </div>
      ),
    },
    {
      headerName: t("Status"), field: "isActive", width: 100, ...fixedGrid,
      cellRenderer: ({ data }) => data && (
        <div className="flex items-center justify-center h-full pt-[3px]"><Switch checked={data.isActive} onCheckedChange={() => toggleRegion(data)} /></div>
      ),
    },
    { headerName: t("Region"), field: "name", width: 180, ...fixedGrid, sortable: true, cellRenderer: ({ value }) => <span className="fw-bold">{value}</span> },
    { headerName: t("Currency"), field: "currency", width: 110, ...fixedGrid },
    {
      headerName: t("Countries"), field: "countries", width: 380, ...fixedGrid, wrapText: true, autoHeight: true,
      cellRenderer: ({ value }) => (
        <div className="flex flex-wrap gap-1 py-1.5">
          {(value || []).map((c) => (
            <AppTooltip key={c} text={countryName(c, lang)}>
              <span className="px-1.5 py-0.5 rounded text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">{c}</span>
            </AppTooltip>
          ))}
        </div>
      ),
    },
    {
      headerName: t("Plan Prices"), field: "prices", width: 320, ...fixedGrid, wrapText: true, autoHeight: true,
      cellRenderer: ({ data }) => data && (
        <div className="flex flex-col py-1.5 text-xs leading-5">
          {(data.prices || []).map((p) => {
            const plan = plans.find((pl) => String(pl._id) === String(p.packageId));
            const yearly = p.yearlyPrice > 0 ? p.yearlyPrice : p.monthlyPrice * 10;
            return (
              <span key={String(p.packageId)}>
                <b>{plan?.name || t("Deleted plan")}</b>: {currencySymbol(data.currency)}{p.monthlyPrice}/{t("mo")} · {currencySymbol(data.currency)}{yearly}/{t("year")}
              </span>
            );
          })}
        </div>
      ),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [t, lang, plans]);

  const orgColumns = useMemo(() => [
    { headerName: t("Organization"), field: "organizationName", width: 220, ...fixedGrid, sortable: true, cellRenderer: ({ value }) => <span className="fw-bold">{value || "-"}</span> },
    { headerName: t("Plan"), field: "planId", width: 140, ...fixedGrid, cellRenderer: ({ value }) => value?.name || "-" },
    {
      headerName: t("Pricing"), field: "pricingMode", width: 260, ...fixedGrid,
      cellRenderer: ({ data }) => {
        if (!data) return null;
        if (data.pricingMode === "default") return <span className="text-slate-500">{t("Default price (existing customer)")}</span>;
        return (
          <span>
            {data.billingCountry ? `${countryName(data.billingCountry, lang)} (${data.billingCountry})` : t("By visitor country")}
            {data.billingCountrySource === "admin" && <span className="ml-1 text-[11px] text-slate-400">· {t("set by admin")}</span>}
          </span>
        );
      },
    },
    { headerName: t("Locked On"), field: "billingCountrySetAt", width: 130, ...fixedGrid, cellRenderer: ({ value }) => (value ? moment(value).format("DD MMM YYYY") : "-") },
    {
      headerName: t("Country Check"), field: "billingCountryMismatch", width: 260, ...fixedGrid, wrapText: true, autoHeight: true,
      cellRenderer: ({ value }) => value?.detectedAt ? (
        <span className="text-amber-600 dark:text-amber-400 text-xs font-semibold py-1 inline-block">
          <i className="fa fa-triangle-exclamation mr-1" />
          {t("Priced for {{country}}, card {{card}}, address {{address}}", { country: value.pricingCountry || "-", card: value.cardCountry || "-", address: value.addressCountry || "-" })}
        </span>
      ) : <span className="text-emerald-600 text-xs"><i className="fa fa-check mr-1" />{t("OK")}</span>,
    },
    {
      headerName: t("Action"), field: "action", width: 150, ...fixedGrid,
      cellRenderer: ({ data }) => data && (
        <div className="action_container gap-3 flex items-center h-full">
          <AppTooltip text={t("Set billing country")}><i className="fa fa-earth-americas cursor-pointer" onClick={() => { setSetCountryFor(data); setNewCountry(data.billingCountry || ""); }} /></AppTooltip>
          <AppTooltip text={t("Reset: lock again at next payment")}><i className="fa fa-rotate-left cursor-pointer" onClick={() => updateOrg(data._id, "reset")} /></AppTooltip>
          {data.pricingMode !== "default" && (
            <AppTooltip text={t("Always use default price")}><i className="fa fa-dollar-sign cursor-pointer" onClick={() => updateOrg(data._id, "default")} /></AppTooltip>
          )}
          {data.billingCountryMismatch?.detectedAt && (
            <AppTooltip text={t("Clear warning")}><i className="fa fa-check-double cursor-pointer" onClick={() => updateOrg(data._id, "clearFlag")} /></AppTooltip>
          )}
        </div>
      ),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [t, lang]);

  return (
    <>
      <Filter name={t("Regional Pricing")} nameShow={false} dateShow={false} profileShow={false} />

      <div className="middle_container budget_container">
        {/* Regions */}
        <div className="data_content data_content_btn glass-grid-container h-maxContent" style={{ marginTop: "12px" }}>
          <div className="camapgin_btn flex flex-wrap justify-between items-center gap-3 pt-4 pb-2 px-6">
            <div className="flex flex-col gap-1">
              <CardTitle className="m-0 flex items-center cron-title-bar" style={{ fontSize: 14 }}>{t("Pricing Regions")}</CardTitle>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {t("Countries without a region pay the plan's default price.")}{" "}
                {detected && (detected.country
                  ? t("Your country (Cloudflare): {{country}}", { country: `${countryName(detected.country, lang)} (${detected.country})` })
                  : <span className="text-amber-600">{t("Cloudflare country header not received — check the Cloudflare setup.")}</span>)}
              </span>
            </div>
            <Button
              id="regional-pricing-add-btn"
              onClick={() => setModal({ open: true, region: null })}
              className="h-9 px-4 rounded-md font-semibold text-white transition-all hover:opacity-90 flex items-center gap-2"
              style={{ background: "linear-gradient(135deg, #2374F2, #1A9FD4)", fontSize: "12px" }}
            >
              <i className="fa fa-plus" /> {t("Add Region")}
            </Button>
          </div>
          <div className="data_table">
            <AgTable
              ref={regionGrid}
              tableId="pricing-regions-table"
              loading={loading}
              onRefresh={() => fetchRegions(true)}
              rowData={regions}
              columnDefs={regionColumns}
              totalRecords={regions.length}
              perPage={Math.max(regions.length, 10)}
              currentPage={1}
              onPageChange={() => {}}
              onPerPageChange={() => {}}
              onSortChanged={() => {}}
              paginationOptions={paginationRowsPerPageOptions}
              isCustomSaveColumns={true}
              customSaveColumnName={"Pricing Regions"}
              {...compactGrid}
              height={gridHeight(regions.map(regionRowPx))}
            />
          </div>
        </div>

        {/* Preview */}
        <div className="data_content glass-grid-container h-maxContent px-6 py-4" style={{ marginTop: "12px" }}>
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle className="m-0 cron-title-bar" style={{ fontSize: 14 }}>{t("Preview Prices for a Country")}</CardTitle>
            <CountryPicker value={previewCountry} onChange={setPreviewCountry} placeholder={t("Select country")} />
            {preview && (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {preview.regionName ? t("Region: {{name}}", { name: preview.regionName }) : t("No region — default prices")}
              </span>
            )}
          </div>
          {preview && (
            <div className="flex flex-wrap gap-3 mt-3">
              {preview.plans.map((p) => (
                <div key={p._id} className="rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2.5 min-w-[170px]">
                  <div className="text-xs font-bold text-slate-700 dark:text-slate-200">{p.name}</div>
                  <div className="text-sm font-extrabold text-slate-900 dark:text-white">{currencySymbol(p.currency)}{p.monthlyPrice} <span className="text-[11px] font-medium text-slate-500">/ {t("mo")}</span></div>
                  <div className="text-xs text-blue-500 font-semibold">{currencySymbol(p.currency)}{p.yearlyPrice} / {t("year")}</div>
                  {!p.isRegional && <div className="text-[10px] text-slate-400">{t("Default price")}</div>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Organization billing */}
        <div className="data_content data_content_btn glass-grid-container h-maxContent" style={{ marginTop: "12px" }}>
          <div className="flex flex-col gap-1 pt-4 pb-2 px-6">
            <CardTitle className="m-0 cron-title-bar" style={{ fontSize: 14 }}>{t("Organization Billing Country")}</CardTitle>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {t("The billing country is locked at the first payment, so renewals and plan changes keep the same price even on a VPN.")}
            </span>
          </div>
          <div className="data_table">
            <AgTable
              ref={orgGrid}
              tableId="pricing-org-billing-table"
              loading={orgLoading}
              onRefresh={() => fetchOrgs(true)}
              rowData={orgs}
              columnDefs={orgColumns}
              totalRecords={orgs.length}
              perPage={Math.max(orgs.length, 10)}
              currentPage={1}
              onPageChange={() => {}}
              onPerPageChange={() => {}}
              onSortChanged={() => {}}
              paginationOptions={paginationRowsPerPageOptions}
              isCustomSaveColumns={true}
              customSaveColumnName={"Organization Billing Country"}
              {...compactGrid}
              height={gridHeight(orgs.map((o) => (o.billingCountryMismatch?.detectedAt ? 52 : 46)))}
            />
          </div>
        </div>

        <RegionModal
          open={modal.open}
          region={modal.region}
          plans={plans}
          saving={saving}
          onClose={() => setModal({ open: false, region: null })}
          onSave={saveRegion}
        />

        <CustomModal
          show={!!deleteRow}
          onHide={() => setDeleteRow(null)}
          title={t("Delete Region")}
          subtitle={deleteRow?.name}
          icon="delete"
          iconVariant="danger"
          message={t("Countries in this region will pay the default plan price on their next purchase. Running subscriptions keep their current price until they change plan.")}
          actions={[
            { label: t("Cancel"), cancel: true, icon: "close", onClick: () => setDeleteRow(null) },
            { label: t("Delete"), variant: "danger", icon: "delete", onClick: confirmDelete },
          ]}
        />

        <CustomModal
          show={!!setCountryFor}
          onHide={() => setSetCountryFor(null)}
          title={t("Set billing country")}
          subtitle={setCountryFor?.organizationName}
          icon="edit"
          message={t("This organization will see and pay the price of the selected country from its next payment.")}
          actions={[
            { label: t("Cancel"), cancel: true, icon: "close", onClick: () => setSetCountryFor(null) },
            {
              label: t("Save"), icon: "save", disabled: !newCountry,
              onClick: async () => { await updateOrg(setCountryFor._id, "set", newCountry); setSetCountryFor(null); },
            },
          ]}
        >
          <div className="mt-3 w-full flex justify-center">
            <CountryPicker value={newCountry} onChange={setNewCountry} placeholder={t("Select country")} className="w-full" />
          </div>
        </CustomModal>
      </div>
    </>
  );
};

export default RegionalPricing;
