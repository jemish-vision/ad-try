import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../../components/ui/dialog";
import { Button } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
import { ApiAdminAiCreditOrganization, ApiAdminAiCreditUsage, ApiAdminAiCreditTransactions } from "../../../../api-wrapper/ApiAiCredits";
import { formatCredits } from "../../../../helper/aiCredits/aiCredits";
import AiCreditDetail from "../AiCreditDetail";

export const labelCls = "text-[11px] font-bold uppercase tracking-wider text-[#475569] dark:text-[#cbd5e1] mb-2 block";

const Shell = ({ open, onClose, id, title, subtitle, width = "max-w-[520px]", children, footer }) => (
  <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
    <DialogContent className={`${width} w-[95vw] premium-modal modal-content p-0 overflow-hidden bg-white dark:bg-slate-900 border-none gap-0`} onInteractOutside={(e) => e.preventDefault()} id={id}>
      <DialogHeader className="modal-header border-b border-gray-200 dark:border-slate-800 p-4">
        <DialogTitle className="modal-title font-bold text-lg text-slate-900 dark:text-slate-50">{title}</DialogTitle>
        {subtitle && <p className="text-[12.5px] text-slate-500 dark:text-slate-400 m-0">{subtitle}</p>}
      </DialogHeader>
      {children}
      {footer && <div className="p-4 flex justify-end gap-3 border-t border-gray-200 dark:border-slate-800">{footer}</div>}
    </DialogContent>
  </Dialog>
);

const Footer = ({ onClose, onSubmit, saving, label }) => {
  const { t } = useTranslation();
  return (
    <>
      <Button variant="outline" type="button" className="btn-premium-secondary" disabled={saving} onClick={onClose}>
        {t("Cancel")}
      </Button>
      <Button type="button" className="btn-premium-primary px-5 font-bold" disabled={saving} onClick={onSubmit}>
        {saving ? <i className="fa-solid fa-spinner fa-spin mr-1.5" /> : <i className="fa-solid fa-check mr-1.5" />}
        {label}
      </Button>
    </>
  );
};

/** Add or remove credits for the current month, with a required reason. */
export function AdjustCreditsModal({ open, org, onClose, onSave, saving }) {
  const { t, i18n } = useTranslation();
  const [mode, setMode] = useState("add");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (open) {
      setMode("add");
      setAmount("");
      setNote("");
      setError("");
    }
  }, [open]);

  const submit = () => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return setError(t("Enter a number of credits greater than 0"));
    if (!note.trim()) return setError(t("A reason is required"));
    setError("");
    onSave({ organizationId: org.organizationId, credits: mode === "add" ? n : -n, note: note.trim() });
  };
  const after = org ? org.available + (mode === "add" ? 1 : -1) * (Number(amount) || 0) : 0;

  return (
    <Shell open={open} onClose={onClose} id="ai-credit-adjust-modal" title={t("Adjust AI credits")} subtitle={org?.organizationName} footer={<Footer onClose={onClose} onSubmit={submit} saving={saving} label={t("Save")} />}>
      <div className="p-5 flex flex-col gap-4">
        <div className="inline-flex rounded-lg border border-slate-200 dark:border-white/10 p-0.5 bg-slate-50 dark:bg-white/[0.03] self-start" role="radiogroup" aria-label={t("Adjustment")}>
          {[
            ["add", t("Add credits")],
            ["remove", t("Remove credits")],
          ].map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={mode === k} onClick={() => setMode(k)} className={`h-7 px-3 rounded-md text-[12px] font-semibold ${mode === k ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-sky-400 shadow-sm" : "text-slate-500"}`}>
              {label}
            </button>
          ))}
        </div>
        <div>
          <label className={labelCls} htmlFor="ai-credit-adjust-amount">{t("Credits")}</label>
          <Input id="ai-credit-adjust-amount" type="number" min="0" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="100" />
        </div>
        <div>
          <label className={labelCls} htmlFor="ai-credit-adjust-note">{t("Reason")}</label>
          <Input id="ai-credit-adjust-note" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder={t("e.g. Extra credits for onboarding")} />
        </div>
        <p className="text-[12px] text-slate-500 dark:text-slate-400 m-0">
          {t("Applies to this month only. Available after the change: {{amount}} credits.", { amount: formatCredits(Math.max(0, after), i18n.language) })}
        </p>
        {error && <div className="text-red-500 text-sm font-medium">{error}</div>}
      </div>
    </Shell>
  );
}

/** Organization's own monthly allowance, or back to its plan's allowance. */
export function MonthlyLimitModal({ open, org, defaultMonthlyCredits, onClose, onSave, saving }) {
  const { t, i18n } = useTranslation();
  const [usePlan, setUsePlan] = useState(true);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (open && org) {
      const custom = org.monthlyLimitOverride !== null && org.monthlyLimitOverride !== undefined;
      setUsePlan(!custom);
      setValue(custom ? String(org.monthlyLimitOverride) : String(org.monthlyLimit ?? ""));
      setError("");
    }
  }, [open, org]);

  const planAllowance = org?.plan?.aiMonthlyCredits ?? defaultMonthlyCredits;
  const submit = () => {
    if (usePlan) return onSave({ organizationId: org.organizationId, monthlyLimit: null });
    const n = Number(value);
    if (value === "" || !Number.isFinite(n) || n < 0) return setError(t("Enter 0 or more credits"));
    setError("");
    return onSave({ organizationId: org.organizationId, monthlyLimit: n });
  };

  const option = (checked, onSelect, title, body, idSuffix) => (
    <label htmlFor={`ai-limit-${idSuffix}`} className={`flex items-start gap-3 rounded-xl border px-4 py-3 cursor-pointer ${checked ? "border-blue-400 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-700" : "border-slate-200 dark:border-white/10"}`}>
      <input id={`ai-limit-${idSuffix}`} type="radio" name="ai-limit-mode" checked={checked} onChange={onSelect} className="mt-1" />
      <span>
        <span className="block text-[13px] font-semibold text-slate-800 dark:text-slate-100">{title}</span>
        <span className="block text-[12px] text-slate-500 dark:text-slate-400">{body}</span>
      </span>
    </label>
  );

  return (
    <Shell open={open} onClose={onClose} id="ai-credit-limit-modal" title={t("Monthly AI credits")} subtitle={org?.organizationName} footer={<Footer onClose={onClose} onSubmit={submit} saving={saving} label={t("Save")} />}>
      <div className="p-5 flex flex-col gap-3">
        {option(usePlan, () => setUsePlan(true), t("Use the plan's allowance"), org?.plan ? t("{{plan}}: {{amount}} credits a month", { plan: org.plan.name, amount: formatCredits(planAllowance, i18n.language) }) : t("Standard allowance: {{amount}} credits a month", { amount: formatCredits(planAllowance, i18n.language) }), "plan")}
        {option(!usePlan, () => setUsePlan(false), t("Custom allowance for this organization"), t("Overrides the plan until you switch back."), "custom")}
        {!usePlan && (
          <div>
            <label className={labelCls} htmlFor="ai-credit-limit-value">{t("Credits a month")}</label>
            <Input id="ai-credit-limit-value" type="number" min="0" step="1" value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
        )}
        <p className="text-[12px] text-slate-500 dark:text-slate-400 m-0">{t("Takes effect now: this month's credits move by the difference, and credits already used still count.")}</p>
        {error && <div className="text-red-500 text-sm font-medium">{error}</div>}
      </div>
    </Shell>
  );
}

/** Super Admin view of one organization: same view the organization's users see. */
export function OrganizationCreditsModal({ open, org, onClose, reloadKey }) {
  const { t } = useTranslation();
  const [summary, setSummary] = useState(null);
  const orgId = org?.organizationId;
  useEffect(() => {
    if (!open || !orgId) return;
    setSummary(null);
    ApiAdminAiCreditOrganization({ organizationId: orgId }).then((r) => setSummary(r?.isSuccess ? r.data : null));
  }, [open, orgId, reloadKey]);
  const loadUsage = useCallback((body) => ApiAdminAiCreditUsage({ ...body, organizationId: orgId }), [orgId]);
  const loadTx = useCallback((body) => ApiAdminAiCreditTransactions({ ...body, organizationId: orgId }), [orgId]);

  return (
    <Shell open={open} onClose={onClose} id="ai-credit-org-modal" title={t("AI credits")} subtitle={org?.organizationName} width="max-w-[1100px]">
      <div className="p-5 max-h-[78vh] overflow-y-auto bg-slate-50/50 dark:bg-transparent">
        {summary ? (
          <AiCreditDetail summary={summary} loadUsage={loadUsage} loadTransactions={loadTx} reloadKey={reloadKey} />
        ) : (
          <div role="status" className="space-y-4">
            {[140, 240].map((h) => <div key={h} className="animate-pulse rounded-2xl bg-slate-100 dark:bg-white/[0.04]" style={{ height: h }} />)}
          </div>
        )}
      </div>
    </Shell>
  );
}
