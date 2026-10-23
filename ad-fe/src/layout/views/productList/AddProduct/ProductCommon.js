import { ErrorMessage, Field, FieldArray } from "formik"
import React, { useState, useRef, useCallback } from "react"
import ReactDOM from "react-dom"

import { t } from "i18next";

function TooltipWrapper({ text, children }) {
    const [visible, setVisible] = useState(false);
    const [pos, setPos] = useState({ top: 0, left: 0 });
    const ref = useRef(null);

    const show = useCallback(() => {
        if (ref.current) {
            const r = ref.current.getBoundingClientRect();
            setPos({
                top: r.top - 8,
                left: r.left + r.width / 2,
            });
        }
        setVisible(true);
    }, []);

    const hide = useCallback(() => setVisible(false), []);

    return (
        <>
            <div
                ref={ref}
                onMouseEnter={show}
                onMouseLeave={hide}
                style={{ display: "inline-flex", alignItems: "center" }}
            >
                {children}
            </div>
            {visible &&
                ReactDOM.createPortal(
                    <div
                        style={{
                            position: "fixed",
                            top: pos.top,
                            left: pos.left,
                            transform: "translate(-50%, -100%)",
                            zIndex: 99999,
                            pointerEvents: "none",
                            whiteSpace: "nowrap",
                            background: "linear-gradient(135deg, #1A9FD4 0%, #2374F2 100%)",
                            color: "#fff",
                            fontSize: "11px",
                            fontWeight: 600,
                            padding: "5px 10px",
                            borderRadius: "6px",
                            boxShadow: "0 4px 14px rgba(2,70,139,0.3)",
                            border: "1px solid rgba(255,255,255,0.15)",
                            marginBottom: "6px",
                        }}
                    >
                        {text}
                        <div
                            style={{
                                position: "absolute",
                                bottom: "-5px",
                                left: "50%",
                                transform: "translateX(-50%) rotate(45deg)",
                                width: "8px",
                                height: "8px",
                                backgroundColor: "#2374F2",
                            }}
                        />
                    </div>,
                    document.body
                )}
        </>
    );
}

export const FieldTitle = ({ title, tooltip = "Fill this field" }) => {
    return (
        <div className="w-full md:w-1/4 px-3" style={{ fontSize: "14px", fontWeight: 600 }}>
            <p className="mb-0 mr-1 text-end" style={{ fontWeight: 600, fontSize: "14px" }}>{title}</p>
            {tooltip && (
                <TooltipWrapper text={tooltip}>
                    <i
                        className="fa fa-question-circle ml-1"
                        aria-hidden="true"
                        style={{ cursor: "pointer", fontSize: "13px" }}
                    ></i>
                </TooltipWrapper>
            )}
        </div>
    );
};

export const CustomInput = ({ name, title, type = "text", placeholder, tooltip }) => {
    return (
        <React.Fragment>
            <div className="flex flex-wrap -mx-3">
                <FieldTitle title={title} tooltip={tooltip} />
                <div className="w-full md:w-2/3 px-3">
                    <Field name={name} className="form-control small-placeholder" type={type} placeholder={placeholder} />
                    <ErrorMessage name={name} render={(msg) => <div className="text-red-500">{t(msg)}</div>} />
                </div>
            </div>
        </React.Fragment>
    )
}

export const CustomSelectFieldArray = ({
    name,
    placeholder,
    values,
    options = [],
    maximum,
    minimum = 1,
    disabled = false
}) => {
    return (
        <React.Fragment>
            <FieldArray name={name}>
                {({ push, remove }) => {
                    const selectedValues = values?.[name] || [];
                    const canAddMore = !maximum || selectedValues.length < maximum;
                    return (
                        <div className="w-full px-3">
                            {selectedValues.map((_, index) => {
                                const currentValue = selectedValues[index];
                                const availableOptions = options.filter(
                                    opt => !selectedValues.includes(opt.value) || opt.value === currentValue
                                );

                                return (
                                    <div className="flex flex-wrap -mx-3" key={index}>
                                        <div className="w-full px-3">
                                            <Field
                                                as="select"
                                                name={`${name}[${index}]`}
                                                className="form-select small-placeholder"
                                                disabled={disabled}
                                            >
                                                <option value="">{placeholder || "Select option"}</option>
                                                {availableOptions.map((opt, i) => (
                                                    <option key={i} value={opt.value}>
                                                        {t(opt.label)}
                                                    </option>
                                                ))}
                                            </Field>

                                            {/* 🔹 Only show delete if above minimum */}
                                            {selectedValues.length > minimum && (
                                                <i
                                                    className="fa-solid fa-trash text-red-500"
                                                    style={{
                                                        cursor: disabled ? "not-allowed" : "pointer",
                                                        opacity: disabled ? 0.5 : 1
                                                    }}
                                                    onClick={() => !disabled && remove(index)}
                                                ></i>
                                            )}
                                        </div>

                                        <ErrorMessage
                                            name={`${name}[${index}]`}
                                            render={(msg) => <div className="text-red-500">{t(msg)}</div>}
                                        />
                                    </div>
                                );
                            })}

                            {!Boolean(selectedValues.length) && (
                                <div className="text-gray-500 fst-italic pl-2">{t("No entries found")}</div>
                            )}

                            <div className="flex justify-between items-center mt-3">
                                <button type="button"
                                    className="outline-blue"
                                    variant="outline-dark"
                                    size="sm"
                                    onClick={() => push("")}
                                    disabled={!canAddMore || disabled}
                                >
                                    + {t("Add")}
                                </button>

                                {/* 🔹 Show helper message if maximum reached */}
                                {maximum && selectedValues.length >= maximum && (
                                    <span className="text-gray-500 small ml-2">
                                        {t("Maximum")} {maximum} {t("entries allowed")}
                                    </span>
                                )}
                            </div>
                        </div>
                    );
                }}
            </FieldArray>
        </React.Fragment>
    );
};

export const CustomFieldArray = ({ name, title, type = "text", placeholder, values }) => {
    return (
        <React.Fragment>
            <FieldArray name={name}>
                {({ push, remove }) => (
                    <div className="w-full px-3">
                        {values?.[name]?.map((_, index) => (
                            <div className="flex flex-wrap -mx-3" key={index}>
                                <div className="w-full px-3">
                                    <Field
                                        name={`${name}[${index}]`}
                                        type={type}
                                        className="form-control small-placeholder"
                                        placeholder={`${placeholder} #${index + 1}`}
                                    />
                                    {
                                        !Boolean(values?.[name]?.length === 1) && (
                                            <i class="fa-solid fa-trash" onClick={() => remove(index)}></i>
                                        )
                                    }
                                </div>
                                <ErrorMessage name={`${name}[${index}]`} render={(msg) => <div className="text-red-500">{t(msg)}</div>} />
                            </div>
                        ))}

                        {
                            !Boolean(values?.[name]?.length) && (
                                <div className="text-gray-500 fst-italic pl-2">
                                    {t("No entries found")}
                                </div>

                            )
                        }

                        <div className="flex justify-between items-center mt-3">
                            <button type="button" className="outline-blue" variant="outline-dark" size="sm" onClick={() => push("")}>
                                + {t("Add")}
                            </button>
                        </div>
                    </div>
                )}
            </FieldArray>
        </React.Fragment>
    )
}

export const YesNoRadio = ({ name, title, tooltip }) => {
    return (
        <div className="flex flex-wrap -mx-3">
            <FieldTitle title={title} tooltip={tooltip} />
            <div className="w-full md:w-2/3 px-3">
                <div className="px-3">

                    {/* YES */}
                    <label className="flex items-start gap-2 mb-2">
                        <Field
                            type="radio"
                            name={name}
                            value="Yes"
                        />
                        <span>{t("Yes")}</span>
                    </label>

                    {/* NO */}
                    <label className="flex items-start gap-2">
                        <Field
                            type="radio"
                            name={name}
                            value="No"
                        />
                        <span>{t("No")}</span>
                    </label>

                </div>

                <ErrorMessage
                    name={name}
                    render={(msg) => <div className="text-red-500">{t(msg)}</div>}
                />
            </div>
        </div>
    );
};

export const CustomNutritionalInfoArray = ({ name, values, options }) => {
    return (
        <FieldArray name={name}>
            {({ push, remove }) => (
                <div className="w-full px-3">

                    {values?.[name]?.map((info, index) => (
                        <div key={index} className="border rounded p-3 mb-3 bg-gray-100">
                            <div className="flex flex-wrap -mx-3">
                                <div className="w-full md:w-1/3 px-3">
                                    <Field
                                        name={`${name}[${index}].serving_quantity`}
                                        type="number"
                                        className="form-control"
                                        placeholder={t("Serving Quantity")}
                                    />
                                    <ErrorMessage
                                        name={`${name}[${index}].serving_quantity`}
                                        component="div"
                                        className="text-red-500"
                                    />
                                </div>
                                <div className="w-full md:w-1/3 px-3">
                                    <Field
                                        as="select"
                                        name={`${name}[${index}].serving_unit`}
                                        className="form-select"
                                    >
                                        <option value="">{t("Select Serving Unit")}</option>
                                        {options?.map((options) => (
                                            <option key={options?.value} value={options?.value}>
                                                {t(options?.label)}
                                            </option>
                                        ))}
                                    </Field>
                                    <ErrorMessage
                                        name={`${name}[${index}].serving_unit`}
                                        render={(msg) => <div className="text-red-500">{t(msg)}</div>}
                                    />
                                </div>
                                <div className="w-full md:w-1/6 px-3">
                                    {
                                        !Boolean(values?.[name]?.length === 1) && (
                                            <i
                                                className="fa-solid fa-trash text-red-500 cursor-pointer"
                                                onClick={() => remove(index)}
                                                title={t("Remove Serving")}
                                            ></i>
                                        )
                                    }
                                </div>
                            </div>

                            {/* ✅ Vitamins and Minerals Sub-array */}
                            <FieldArray name={`${name}[${index}].vitamins_and_minerals`}>
                                {({ push, remove }) => (
                                    <div className="pl-3">
                                        <div className="flex justify-between items-center mb-2">
                                            <label className="font-bold small">{t("Vitamins & Minerals")}</label>
                                        </div>

                                        {info.vitamins_and_minerals?.map((_, subIndex) => (
                                            <div className="flex flex-wrap -mx-3" key={subIndex}>
                                                <div className="w-full md:w-1/3 px-3">
                                                    <Field
                                                        name={`${name}[${index}].vitamins_and_minerals[${subIndex}].nutrient`}
                                                        type="text"
                                                        className="form-control"
                                                        placeholder={`${t("Nutrient (e.g. Vitamin C)")}`}
                                                    />
                                                    <ErrorMessage
                                                        name={`${name}[${index}].vitamins_and_minerals[${subIndex}].nutrient`}
                                                        render={(msg) => <div className="text-red-500">{t(msg)}</div>}
                                                    />
                                                </div>
                                                <div className="w-full md:w-1/4 px-3">
                                                    <Field
                                                        as="select"
                                                        name={`${name}[${index}].vitamins_and_minerals[${subIndex}].unit`}
                                                        className="form-select"
                                                    >
                                                        <option value="">{t("Select Unit")}</option>
                                                        {options?.map((options) => (
                                                            <option key={options?.value} value={options?.value}>
                                                                {t(options?.label)}
                                                            </option>
                                                        ))}
                                                    </Field>
                                                    <ErrorMessage
                                                        name={`${name}[${index}].vitamins_and_minerals[${subIndex}].unit`}
                                                        render={(msg) => <div className="text-red-500">{t(msg)}</div>}
                                                    />
                                                </div>
                                                <div className="w-full md:w-1/4 px-3">
                                                    <Field
                                                        name={`${name}[${index}].vitamins_and_minerals[${subIndex}].value`}
                                                        type="number"
                                                        className="form-control"
                                                        placeholder={t("Value")}
                                                    />
                                                    <ErrorMessage
                                                        name={`${name}[${index}].vitamins_and_minerals[${subIndex}].value`}
                                                        render={(msg) => <div className="text-red-500">{t(msg)}</div>}
                                                    />
                                                </div>
                                                <div className="w-full md:w-1/6 px-3">
                                                    {
                                                        !Boolean(values?.[name]?.[index]?.[`vitamins_and_minerals`]?.length === 1) && (
                                                            <i
                                                                className="fa-solid fa-trash text-red-500 cursor-pointer"
                                                                onClick={() => remove(subIndex)}
                                                            ></i>
                                                        )
                                                    }
                                                </div>
                                            </div>
                                        ))}

                                        <div className="flex justify-between items-center mt-3">
                                            <button type="button" className="outline-blue" variant="outline-dark" size="sm" onClick={() =>
                                                push({ nutrient: "", unit: "", value: "" })
                                            }>
                                                + {t("Add")}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </FieldArray>
                        </div>
                    ))}

                    {/* <div className="flex justify-between items-center mt-3">
                        <button type="button" className="outline-blue" variant="outline-dark" size="sm" onClick={() =>
                            push({
                                serving_quantity: "",
                                serving_unit: "",
                                vitamins_and_minerals: [
                                    { nutrient: "", unit: "", value: "" }
                                ],
                            })
                        }>
                            + {t("Add")}
                        </button>
                    </div> */}

                    {!values?.[name]?.length && (
                        <div className="text-gray-500 fst-italic pl-2">{t("No nutritional info added")}</div>
                    )}
                </div>
            )}
        </FieldArray>
    );
};