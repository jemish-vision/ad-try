import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import AgTable from "../../../common/grid/AgTable";
import Toast from "../../../common/helper/toast/Toast";
import { MdOutlineClose } from "react-icons/md";
import { CustomModal } from "../../../helper/modal/CustomModal";
import { Switch } from "../../../components/ui/switch";
import { Button } from "../../../components/ui/button";
import { CardTitle } from "src/components/ui/card";
import { AppTooltip } from "../../../components/ui/AppTooltip";
import { countryName, currencySymbol, regionalYearlyPrice } from "../../../common/constants/countries";
import RegionModal from "./RegionModal";
import {
  ApiPricingRegionList,
  ApiCreatePricingRegion,
  ApiUpdatePricingRegion,
  ApiChangePricingRegionStatus,
  ApiDeletePricingRegion,
  ApiDetectPricingCountry,
} from "../../../api-wrapper/ApiPricingRegions";

const PAGE_SIZES = [10, 25, 50, 100];
const fixedGrid = { resizable: true, sortable: false };
const GRID_AUTO_SIZE = { type: "fitGridWidth" };
const fitColumns = (p) => p?.api?.sizeColumnsToFit?.();
// Small lists: size the grid to its rows (no fixed 100vh grid with empty space), columns stretched to the width.
const HEADER_PX = 52;
const gridHeight = (rowHeights) => `${HEADER_PX + Math.max(rowHeights.reduce((a, b) => a + b, 0), 88) + 4}px`;
const regionRowPx = (r) => Math.max(46, (r.prices?.length || 0) * 20 + 18, Math.ceil((r.countries?.length || 0) / 14) * 26 + 14);
const compactGrid = {
  minHeight: "0",
  autoSizeStrategy: GRID_AUTO_SIZE,
  onGridSizeChanged: fitColumns,
  onFirstDataRendered: fitColumns,
  suppressHorizontalScroll: true,
};

/**
 * Pricing regions. Rendered under the Plans grid (Super Admin).
 * refreshKey: bump to reload the regions (e.g. after a plan's regional prices were saved).
 */
const RegionalPricing = ({ refreshKey = 0, isDark = false, addRegionSignal = 0 }) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [regions, setRegions] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState({ open: false, region: null });
  const [saving, setSaving] = useState(false);
  const [deleteRow, setDeleteRow] = useState(null);
  const [detected, setDetected] = useState(null);
  const regionGrid = useRef(null);
  const [regionArg, setRegionArg] = useState({ pageNo: 1, perPage: PAGE_SIZES[0] });
  const [regionTotal, setRegionTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const h = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setRegionArg((prev) => (prev.pageNo === 1 ? prev : { ...prev, pageNo: 1 }));
    }, 350);
    return () => clearTimeout(h);
  }, [search]);

  const fetchRegions = useCallback(async (skip = true) => {
    setLoading(true);
    const res = await ApiPricingRegionList({ ...regionArg, search: debouncedSearch }, skip);
    if (res?.isSuccess) {
      setRegions(res.data || []);
      setPlans(res.plans || []);
      setRegionTotal(res.totalRecords || 0);
    } else Toast.error(res?.message || t("Something went wrong"));
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionArg, debouncedSearch, refreshKey]);

  useEffect(() => { fetchRegions(); }, [fetchRegions]);
  // "Add Region" requested from elsewhere (e.g. the plan's regional prices modal when no region exists).
  useEffect(() => {
    if (addRegionSignal) setModal({ open: true, region: null });
  }, [addRegionSignal]);
  useEffect(() => {
    ApiDetectPricingCountry().then((res) => res?.isSuccess && setDetected(res.data));
  }, []);

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
            const yearly = p.yearlyPrice > 0 ? p.yearlyPrice : regionalYearlyPrice(p.monthlyPrice);
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

  return (
    <>
      <div>
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
            <div className="flex items-center gap-2 flex-wrap">
            <div
              id="regional-pricing-search"
              className="search_option m-0"
              style={{
                display: "flex", alignItems: "center", position: "relative", minWidth: "240px",
                backgroundColor: isDark ? "#1e293b" : "#fff",
                border: isDark ? "1px solid #334155" : "1px solid #cbd5e1",
              }}
            >
              <input
                type="text"
                placeholder={t("Search region name")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ width: "100%", height: "36px", backgroundColor: "transparent", color: isDark ? "#f8fafc" : "#1e293b", border: "none", paddingRight: search ? "30px" : "10px" }}
              />
              {search && (
                <MdOutlineClose
                  onClick={() => setSearch("")}
                  style={{ position: "absolute", right: "10px", cursor: "pointer", color: "var(--text-secondary)", fontSize: "18px", opacity: 0.7 }}
                />
              )}
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
          </div>
          <div className="data_table">
            <AgTable
              ref={regionGrid}
              tableId="pricing-regions-table"
              loading={loading}
              onRefresh={() => fetchRegions(true)}
              rowData={regions}
              columnDefs={regionColumns}
              totalRecords={regionTotal}
              perPage={regionArg.perPage}
              currentPage={regionArg.pageNo}
              onPageChange={(page) => setRegionArg((prev) => ({ ...prev, pageNo: page }))}
              onPerPageChange={(perPage) => setRegionArg({ pageNo: 1, perPage })}
              onSortChanged={() => {}}
              paginationOptions={PAGE_SIZES}
              isCustomSaveColumns={true}
              customSaveColumnName={"Pricing Regions"}
              {...compactGrid}
              height={gridHeight(regions.map(regionRowPx))}
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
      </div>
    </>
  );
};

export default RegionalPricing;
