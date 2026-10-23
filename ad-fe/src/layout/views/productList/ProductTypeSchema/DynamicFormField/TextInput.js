import { FieldTitle } from "./ProductCommon";
import { ErrorMessage } from "formik";
import UrlWithFileInput from "./UrlWithFileInput";
import { ShadcnDatePicker } from "../../../../../components/ui/date-picker";

const formatValue = (date, field) => {
    if (!date) return "";
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const hh = String(date.getHours()).padStart(2, "0");
    const min = String(date.getMinutes()).padStart(2, "0");
    return (field.oneOf?.some(item => item.format === "date") || field?.semanticType === "date")
        ? `${yyyy}-${mm}-${dd}`
        : `${yyyy}-${mm}-${dd} ${hh}:${min}`;
};

export default function TextInput({ field, fullPath, value, setFieldValue, amazonError, onAmazonErrorClear }) {
    const disabled = field.key === "marketplace_id" || field.key === "language_tag";
    const amazonErrorKey = fullPath?.split('[')[0];
    const amsError = amazonError?.[amazonErrorKey];
    const hasError = !!amsError;

    // ── Date / DateTime ──────────────────────────────────────────────────────
    if (
        ["string"].includes(field?.type) &&
        ((field?.oneOf?.length && field?.oneOf?.some(item => ["date", "date-time"].includes(item?.format))) ||
            field?.semanticType === "date")
    ) {
        const isDateOnly =
            field.oneOf?.some(item => item.format === "date") ||
            field?.semanticType === "date";

        return (
            <div className="pf-field-row">
                <label className="pf-label">
                    <FieldTitle
                        title={field.label || field?.key}
                        tooltip={field?.description ?? field.label ?? field?.key}
                    />
                </label>
                <div>
                    <ShadcnDatePicker
                        className={`pf-datepicker${hasError ? " border-red-500" : ""}`}
                        value={value}
                        onChange={(date) => {
                            onAmazonErrorClear?.(amazonErrorKey);
                            setFieldValue(fullPath, date);
                        }}
                        placeholder={field?.placeholder || field.label || field.key}
                    />
                    <ErrorMessage
                        name={fullPath}
                        render={(msg) => <div className="pf-error-msg">{msg}</div>}
                    />
                    {amsError && <div className="pf-error-msg">{amsError}</div>}
                </div>
            </div>
        );
    }

    // ── URI / Image ──────────────────────────────────────────────────────────
    if (
        ["string"].includes(field?.type) &&
        (field?.format === "uri" || field?.semanticType === "image")
    ) {
        return (
            <UrlWithFileInput
                field={field}
                fullPath={fullPath}
                value={value}
                setFieldValue={setFieldValue}
            />
        );
    }

    // ── Number ───────────────────────────────────────────────────────────────
    if (["integer"].includes(field?.type)) {
        return (
            <div className="pf-field-row">
                <label className="pf-label">
                    <FieldTitle
                        title={field.label || field?.key}
                        tooltip={field?.description ?? field.label ?? field?.key}
                    />
                </label>
                <div>
                    <input
                        type="number"
                        className={`pf-input${disabled ? " pf-input-disabled" : ""}${hasError ? " pf-has-error" : ""}`}
                        value={value ?? ""}
                        disabled={disabled}
                        onChange={(e) => {
                            onAmazonErrorClear?.(amazonErrorKey);
                            setFieldValue(fullPath, e.target.value);
                        }}
                        placeholder={field?.placeholder || field.label || field.key}
                    />
                    <ErrorMessage
                        name={fullPath}
                        render={(msg) => <div className="pf-error-msg">{msg}</div>}
                    />
                    {amsError && <div className="pf-error-msg">{amsError}</div>}
                </div>
            </div>
        );
    }

    // ── Default String ───────────────────────────────────────────────────────
    return (
        <div className="pf-field-row">
            <label className="pf-label">
                <FieldTitle
                    title={field.label || field?.key}
                    tooltip={field?.description ?? field.label ?? field?.key}
                />
            </label>
            <div>
                <input
                    type={field.type === "string" ? "text" : field.type}
                    className={`pf-input${disabled ? " pf-input-disabled" : ""}${hasError ? " pf-has-error" : ""}`}
                    value={value ?? ""}
                    disabled={disabled}
                    onChange={(e) => {
                        onAmazonErrorClear?.(amazonErrorKey);
                        setFieldValue(fullPath, e.target.value);
                    }}
                    placeholder={field?.placeholder || field.label || field.key}
                />
                <ErrorMessage
                    name={fullPath}
                    render={(msg) => <div className="pf-error-msg">{msg}</div>}
                />
                {amsError && <div className="pf-error-msg">{amsError}</div>}
            </div>
        </div>
    );
}