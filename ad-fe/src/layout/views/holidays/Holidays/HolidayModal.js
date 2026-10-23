import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../../../../i18n";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../../components/ui/dialog";
import { Button } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
import moment from "moment";
import { ShadcnDatePicker } from "../../../../components/ui/date-picker";
import { ColorPicker } from "../../../../components/ui/color-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../components/ui/select";
import { ROLES } from "src/common/constants";

/* ─── helpers ─────────────────────────────────────────────────────────── */
const buildInitial = (initialData, range) => ({
    title: initialData?.title || "",
    start: initialData?.start || range?.start || "",
    end: initialData?.end || range?.end || "",
    color: initialData?.backgroundColor || "#1A9FD4",
    reminders: initialData?.extendedProps?.reminders || [7],
    protectionEnabled: initialData?.extendedProps?.protection?.enabled || false,
    protectionMode: initialData?.extendedProps?.protection?.mode || "",
    reduceBidPercent: initialData?.extendedProps?.protection?.reduceBidPercent || "",
});

const validate = (values) => {
    const errs = {};

    if (!values.title?.trim()) {
        errs.title = i18n.t("Event title is required");
    }

    if (!values.start) {
        errs.start = i18n.t("Start date is required");
    }

    if (!values.end) {
        errs.end = i18n.t("End date is required");
    } else if (values.start && !moment(values.end).isSameOrAfter(moment(values.start))) {
        errs.end = i18n.t("End date must be after start date");
    }

    if (!values.color) {
        errs.color = i18n.t("Color is required");
    }

    // Reminders
    const reminderErrors = values.reminders.map((val) => {
        if (val === "" || val === null || val === undefined) return i18n.t("Day is required");
        const num = Number(val);
        if (isNaN(num) || !isFinite(num)) return i18n.t("Must be a number");
        if (num <= 0) return i18n.t("Must be greater than 0");

        if (values.start) {
            const today = moment().startOf("day");
            const startDate = moment(values.start, "YYYY-MM-DD").startOf("day");
            const maxDays = startDate.diff(today, "days");
            if (maxDays <= 0) return i18n.t("Reminders are not allowed for today or past dates");
            if (num < 1 || num > maxDays) return i18n.t("Reminder must be between 1 and {{maxDays}} days", { maxDays });
        }
        return null;
    });
    if (reminderErrors.some(Boolean)) {
        errs.reminders = reminderErrors;
    }
    if (values.reminders.length === 0) {
        errs.remindersArray = i18n.t("At least one reminder is required");
    }

    // Protection
    if (values.protectionEnabled && !values.protectionMode) {
        errs.protectionMode = i18n.t("Protection mode is required");
    }

    return errs;
};

/* ─── Error message component ─────────────────────────────────────────── */
const FieldError = ({ msg }) =>
    msg ? <div className="text-red-500 text-sm mt-1">{msg}</div> : null;

/* ─── Main component ──────────────────────────────────────────────────── */
const HolidayModal = ({
    show,
    onClose,
    mode = "add",
    initialData = null,
    range = null,
    onSave,
    onSuperAdminEventReminderSave,
    onDelete,
    canUpdate = true,
    canRemove = true,
}) => {
    const { t } = useTranslation();
    const isSuperAdminEvent = initialData?.isSuperAdminEvent;
    const role = localStorage.getItem("role");

    const [values, setValues] = useState(() => buildInitial(initialData, range));
    const [errors, setErrors] = useState({});
    const [touched, setTouched] = useState({});
    const [saving, setSaving] = useState(false);

    // Re-initialise whenever the modal opens with different data
    useEffect(() => {
        if (show) {
            setValues(buildInitial(initialData, range));
            setErrors({});
            setTouched({});
        }
    }, [show, initialData, range]);

    /* ── helpers ── */
    const setField = (name, val) => {
        setValues((prev) => ({ ...prev, [name]: val }));
        setTouched((prev) => ({ ...prev, [name]: true }));
        // Re-validate the touched field live
        const newValues = { ...values, [name]: val };
        const errs = validate(newValues);
        setErrors(errs);
    };

    const touchAll = () => {
        const all = {};
        Object.keys(values).forEach((k) => (all[k] = true));
        values.reminders.forEach((_, i) => (all[`reminders_${i}`] = true));
        setTouched(all);
    };

    /* ── reminder helpers ── */
    const addReminder = () => setField("reminders", [...values.reminders, ""]);
    const removeReminder = (i) => {
        const next = values.reminders.filter((_, idx) => idx !== i);
        setField("reminders", next);
    };
    const setReminder = (i, val) => {
        const next = [...values.reminders];
        next[i] = val === "" ? "" : Number(val);
        setField("reminders", next);
    };

    /* ── submit ── */
    const handleSubmit = async (e) => {
        e.preventDefault();
        touchAll();
        const errs = validate(values);
        setErrors(errs);
        if (Object.keys(errs).length > 0) return;

        try {
            setSaving(true);
            if (isSuperAdminEvent) {
                return await onSuperAdminEventReminderSave({ specialDayId: initialData?.id, reminders: values.reminders });
            }

            const payload = {
                id: initialData?.id,
                title: values.title,
                start: values.start,
                end: values.end,
                color: values.color,
                reminders: values.reminders,
                protection: {
                    enabled: values.protectionEnabled,
                    mode: values.protectionEnabled ? values.protectionMode : null,
                },
            };
            if (onSave) {
                await onSave(payload);
            }
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={show} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
            <DialogContent
                className="sm:max-w-[800px] premium-modal modal-content p-0 flex flex-col max-h-[90vh] overflow-hidden"
                onInteractOutside={(e) => e.preventDefault()}
                onEscapeKeyDown={(e) => e.preventDefault()}
            >
                <DialogHeader className="modal-header border-b-0 p-4 pb-0">
                    <DialogTitle className="modal-title">
                        {mode === "add" ? t("Create Holiday / Special Day") : isSuperAdminEvent ? t("Add a Reminders") : t("Edit Holiday")}
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="flex flex-col h-full overflow-hidden">
                    <div className="modal-body overflow-y-auto p-4 flex-1">

                        {/* ROW 1 – Title + Color */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="text-[13px] font-semibold text-[#475569] dark:text-[#cbd5e1] mb-[6px] block">
                                    {t("Event Title")} *
                                </label>
                                <Input
                                    value={values.title}
                                    onChange={(e) => setField("title", e.target.value)}
                                    onBlur={() => setTouched((p) => ({ ...p, title: true }))}
                                    className={`form-control dark:!bg-white/5 dark:!border-white/10 dark:!text-white ${errors.title && touched.title ? "border-red-500" : ""}`}
                                    disabled={isSuperAdminEvent}
                                    placeholder={t("Enter event title")}
                                />
                                {touched.title && <FieldError msg={errors.title} />}
                            </div>

                            <div>
                                <label className="text-[13px] font-semibold text-[#475569] dark:text-[#cbd5e1] mb-[6px] block">
                                    {t("Event Color")} *
                                </label>
                                <ColorPicker
                                    value={values.color}
                                    onChange={(val) => setField("color", val)}
                                    disabled={isSuperAdminEvent}
                                />
                                {touched.color && <FieldError msg={errors.color} />}
                            </div>
                        </div>

                        {/* ROW 2 – Dates */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="text-[13px] font-semibold text-[#475569] dark:text-[#cbd5e1] mb-[6px] block">
                                    {t("Start Date")} *
                                </label>
                                <ShadcnDatePicker
                                    value={values.start}
                                    onChange={(val) => setField("start", val)}
                                    placeholder={t("Select Start Date")}
                                    disabled={isSuperAdminEvent}
                                    disabledDate={(date) => moment(date).isBefore(moment().startOf("day"))}
                                    className={errors.start && touched.start ? "border-red-500" : ""}
                                />
                                {touched.start && <FieldError msg={errors.start} />}
                            </div>
                            <div>
                                <label className="text-[13px] font-semibold text-[#475569] dark:text-[#cbd5e1] mb-[6px] block">
                                    {t("End Date")} *
                                </label>
                                <ShadcnDatePicker
                                    value={values.end}
                                    onChange={(val) => setField("end", val)}
                                    placeholder={t("Select End Date")}
                                    disabled={isSuperAdminEvent}
                                    disabledDate={(date) => moment(date).isBefore(moment().startOf("day"))}
                                    className={errors.end && touched.end ? "border-red-500" : ""}
                                />
                                {touched.end && <FieldError msg={errors.end} />}
                            </div>
                        </div>

                        {/* ROW 3 – Reminders */}
                        <div className="mb-4">
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-[13px] font-semibold text-[#475569] dark:text-[#cbd5e1] mb-0 block">
                                    {t("Custom Reminder Days")} *
                                </label>
                                <button
                                    type="button"
                                    style={{
                                        padding: "5px 12px",
                                        borderRadius: "6px",
                                        border: "1px solid #1A9FD4",
                                        background: "transparent",
                                        color: "#1A9FD4",
                                        fontSize: "12px",
                                        fontWeight: "600",
                                        cursor: "pointer",
                                    }}
                                    onClick={addReminder}
                                >
                                    + {t("Add Reminder")}
                                </button>
                            </div>

                            {values.reminders.map((reminder, i) => (
                                <div key={i} className="flex items-center gap-4 mb-2">
                                    <div className="flex-1">
                                        <Input
                                            type="number"
                                            value={reminder}
                                            onChange={(e) => setReminder(i, e.target.value)}
                                            onBlur={() => setTouched((p) => ({ ...p, [`reminders_${i}`]: true }))}
                                            className={`form-control dark:!bg-white/5 dark:!border-white/10 dark:!text-white ${errors.reminders?.[i] && touched[`reminders_${i}`] ? "border-red-500" : ""}`}
                                            placeholder={t("Days before event")}
                                        />
                                        {touched[`reminders_${i}`] && (
                                            <FieldError msg={errors.reminders?.[i]} />
                                        )}
                                    </div>
                                    <div>
                                        <button
                                            type="button"
                                            className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-red-300 dark:border-red-500/40 bg-transparent text-red-400 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 hover:border-red-500 hover:text-red-500 transition-all duration-150 cursor-pointer text-sm"
                                            onClick={() => removeReminder(i)}
                                            title={t("Remove reminder")}
                                        >
                                            ✕
                                        </button>
                                    </div>
                                </div>
                            ))}

                            {errors.remindersArray && (
                                <FieldError msg={errors.remindersArray} />
                            )}
                        </div>

                        {/* ROW 4 – Protection */}
                        <div className={`${(role === ROLES.SUPER_ADMIN || isSuperAdminEvent) && "hidden"}`}>
                            <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50/50 dark:bg-white/5">
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={values.protectionEnabled}
                                        onChange={(e) => setField("protectionEnabled", e.target.checked)}
                                        className="form-check-input w-[42px] h-[21px] cursor-pointer"
                                        role="switch"
                                    />
                                    <span className="text-[14px] font-semibold text-[#475569] dark:text-[#cbd5e1]">
                                        {t("Enable Holiday Protection")}
                                    </span>
                                </label>

                                {values.protectionEnabled && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                                        <div>
                                            <label className="text-[13px] font-semibold text-[#475569] dark:text-[#cbd5e1] mb-[6px] block">
                                                {t("Protection Action")} *
                                            </label>
                                            <Select
                                                value={values.protectionMode || undefined}
                                                onValueChange={(val) => setField("protectionMode", val || "")}
                                            >
                                                <SelectTrigger className="w-full">
                                                    <SelectValue placeholder={t("Select action")} />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="PAUSE_RULES">{t("Pause Rules")}</SelectItem>
                                                    <SelectItem value="PAUSE_CAMPAIGNS">{t("Pause Campaigns")}</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            {touched.protectionMode && <FieldError msg={errors.protectionMode} />}
                                        </div>

                                        {values.protectionMode === "REDUCE_BIDS" && (
                                            <div>
                                                <label className="text-[13px] font-semibold text-[#475569] dark:text-[#cbd5e1] mb-[6px] block">
                                                    {t("Reduce Bid By (%)")} *
                                                </label>
                                                <Input
                                                    type="number"
                                                    value={values.reduceBidPercent}
                                                    onChange={(e) => setField("reduceBidPercent", e.target.value)}
                                                    onBlur={() => setTouched((p) => ({ ...p, reduceBidPercent: true }))}
                                                    className="form-control dark:!bg-white/5 dark:!border-white/10 dark:!text-white"
                                                />
                                                {touched.reduceBidPercent && <FieldError msg={errors.reduceBidPercent} />}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                    </div>

                    {/* FOOTER */}
                    <div className="cm-footer border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-4 flex justify-end gap-2 shrink-0">
                        {(mode === "edit" && canRemove && !isSuperAdminEvent) && (
                            <Button
                                type="button"
                                className="btn-danger-brand mr-auto"
                                disabled={saving}
                                onClick={() => onDelete(initialData.id)}
                            >
                                {t("Delete")}
                            </Button>
                        )}

                        <Button
                            type="button"
                            variant="outline"
                            className="btn-premium-secondary"
                            disabled={saving}
                            onClick={onClose}
                        >
                            {t("Cancel")}
                        </Button>

                        {canUpdate && (
                            <Button type="submit" className="btn-premium-primary flex items-center gap-1.5" disabled={saving}>
                                {saving && <i className="fa-solid fa-spinner fa-spin mr-1.5" />}
                                {saving
                                    ? mode === "add"
                                        ? t("Creating...")
                                        : isSuperAdminEvent
                                            ? t("Saving...")
                                            : t("Updating...")
                                    : mode === "add"
                                        ? t("Create Holiday")
                                        : isSuperAdminEvent
                                            ? t("Add Reminders") : t("Update Holiday")}
                            </Button>
                        )}
                    </div>
                </form>

            </DialogContent>
        </Dialog>
    );
};

export default HolidayModal;
