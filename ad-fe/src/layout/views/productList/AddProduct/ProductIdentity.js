import { useTranslation } from "react-i18next";
import { Field, ErrorMessage } from "formik";

import { t } from "i18next";
import { CustomFieldArray, CustomInput, CustomSelectFieldArray, FieldTitle } from "./ProductCommon";
import { target_audience_keyword } from "./CommonOptions";

const ProductIdentity = ({ values }) => (
    <div className="flex flex-wrap -mx-3">

        <div className="flex flex-wrap -mx-3">
            <FieldTitle title={`* ${t("Product Type")}`} tooltip={t("productType-ToolTip")} />
            <div className="w-full md:w-2/3 px-3">
                <Field as="select" name="productType" className="form-select">
                    <option value="">{t("Select Type")}</option>
                    <option value="CONDITIONER">{t("CONDITIONER")}</option>
                    <option value="HAIR_CLEANER_CONDITIONER">{t("HAIR_CLEANER_CONDITIONER")}</option>
                    <option value="HERBAL_SUPPLEMENT">{t("HERBAL_SUPPLEMENT")}</option>
                    <option value="NUTRITIONAL_SUPPLEMENT">{t("NUTRITIONAL_SUPPLEMENT")}</option>
                    <option value="PRODUCT">{t("PRODUCT")}</option>
                    <option value="SHAMPOO">{t("SHAMPOO")}</option>
                    <option value="SKIN_CLEANING_AGENT">{t("SKIN_CLEANING_AGENT")}</option>
                    <option value="SKIN_MOISTURIZER">{t("SKIN_MOISTURIZER")}</option>
                    <option value="SKIN_TREATMENT_MASK">{t("SKIN_TREATMENT_MASK")}</option>
                    <option value="TOPICAL_HAIR_REGROWTH_TREATMENT">{t("TOPICAL_HAIR_REGROWTH_TREATMENT")}</option>
                    <option value="VITAMIN">{t("VITAMIN")}</option>
                </Field>
                <ErrorMessage name="productType" render={(msg) => <div className="text-danger">{t(msg)}</div>} />
            </div>
        </div>

        <CustomInput name="item_name" title={`* ${t("Item Name")}`} placeholder={t("Item Name")} tooltip={t("item_name-ToolTip")} />
        <CustomInput name="sku" title={`* ${t("SKU")}`} placeholder={t("SKU")} tooltip={t("sku-ToolTip")} />
        <CustomInput name="brand" title={`* ${t("Brand")}`} placeholder={t("Brand")} tooltip={t("brand-ToolTip")} />

        <div className="flex flex-wrap -mx-3">
            <FieldTitle title={`${t("External Product ID")}`} tooltip={t("externally_assigned_product_identifier-ToolTip")} />
            <div className="w-full md:w-2/3 px-3">
                <div className="flex flex-wrap -mx-3">

                    {/* VALUE */}
                    <div className="w-full md:w-1/2 px-3">
                        <Field
                            name="externally_assigned_product_identifier.value"
                            className="form-control small-placeholder"
                            type="text"
                            placeholder={t("Example: 123456789")}
                            disabled={values?.supplier_declared_has_product_identifier_exemption}
                        />
                        <ErrorMessage name="externally_assigned_product_identifier.value" render={(msg) => <div className="text-danger">{t(msg)}</div>} />
                    </div>

                    {/* TYPE */}
                    <div className="w-full md:w-1/2 px-3">
                        <Field
                            as="select"
                            name="externally_assigned_product_identifier.type"
                            className="form-select"
                            disabled={values?.supplier_declared_has_product_identifier_exemption}
                        >
                            <option value="">{t("Select Identifier")}</option>
                            <option value="ean">EAN</option>
                            <option value="gtin">GTIN</option>
                            <option value="upc">UPC</option>
                        </Field>
                        <ErrorMessage name="externally_assigned_product_identifier.type" render={(msg) => <div className="text-danger">{t(msg)}</div>} />
                    </div>

                    {/* CHECKBOX */}
                    <div className="w-full md:w-1/2 px-3">
                        <Field
                            type="checkbox"
                            name="supplier_declared_has_product_identifier_exemption"
                            id="supplier_declared_has_product_identifier_exemption"
                            className="mr-2"
                        />
                        <label htmlFor="supplier_declared_has_product_identifier_exemption" className="mb-0">
                            {t("I don't have a Product ID")}
                        </label>
                    </div>
                    <ErrorMessage name="externally_assigned_product_identifier" render={(msg) => <div className="text-danger">{t(msg)}</div>} />
                </div>
            </div>
        </div>

        {!Boolean(values?.supplier_declared_has_product_identifier_exemption || !values?.externally_assigned_product_identifier?.type || !values?.externally_assigned_product_identifier?.value) && (
            <CustomInput
                name="merchant_suggested_asin"
                title={`* ${t("Merchant Suggested ASIN")}`}
                placeholder={t("Example: B0C12345XY")}
                tooltip={t("merchant_suggested_asin-ToolTip")}
            />
        )}

        <div className="flex flex-wrap -mx-3">
            <FieldTitle title={`* ${t("Recommended Browse Nodes")}`} tooltip={t("recommended_browse_nodes-ToolTip")} />
            <div className="w-full md:w-2/3 px-3">
                <CustomFieldArray name="recommended_browse_nodes" title={`${t("Recommended Browse Nodes")} *`} placeholder={t("Browse Nodes")} values={values} />
            </div>
        </div>

        {
            (!Boolean(["HERBAL_SUPPLEMENT", "NUTRITIONAL_SUPPLEMENT", "VITAMIN", "PRODUCT"].includes(values?.productType) || !values?.productType)) && (
                <div className="flex flex-wrap -mx-3">
                    <FieldTitle title={`* ${t("Target Audience Keyword")}`} tooltip={t("target_audience_keyword-ToolTip")} />
                    <div className="w-full md:w-2/3 px-3">
                        <CustomSelectFieldArray
                            name="target_audience_keyword"
                            title={`* ${t("Target Audience Keyword")}`}
                            placeholder={t("Select Target Audience")}
                            values={values}
                            options={target_audience_keyword}
                        />
                    </div>
                </div>
            )
        }

        <CustomInput
            name="manufacturer"
            title={`* ${t("Manufacturer")}`}
            placeholder={t("Nike, Procter & Gamble")}
            tooltip={t("manufacturer-ToolTip")}
        />

    </div>
);

export default ProductIdentity;
