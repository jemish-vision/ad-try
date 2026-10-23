import * as Yup from "yup";
import i18n from "../../../../i18n";

const firstStep = {
    campaignName: Yup.string().required(i18n.t("Campaign Name is required")),
    startDate: Yup.string().required(i18n.t("Start Date is required")),
    // endDate: Yup.string().required("End Date is required"),
    dailyBudget: Yup.number().required(i18n.t("Daily Budget is required")).positive(i18n.t("Daily Budget must be positive")).min(50, i18n.t("Minimum daily budget must be 50")),
    adGroups: Yup.array().of(Yup.string().trim().required(i18n.t("AdGroup field is required"))).min(1, i18n.t("At least one AdGroup is required")),
    siteType: Yup.string().required(i18n.t("Site selection is required")),

    targetingType: Yup.string().oneOf(["AUTO", "MANUAL"]).required(i18n.t("Please select targeting type")),
    bidStrategy: Yup.string().required(i18n.t("Select a bid strategy")),
    placements: Yup.object({
        topOfSearch: Yup.string().required(i18n.t("Top of Search is required")).min(0, i18n.t("Value cannot be negative")),
        restOfSearch: Yup.string().required(i18n.t("Rest of Search is required")).min(0, i18n.t("Value cannot be negative")),
        productPage: Yup.string().required(i18n.t("Product Page is required")).min(0, i18n.t("Value cannot be negative")),
    }),
}

const secondStep = {
    products: Yup.array().min(1, i18n.t("Please select at least one product to continue.")),
}

const thirdStep = {

    autoBidMode: Yup.string().when("targetingType", ([type]) => {
        if (type === "AUTO") {
            return Yup.string().oneOf(["default", "group"]).required(i18n.t("Please select bid mode"));
        }
        return Yup.string().notRequired();
    }),

    autoBidDefault: Yup.string()
        .when(["targetingType", "autoBidMode"], ([type, mode]) => {
            if (type === "AUTO" && mode === "default") {
                return Yup.string().required(i18n.t("Default bid is required")).test("min-bid", i18n.t("Bid must be at least 1.00"), val => !val || parseFloat(val) >= 1);
            }
            return Yup.string().notRequired();
        }),

    autoBidGroups: Yup.lazy((_, { parent }) => {
        const { targetingType, autoBidMode } = parent;

        const numberSchema = Yup.string().test("min-bid", i18n.t("Bid must be at least 1.00"), val => !val || parseFloat(val) >= 1);
        if (targetingType === "AUTO" && autoBidMode === "group") {
            return Yup.object({
                closeMatch: numberSchema.required(i18n.t("Bid required")),
                looseMatch: numberSchema.required(i18n.t("Bid required")),
                substitutes: numberSchema.required(i18n.t("Bid required")),
                complements: numberSchema.required(i18n.t("Bid required")),
            });
        }

        return Yup.object({
            closeMatch: numberSchema.notRequired(),
            looseMatch: numberSchema.notRequired(),
            substitutes: numberSchema.notRequired(),
            complements: numberSchema.notRequired(),
        });
    }),

    manualTargetType: Yup.string().when("targetingType", ([type]) => {
        if (type === "MANUAL") return Yup.string().oneOf(["keyword", "product"]).required(i18n.t("Select manual targeting type"));
        return Yup.string().notRequired();
    }),

    manualKeywordTargeting: Yup.array().when(["targetingType", "manualTargetType"], ([type, targetType]) => {
        if (type === "MANUAL" && targetType === "keyword") {
            return Yup.array()
                .of(
                    Yup.object({
                        keyword: Yup.string().required(i18n.t("Keyword required")),
                        matchType: Yup.string().required(i18n.t("Match type required")),
                        bid: Yup.string().required(i18n.t("Bid required")).test("min-bid", i18n.t("Bid must be at least 1.00"), val => !val || parseFloat(val) >= 1),
                    })
                )
                .min(1, i18n.t("Please add at least 1 keyword"));
        }
        return Yup.array().notRequired();
    }),

    manualProductTargeting: Yup.array().when(["targetingType", "manualTargetType"], ([type, targetType]) => {
        if (type === "MANUAL" && targetType === "product") {
            return Yup.array()
                .of(
                    Yup.object({
                        asin: Yup.string().required(i18n.t("ASIN missing")),
                        // itemName: Yup.string().required("Item name missing"),
                        type: Yup.string().oneOf(["Exact", "Expanded"]).required(i18n.t("Type required")),
                        bid: Yup.string().required(i18n.t("Bid required")).test("min-bid", i18n.t("Bid must be at least 1.00"), val => !val || parseFloat(val) >= 1),
                    })
                )
                .min(1, i18n.t("Please add at least 1 product"));
        }
        return Yup.array().notRequired();
    }),
}

const fourStep = {
}

const fifthStep = {
}

export const validationSchemas = [
    // Step 1: Campaign
    Yup.object(firstStep),

    // Step 2: Products
    Yup.object(secondStep),

    // Step 3: Targeting
    Yup.object(thirdStep),

    // Step 4: Bid Strategy
    Yup.object(fourStep),

    // Step 5: Review
    Yup.object(fifthStep),
];

export const fullValidationSchema = Yup.object().shape(
    { ...firstStep, ...secondStep, ...thirdStep, ...fourStep, ...fifthStep }
);