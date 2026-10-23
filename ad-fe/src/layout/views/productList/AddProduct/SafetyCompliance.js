import { Field, ErrorMessage } from "formik";

import { t } from "i18next";
import { CustomFieldArray, CustomInput, CustomNutritionalInfoArray, CustomSelectFieldArray, FieldTitle, YesNoRadio } from "./ProductCommon";
import { age_range_description, allergen_information, form_factor, fssai_veg_non_veg_status, ghs, hazmat, item_package_weight, item_weight, melting_temperature, serving_unit, supplier_declared_dg_hz_regulation, volume } from "./CommonOptions";
import React from "react";

const SafetyCompliance = ({ values, country }) => (
    <div className="flex flex-wrap -mx-3">

        {
            !Boolean(["PRODUCT"].includes(values?.productType)) && (
                <div className="flex flex-wrap -mx-3">
                    <FieldTitle title={`* ${t("Safety Warnings")}`} tooltip={t("safety_warning-ToolTip")} />
                    <div className="w-full md:w-2/3 px-3">
                        <CustomFieldArray name="safety_warning" title={`${t("Safety Warnings")}`} placeholder={t("Safety Warnings")} values={values} />
                    </div>
                </div>
            )
        }
        <div className="flex flex-wrap -mx-3">
            <FieldTitle title={`* ${t("Country of Origin")}`} tooltip={t("country_of_origin-ToolTip")} />
            <div className="w-full md:w-2/3 px-3">
                <div className="flex flex-wrap -mx-3">
                    {/* COUNTRY */}
                    <div className="w-full px-3">
                        <Field
                            as="select"
                            name="country_of_origin"
                            className="form-select"
                        >
                            <option value="">Select</option>
                            {country?.map((cur) => (<option value={cur?.value}>{cur?.title}</option>))}
                        </Field>
                        <ErrorMessage
                            name="country_of_origin"
                            render={(msg) => <div className="text-danger">{t(msg)}</div>}
                        />
                    </div>
                </div>
            </div>
        </div>
        {
            ["CONDITIONER", "HAIR_CLEANER_CONDITIONER", "TOPICAL_HAIR_REGROWTH_TREATMENT", "SHAMPOO", "SKIN_CLEANING_AGENT", "SKIN_TREATMENT_MASK", "HERBAL_SUPPLEMENT", "PRODUCT", "VITAMIN"].includes(values?.productType) && (
                <div className="flex flex-wrap -mx-3">
                    <FieldTitle title={`* ${t("Dangerous Goods Regulations")}`} tooltip={t("supplier_declared_dg_hz_regulation-ToolTip")} />
                    <div className="w-full md:w-2/3 px-3">
                        <CustomSelectFieldArray
                            name="supplier_declared_dg_hz_regulation"
                            title={`* ${t("Dangerous Goods Regulations")}`}
                            placeholder={t("Select Regulations")}
                            values={values}
                            options={supplier_declared_dg_hz_regulation}
                        />
                    </div>
                </div>
            )
        }
        {
            values?.supplier_declared_dg_hz_regulation?.includes("ghs") && (
                <div className="flex flex-wrap -mx-3">
                    <FieldTitle title={`* ${t("GHS")}`} tooltip={t("ghs-ToolTip")} />
                    <div className="w-full md:w-2/3 px-3">
                        <div className="flex flex-wrap -mx-3">
                            {/* TYPE */}
                            <div className="w-full px-3">
                                <Field
                                    as="select"
                                    name="ghs"
                                    className="form-select"
                                >
                                    <option value="">{t("Select Type")}</option>
                                    {ghs?.map((unit) => (<option value={unit?.value}>{t(unit?.label)}</option>))}
                                </Field>
                                <ErrorMessage name="ghs" render={(msg) => <div className="text-danger">{t(msg)}</div>} />
                            </div>
                        </div>
                    </div>
                </div>
            )
        }
        {
            values?.supplier_declared_dg_hz_regulation?.includes("ghs") && (
                <CustomInput name="safety_data_sheet_url" title={`* ${t("Safety Data Sheet URL")}`} placeholder={t("Safety Data Sheet URL")} tooltip={t("safety_data_sheet_url-ToolTip")} />
            )
        }
        {
            !Boolean(["PRODUCT"].includes(values?.productType)) && (
                <YesNoRadio name={'contains_liquid_contents'} title={`* ${t("Contains Liquid Contents?")}`} tooltip={t("contains_liquid_contents-ToolTip")} />
            )
        }
        {
            ["HERBAL_SUPPLEMENT", "NUTRITIONAL_SUPPLEMENT", "VITAMIN"].includes(values?.productType) && (
                <div className="flex flex-wrap -mx-3">
                    <FieldTitle title={`* ${t("Vegetarian/Non-Vegetarian")}`} tooltip={t("fssai_veg_non_veg_status-ToolTip")} />
                    <div className="w-full md:w-2/3 px-3">
                        <div className="flex flex-wrap -mx-3">
                            {/* TYPE */}
                            <div className="w-full px-3">
                                <Field
                                    as="select"
                                    name="fssai_veg_non_veg_status"
                                    className="form-select"
                                >
                                    <option value="">{t("Select Type")}</option>
                                    {fssai_veg_non_veg_status?.map((unit) => (<option value={unit?.value}>{t(unit?.label)}</option>))}
                                </Field>
                                <ErrorMessage name="fssai_veg_non_veg_status" render={(msg) => <div className="text-danger">{t(msg)}</div>} />
                            </div>
                        </div>
                    </div>
                </div>
            )
        }
        {
            ["HERBAL_SUPPLEMENT", "NUTRITIONAL_SUPPLEMENT", "VITAMIN"].includes(values?.productType) && (
                <YesNoRadio name={'contains_food_or_beverage'} title={`* ${t("Contains Food or Beverage")}`} tooltip={t("contains_food_or_beverage-ToolTip")} />
            )
        }

        <div className="w-full px-3"></div>

        {
            values?.supplier_declared_dg_hz_regulation?.includes("transportation") && (
                <React.Fragment>
                    <CustomInput name="hazmat.value" title={`* ${t("Hazmat")}`} placeholder={t("Example: UN1993")} tooltip={t("hazmat.value-ToolTip")} />
                    <div className="flex flex-wrap -mx-3">
                        <FieldTitle title={`* ${t("Hazmat Aspect")}`} tooltip={t("hazmat.aspect-ToolTip")} />
                        <div className="w-full md:w-2/3 px-3">
                            <div className="flex flex-wrap -mx-3">
                                {/* TYPE */}
                                <div className="w-full px-3">
                                    <Field
                                        as="select"
                                        name="hazmat.aspect"
                                        className="form-select"
                                    >
                                        <option value="">{t("Select Type")}</option>
                                        {hazmat?.map((unit) => (<option value={unit?.value}>{t(unit?.label)}</option>))}
                                    </Field>
                                    <ErrorMessage name="hazmat.aspect" render={(msg) => <div className="text-danger">{t(msg)}</div>} />
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="w-full px-3"></div>
                </React.Fragment>
            )
        }

        {
            !Boolean(["PRODUCT"].includes(values?.productType)) && (
                <React.Fragment>
                    <CustomInput name="liquid_volume.value" title={`* ${t("Liquid Volume")}`} placeholder={t("Example: 10.0")} type="number" tooltip={t("liquid_volume.value-ToolTip")} />
                    <div className="flex flex-wrap -mx-3">
                        <FieldTitle title={`* ${t("Liquid Volume Unit")}`} tooltip={t("liquid_volume.unit-ToolTip")} />
                        <div className="w-full md:w-2/3 px-3">
                            <div className="flex flex-wrap -mx-3">
                                {/* TYPE */}
                                <div className="w-full px-3">
                                    <Field
                                        as="select"
                                        name="liquid_volume.unit"
                                        className="form-select"
                                    >
                                        <option value="">{t("Select Type")}</option>
                                        {volume?.map((unit) => (<option value={unit?.value}>{t(unit?.label)}</option>))}
                                    </Field>
                                    <ErrorMessage name="liquid_volume.unit" render={(msg) => <div className="text-danger">{t(msg)}</div>} />
                                </div>
                            </div>
                        </div>
                    </div>
                </React.Fragment>
            )
        }
        {
            ["HERBAL_SUPPLEMENT", "NUTRITIONAL_SUPPLEMENT", "VITAMIN"].includes(values?.productType) && (
                <CustomInput name="liquid_contents_description" title={`* ${t("Liquid Contents Description")}`} placeholder={t("Liquid Contents Description")} tooltip={t("liquid_contents_description-ToolTip")} />
            )
        }

        {
            !Boolean(["PRODUCT"].includes(values?.productType)) && (
                <div className="w-full px-3"></div>
            )
        }

        {
            ["SHAMPOO"].includes(values?.productType) && (
                <React.Fragment>
                    <CustomInput name="item_volume.value" title={`* ${t("Item Volume")}`} placeholder={t("Example: 10.0")} type="number" tooltip={t("item_volume.value-ToolTip")} />
                    <div className="flex flex-wrap -mx-3">
                        <FieldTitle title={`* ${t("Item Volume Unit")}`} tooltip={t("item_volume.unit-ToolTip")} />
                        <div className="w-full md:w-2/3 px-3">
                            <div className="flex flex-wrap -mx-3">
                                {/* TYPE */}
                                <div className="w-full px-3">
                                    <Field
                                        as="select"
                                        name="item_volume.unit"
                                        className="form-select"
                                    >
                                        <option value="">{t("Select Type")}</option>
                                        {volume?.map((unit) => (<option value={unit?.value}>{t(unit?.label)}</option>))}
                                    </Field>
                                    <ErrorMessage name="item_volume.unit" render={(msg) => <div className="text-danger">{t(msg)}</div>} />
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="w-full px-3"></div>
                </React.Fragment>
            )
        }

        <CustomInput name="item_weight.value" title={`* ${t("Item Weight")}`} placeholder={t("Example: 12")} tooltip={t("item_weight.value-ToolTip")} />
        <div className="flex flex-wrap -mx-3">
            <FieldTitle title={`* ${t("Item Weight Unit")}`} tooltip={t("item_weight.unit-ToolTip")} />
            <div className="w-full md:w-2/3 px-3">
                <div className="flex flex-wrap -mx-3">
                    {/* TYPE */}
                    <div className="w-full px-3">
                        <Field
                            as="select"
                            name="item_weight.unit"
                            className="form-select"
                        >
                            <option value="">{t("Select Type")}</option>
                            {item_weight?.map((unit) => (<option value={unit?.value}>{t(unit?.label)}</option>))}
                        </Field>
                        <ErrorMessage name="item_weight.unit" render={(msg) => <div className="text-danger">{t(msg)}</div>} />
                    </div>
                </div>
            </div>
        </div>

        <div className="w-full px-3"></div>

        <CustomInput name="item_package_weight.value" title={`* ${t("Package Weight")}`} placeholder={t("Example: 12")} tooltip={t("item_package_weight.value-ToolTip")} />
        <div className="flex flex-wrap -mx-3">
            <FieldTitle title={`* ${t("Package Weight Unit")}`} tooltip={t("item_package_weight.unit-ToolTip")} />
            <div className="w-full md:w-2/3 px-3">
                <div className="flex flex-wrap -mx-3">
                    {/* TYPE */}
                    <div className="w-full px-3">
                        <Field
                            as="select"
                            name="item_package_weight.unit"
                            className="form-select"
                        >
                            <option value="">{t("Select Type")}</option>
                            {item_package_weight?.map((unit) => (<option value={unit?.value}>{t(unit?.label)}</option>))}
                        </Field>
                        <ErrorMessage name="item_package_weight.unit" render={(msg) => <div className="text-danger">{t(msg)}</div>} />
                    </div>
                </div>
            </div>
        </div>

        <div className="w-full px-3"></div>

        {
            ["SKIN_CLEANING_AGENT", "SKIN_MOISTURIZER", "HERBAL_SUPPLEMENT", "NUTRITIONAL_SUPPLEMENT", "VITAMIN"].includes(values?.productType) && (
                <React.Fragment>
                    <CustomInput name="melting_temperature.value" title={`* ${t("Melting Temperature")}`} placeholder={t("Example: 10.0")} type="number" tooltip={t("melting_temperature.value-ToolTip")} />
                    <div className="flex flex-wrap -mx-3">
                        <FieldTitle title={`* ${t("Melting Temperature Unit")}`} tooltip={t("melting_temperature.unit-ToolTip")} />
                        <div className="w-full md:w-2/3 px-3">
                            <div className="flex flex-wrap -mx-3">
                                {/* TYPE */}
                                <div className="w-full px-3">
                                    <Field
                                        as="select"
                                        name="melting_temperature.unit"
                                        className="form-select"
                                    >
                                        <option value="">{t("Select Type")}</option>
                                        {melting_temperature?.map((unit) => (<option value={unit?.value}>{t(unit?.label)}</option>))}
                                    </Field>
                                    <ErrorMessage name="melting_temperature.unit" render={(msg) => <div className="text-danger">{t(msg)}</div>} />
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="w-full px-3"></div>
                </React.Fragment>
            )
        }

        {
            ["VITAMIN"].includes(values?.productType) && (
                <React.Fragment>
                    <div className="flex flex-wrap -mx-3">
                        <FieldTitle title={`* ${t("Age Range Description")}`} tooltip={t("age_range_description-ToolTip")} />
                        <div className="w-full md:w-2/3 px-3">
                            <div className="flex flex-wrap -mx-3">
                                {/* TYPE */}
                                <div className="w-full px-3">
                                    <Field
                                        as="select"
                                        name="age_range_description"
                                        className="form-select"
                                    >
                                        <option value="">{t("Select Age Range")}</option>
                                        {age_range_description?.map((unit) => (<option value={unit?.value}>{t(unit?.label)}</option>))}
                                    </Field>
                                    <ErrorMessage name="age_range_description" render={(msg) => <div className="text-danger">{t(msg)}</div>} />
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-wrap -mx-3">
                        <FieldTitle title={`* ${t("Form Factor")}`} tooltip={t("form_factor-ToolTip")} />
                        <div className="w-full md:w-2/3 px-3">
                            <div className="flex flex-wrap -mx-3">
                                {/* TYPE */}
                                <div className="w-full px-3">
                                    <Field
                                        as="select"
                                        name="form_factor"
                                        className="form-select"
                                    >
                                        <option value="">{t("Select Factor")}</option>
                                        {form_factor?.map((unit) => (<option value={unit?.value}>{t(unit?.label)}</option>))}
                                    </Field>
                                    <ErrorMessage name="form_factor" render={(msg) => <div className="text-danger">{t(msg)}</div>} />
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-wrap -mx-3">
                        <FieldTitle title={`* ${t("Allergen Information")}`} tooltip={t("allergen_information-ToolTip")} />
                        <div className="w-full md:w-2/3 px-3">
                            <CustomSelectFieldArray
                                name="allergen_information"
                                title={`* ${t("Allergen Information")}`}
                                placeholder={t("Select Information")}
                                values={values}
                                options={allergen_information}
                                maximum={20}
                            />
                        </div>
                    </div>
                    <div className="w-full px-3"></div>
                </React.Fragment>
            )
        }

        {
            ["HERBAL_SUPPLEMENT", "VITAMIN"].includes(values?.productType) && (
                <React.Fragment>
                    <div className="flex flex-wrap -mx-3">
                        <FieldTitle title={`* ${t("Nutritional Info. (Vitamins And Minerals)")}`} tooltip={t("nutritional_info-ToolTip")} />
                        <div className="w-full md:w-2/3 px-3">
                            <CustomNutritionalInfoArray
                                name="nutritional_info"
                                title={t("Nutritional Info. (Vitamins And Minerals)")}
                                values={values}
                                options={serving_unit}
                            />
                        </div>
                    </div>
                    <div className="w-full px-3"></div>
                </React.Fragment>
            )
        }

        {
            !Boolean(["PRODUCT"].includes(values?.productType)) && (
                <YesNoRadio name={'is_liquid_double_sealed'} title={`* ${t("Is the liquid product double sealed?")}`} tooltip={t("is_liquid_double_sealed-ToolTip")} />
            )
        }
        {
            ["SKIN_CLEANING_AGENT", "SKIN_MOISTURIZER", "HERBAL_SUPPLEMENT", "NUTRITIONAL_SUPPLEMENT", "VITAMIN"].includes(values?.productType) && (
                <YesNoRadio name={'is_heat_sensitive'} title={`* ${t("Is the Item Heat Sensitive?")}`} tooltip={t("is_heat_sensitive-ToolTip")} />
            )
        }

    </div>
);

export default SafetyCompliance;
