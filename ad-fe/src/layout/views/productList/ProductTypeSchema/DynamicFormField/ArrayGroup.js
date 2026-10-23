import { FieldArray, getIn, useFormikContext } from "formik";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { RenderInput } from "./RenderInput";

function useRowHasError(fullPath, idx, innerFieldKeys, amazonErrors) {
    const { errors, submitCount } = useFormikContext();

    if (submitCount === 0) return false;

    const hasFormikError = innerFieldKeys.some((key) => {
        const nestedPath = `${fullPath}[${idx}].${key}`;
        return !!getIn(errors, nestedPath);
    });

    const hasAmazonError = innerFieldKeys.some((key) => {
        const baseKey = `${fullPath}[${idx}].${key}`.split('[')[0];
        return !!amazonErrors?.[baseKey];
    });

    return hasFormikError || hasAmazonError;
}

function ArrayRow({
    idx,
    row,
    field,
    fullPath,
    innerField,
    canRemove,
    remove,
    setFieldValue,
    marketplace_id,
    language_tag,
    amazonErrors,
    onAmazonErrorClear,
}) {
    const { t } = useTranslation();
    const innerFieldKeys = Object.keys(innerField ?? {});
    const hasError = useRowHasError(fullPath, idx, innerFieldKeys, amazonErrors);

    return (
        <div className={`pf-array-item${hasError ? "" : ""}`}>
            {canRemove && (
                <button
                    type="button"
                    className="pf-remove-btn"
                    onClick={() => remove(idx)}
                    title={t("Remove item")}
                    style={{ position: 'absolute', top: '12px', right: '12px', zIndex: 10 }}
                >
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                        <path
                            d="M3 4h10M6 4V2h4v2M5 4v9h6V4H5z"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                </button>
            )}

            {/* Fields */}
            <div className="pf-object-inner">
                {Object.entries(innerField ?? {}).map(([key, prop]) => {
                    const nestedPath = `${fullPath}[${idx}].${key}`;
                    return (
                        <RenderInput
                            key={key}
                            field={{ ...prop, key }}
                            fullPath={nestedPath}
                            value={getIn({ temp: row }, `temp.${key}`)}
                            setFieldValue={setFieldValue}
                            marketplace_id={marketplace_id}
                            language_tag={language_tag}
                            amazonError={amazonErrors}
                            onAmazonErrorClear={onAmazonErrorClear}
                        />
                    );
                })}
            </div>
        </div>
    );
}

export default function ArrayGroup({
    field,
    fullPath,
    value,
    setFieldValue,
    marketplace_id,
    language_tag,
    amazonErrors = {},
    onAmazonErrorClear,
}) {
    const { t } = useTranslation();
    const innerField = Object.fromEntries(
        field?.items?.map(item => [item?.childKey, item])
    );

    const rows = value || [];

    const maxItems = field.maxUniqueItems ?? field.maxItems ?? 1;
    const minItems = field.minItems || 1;

    const canRemove = rows.length > minItems;
    const canAdd = rows.length < maxItems;

    useEffect(() => {
        if (!Array.isArray(rows)) return;
        if (rows.length > maxItems) {
            const filtered = rows.filter(row => Object.values(row || {}).some(v => v !== "" && v !== null && v !== undefined));
            const trimmed = filtered.slice(0, maxItems);
            setFieldValue(fullPath, trimmed);
        }
    }, [rows, maxItems]);

    return (
        <FieldArray name={fullPath}>
            {({ push, remove }) => (
                <div>
                    {rows.map((row, idx) => (
                        <ArrayRow
                            key={idx}
                            idx={idx}
                            row={row}
                            field={field}
                            fullPath={fullPath}
                            innerField={innerField}
                            canRemove={canRemove}
                            remove={remove}
                            setFieldValue={setFieldValue}
                            marketplace_id={marketplace_id}
                            language_tag={language_tag}
                            amazonErrors={amazonErrors}
                            onAmazonErrorClear={onAmazonErrorClear}
                            maxItems={maxItems}
                        />
                    ))}

                    {canAdd && (
                        <button
                            type="button"
                            className="pf-add-btn"
                            onClick={() => {
                                const empty = {};
                                Object.keys(innerField ?? {}).forEach(k => (empty[k] = ""));
                                push(empty);
                            }}
                        >
                            <span className="pf-add-btn-icon">+</span>
                            {t("Add {{name}}", { name: t(field.label || field.key?.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())) })}
                        </button>
                    )}
                </div>
            )}
        </FieldArray>
    );
}