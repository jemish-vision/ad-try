export const initialValues = {
    // Step 1: Campaign
    campaignName: "",
    startDate: "",
    endDate: "",
    dailyBudget: "",

    // Step 2: AdGroup
    adGroups: [""],

    // Step 3: Sites
    siteType: "", // Amazon / Amazon Business

    // Step 4: Products
    products: [],

    // Step 5: Targeting
    targetingType: "", // automatic / manual

    // Automatic targeting
    autoBidDefault: "",
    autoBidMode: "", // default | group
    autoBidGroups: {
        closeMatch: "",
        looseMatch: "",
        substitutes: "",
        complements: "",
    },

    // Manual targeting
    manualTargetType: "", // keyword | product
    manualKeywordTargeting: [],
    manualProductTargeting: [],

    negativeKeywords: [],
    negativeProducts: [],

    // Step 6: Bid Strategy
    bidStrategy: "",
    placements: {
        topOfSearch: "",
        restOfSearch: "",
        productPage: ""
    }
};
