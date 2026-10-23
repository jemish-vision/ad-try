import { useTranslation } from "react-i18next";
import { t } from "i18next"
import { useContext, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import Filter from "../../../helper/filter/Filter";
import { ProfileContext } from "../../../helper/usecontext/useContext";
import { ApiAddProduct, ApiGenerateProductData, ApiGetProductDefinition, ApiParseFields } from "../../../api-wrapper/productList/ApiProductList";
import FieldSelector from "./FieldSelector";
import { ArrowRight as ArrowForward } from "lucide-react";
import DynamicFormField from "./ProductTypeSchema/DynamicFormField";
import { useDispatch } from "react-redux";
import { handleLoader, Toast } from "../../../helper/links/Link";
import { generateInitialValues, generateYupSchema } from "./ProductTypeSchema/DynamicFormField/ProductFormBasic";
import { GeneratedProductModal } from "./ProductTypeSchema/GeneratedProductModal";
import Breadcrumb from "../../../common/components/Breadcrumb";

const ignoreField = ["item_name", "bullet_point", "generic_keyword", "product_description"]
const requiredField = ["purchasable_offer", "fulfillment_availability", "parentage_level"]
const filterValuesByProperties = (values, properties) => {

    return Object.fromEntries(Object.entries(values).filter(([key]) => properties?.[key] || key === "sku"));
};

const ProductTypeSchema = () => {
    const { t } = useTranslation();
    const { profileId, selectedAdType } = useContext(ProfileContext);
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const location = useLocation();
    const { productType } = useParams();

    const [isMobile, setIsMobile] = useState(window.innerWidth <= 1024);
    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 1024);
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    const [productAmazonGroup, setProductAmazonGroup] = useState(null)
    const [productAmazonData, setProductAmazonData] = useState(null)

    const [mandatoryFields, setMandatoryFields] = useState([])
    const [otherFields, setOtherFields] = useState([])
    const [selectedFields, setSelectedFields] = useState(mandatoryFields);

    const [moveNext, setMoveNext] = useState(false);
    const [formFields, setFormFields] = useState(mandatoryFields);
    const [shouldRebuildForm, setShouldRebuildForm] = useState(false);

    const [initialValues, setInitializeValue] = useState({});
    const [validationSchema, setValidationSchema] = useState({});

    const [productData, setProductData] = useState(null);
    const [errors, setErrors] = useState([]);
    const [amazonErrors, setAmazonErrors] = useState({});

    const [modalOpen, setModalOpen] = useState(false);

    const { marketplace_id, language_tag, asinData } = location.state || {};

    useEffect(() => {
        if (!marketplace_id || !language_tag) {
            navigate("/product-list", { replace: true });
        }
    }, [marketplace_id, language_tag, navigate]);

    const ApiListing = async () => {
        if (profileId.value && selectedAdType) {
            await ApiGetProductDefinition({ profileId: profileId?.value, productType })
                .then((e) => {
                    if (e?.isSuccess) {
                        setProductAmazonData(e?.schema)

                        const group = { ...e?.propertyGroup };
                        group.other = { title: "Other", description: "Ungrouped Fields", propertyNames: [] };
                        if (group?.product_identity) {
                            group.product_identity.propertyNames = [...group.product_identity.propertyNames, "sku"];
                        }
                        setProductAmazonGroup(group);

                        const fields = e?.schema?.properties
                        const allFields = Object.keys(e?.schema?.properties)
                        const mandatory = e?.schema?.required
                        const other = allFields.filter(ele => !mandatory.includes(ele))

                        let mandatoryFields = mandatory?.map((ele) => ({ key: ele, label: fields?.[ele]?.title }))?.filter(ele => !ignoreField.includes(ele?.key));
                        let otherFields = other?.map((ele) => ({ key: ele, label: fields?.[ele]?.title }))?.filter(ele => !ignoreField.includes(ele?.key));

                        const extraRequired = requiredField.filter(key => other.includes(key)).map(key => ({ key, label: fields[key]?.title || key }));
                        mandatoryFields = [...mandatoryFields, ...extraRequired.filter(er => !mandatoryFields.some(m => m?.key === er?.key))];
                        otherFields = otherFields.filter(f => !requiredField.includes(f.key));

                        setMandatoryFields(mandatoryFields)
                        setOtherFields(otherFields)

                        // setSelectedFields([...mandatoryFields, ...otherFields]);
                        // return

                        if (asinData?.attributes && typeof asinData?.attributes === "object") {
                            const asinAttributeKeys = Object.keys(asinData.attributes);
                            const asinFields = asinAttributeKeys.map(key => ({ key, label: fields?.[key]?.title || key })).filter(item => !ignoreField.includes(item?.key));

                            setSelectedFields([...mandatoryFields, ...asinFields.filter(item => !mandatoryFields.some(m => m.key === item.key))]);
                        } else {
                            setSelectedFields(mandatoryFields);
                        }
                    }
                })
                .catch((e) => Toast.error(t("Something went wrong")));
        }
    };

    useEffect(() => {
        if (profileId?.value && selectedAdType) ApiListing();
    }, [profileId?.value, selectedAdType, productType]);

    const toggleField = (field) => {
        setSelectedFields((prev) => prev.some((f) => f.key === field.key) ? prev.filter((f) => f.key !== field.key) : [...prev, field]);
    };

    const handleCancel = () => {
        navigate("/product-list");
    };

    const handleNext = async (prevInit = {}) => {
        setMoveNext(true);
        const selectedFieldObj = selectedFields?.reduce((acc, ele) => ({ ...acc, ...(productAmazonData?.properties?.[ele?.key] && { [ele?.key]: productAmazonData?.properties?.[ele?.key] }) }), {});

        const addExtrafield = {
            "sku": {
                "key": "sku",
                "label": "SKU",
                "type": "array",
                "description": "An alphanumeric string up to 100 characters.",
                "minItems": 1,
                "minUniqueItems": 1,
                "maxUniqueItems": 1,
                "renderAsSingle": true,
                "items": [
                    {
                        "childKey": "value",
                        "label": "SKU",
                        "required": true,
                        "type": "string",
                        "semanticType": "string",
                        "minLength": 1,
                        "maxLength": 100
                    },
                ]
            }
        }

        const totalFields = { ...addExtrafield, ...selectedFieldObj }

        await ApiParseFields({ selectedKeys: Object.keys(totalFields), schemaUrl: productAmazonData?.schemaUrl })
            .then((e) => {
                if (e?.isSuccess) {
                    const fields = Object.fromEntries(e?.fields.map(item => [item.key, item]))
                    const totatAFileds = { ...addExtrafield, ...fields }

                    const init = generateInitialValues(totatAFileds, marketplace_id, language_tag);

                    const valSchema = generateYupSchema(totatAFileds);
                    setInitializeValue(prev => ({ ...init, ...(asinData?.attributes && typeof asinData?.attributes === "object") ? asinData?.attributes ?? {} : {}, ...prev, ...prevInit }))
                    setValidationSchema(valSchema)

                    setFormFields(totatAFileds)
                }
            })
            .catch((e) => {
                console.log(e);
                Toast.error(t("Something went wrong"))
            });
    };

    const handlePrevious = (values) => {
        setInitializeValue(values)
        setMoveNext(false);
    }

    const handleFormSubmition = async (values) => {
        if (!profileId?.value || !selectedAdType) {
            Toast.error(t("Please select a profile"));
            return;
        }

        try {
            setErrors([]);
            setProductData(null);
            const filteredValues = filterValuesByProperties(values, productAmazonData?.properties);

            const data = { ...filteredValues, profileId: profileId?.value, productType }
            const res = await ApiGenerateProductData(data);

            if (res?.isSuccess) {
                Toast.success(res?.message);
                setProductData(res?.data);
                setModalOpen(true);
            } else {
                Toast.error(res?.message ?? "Failed to create product. Please try again.");
            }
            dispatch(handleLoader(false));

            console.log("✅ Product created successfully:", res);
            // resetForm();
        } catch (err) {
            console.error("❌ Product creation failed:", err);
            Toast.error(t("Failed to create product. Please try again."));
        }
    }

    const handleCreateProduct = async () => {
        setErrors([]);
        setAmazonErrors({});
        try {
            const res = await ApiAddProduct({ ...productData, profileId: profileId?.value, marketplace_id, language_tag });
            if (res?.isSuccess) {
                const issues = res?.data?.issues ?? [];
                setErrors(issues.filter((item) => item?.severity === "ERROR"));

                // Map Amazon errors to field-level errors
                const fieldErrors = {};
                issues.forEach((issue) => { fieldErrors[issue?.attributeNames?.reverse()?.[0]] = issue.message });
                setAmazonErrors(fieldErrors);

                const missingFields = issues.filter(issue => issue.categories?.includes("MISSING_ATTRIBUTE")).flatMap(issue => issue.attributeNames || []);
                if (missingFields.length) {
                    const newFields = missingFields.map(key => ({ key, label: productAmazonData?.properties?.[key]?.title || key }));

                    setSelectedFields(prev => {
                        const existingKeys = new Set(prev.map(f => f.key));
                        return [...prev, ...newFields.filter(f => !existingKeys.has(f.key))];
                    });

                    setShouldRebuildForm(true);
                    setModalOpen(false);

                    Toast.warning(t("Some required fields were missing. Please fill them."));
                    return;
                }

                setProductData(null);
                setModalOpen(false);

                if (res?.data?.status === "ACCEPTED") {
                    Toast.success(t("Product submitted successfully!"));
                    navigate("/product-list");
                }
            } else {
                Toast.error(res?.message ?? t("Failed to submit product"));
            }
            dispatch(handleLoader(false));
        } catch (err) {
            Toast.error(t("Error submitting product"));
        }
    }

    useEffect(() => {
        if (shouldRebuildForm && moveNext && selectedFields.length) {
            handleNext(productData?.finalData ?? {});
            setShouldRebuildForm(false);
        }
    }, [selectedFields]);

    return (
        <>
            <Filter name={"Product List"} nameShow={false} dateShow={false} profileShow={true} />

            <div className="budget_container px-4 pt-0 pb-8">
                <Breadcrumb
                    paths={[
                        { label: t("Product List"), link: "/product-list" },
                        { label: productType }
                    ]}
                    onBack={() => navigate("/product-list")}
                />
            </div>

            {
                !Boolean(moveNext) && (
                    <div id="product-schema" className="middle_container budget_container" style={{ display: 'flex', flexDirection: 'column', height: isMobile ? 'calc(100dvh - 130px)' : 'calc(100vh - 230px)', padding: '0', gap: '5px' }}>
                        <FieldSelector
                            mandatoryFields={mandatoryFields}
                            otherFields={otherFields}
                            selectedFields={selectedFields}
                            toggleField={toggleField}
                            setSelectedFields={setSelectedFields}
                        />

                        {/* ✅ Bottom Button Bar */}
                        <div
                            id="fs-bottom-bar"
                            className="fs-bottom-bar data_content data_content_btn flex shrink-0 p-4 md:p-6 z-10 bg-white dark:bg-slate-900 justify-between items-center flex-wrap gap-4"
                        >
                            {/* Summary Stats */}
                            <div className="hidden md:flex flex-row gap-8 items-center">
                                <div>
                                    <span className="fs-stat-label text-[10px] font-extrabold tracking-wider text-slate-400 dark:text-slate-500 uppercase block mb-1">
                                        {t("Total Fields")}
                                    </span>
                                    <span className="fs-stat-value text-lg font-black text-slate-800 dark:text-slate-100 block leading-none">
                                        {selectedFields.length}
                                    </span>
                                </div>
                                <div>
                                    <span className="fs-stat-label text-[10px] font-extrabold tracking-wider text-slate-400 dark:text-slate-500 uppercase block mb-1">
                                        {t("Core Attributes")}
                                    </span>
                                    <span className="fs-stat-value-blue text-lg font-black text-[#2374F2] dark:text-[#60a5fa] block leading-none">
                                        {selectedFields.filter(f => mandatoryFields.some(m => m.key === f.key)).length}
                                    </span>
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex gap-3 w-full md:w-auto items-center justify-end">
                                <button
                                    id="product-schema-cancel-btn"
                                    type="button"
                                    className="df-simple-outlined-btn px-6 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-sm font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                    onClick={handleCancel}
                                >
                                    {t("Cancel")}
                                </button>

                                <button
                                    id="product-schema-next-btn"
                                    type="button"
                                    className="customize-button clicked h-9 flex items-center justify-center gap-1.5 px-6 font-bold bg-[#2374F2] hover:bg-[#1A9FD4] text-white border-0 shadow-sm rounded-lg"
                                    onClick={() => handleNext()}
                                >
                                    <span>{t("Save and Continue")}</span>
                                    <ArrowForward className="h-4.5 w-4.5" />
                                </button>
                            </div>
                        </div>

                    </div>
                )
            }
            {
                Boolean(moveNext) && (
                    <div id="product-form-field p-0" className="budget_container">
                        <div className="data_content data_content_btn p-0">
                            <DynamicFormField
                                formFields={formFields}
                                group={productAmazonGroup}
                                initialValues={initialValues}
                                validationSchema={validationSchema}
                                marketplace_id={marketplace_id}
                                language_tag={language_tag}
                                handlePrevious={handlePrevious}
                                onSubmit={handleFormSubmition}
                                amazonErrors={amazonErrors}
                                onAmazonErrorClear={(key) =>
                                    setAmazonErrors(prev => {
                                        const updated = { ...prev };
                                        delete updated[key];
                                        return updated;
                                    })
                                }
                            />
                        </div>
                    </div>
                )
            }

            {/* Generated Product Data Modal */}
            <GeneratedProductModal
                open={modalOpen && Boolean(productData?.generated?.parsedContent)}
                onClose={() => setModalOpen(false)}
                productData={productData}
                errors={errors}
                onSubmit={handleCreateProduct}
            />
        </>
    )
}

export default ProductTypeSchema