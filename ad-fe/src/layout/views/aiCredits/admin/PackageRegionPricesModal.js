import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../../components/ui/dialog";
import { Button } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
import { currencySymbol } from "../../../../common/constants/countries";
import { formatMoney } from "../aiCreditComponents";

/** "" or a positive number per region id → the package's regionalPrices list. */
export function toRegionalPrices(values) {
  return Object.entries(values || {})
    .filter(([, v]) => v !== "" && v !== undefined && v !== null)
    .map(([regionId, price]) => ({ regionId, price: Number(price) }));
}

/**
 * One credit package's price in every pricing region — the same setting plans have
 * (Plans → Regional Prices). Buyers are matched to a region by their country (Cloudflare) and pay
 * that region's price in its currency; regions left empty pay the package's default price.
 */
export default function PackageRegionPricesModal({ pkg, regions = [], saving = false, onClose, onSave }) {
  const { t, i18n } = useTranslation();
  const [values, setValues] = useState({});
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!pkg) return;
    setValues(Object.fromEntries((pkg.regionalPrices || []).map((r) => [String(r.regionId), String(r.price)])));
    setErrors({});
  }, [pkg]);

  const save = () => {
    const errs = {};
    Object.entries(values).forEach(([id, v]) => {
      if (v !== "" && !(Number(v) > 0)) errs[id] = t("Price must be greater than 0");
    });
    setErrors(errs);
    if (Object.keys(errs).length) return;
    onSave({ packageId: pkg._id, regionalPrices: toRegionalPrices(values) });
  };

  return (
    <Dialog open={Boolean(pkg)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-[760px] w-[95vw] premium-modal modal-content p-0 overflow-hidden bg-white dark:bg-slate-900 border-none gap-0"
        onInteractOutside={(e) => e.preventDefault()}
        id="ai-pkg-region-prices-modal"
      >
        <DialogHeader className="modal-header border-b border-gray-200 dark:border-slate-800 p-4">
          <DialogTitle className="modal-title font-bold text-lg text-slate-900 dark:text-slate-50">
            {t("Regional Prices")}
            <span className="font-normal ml-2 text-sm text-gray-500 dark:text-gray-400">— {pkg?.name}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="p-5 flex flex-col gap-3 max-h-[65vh] overflow-y-auto">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {t("Default price")}: <b>{formatMoney(pkg?.price, pkg?.currency, i18n.language)}</b>.{" "}
            {t("Buyers see the price of the region their country belongs to, in that region's currency.")}{" "}
            {t("Leave blank to charge the default price in that region.")}
          </div>

          {regions.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400" id="ai-pkg-no-regions">
              {t("No pricing regions yet. Add regions on the Plans page (Pricing Regions); credit packages use the same regions.")}
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300">
                  <tr>
                    <th className="text-left font-semibold px-3 py-2">{t("Region")}</th>
                    <th className="text-left font-semibold px-3 py-2">{t("Countries")}</th>
                    <th className="text-left font-semibold px-3 py-2">{t("Price")}</th>
                  </tr>
                </thead>
                <tbody>
                  {regions.map((r) => {
                    const id = String(r._id);
                    return (
                      <tr key={id} className="border-t border-slate-200 dark:border-slate-700">
                        <td className="px-3 py-2 font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                          {r.name} <span className="text-xs font-medium text-slate-500">({r.currency})</span>
                          {r.isActive === false && <span className="ml-2 text-[10px] text-slate-400">{t("Inactive")}</span>}
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400 max-w-[240px] truncate" title={(r.countries || []).join(", ")}>
                          {(r.countries || []).join(", ")}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-slate-500 w-8 text-right shrink-0">{currencySymbol(r.currency).trim()}</span>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              className="h-9 w-32"
                              aria-label={t("Price in {{currency}} for {{region}}", { currency: r.currency, region: r.name })}
                              placeholder={t("Default")}
                              value={values[id] ?? ""}
                              onChange={(e) => setValues((prev) => ({ ...prev, [id]: e.target.value }))}
                            />
                          </div>
                          {errors[id] && <div className="text-red-500 text-[11px] mt-0.5 ml-9">{errors[id]}</div>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="p-4 flex justify-end gap-3 border-t border-gray-200 dark:border-slate-800">
          <Button variant="outline" type="button" className="btn-premium-secondary" disabled={saving} onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button type="button" id="ai-pkg-region-prices-save" className="btn-premium-primary px-5 font-bold" disabled={saving || !regions.length} onClick={save}>
            {saving ? <i className="fa-solid fa-spinner fa-spin mr-1.5" /> : <i className="fa-solid fa-check mr-1.5" />}
            {t("Save Prices")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
