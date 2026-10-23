
import { CustomFieldArray, CustomInput, FieldTitle } from "./ProductCommon";
import { t } from "i18next";
import { item_dimensions, item_package_dimensions } from "./CommonOptions";
import { ErrorMessage, Field } from "formik";

const Shipping = () => (
    <div className="flex flex-wrap -mx-3">

        <fieldset className="border rounded p-3 position-relative flex flex-col gap-3">
            <legend className="float-none w-auto px-2 font-bold h6">
                {t("Item Dimensions")}
            </legend>
            <fieldset className="border rounded p-3 position-relative flex flex-col gap-3">
                <legend className="float-none w-auto px-2 font-bold h6">
                    {t("Item Length")}
                </legend>
                <CustomInput name="item_dimensions.length.value" title={`* ${t("Item Length")}`} placeholder={t("Example: 5")} tooltip={t("item_dimensions.length.value-ToolTip")} />
                <div className="flex flex-wrap -mx-3">
                    <FieldTitle title={`* ${t("Item Length Unit")}`} tooltip={t("item_dimensions.length.unit-ToolTip")} />
                    <div className="w-full md:w-2/3 px-3">
                        <div className="flex flex-wrap -mx-3">
                            <div className="w-full px-3">
                                <Field
                                    as="select"
                                    name="item_dimensions.length.unit"
                                    className="form-select"
                                >
                                    <option value="">{t("Select Type")}</option>
                                    {item_dimensions?.map((unit) => (<option value={unit?.value}>{t(unit?.label)}</option>))}
                                </Field>
                                <ErrorMessage name="item_dimensions.length.unit" render={(msg) => <div className="text-danger">{t(msg)}</div>} />
                            </div>
                        </div>
                    </div>
                </div>
            </fieldset>
            <fieldset className="border rounded p-3 position-relative flex flex-col gap-3">
                <legend className="float-none w-auto px-2 font-bold h6">
                    {t("Item Width")}
                </legend>
                <CustomInput name="item_dimensions.width.value" title={`* ${t("Item Width")}`} placeholder={t("Example: 5")} tooltip={t("item_dimensions.width.value-ToolTip")} />
                <div className="flex flex-wrap -mx-3">
                    <FieldTitle title={`* ${t("Item Width Unit")}`} tooltip={t("item_dimensions.width.unit-ToolTip")} />
                    <div className="w-full md:w-2/3 px-3">
                        <div className="flex flex-wrap -mx-3">
                            <div className="w-full px-3">
                                <Field
                                    as="select"
                                    name="item_dimensions.width.unit"
                                    className="form-select"
                                >
                                    <option value="">{t("Select Type")}</option>
                                    {item_dimensions?.map((unit) => (<option value={unit?.value}>{t(unit?.label)}</option>))}
                                </Field>
                                <ErrorMessage name="item_dimensions.width.unit" render={(msg) => <div className="text-danger">{t(msg)}</div>} />
                            </div>
                        </div>
                    </div>
                </div>
            </fieldset>
            <fieldset className="border rounded p-3 position-relative flex flex-col gap-3">
                <legend className="float-none w-auto px-2 font-bold h6">
                    {t("Item Height")}
                </legend>
                <CustomInput name="item_dimensions.height.value" title={`* ${t("Item Height")}`} placeholder={t("Example: 5")} tooltip={t("item_dimensions.height.value-ToolTip")} />
                <div className="flex flex-wrap -mx-3">
                    <FieldTitle title={`* ${t("Item Height Unit")}`} tooltip={t("item_dimensions.height.unit-ToolTip")} />
                    <div className="w-full md:w-2/3 px-3">
                        <div className="flex flex-wrap -mx-3">
                            <div className="w-full px-3">
                                <Field
                                    as="select"
                                    name="item_dimensions.height.unit"
                                    className="form-select"
                                >
                                    <option value="">{t("Select Type")}</option>
                                    {item_dimensions?.map((unit) => (<option value={unit?.value}>{t(unit?.label)}</option>))}
                                </Field>
                                <ErrorMessage name="item_dimensions.height.unit" render={(msg) => <div className="text-danger">{t(msg)}</div>} />
                            </div>
                        </div>
                    </div>
                </div>
            </fieldset>
        </fieldset>

        <fieldset className="border rounded p-3 position-relative flex flex-col gap-3">
            <legend className="float-none w-auto px-2 font-bold h6">
                {t("Item Package Dimensions")}
            </legend>
            <fieldset className="border rounded p-3 position-relative flex flex-col gap-3">
                <legend className="float-none w-auto px-2 font-bold h6">
                    {t("Package Length")}
                </legend>
                <CustomInput name="item_package_dimensions.length.value" title={`* ${t("Package Length")}`} placeholder={t("Example: 5")} tooltip={t("item_package_dimensions.length.value-ToolTip")} />
                <div className="flex flex-wrap -mx-3">
                    <FieldTitle title={`* ${t("Package Length Unit")}`} tooltip={t("item_package_dimensions.length.unit-ToolTip")} />
                    <div className="w-full md:w-2/3 px-3">
                        <div className="flex flex-wrap -mx-3">
                            <div className="w-full px-3">
                                <Field
                                    as="select"
                                    name="item_package_dimensions.length.unit"
                                    className="form-select"
                                >
                                    <option value="">{t("Select Type")}</option>
                                    {item_package_dimensions?.map((unit) => (<option value={unit?.value}>{t(unit?.label)}</option>))}
                                </Field>
                                <ErrorMessage name="item_package_dimensions.length.unit" render={(msg) => <div className="text-danger">{t(msg)}</div>} />
                            </div>
                        </div>
                    </div>
                </div>
            </fieldset>
            <fieldset className="border rounded p-3 position-relative flex flex-col gap-3">
                <legend className="float-none w-auto px-2 font-bold h6">
                    {t("Package Width")}
                </legend>
                <CustomInput name="item_package_dimensions.width.value" title={`* ${t("Package Width")}`} placeholder={t("Example: 5")} tooltip={t("item_package_dimensions.width.value-ToolTip")} />
                <div className="flex flex-wrap -mx-3">
                    <FieldTitle title={`* ${t("Package Width Unit")}`} tooltip={t("item_package_dimensions.width.unit-ToolTip")} />
                    <div className="w-full md:w-2/3 px-3">
                        <div className="flex flex-wrap -mx-3">
                            <div className="w-full px-3">
                                <Field
                                    as="select"
                                    name="item_package_dimensions.width.unit"
                                    className="form-select"
                                >
                                    <option value="">{t("Select Type")}</option>
                                    {item_package_dimensions?.map((unit) => (<option value={unit?.value}>{t(unit?.label)}</option>))}
                                </Field>
                                <ErrorMessage name="item_package_dimensions.width.unit" render={(msg) => <div className="text-danger">{t(msg)}</div>} />
                            </div>
                        </div>
                    </div>
                </div>
            </fieldset>
            <fieldset className="border rounded p-3 position-relative flex flex-col gap-3">
                <legend className="float-none w-auto px-2 font-bold h6">
                    {t("Package Height")}
                </legend>
                <CustomInput name="item_package_dimensions.height.value" title={`* ${t("Package Height")}`} placeholder={t("Example: 5")} tooltip={t("item_package_dimensions.height.value-ToolTip")} />
                <div className="flex flex-wrap -mx-3">
                    <FieldTitle title={`* ${t("Package Height Unit")}`} tooltip={t("item_package_dimensions.height.unit-ToolTip")} />
                    <div className="w-full md:w-2/3 px-3">
                        <div className="flex flex-wrap -mx-3">
                            <div className="w-full px-3">
                                <Field
                                    as="select"
                                    name="item_package_dimensions.height.unit"
                                    className="form-select"
                                >
                                    <option value="">{t("Select Type")}</option>
                                    {item_package_dimensions?.map((unit) => (<option value={unit?.value}>{t(unit?.label)}</option>))}
                                </Field>
                                <ErrorMessage name="item_package_dimensions.height.unit" render={(msg) => <div className="text-danger">{t(msg)}</div>} />
                            </div>
                        </div>
                    </div>
                </div>
            </fieldset>
        </fieldset>

    </div>
);

export default Shipping;
