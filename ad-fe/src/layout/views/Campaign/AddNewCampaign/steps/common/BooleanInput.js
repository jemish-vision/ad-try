import { ErrorMessage } from "formik";
import { useTranslation } from "react-i18next";
import { FieldTitle } from "../../../../productList/ProductTypeSchema/DynamicFormField/ProductCommon";

export default function BooleanInput({ field, value, setFieldValue, formik }) {
    const { t } = useTranslation();
    const options = field?.enum || [];
    const labels = field?.enumNames || [];
    const descriptions = field?.enumDescriptions || [];

    const hasError = formik?.touched?.[field.key] && formik?.errors?.[field.key];

    return (
        <div className="mb-4">
            {/* Label Header */}
            <div className="modern-label mb-3 flex items-center gap-1">
                <FieldTitle title={field.label || field?.key} tooltip={field?.description ?? field.label ?? field?.key} />
            </div>

            {/* Radio Options */}
            <div className="flex flex-col gap-3">
                {options.map((opt, index) => (
                    <div
                        key={index}
                        className={`modern-radio-row flex items-start gap-3 ${hasError ? 'border-red-500' : ''}`}
                        onClick={() => setFieldValue(field?.key, opt)}
                        style={{ cursor: 'pointer' }}
                    >
                        <div style={{ flexShrink: 0, marginTop: '3px', position: 'relative' }}>
                            <div
                                style={{
                                    width: '16px',
                                    height: '16px',
                                    borderRadius: '50%',
                                    border: value === opt ? '2px solid #2374F2' : '2px solid var(--theme-border-alt)',
                                    transition: 'all 0.2s ease-in-out'
                                }}
                            ></div>
                            <div
                                style={{
                                    position: 'absolute',
                                    top: '4px',
                                    left: '4px',
                                    width: '8px',
                                    height: '8px',
                                    borderRadius: '50%',
                                    background: '#2374F2',
                                    transform: value === opt ? 'scale(1)' : 'scale(0)',
                                    opacity: value === opt ? 1 : 0,
                                    transition: 'all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
                                }}
                            ></div>
                        </div>
                        <div>
                            <div className="font-semibold m-0" style={{ fontSize: "14px", color: "var(--theme-text-dark)" }}>
                                {t(labels[index] ?? String(opt))}
                            </div>
                            {descriptions[index] && (<div className="text-gray-500 mt-1" style={{ fontSize: "13px", lineHeight: '1.4' }}>{t(descriptions[index])}</div>)}
                        </div>
                    </div>
                ))}

                <ErrorMessage name={field?.key} render={(msg) => <div className="text-red-500 text-xs mt-1">{t(msg)}</div>} />
            </div>
        </div>
    );
}

