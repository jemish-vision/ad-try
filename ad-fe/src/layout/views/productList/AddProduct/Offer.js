import { useTranslation } from "react-i18next";
import { Field, ErrorMessage } from "formik";

import { t } from "i18next";
import { CustomInput, FieldTitle } from "./ProductCommon";

const Offer = ({ currency }) => {
  const { t } = useTranslation();
    return (
        <div className="flex flex-wrap -mx-3" className="gap-3">

            <CustomInput name="quantities" title={`* ${t("Quantity")}`} placeholder={t("Example: 25")} type="number" tooltip={t("quantities-ToolTip")} />

            <div className="flex flex-wrap -mx-3">
                <FieldTitle title={`* ${t("Your Price")}`} tooltip={t("our_price-ToolTip")} />
                <div className="w-full md:w-2/3 px-3" className="p-0">
                    <div className="flex flex-wrap -mx-3">

                        {/* CURRENCY */}
                        <div className="w-full md:w-1/4 px-3">
                            <Field
                                as="select"
                                name="currency"
                                className="form-select"
                            >
                                <option value="">{t("Select")}</option>
                                {currency?.map((cur) => (<option value={cur?.value}>{cur?.title}</option>))}
                            </Field>
                            <ErrorMessage
                                name="currency"
                                render={(msg) => <div className="text-danger">{t(msg)}</div>}
                            />
                        </div>

                        {/* OUR PRICE */}
                        <div className="w-full px-3" md={9}>
                            <Field
                                name="our_price"
                                className="form-control small-placeholder"
                                type="number"
                                placeholder={t("Example: 29")}
                            />
                            <ErrorMessage
                                name="our_price"
                                render={(msg) => <div className="text-danger">{t(msg)}</div>}
                            />
                        </div>

                    </div>
                </div>
            </div>

            <div className="flex flex-wrap -mx-3">
                <FieldTitle title={`* ${t("Maximum Retail Price")}`} tooltip={t("maximum_retail_price-ToolTip")} />
                <div className="w-full md:w-2/3 px-3" className="p-0">
                    <div className="flex flex-wrap -mx-3">

                        {/* CURRENCY */}
                        <div className="w-full md:w-1/4 px-3">
                            <Field
                                as="select"
                                name="currency"
                                className="form-select"
                            >
                                <option value="">{t("Select")}</option>
                                {currency?.map((cur) => (<option value={cur?.value}>{cur?.title}</option>))}
                            </Field>
                            <ErrorMessage
                                name="currency"
                                render={(msg) => <div className="text-danger">{t(msg)}</div>}
                            />
                        </div>

                        {/* OUR PRICE */}
                        <div className="w-full px-3" md={9}>
                            <Field
                                name="maximum_retail_price"
                                className="form-control small-placeholder"
                                type="number"
                                placeholder={t("Example: 599")}
                            />
                            <ErrorMessage
                                name="maximum_retail_price"
                                render={(msg) => <div className="text-danger">{t(msg)}</div>}
                            />
                        </div>

                    </div>
                </div>
            </div>

            <div className="flex flex-wrap -mx-3" className="mt-3">
                <FieldTitle title={`* ${t("Fulfillment Channel")}`} required tooltip={t("fulfillment_channel_code-ToolTip")} />

                <div className="w-full md:w-2/3 px-3" className="p-0">

                    <div className="border rounded p-3">

                        {/* Merchant Fulfilled */}
                        <label className="flex items-start gap-2 mb-3">
                            <Field
                                type="radio"
                                name="fulfillment_channel_code"
                                value="DEFAULT"
                            />
                            <span>
                                <strong>{t("I will ship this item myself (Self Ship)")}</strong><br />
                                <small className="text-gray-500">{t("(Merchant Fulfilled)")}</small>
                            </span>
                        </label>

                        {/* Fulfilled by Amazon */}
                        <label className="flex items-start gap-2">
                            <Field
                                type="radio"
                                name="fulfillment_channel_code"
                                value="AMAZON_IN"
                            />
                            <span>
                                <strong>{t("Amazon will ship and provide customer service")}</strong><br />
                                <small className="text-gray-500">{t("(Fulfilled by Amazon)")}</small>
                            </span>
                        </label>

                    </div>

                    <ErrorMessage
                        name="fulfillment_channel_code"
                        render={(msg) => <div className="text-danger">{t(msg)}</div>}
                    />

                </div>
            </div>

        </div>
    )
};

export default Offer;
