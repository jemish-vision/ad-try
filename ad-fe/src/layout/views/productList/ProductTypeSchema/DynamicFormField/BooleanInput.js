import { ErrorMessage } from "formik";
import { FieldTitle } from "./ProductCommon";

export default function BooleanInput({ field, fullPath, value, setFieldValue, amazonError, onAmazonErrorClear }) {
    const options = field?.enum || [];
    const labels = field?.enumNames || [];

    const amazonErrorKey = fullPath?.split('[')[0];
    const amsError = amazonError?.[amazonErrorKey];

    return (
        <div className="pf-field-row">
            <label className="pf-label">
                <FieldTitle
                    title={field.label || field?.key}
                    tooltip={field?.description ?? field.label ?? field?.key}
                />
            </label>

            <div>
                <div className="pf-radio-group">
                    {options.map((opt, index) => {
                        const checked = value === opt;
                        const id = `${fullPath}-${index}`;
                        return (
                            <label
                                key={index}
                                htmlFor={id}
                                className={`pf-radio-label${checked ? " pf-radio-checked" : ""}`}
                            >
                                <input
                                    id={id}
                                    className="pf-radio-input"
                                    type="radio"
                                    name={fullPath}
                                    checked={checked}
                                    onChange={() => {
                                        onAmazonErrorClear?.(amazonErrorKey);
                                        setFieldValue(fullPath, opt);
                                    }}
                                />
                                <span className="pf-radio-dot" />
                                {labels[index] ?? String(opt)}
                            </label>
                        );
                    })}
                </div>

                <ErrorMessage
                    name={fullPath}
                    render={(msg) => <div className="pf-error-msg">{msg}</div>}
                />
                {amsError && <div className="pf-error-msg">{amsError}</div>}
            </div>
        </div>
    );
}