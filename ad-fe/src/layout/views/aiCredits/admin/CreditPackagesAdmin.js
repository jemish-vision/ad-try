import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Package, Plus, Pencil, Trash2, Receipt, Globe, MapPin } from "lucide-react";
import Toast from "../../../../common/helper/toast/Toast";
import { CustomModal } from "../../../../helper/modal/CustomModal";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../../components/ui/dialog";
import { Button } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
import { Switch } from "../../../../components/ui/switch";
import {
  ApiAdminAiCreditPackages,
  ApiAdminCreateAiCreditPackage,
  ApiAdminUpdateAiCreditPackage,
  ApiAdminDeleteAiCreditPackage,
  ApiAdminAiCreditPayments,
} from "../../../../api-wrapper/ApiAiCredits";
import { ApiDetectPricingCountry } from "../../../../api-wrapper/ApiPricingRegions";
import { countryName } from "../../../../common/constants/countries";
import { formatCredits } from "../../../../helper/aiCredits/aiCredits";
import { Card, CardHeader, Pager, Select, PaymentsTable, PAYMENT_STATUS_OPTIONS, formatMoney } from "../aiCreditComponents";
import { labelCls } from "./AiCreditAdminModals";
import PackageRegionPricesModal from "./PackageRegionPricesModal";
import CustomPricingCard from "./CustomPricingCard";

const PER_PAGE = 10;
const CURRENCIES = ["USD", "EUR", "GBP", "INR", "AED", "SAR", "CAD", "AUD", "JPY"];
const emptyForm = { name: "", description: "", credits: "", price: "", currency: "USD", isActive: true, isPopular: false, sortOrder: "0", regionalPrices: {} };

/** Same rules as the server's validatePackageInput. */
export function validatePackageForm(form, t) {
  const errors = {};
  if (!String(form.name || "").trim()) errors.name = t("Package name is required");
  if (!(Number(form.credits) >= 1)) errors.credits = t("Credits must be 1 or more");
  if (!(Number(form.price) > 0)) errors.price = t("Price must be greater than 0");
  Object.entries(form.regionalPrices || {}).forEach(([regionId, v]) => {
    if (v !== "" && v !== undefined && !(Number(v) > 0)) errors[`region.${regionId}`] = t("Price must be greater than 0");
  });
  return errors;
}

function PackageModal({ open, pkg, regions, onClose, onSave, saving }) {
  const { t } = useTranslation();
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm(
      pkg
        ? {
            name: pkg.name,
            description: pkg.description || "",
            credits: String(pkg.credits),
            price: String(pkg.price),
            currency: pkg.currency || "USD",
            isActive: pkg.isActive !== false,
            isPopular: Boolean(pkg.isPopular),
            sortOrder: String(pkg.sortOrder || 0),
            regionalPrices: Object.fromEntries((pkg.regionalPrices || []).map((r) => [String(r.regionId), String(r.price)])),
          }
        : emptyForm,
    );
  }, [open, pkg]);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    const errs = validatePackageForm(form, t);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    onSave({
      ...(pkg ? { packageId: pkg._id } : {}),
      name: form.name.trim(),
      description: form.description.trim(),
      credits: Number(form.credits),
      price: Number(form.price),
      currency: form.currency,
      isActive: form.isActive,
      isPopular: form.isPopular,
      sortOrder: Number(form.sortOrder) || 0,
      regionalPrices: Object.entries(form.regionalPrices)
        .filter(([, v]) => v !== "" && v !== undefined)
        .map(([regionId, price]) => ({ regionId, price: Number(price) })),
    });
  };

  const field = (id, label, input, error, hint) => (
    <div>
      <label className={labelCls} htmlFor={id}>{label}</label>
      {input}
      {error ? <div className="text-red-500 text-[12px] mt-1">{error}</div> : hint ? <div className="text-[11.5px] text-slate-500 dark:text-slate-400 mt-1">{hint}</div> : null}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[640px] w-[95vw] premium-modal modal-content p-0 overflow-hidden bg-white dark:bg-slate-900 border-none gap-0" onInteractOutside={(e) => e.preventDefault()} id="ai-credit-package-modal">
        <DialogHeader className="modal-header border-b border-gray-200 dark:border-slate-800 p-4">
          <DialogTitle className="modal-title font-bold text-lg text-slate-900 dark:text-slate-50">{pkg ? t("Edit credit package") : t("Add credit package")}</DialogTitle>
        </DialogHeader>
        <div className="p-5 flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {field("ai-pkg-name", t("Package name"), <Input id="ai-pkg-name" value={form.name} maxLength={80} onChange={(e) => set("name", e.target.value)} placeholder={t("e.g. Growth")} />, errors.name)}
            {field("ai-pkg-credits", t("Credits"), <Input id="ai-pkg-credits" type="number" min="1" value={form.credits} onChange={(e) => set("credits", e.target.value)} />, errors.credits)}
            {field("ai-pkg-price", t("Price"), <Input id="ai-pkg-price" type="number" min="0" step="0.01" value={form.price} onChange={(e) => set("price", e.target.value)} />, errors.price, t("Charged to everyone outside the pricing regions below."))}
            {field(
              "ai-pkg-currency",
              t("Currency"),
              <select id="ai-pkg-currency" value={form.currency} onChange={(e) => set("currency", e.target.value)} className="h-9 w-full px-2.5 rounded-md text-[13px] bg-white dark:bg-slate-950 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-100">
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>,
            )}
          </div>
          {field("ai-pkg-description", t("Description (optional)"), <Input id="ai-pkg-description" value={form.description} maxLength={300} onChange={(e) => set("description", e.target.value)} placeholder={t("e.g. Best value for busy teams.")} />)}
          {regions.length === 0 && (
            <div className="text-[11.5px] text-slate-500 dark:text-slate-400" id="ai-pkg-no-regions-hint">
              {t("No pricing regions yet. Add regions on the Plans page (Pricing Regions); credit packages use the same regions.")}
            </div>
          )}
          {regions.length > 0 && (
            <div id="ai-pkg-regional-prices">
              <div className={labelCls}>{t("Price per pricing region (optional)")}</div>
              <div className="rounded-xl border border-slate-200/80 dark:border-white/[0.08] divide-y divide-slate-100 dark:divide-white/5">
                {regions.map((r) => (
                  <div key={r._id} className="flex items-center gap-3 px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold text-slate-800 dark:text-slate-100 truncate">
                        {r.name} {r.isActive === false && <span className="text-[11px] font-normal text-slate-400">({t("inactive")})</span>}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{(r.countries || []).join(", ")}</div>
                    </div>
                    <div className="w-[160px]">
                      <Input
                        aria-label={t("Price in {{currency}} for {{region}}", { currency: r.currency, region: r.name })}
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder={t("Default price")}
                        value={form.regionalPrices[String(r._id)] ?? ""}
                        onChange={(e) => set("regionalPrices", { ...form.regionalPrices, [String(r._id)]: e.target.value })}
                      />
                      {errors[`region.${r._id}`] && <div className="text-red-500 text-[11px] mt-0.5">{errors[`region.${r._id}`]}</div>}
                    </div>
                    <span className="w-10 text-[12px] font-semibold text-slate-500 dark:text-slate-400">{r.currency}</span>
                  </div>
                ))}
              </div>
              <div className="text-[11.5px] text-slate-500 dark:text-slate-400 mt-1">{t("Leave blank to charge the default price in that region.")}</div>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/80 dark:border-white/[0.08] px-3 py-2">
              <span className="text-[13px] font-semibold text-slate-700 dark:text-slate-200">{t("Available to buy")}</span>
              <Switch checked={form.isActive} onCheckedChange={(v) => set("isActive", v)} aria-label={t("Available to buy")} />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/80 dark:border-white/[0.08] px-3 py-2">
              <span className="text-[13px] font-semibold text-slate-700 dark:text-slate-200">{t("Most popular")}</span>
              <Switch checked={form.isPopular} onCheckedChange={(v) => set("isPopular", v)} aria-label={t("Most popular")} />
            </label>
            {field("ai-pkg-sort", t("Display order"), <Input id="ai-pkg-sort" type="number" value={form.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} />)}
          </div>
        </div>
        <div className="p-4 flex justify-end gap-3 border-t border-gray-200 dark:border-slate-800">
          <Button variant="outline" type="button" className="btn-premium-secondary" disabled={saving} onClick={onClose}>{t("Cancel")}</Button>
          <Button type="button" id="ai-pkg-save" className="btn-premium-primary px-5 font-bold" disabled={saving} onClick={submit}>
            {saving ? <i className="fa-solid fa-spinner fa-spin mr-1.5" /> : <i className="fa-solid fa-check mr-1.5" />}
            {t("Save package")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The country this browser is priced for, as the server sees it (Cloudflare header), and the region
 * and currency that applies — so Super Admin can check what buyers there will be charged.
 */
export function DetectedCountryNote({ detected }) {
  const { t, i18n } = useTranslation();
  if (!detected) return null;
  if (!detected.country) {
    return <span className="text-amber-600 dark:text-amber-400">{t("Cloudflare country header not received — check the Cloudflare setup.")}</span>;
  }
  const where = t("Your country (Cloudflare): {{country}}", { country: `${countryName(detected.country, i18n.language)} (${detected.country})` });
  return (
    <span>
      {where} ·{" "}
      {detected.regionName
        ? t("buyers here pay the {{region}} price in {{currency}}", { region: detected.regionName, currency: detected.currency })
        : t("no pricing region, buyers here pay the default price")}
    </span>
  );
}

/** Super Admin: credit packages organizations can buy. */
export default function CreditPackagesAdmin({ reloadKey }) {
  const { t, i18n } = useTranslation();
  const L = i18n.language;
  const [data, setData] = useState({ packages: [], regions: [], custom: null });
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState({ open: false, pkg: null });
  const [toDelete, setToDelete] = useState(null);
  const [saving, setSaving] = useState(false);
  const [regionPkg, setRegionPkg] = useState(null);
  const [detected, setDetected] = useState(null);

  useEffect(() => {
    ApiDetectPricingCountry().then((res) => res?.isSuccess && setDetected(res.data));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await ApiAdminAiCreditPackages();
    if (res?.isSuccess) setData(res.data);
    setLoading(false);
  }, []);
  useEffect(() => {
    load();
  }, [load, reloadKey]);

  const run = async (call, body, done) => {
    setSaving(true);
    const res = await call(body);
    setSaving(false);
    if (res?.isSuccess) {
      Toast.success(t(res.message || "Saved"));
      done?.();
      load();
    } else Toast.error(res?.message || t("Something went wrong"));
  };
  const regionName = (id) => data.regions.find((r) => String(r._id) === String(id));
  const iconBtn = "h-7 w-7 rounded-lg border border-slate-200 dark:border-white/10 flex items-center justify-center text-slate-500 hover:text-blue-600 bg-white dark:bg-slate-900";

  return (
    <div className="space-y-5">
      <Card id="ai-credit-admin-packages">
        <CardHeader
          icon={<Package className="w-3.5 h-3.5" />}
          title={t("Credit packages")}
          subtitle={t("Extra credits organizations can buy. Purchased credits never expire and are used after the monthly credits.")}
          right={
            <Button type="button" id="ai-pkg-add" className="btn-premium-primary h-8 text-[12px]" onClick={() => setModal({ open: true, pkg: null })}>
              <Plus className="w-3.5 h-3.5 mr-1" /> {t("Add package")}
            </Button>
          }
        />
        {detected && (
          <div className="flex items-center gap-1.5 -mt-1 mb-3 text-[12px] text-slate-500 dark:text-slate-400" id="ai-pkg-detected-country">
            <MapPin className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <DetectedCountryNote detected={detected} />
          </div>
        )}
        <div className="rounded-xl border border-slate-200/80 dark:border-white/[0.08] overflow-x-auto">
          <table className="w-full text-[12.5px] min-w-[640px]">
            <thead className="bg-slate-50 dark:bg-white/[0.04] text-slate-500 dark:text-slate-400">
              <tr>
                {[t("Package"), t("Credits"), t("Price"), t("Regional prices"), t("Status"), ""].map((c, i) => (
                  <th key={i} className={`px-3 py-2.5 font-semibold whitespace-nowrap ${i === 1 || i === 2 ? "text-right" : "text-left"}`}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5 text-slate-700 dark:text-slate-200">
              {loading && !data.packages.length ? (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400" role="status">{t("Loading...")}</td></tr>
              ) : !data.packages.length ? (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">{t("No credit packages yet. Add one so organizations can buy extra credits.")}</td></tr>
              ) : (
                data.packages.map((p, index) => (
                  <tr key={p._id} className="hover:bg-slate-50/70 dark:hover:bg-white/[0.02]">
                    <td className="px-3 py-2.5">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {p.name}
                        {p.isPopular && <span className="ml-2 px-1.5 py-0.5 rounded text-[10.5px] font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">{t("Most popular")}</span>}
                      </div>
                      {p.description && <div className="text-[11.5px] text-slate-500 dark:text-slate-400 truncate max-w-[280px]">{p.description}</div>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatCredits(p.credits, L)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{formatMoney(p.price, p.currency, L)}</td>
                    <td className="px-3 py-2.5 text-[12px]">
                      {(p.regionalPrices || []).length
                        ? p.regionalPrices.map((r) => {
                            const region = regionName(r.regionId);
                            return region ? <div key={String(r.regionId)}>{region.name}: <b>{formatMoney(r.price, region.currency, L)}</b></div> : null;
                          })
                        : <span className="text-slate-400">{t("Default price everywhere")}</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <Switch
                        checked={p.isActive !== false}
                        onCheckedChange={(v) => run(ApiAdminUpdateAiCreditPackage, { packageId: p._id, isActive: v })}
                        aria-label={t("Available to buy")}
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          id={index === 0 ? "ai-pkg-region-prices" : undefined}
                          className={iconBtn}
                          title={t("Regional Prices")}
                          aria-label={t("Regional Prices")}
                          onClick={() => setRegionPkg(p)}
                        >
                          <Globe className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" className={iconBtn} title={t("Edit")} aria-label={t("Edit")} onClick={() => setModal({ open: true, pkg: p })}><Pencil className="w-3.5 h-3.5" /></button>
                        <button type="button" className={`${iconBtn} hover:!text-rose-600`} title={t("Delete")} aria-label={t("Delete")} onClick={() => setToDelete(p)}><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <PackageModal
          open={modal.open}
          pkg={modal.pkg}
          regions={data.regions}
          saving={saving}
          onClose={() => setModal({ open: false, pkg: null })}
          onSave={(body) => run(body.packageId ? ApiAdminUpdateAiCreditPackage : ApiAdminCreateAiCreditPackage, body, () => setModal({ open: false, pkg: null }))}
        />
        <PackageRegionPricesModal
          pkg={regionPkg}
          regions={data.regions}
          saving={saving}
          onClose={() => setRegionPkg(null)}
          onSave={(body) => run(ApiAdminUpdateAiCreditPackage, body, () => setRegionPkg(null))}
        />
        <CustomModal
          show={Boolean(toDelete)}
          onHide={() => setToDelete(null)}
          title={t("Delete credit package")}
          subtitle={toDelete?.name}
          icon="delete"
          iconVariant="danger"
          message={t("Organizations can no longer buy this package. Past purchases and their credits are not affected.")}
          actions={[
            { label: t("Cancel"), cancel: true, icon: "close", onClick: () => setToDelete(null) },
            { label: t("Delete"), variant: "danger", icon: "delete", onClick: () => run(ApiAdminDeleteAiCreditPackage, { packageId: toDelete._id }, () => setToDelete(null)) },
          ]}
        />
      </Card>
      <CustomPricingCard custom={data.custom} packages={data.packages} regions={data.regions} onSaved={load} />
    </div>
  );
}

/** Super Admin: every credit purchase across organizations. */
export function PaymentsLog({ reloadKey }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState("");
  const [pageNo, setPageNo] = useState(1);
  const [res, setRes] = useState({ data: [], totalRecords: 0 });
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setLoading(true);
    ApiAdminAiCreditPayments({ status: status || undefined, pageNo, perPage: PER_PAGE }).then((r) => {
      setRes(r?.isSuccess ? r : { data: [], totalRecords: 0 });
      setLoading(false);
    });
  }, [status, pageNo, reloadKey]);
  return (
    <Card id="ai-credit-admin-payments">
      <CardHeader
        icon={<Receipt className="w-3.5 h-3.5" />}
        title={t("Payments")}
        subtitle={t("Every credit purchase: paid, pending, failed and cancelled.")}
        right={<Select id="ai-credit-admin-payment-status" label={t("Status")} value={status} onChange={(v) => { setStatus(v); setPageNo(1); }} options={PAYMENT_STATUS_OPTIONS(t)} />}
      />
      <PaymentsTable rows={res.data} loading={loading} showOrganization />
      <Pager pageNo={pageNo} perPage={PER_PAGE} total={res.totalRecords} onPage={setPageNo} />
    </Card>
  );
}
