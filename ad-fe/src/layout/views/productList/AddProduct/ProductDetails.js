
import { CustomFieldArray, CustomInput, CustomSelectFieldArray, FieldTitle, YesNoRadio } from "./ProductCommon";
import { t } from "i18next";
import { active_ingredients, external_product_information, fc_shelf_life, hair_type, product_benefit, product_expiration_type, skin_type, target_gender, unit_count } from "./CommonOptions";
import { ErrorMessage, Field } from "formik";
import React from "react";

const ProductDetails = ({ values }) => (
    <div className="flex flex-wrap -mx-3">

        <div className="flex flex-wrap -mx-3">
            <FieldTitle title={`* ${t("Bullet Points")}`} tooltip={t("bullet_point-ToolTip")} />
            <div className="w-full md:w-2/3 px-3">
                <CustomFieldArray name="bullet_point" title={`${t("Bullet Points")} *`} placeholder={t("Bullet Point")} values={values} />
            </div>
        </div>
        <div className="flex flex-wrap -mx-3">
            <FieldTitle title={`* ${t("Generic Keywords")}`} tooltip={t("generic_keyword-ToolTip")} />
            <div className="w-full md:w-2/3 px-3">
                <CustomFieldArray name="generic_keyword" title={`${t("Generic Keywords")} *`} placeholder={t("Keyword")} values={values} />
            </div>
        </div>
        {
            !Boolean(["HERBAL_SUPPLEMENT", "NUTRITIONAL_SUPPLEMENT", "VITAMIN", "PRODUCT"].includes(values?.productType)) && (
                <CustomInput name="lifestyle" title={`* ${t("Lifestyle")}`} placeholder={t("Mass Beauty")} tooltip={t("lifestyle-ToolTip")} />
            )
        }
        {
            !Boolean(["HAIR_CLEANER_CONDITIONER", "HERBAL_SUPPLEMENT", "VITAMIN", "PRODUCT"].includes(values?.productType)) && (
                <div className="flex flex-wrap -mx-3">
                    <FieldTitle title={`* ${t("Target Gender")}`} tooltip={t("target_gender-ToolTip")} />
                    <div className="w-full md:w-2/3 px-3">
                        <CustomSelectFieldArray
                            name="target_gender"
                            title={`* ${t("Target Gender")}`}
                            placeholder={t("Select Gender")}
                            values={values}
                            options={target_gender}
                            maximum={1}
                        />
                    </div>
                </div>
            )
        }
        {
            !Boolean(["PRODUCT"].includes(values?.productType)) && (
                <CustomInput name="number_of_items" title={`* ${t("Number of Items")}`} placeholder={t("Example: 25")} type="number" tooltip={t("number_of_items-ToolTip")} />
            )
        }
        <CustomInput name="item_type_name" title={`* ${t("Item Type Name")}`} placeholder={t("Watch")} tooltip={t("item_type_name-ToolTip")} />

        <div className="w-full px-3"></div>

        <CustomInput name="color" title={`* ${t("Color")}`} placeholder={t("Brown")} tooltip={t("color-ToolTip")} />
        <CustomInput name="size" title={`* ${t("Size")}`} placeholder={t("Extra Large")} tooltip={t("size-ToolTip")} />
        {
            ["HERBAL_SUPPLEMENT", "NUTRITIONAL_SUPPLEMENT"].includes(values?.productType) && (
                <CustomInput name="flavor" title={`* ${t("Flavor")}`} placeholder={t("Strawberry")} tooltip={t("flavor-ToolTip")} />
            )
        }

        <div className="w-full px-3"></div>

        <CustomInput name="part_number" title={`* ${t("Part Number")}`} placeholder={t("RIV001")} tooltip={t("part_number-ToolTip")} />
        <CustomInput name="rtip_manufacturer_contact_information" title={`* ${t("Manufacturer Contact Information")}`} placeholder={t("Manufacturer Contact Information")} tooltip={t("rtip_manufacturer_contact_information-ToolTip")} />
        {
            ["SKIN_CLEANING_AGENT", "SKIN_MOISTURIZER", "SKIN_TREATMENT_MASK"].includes(values?.productType) && (
                <div className="flex flex-wrap -mx-3">
                    <FieldTitle title={`* ${t("Product Benefits")}`} tooltip={t("product_benefit-ToolTip")} />
                    <div className="w-full md:w-2/3 px-3">
                        <CustomSelectFieldArray
                            name="product_benefit"
                            title={`* ${t("Product Benefits")}`}
                            placeholder={t("Select Benefits")}
                            values={values}
                            options={product_benefit}
                            maximum={6}
                        />
                    </div>
                </div>
            )
        }
        {
            !Boolean(["HERBAL_SUPPLEMENT", "NUTRITIONAL_SUPPLEMENT", "PRODUCT"].includes(values?.productType)) && (
                <div className="flex flex-wrap -mx-3">
                    <FieldTitle title={`* ${t("Active Ingredients")}`} tooltip={t("active_ingredients-ToolTip")} />
                    <div className="w-full md:w-2/3 px-3">
                        <CustomSelectFieldArray
                            name="active_ingredients"
                            title={`* ${t("Active Ingredients")}`}
                            placeholder={t("Select Ingredients")}
                            values={values}
                            options={active_ingredients}
                            maximum={3}
                        />
                    </div>
                </div>
            )
        }
        {
            !Boolean(["PRODUCT"].includes(values?.productType)) && (
                <div className="flex flex-wrap -mx-3">
                    <FieldTitle title={`* ${t("Ingredients")}`} tooltip={t("ingredients-ToolTip")} />
                    <div className="w-full md:w-2/3 px-3">
                        <CustomFieldArray name="ingredients" title={`${t("Ingredients")} *`} placeholder={t("Ingredients")} values={values} />
                    </div>
                </div>
            )
        }
        {
            !Boolean(["PRODUCT"].includes(values?.productType)) && (
                <YesNoRadio name={'is_expiration_dated_product'} title={`* ${t("Is Product Expirable")}`} tooltip={t("is_expiration_dated_product-ToolTip")} />
            )
        }
        {(values?.is_expiration_dated_product === "Yes") && (
            <div className="flex flex-wrap -mx-3">
                <FieldTitle title={`* ${t("Product Expiration Type")}`} tooltip={t("product_expiration_type-ToolTip")} />
                <div className="w-full md:w-2/3 px-3">
                    <div className="flex flex-wrap -mx-3">
                        {/* TYPE */}
                        <div className="w-full px-3">
                            <Field
                                as="select"
                                name="product_expiration_type"
                                className="form-select"
                            >
                                <option value="">{t("Select Type")}</option>
                                {product_expiration_type?.map((unit) => (<option value={unit?.value}>{t(unit?.label)}</option>))}
                            </Field>
                            <ErrorMessage name="product_expiration_type" render={(msg) => <div className="text-danger">{t(msg)}</div>} />
                        </div>
                    </div>
                </div>
            </div>
        )}
        {
            !Boolean(["PRODUCT"].includes(values?.productType)) && (
                <CustomInput name="item_form" title={`* ${t("Item Form")}`} placeholder={t("Liquid")} tooltip={t("item_form-ToolTip")} />
            )
        }
        {
            (values?.is_expiration_dated_product === "Yes") && (
                <React.Fragment>
                    <div className="w-full px-3"></div>

                    <CustomInput name="fc_shelf_life.value" title={`* ${t("Fulfillment Center Shelf Life")}`} placeholder={t("Example: 12")} tooltip={t("fc_shelf_life.value-ToolTip")} />
                    <div className="flex flex-wrap -mx-3">
                        <FieldTitle title={`* ${t("Fulfillment Center Shelf Life Unit")}`} tooltip={t("fc_shelf_life.unit-ToolTip")} />
                        <div className="w-full md:w-2/3 px-3">
                            <div className="flex flex-wrap -mx-3">
                                {/* TYPE */}
                                <div className="w-full px-3">
                                    <Field
                                        as="select"
                                        name="fc_shelf_life.unit"
                                        className="form-select"
                                    >
                                        <option value="">{t("Select Type")}</option>
                                        {fc_shelf_life?.map((unit) => (<option value={unit?.value}>{t(unit?.label)}</option>))}
                                    </Field>
                                    <ErrorMessage name="fc_shelf_life.unit" render={(msg) => <div className="text-danger">{t(msg)}</div>} />
                                </div>
                            </div>
                        </div>
                    </div>
                </React.Fragment>
            )
        }

        <div className="w-full px-3"></div>

        <CustomInput name="unit_count.value" title={`* ${t("Unit Counts")}`} placeholder={t("Example: 12")} tooltip={t("unit_count.value-ToolTip")} />
        <div className="flex flex-wrap -mx-3">
            <FieldTitle title={`* ${t("Unit Counts Type")}`} tooltip={t("unit_count.type-ToolTip")} />
            <div className="w-full md:w-2/3 px-3">
                <div className="flex flex-wrap -mx-3">
                    {/* TYPE */}
                    <div className="w-full px-3">
                        <Field
                            as="select"
                            name="unit_count.type"
                            className="form-select"
                        >
                            <option value="">{t("Select Type")}</option>
                            {unit_count?.map((unit) => (<option value={unit?.value}>{t(unit?.label)}</option>))}
                        </Field>
                        <ErrorMessage name="unit_count.type" render={(msg) => <div className="text-danger">{t(msg)}</div>} />
                    </div>
                </div>
            </div>
        </div>

        <div className="w-full px-3"></div>

        {
            ["CONDITIONER", "HAIR_CLEANER_CONDITIONER", "SHAMPOO", "TOPICAL_HAIR_REGROWTH_TREATMENT"].includes(values?.productType) && (
                <div className="flex flex-wrap -mx-3">
                    <FieldTitle title={`* ${t("Hair Type")}`} tooltip={t("hair_type-ToolTip")} />
                    <div className="w-full md:w-2/3 px-3">
                        <CustomSelectFieldArray
                            name="hair_type"
                            title={`* ${t("Hair Type")}`}
                            placeholder={t("Select Type")}
                            values={values}
                            options={hair_type}
                            maximum={1}
                        />
                    </div>
                </div>
            )
        }
        {
            ["SKIN_CLEANING_AGENT", "SKIN_MOISTURIZER", "SKIN_TREATMENT_MASK"].includes(values?.productType) && (
                <div className="flex flex-wrap -mx-3">
                    <FieldTitle title={`* ${t("Skin Type")}`} tooltip={t("skin_type-ToolTip")} />
                    <div className="w-full md:w-2/3 px-3">
                        <CustomSelectFieldArray
                            name="skin_type"
                            title={`* ${t("Skin Type")}`}
                            placeholder={t("Select Type")}
                            values={values}
                            options={skin_type}
                            maximum={6}
                        />
                    </div>
                </div>
            )
        }
        {
            !Boolean(["PRODUCT"].includes(values?.productType)) && (
                <React.Fragment>
                    <CustomInput name="scent" title={`* ${t("Scent")}`} placeholder={t("Lavender")} tooltip={t("scent-ToolTip")} />
                    <div className="w-full px-3"></div>
                </React.Fragment>
            )
        }

        <div className="flex flex-wrap -mx-3">
            <FieldTitle title={`* ${t("External Product Information Entity")}`} tooltip={t("external_product_information.entity-ToolTip")} />
            <div className="w-full md:w-2/3 px-3">
                <div className="flex flex-wrap -mx-3">
                    {/* TYPE */}
                    <div className="w-full px-3">
                        <Field
                            as="select"
                            name="external_product_information.entity"
                            className="form-select"
                        >
                            <option value="">{t("Select Type")}</option>
                            {external_product_information?.map((unit) => (<option value={unit?.value}>{t(unit?.label)}</option>))}
                        </Field>
                        <ErrorMessage name="external_product_information.entity" render={(msg) => <div className="text-danger">{t(msg)}</div>} />
                    </div>
                </div>
            </div>
        </div>
        <CustomInput name="external_product_information.value" title={`* ${t("External Product Information")}`} placeholder={t("61051010")} tooltip={t("external_product_information.value-ToolTip")} />

        <div className="w-full px-3"></div>

        <div className="flex flex-wrap -mx-3">
            <FieldTitle title={`* ${t("Importer Contact Information")}`} tooltip={t("importer_contact_information-ToolTip")} />
            <div className="w-full md:w-2/3 px-3">
                <CustomFieldArray name="importer_contact_information" title={`${t("Importer Contact Information")}`} placeholder={t("Importer Contact Information")} values={values} />
            </div>
        </div>
        <div className="flex flex-wrap -mx-3">
            <FieldTitle title={`* ${t("Packer Contact Information")}`} tooltip={t("packer_contact_information-ToolTip")} />
            <div className="w-full md:w-2/3 px-3">
                <CustomFieldArray name="packer_contact_information" title={`${t("Packer Contact Information")}`} placeholder={t("Packer Contact Information")} values={values} />
            </div>
        </div>

    </div>
);

export default ProductDetails;
