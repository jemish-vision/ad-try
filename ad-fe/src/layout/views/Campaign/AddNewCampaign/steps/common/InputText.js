import { ErrorMessage } from "formik";
import { useTranslation } from "react-i18next";
import { FieldTitle } from "../../../../productList/ProductTypeSchema/DynamicFormField/ProductCommon";
import { ShadcnDatePicker } from "../../../../../../components/ui/date-picker";

const getNestedValue = (obj, path) => {
    if (!path || !obj) return undefined;
    return path.split(/[\.\[\]]+/).filter(Boolean).reduce((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), obj);
};

export default function TextInput({ field, value, setFieldValue, formik }) {
    const { t } = useTranslation();
    const isDate = field?.type === "date";
    // Check if error exists using nested path resolver
    const hasError = getNestedValue(formik?.touched, field.key) && getNestedValue(formik?.errors, field.key);

    return (
        <div className="mb-3">
            {/* LABEL */}
            <div className="modern-label mb-2 flex items-center gap-1">
                <FieldTitle title={field.label || field.key} tooltip={field.description ?? field.label} />
            </div>

            {/* INPUT FIELD */}
            <div>
                {/* DATE PICKER */}
                {isDate ? (
                    <ShadcnDatePicker
                        value={value || ""}
                        onChange={(val) => setFieldValue(field.key, val || "")}
                        placeholder={t(field.placeholder || field.label)}
                        className={hasError ? 'border-red-500' : ''}
                    />
                ) : field.prefix ? (
                    <div className="modern-input-group">
                        <span className="modern-input-prefix">{field.prefix}</span>
                        <input
                            type={field.type || "text"}
                            className={`modern-input has-prefix ${hasError ? 'border-red-500' : ''}`}
                            value={value || ""}
                            placeholder={t(field.placeholder || field.label)}
                            onChange={(e) => setFieldValue(field.key, e.target.value)}
                        />
                    </div>
                ) : (
                    <input
                        type={field.type || "text"}
                        className={`modern-input ${hasError ? 'border-red-500' : ''}`}
                        value={value || ""}
                        placeholder={t(field.placeholder || field.label)}
                        onChange={(e) => setFieldValue(field.key, e.target.value)}
                    />
                )}

                {/* ERROR MESSAGE */}
                <ErrorMessage name={field.key} render={(msg) => <div className="text-red-500 text-xs mt-1">{t(msg)}</div>} />
            </div>
        </div>
    );
}
