import { safeJsonParse } from "./common.js";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleGenAI } from "@google/genai";
import axios from "axios";

const openai = new OpenAI({
    apiKey: `${process.env.OPENAI_API_KEY}`,
});

// Module-level Gemini instance (shared across all functions)
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_STUDIO_KEY);

export async function runModuleCreation(productData) {
    const system = `
    You are an expert Amazon Listing Copywriter for the **${productData?.productType}** category.

    Your task: Create a **complete and high-converting** Amazon product listing.

    **ANALYSIS STEPS:**

    **STEP 1: QUICK PRODUCT ANALYSIS**
    - Product type based on images: What is it? (e.g., Hair Oil, Shampoo, Powder, Tablet, etc.)
    - Target audience indicator: For whom is it obviously? (e.g., adults, Old Age)
    - Main features: Color, size, special features

    **STEP 2: TARGET AUDIENCE IDENTIFICATION**
    **CRITICAL:** Who BUYS vs. who USES?
    Main target audiences:
    - Everyone

    **STEP 3: KEYWORD CATEGORIZATION**
    Sort keywords into:
    **A) TITLE KEYWORDS (Top Priority)**: Search volume > 500, Direct purchase intention
    **B) BULLET KEYWORDS**: Search volume > 100, Descriptive/emotional
    **C) BACKEND KEYWORDS**: Synonyms, long-tail, seasonal terms
    **D) FORBIDDEN KEYWORDS**: Exclude brand names, misleading terms


    **TITLE STRUCTURE:**
    [BRAND] [MAIN KEYWORD] [PRODUCT TYPE] [MOST IMPORTANT FEATURE] [TARGET AUDIENCE/OCCASION] [ADDITIONAL PROPERTIES] [SIZE] [ADDITIONAL DETAILS]
    - Use less hyphes
    - Frame Title that looks natural

    **BULLET POINTS:**
    1. Main promise + emotion + size
    2. Quality & safety
    3. Occasion & target audience
    4. Special feature/USP
    5. Practical benefit

    **BACKEND KEYWORDS:** Keywords should be separated by space, max 249 characters, avoid repetition from title or bullet points.
    **PRODUCT DESCRIPTION:** Write a flowing description emphasizing joy, quality, and emotional benefits, no keyword stuffing.

    **CRITICAL: You MUST respond in valid JSON format with this exact structure:**
    {
      "title": "Complete product title as single string",
      "bulletPoints": [
        "Bullet point 1 text",
        "Bullet point 2 text",
        "Bullet point 3 text",
        "Bullet point 4 text",
        "Bullet point 5 text"
      ],
      "backendKeywords": "All backend keywords separated by spaces as single string",
      "productDescription": "Complete product description as single string"
    }
    `.trim();

    const text = `
    Create a complete Amazon listing based on the Module 1 analysis. Ensure all fields are present: title, bulletPoints (exactly 5), backendKeywords, and productDescription. Response must be valid JSON format.
    ${JSON.stringify(productData, null, 2)}
    `.trim();

    const messages = [
        { role: "system", content: system },
        { role: "user", content: [{ type: "text", text }] }
    ];

    const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages,
        response_format: { type: "json_object" }
    });

    console.log("OpenAI Usage:", completion.usage);

    try {
        const jsonResponse = safeJsonParse(completion.choices[0].message.content ?? {});

        // Validate the response has all required fields
        if (!jsonResponse.title || !jsonResponse.bulletPoints || !jsonResponse.backendKeywords || !jsonResponse.productDescription) {
            console.log("Missing required fields in Module 2 response");
        }

        if (!Array.isArray(jsonResponse.bulletPoints) || jsonResponse.bulletPoints.length !== 5) {
            console.log("bulletPoints must be an array with exactly 5 items");
        }

        return {
            ...completion.choices[0].message,
            parsedContent: jsonResponse
        };
    } catch (error) {
        console.log(`Failed to parse Module 2 JSON response: ${error.message}`);
        return {
            ...completion.choices[0].message,
            parsedContent: {}
        };
    }
}

// ========== MASTER FUNCTION ==========
export async function generateListingWithGPT(productData) {
    const moduleOutput = await runModuleCreation(productData);
    return moduleOutput
}

export async function CampaignAnalysis(data) {
    const system = `You are an expert Amazon PPC manager. Analyze the campaign “${data?.campaign?.name || ""}” for the date range ${data?.range?.startDate} to ${data?.range?.endDate}. My goals are ROAS 3+ and ACOS below 30%.
    
    Your ONLY valid output structure must always be JSON:
    { "html": "<VALID_HTML_STRING>" }

    ⚠️ VERY IMPORTANT — YOUR OUTPUT:
        1. HTML must use Bootstrap classes only.
        2. The structure MUST be:

            <div class="container my-4">
                <div class="row gap-2">
                    <div class="col-12">
                        <!-- Card 1: Best Bid Recommendation -->
                    </div>

                    <div class="col-12">
                        <!-- Card 2: Optimization Steps -->
                    </div>

                    <div class="col-12">
                        <!-- Card 3: Budget Increase Rule -->
                    </div>
                </div>
            </div>

        3. Inside each col-12:
            - Wrap content in <div class="card">
            - Use <div class="card-body"> for spacing
            - Use <h5 class="card-title"> for headings
            - Use <ul> and <li> for all bullet points
        4. Do NOT use inline CSS unless absolutely required.
        5. Output must be JSON with a key "html".

    Rules:
      - Put the entire HTML inside the "html" key as a string.
      - Do NOT include any text outside JSON.
      - No markdown. No extra text.
      - No escaping needed except standard JSON escaping (quotes).

    `.trim();

    const text = `
        Based ONLY on the data below, provide:
            1. 3–5 simple, clear, and actionable steps to reduce wasted spend and improve ROAS.
            2. The best bid recommendation for this auto campaign based on its performance.
            3. When and how much to increase the budget if the campaign becomes profitable (ROAS 3+ or ACOS < 30%).
            4. Keep explanations very short and easy to understand.
            5. Do not add any theory — only actions based on the data.

        Campaign Data
        Campaign Level
            - Spend: ₹${data?.campaign?.spend}
            - Sales: ₹${data?.campaign?.sales}
            - Clicks: ${data?.campaign?.clicks}
            - Impressions: ${data?.campaign?.impressions}
            - ACOS: ${data?.campaign?.acos}%
            - ROAS: ${data?.campaign?.roas}

        Ad Group Level
        ${data?.campaign?.adGroups
            ?.map(
                (g) => `
        Ad Group: ${g.name}
            - Spend: ₹${g.spend}
            - Sales: ₹${g.sales}
            - Clicks: ${g.clicks}
            - Impressions: ${g.impressions}
        `
            )
            .join("\n")}

        Placement Report
        ${data?.campaign?.placements
            ?.map(
                (p) => `
        Placement: ${p.placement}
            - Spend: ₹${p.spend}
            - Sales: ₹${p.sales}
            - Clicks: ${p.clicks}
            - Impressions: ${p.impressions}
            - ACOS: ${p.acos}
            - ROAS: ${p.roas}
        `
            )
            .join("\n")}

        Search Term Level
        Search Term | Clicks | Spend | Order | Sales | CPC | ACOS | ROAS
        ${data?.searchTerm
            ?.map((st) => `
            ${st.searchTerm} | ${st.clicks} | ${st.spend} | ${st.orders} | ${st.sales} | ${st.cpc} | ${st.acos} | ${st.roas}`)
            .join("")}

        Now give me:
            1. The best bid amount I should set based on the above data
            2. 3–5 actionable optimization steps
            3. Clear budget-increase rule when performance is profitable
    
    Your response must contain valid HTML, but the format of the entire output must be JSON.
    `.trim();

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_STUDIO_KEY);

    try {
        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            systemInstruction: system,
        });

        const result = await model.generateContent({
            contents: [
                {
                    role: "user",
                    parts: [{ text: text }],
                },
            ],

            // Model configuration
            generationConfig: {
                temperature: 1,
                responseMimeType: "application/json"
            },

            safetySettings: [],
            tools: [],
        });

        console.log(safeJsonParse(result.response.text()));

        return {
            parsedContent: safeJsonParse(result.response.text())
        }

    } catch (error) {
        console.log(`Failed to parse Module 2 JSON response: ${error.message}`);
        return {
            parsedContent: {}
        };
    }
}

export async function AIPlacementAndTargetingAnalysis(data) {
    const system = `You are an expert Amazon PPC manager. Analyze the Targeting and Placement data for the date range ${data?.range?.startDate} to ${data?.range?.endDate}. 
    Optimize my Targeting and Placement to gradually reach my Target ACOS (30%) without killing sales volume.
    
    Please use the currency sing for ${data.currencyCode}.

    Your ONLY valid output structure must always be JSON:
    { "html": "<VALID_HTML_STRING>" }
    ⚠️ VERY IMPORTANT — YOUR OUTPUT:
        1. The entire HTML must be wrapped in:
            <div class="container my-2">
                <div class="row gap-2">
                    <div class="col-12 p-0">
                        <!-- AI content goes here -->
                    </div>
                </div>
            </div>
        2. Inside the col-12:
        - Wrap everything inside a <div class="card border-0" style="background-color: #f4f4f4;">.
        - Use <div class="card-body p-0"> for spacing.
        - Use <h5 class="card-title"> for headings.
        - Content can be paragraphs, bullet lists, insights, summaries, or tables — any valid Bootstrap HTML is allowed.
        - **If tables are wide, do NOT allow them to overflow the container. Use Bootstrap's table-responsive wrapper to enable horizontal scroll**:
            <div class="table-responsive">
                <table class="table"> ... </table>
            </div>
        3. DO NOT:
        - Output anything outside the JSON.
        - Use markdown.
        - Escape HTML unnecessarily (only JSON-required escaping).
        4. The "html" key must contain the entire HTML response as a single string.

        Your purpose:
        Provide professional PPC insights, recommendations, and explanations using nicely formatted Bootstrap HTML inside the card.
    `.trim();

    const text = `
        Based ONLY on the data below, provide:
        TARGETING REPORT
            Keyword | Match Type | Status | Keyword Bid | Impressions | Clicks | CTR | Spend | CPC | Orders | Sales | ACOS | ROAS
            ${data?.campaign?.targeting?.map((t) => `
            ${t.targeting} | ${t.matchType} | ${t.status} | ₹${t.keywordBid} | ${t.impressions} | ${t.clicks} | ${t.ctr}% | ₹${t.spend} | ₹${t.cpc} | ${t.orders} | ₹${t.sales} | ${t.acos}% | ${t.roas}`).join("")}

        PLACEMENT REPORT
            Placement | Bid Adjustment | Orders | Spend | Sales | CTR | CPC | Clicks | Impressions | ACOS | ROAS
            ${data?.campaign?.placements?.map((p) => `
            ${p?.placement} | ₹${p?.keywordBid} | ₹${p?.orders} | ₹${p?.spend} | ₹${p?.sales} | ${p?.ctr}% | ₹${p?.cpc} | ${p?.clicks} | ${p?.impressions} | ${p?.acos}% | ${p?.roas}`).join("")}
    `.trim();

    try {

        if (data?.aiModel === "gemini") {
            const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_STUDIO_KEY);
            const model = genAI.getGenerativeModel({
                model: "gemini-2.5-flash",
                systemInstruction: system,
            });

            const result = await model.generateContent({
                contents: [
                    { role: "user", parts: [{ text: text }] },
                    ...data?.messages
                ],

                // Model configuration
                generationConfig: {
                    temperature: 1,
                    responseMimeType: "application/json"
                },

                safetySettings: [],
                tools: [],
            });

            return {
                parsedContent: safeJsonParse(result.response.text())
            }
        } else {

            const messages = [
                { role: "system", content: system },
                // { role: "user", content: [{ type: "text", text }] },
                { role: "user", content: JSON.stringify({ range: data?.range, targeting: data?.campaign?.targeting, placements: data?.campaign?.placements }) },
                ...data?.messages
            ];

            const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                // model: "gpt-5-nano-2025-08-07",
                messages,
                response_format: { type: "json_object" }
            });

            const jsonResponse = safeJsonParse(completion.choices[0].message.content ?? {});

            return {
                ...completion.choices[0].message,
                parsedContent: jsonResponse
            };
        }

    } catch (error) {
        console.log(error);
        console.log(`Failed to parse Module 2 JSON response: ${error.message}`);
        return {
            parsedContent: {
                html: `❌ <b>Analysis Failed:</b> ${error.message}`
            }
        };
    }
}

export async function AISearchTermsAnalysis(data) {
    const system = `
    Act as a Senior Amazon PPC Manager and Data Analyst. Analyze thr Search Term data for the date range ${data?.range?.startDate} to ${data?.range?.endDate}.
    Your goal is to optimize the account by cutting wasted spend, scaling winners, fixing inefficient bids, and improving account health (Quality Score).

    Please use the currency sing for ${data.currencyCode}.
    Please analyze the data based on the following strict logic and output the results in clear tables:
    
    Your ONLY valid output structure must always be JSON:
    { "html": "<VALID_HTML_STRING>" }

    ⚠️ VERY IMPORTANT — YOUR OUTPUT:
        1. HTML must use Bootstrap classes only.
        2. The structure MUST be:

            <div class="container my-4">
                <div class="row gap-2">
                    <div class="col-12">
                        <!-- Card 1: BLEEDER IDENTIFICATION -->
                    </div>

                    <div class="col-12">
                        <!-- Card 2: QUALITY SCORE KILLERS -->
                    </div>

                    <div class="col-12">
                        <!-- Card 3: WINNER IDENTIFICATION -->
                    </div>

                    <div class="col-12">
                        <!-- Card 4: PRECISE BID OPTIMIZATION -->
                    </div>

                    <div class="col-12">
                        <!-- Card 5: EXECUTIVE SUMMARY -->
                    </div>
                </div>
            </div>

        3. Inside each col-12:
            - Wrap content in <div class="card">
            - Use <div class="card-body"> for spacing
            - Use <h5 class="card-title"> for headings
            - Use <ul> and <li> for all bullet points
        4. Do NOT use inline CSS unless absolutely required.
        5. Output must be JSON with a key "html".

    Rules:
      - Put the entire HTML inside the "html" key as a string.
      - Do NOT include any text outside JSON.
      - No markdown. No extra text.
      - No escaping needed except standard JSON escaping (quotes).

    `.trim();

    const text = `
        Based ONLY on the data below, provide:
        SEARCH TERM REPORT:
            Search Term | Impressions | Clicks | CTR | Spend | CPC | Orders | Sales | ACOS | ROAS
            ${data?.campaign?.searchTerm?.map((t) => `
            ${t.searchTerm} | ${t.impressions} | ${t.clicks} | ${t.ctr}% | ₹${t.spend} | ₹${t.cpc} | ${t.orders} | ₹${t.sales} | ${t.acos}% | ${t.roas}`).join("")}
    `.trim();

    try {
        if (data?.aiModel === "gemini") {
            const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_STUDIO_KEY);
            const model = genAI.getGenerativeModel({
                model: "gemini-2.5-flash",
                systemInstruction: system,
            });

            const result = await model.generateContent({
                contents: [
                    { role: "user", parts: [{ text: text }] },
                    ...data?.messages
                ],

                // Model configuration
                generationConfig: {
                    temperature: 1,
                    responseMimeType: "application/json"
                },

                safetySettings: [],
                tools: [],
            });

            return {
                parsedContent: safeJsonParse(result.response.text())
            }
        } else {

            const messages = [
                { role: "system", content: system },
                // { role: "user", content: [{ type: "text", text }] },
                { role: "user", content: JSON.stringify({ range: data?.range, searchTerm: data?.campaign?.searchTerm }) },
                ...data?.messages
            ];

            const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                // model: "gpt-5-nano-2025-08-07",
                messages,
                response_format: { type: "json_object" }
            });

            const jsonResponse = safeJsonParse(completion.choices[0].message.content ?? {});

            return {
                ...completion.choices[0].message,
                parsedContent: jsonResponse
            };
        }

    } catch (error) {
        console.log(`Failed to parse Module 2 JSON response: ${error.message}`);
        return {
            parsedContent: {}
        };
    }
}

export async function generatePlacementAndTargetingAnalysis(data) {
    const moduleOutput = await AIPlacementAndTargetingAnalysis(data);
    return moduleOutput
}

export async function generateSearchTermsAnalysis(data) {
    const moduleOutput = await AISearchTermsAnalysis(data);
    return moduleOutput
}

export function buildListingBodyPayload({
    payload,
    generated,
    mainImage,
    otherImages,
    marketplaceId = "A21TJRUUN4KGV", // IN marketplace by default
    languageTag = "en_IN", // India
    productType = "HAIR_CARE_PRODUCT" // change to your category
}) {
    const attributes = {};

    attributes.batteries_required = [{ value: false }]

    if (generated?.title) {
        attributes.item_name = [
            { value: generated.title, language_tag: languageTag, marketplace_id: marketplaceId }
        ];
    }

    if (Array.isArray(generated?.bulletPoints) && generated.bulletPoints.length) {
        attributes.bullet_point = generated.bulletPoints.map(bp => ({
            value: bp,
            language_tag: languageTag,
            marketplace_id: marketplaceId
        }));
    }

    if (generated?.backendKeywords) {
        attributes.generic_keyword = [
            { value: generated.backendKeywords, language_tag: languageTag, marketplace_id: marketplaceId }
        ];
    }

    if (generated?.productDescription) {
        attributes.product_description = [
            { value: generated.productDescription, language_tag: languageTag, marketplace_id: marketplaceId }
        ];
    }

    // 🔹 Brand & manufacturer info
    if (payload?.brand) {
        attributes.brand = [
            { value: payload.brand, language_tag: languageTag, marketplace_id: marketplaceId }
        ];
    }

    if (payload?.manufacturer) {
        attributes.manufacturer = [
            { value: payload.manufacturer, language_tag: languageTag, marketplace_id: marketplaceId }
        ];
    }

    if (payload?.country_of_origin) {
        attributes.country_of_origin = [
            { value: payload.country_of_origin, marketplace_id: marketplaceId }
        ];
    }

    // 🔹 Material, color, size, etc.
    const makeAttributeArray = (arr, key) => {
        if (Array.isArray(arr) && arr.length) {
            const filtered = arr.filter(a => a?.value || a);
            if (filtered.length > 0) {
                attributes[key] = filtered.map(v => ({
                    value: v?.value || v,
                    language_tag: languageTag,
                    marketplace_id: marketplaceId
                }));
            }
        }
    };

    makeAttributeArray([payload.color], "color");
    makeAttributeArray(payload.material, "material");
    makeAttributeArray(payload.size, "size");
    makeAttributeArray(payload.ingredients, "ingredients");
    makeAttributeArray(payload.active_ingredients, "active_ingredients");

    // 🔹 Images
    if (mainImage) {
        attributes.main_product_image_locator = [
            { media_location: mainImage }
        ];
    }

    if (Array.isArray(otherImages) && otherImages.length > 0) {
        otherImages.forEach((img, idx) => {
            attributes[`other_product_image_locator_${idx + 1}`] = [
                { media_location: img }
            ];
        });
    }

    // 🔹 List price / Currency
    if (Array.isArray(payload.listPrices) && payload.listPrices.length > 0) {
        attributes.list_price = payload.listPrices.map((price, i) => ({
            value_with_tax: price,
            currency: payload.listCurrencies?.[i] || "EUR"
        }));
    }

    // 🔹 Fulfillment type
    if (payload.fulfillment_channel_code && payload.quantities) {
        attributes.fulfillment_availability = [{ fulfillment_channel_code: payload?.fulfillment_channel_code, quantity: payload?.quantities }]
    }

    if (payload.our_price && payload.maximum_retail_price) {
        attributes.purchasable_offer = [
            { currency: payload?.currency },
            { our_price: [{ schedule: [{ value_with_tax: payload.our_price }] }] },
            { maximum_retail_price: [{ schedule: [{ value_with_tax: payload.maximum_retail_price }] }] },
        ]
    }

    if (payload.unit_count) {
        attributes.unit_count = [{
            value: Number(payload?.unit_count?.value),
            type: {
                language_tag: languageTag,
                value: payload?.unit_count?.type || "count"
            }
        }]
    }

    if (Array.isArray(payload.recommended_browse_nodes) && payload.recommended_browse_nodes.length) {
        attributes.recommended_browse_nodes = payload?.recommended_browse_nodes?.map((node) => ({ value: node, language_tag: languageTag, marketplace_id: marketplaceId }))
    }

    if (payload.ghs) {
        attributes.ghs = [{ marketplace_id: marketplaceId, classification: [{ class: payload?.ghs }] }]
    }

    if (payload.safety_data_sheet_url) {
        attributes.safety_data_sheet_url = [{ value: payload.safety_data_sheet_url, marketplace_id: marketplaceId, language_tag: languageTag }]
    }

    if (payload.hazmat && payload.hazmat?.value && payload.hazmat?.aspect) {
        attributes.hazmat = [{ ...payload?.hazmat, marketplace_id: marketplaceId }]
    }

    // 🔹 Is Product Expirable (required)
    if (payload.is_expiration_dated_product) {
        attributes.is_expiration_dated_product = [
            { value: payload.is_expiration_dated_product === "Yes" }
        ];
    }

    if (payload.product_expiration_type) {
        attributes.product_expiration_type = [{ value: payload.product_expiration_type, marketplace_id: marketplaceId, language_tag: languageTag }];
    }

    if (payload.fc_shelf_life?.value && payload.fc_shelf_life?.unit) {
        attributes.fc_shelf_life = [{ ...payload?.fc_shelf_life, marketplace_id: marketplaceId }];
    }

    // 🔹 Part Number (required)
    if (payload.part_number) {
        attributes.part_number = [
            { value: payload.part_number, language_tag: languageTag, marketplace_id: marketplaceId }
        ];
    }

    // 🔹 Target Audience Keyword (required)
    if (Array.isArray(payload.target_audience_keyword) && payload.target_audience_keyword.length > 0 && payload.target_audience_keyword?.[0]) {
        attributes.target_audience_keyword = payload.target_audience_keyword.map(k => ({
            value: k,
            language_tag: languageTag,
            marketplace_id: marketplaceId
        }));
    }

    // 🔹 Scent (required)
    if (payload.scent) {
        attributes.scent = [{
            value: payload.scent,
            language_tag: languageTag,
            marketplace_id: marketplaceId
        }]
    }

    // ✅ Target Gender
    if (Array.isArray(payload.target_gender) && payload.target_gender.length > 0 && payload.target_gender?.[0]) {
        attributes.target_gender = payload.target_gender.map(gender => ({ value: gender, language_tag: languageTag, marketplace_id: marketplaceId }));
    }

    // ✅ Merchant Suggested ASIN
    if (payload.merchant_suggested_asin) {
        attributes.merchant_suggested_asin = [{ value: payload?.merchant_suggested_asin }]
    }

    // ✅ Item Package Dimensions (use all entries)
    if (payload.item_dimensions) {
        attributes.item_package_dimensions = [payload.item_package_dimensions]
    }

    // ✅ Item Dimensions (use all entries)
    if (payload.item_dimensions) {
        attributes.item_dimensions = [payload.item_dimensions]
    }

    // ✅ Dangerous Goods Regulations
    if (payload.dangerous_goods_regulations) {
        attributes.dangerous_goods_regulations = [
            { value: payload.dangerous_goods_regulations }
        ];
    }

    // ✅ Packer Contact Information
    if (payload.packer_contact_information) {
        attributes.packer_contact_information = payload.packer_contact_information?.map((info) => ({ value: info }))
    }

    // ✅ Hair Type (Array of string)
    if (Array.isArray(payload.hair_type) && payload.hair_type.length > 0 && payload.hair_type?.[0]) {
        attributes.hair_type = payload.hair_type.map(v => ({ value: v, language_tag: languageTag, marketplace_id: marketplaceId }));
    }

    // ✅ Skin Type (Array of string)
    if (Array.isArray(payload.skin_type) && payload.skin_type.length > 0 && payload.skin_type?.[0]) {
        attributes.skin_type = payload.skin_type.map(v => ({ value: v, language_tag: languageTag, marketplace_id: marketplaceId }));
    }

    // ✅ External Product ID
    if (payload.externally_assigned_product_identifier) {
        attributes.externally_assigned_product_identifier = [
            {
                ...payload.externally_assigned_product_identifier,
                language_tag: languageTag,
                marketplace_id: marketplaceId
            }
        ];
    }
    if (payload.supplier_declared_has_product_identifier_exemption) {
        attributes.supplier_declared_has_product_identifier_exemption = [{ value: payload.supplier_declared_has_product_identifier_exemption }]
    }

    // ✅ Is Product Expirable
    if (typeof payload.is_product_expirable === "boolean") {
        attributes.is_product_expirable = [
            { value: payload.is_product_expirable }
        ];
    }

    // ✅ Importer Contact Information
    if (payload.importer_contact_information) {
        attributes.importer_contact_information = payload.importer_contact_information?.map((info) => ({ value: info }))
    }

    // ✅ Item Type Name
    if (payload.productType) {
        attributes.item_type_name = [
            { value: `${payload.productType}`.toLocaleLowerCase(), language_tag: languageTag, marketplace_id: marketplaceId }
        ];
    }

    // ✅ Item Form
    if (payload.item_form) {
        attributes.item_form = [
            { value: payload.item_form, language_tag: languageTag, marketplace_id: marketplaceId }
        ];
    }

    // ✅ Safety Warning
    if (Array.isArray(payload.safety_warning) && payload.safety_warning.length && payload.safety_warning?.[0]) {
        attributes.safety_warning = payload?.safety_warning?.map((warning) => ({ value: warning, language_tag: languageTag, marketplace_id: marketplaceId }))
    }

    // ✅ External Product Information
    if (payload.external_product_information) {
        attributes.external_product_information = [payload.external_product_information]
    }

    // ✅ Item Package Weight
    if (payload.item_package_weight) {
        attributes.item_package_weight = [payload.item_package_weight];
    }

    // ✅ Lifestyle
    if (payload.lifestyle) {
        attributes.lifestyle = [{
            value: payload.lifestyle,
            language_tag: languageTag,
            marketplace_id: marketplaceId
        }]
    }

    // ✅ Item Weight
    if (payload.item_weight) {
        attributes.item_weight = [payload.item_weight];
    }

    // ✅ Number of Items
    if (payload.number_of_items) {
        attributes.number_of_items = [{ value: Number(payload.number_of_items) }];
    }

    // ✅ Dangerous Goods Regulations
    if (Array.isArray(payload.supplier_declared_dg_hz_regulation) && payload.supplier_declared_dg_hz_regulation.length > 0 && payload.supplier_declared_dg_hz_regulation?.[0]) {
        attributes.supplier_declared_dg_hz_regulation = payload.supplier_declared_dg_hz_regulation.map(regulation => ({
            value: regulation,
            language_tag: languageTag,
            marketplace_id: marketplaceId
        }));
    }

    // ✅ Contains Liquid Contents
    if (payload.contains_liquid_contents) {
        attributes.contains_liquid_contents = [
            { value: Boolean(payload?.contains_liquid_contents === "Yes") }
        ];
    }

    // ✅ Manufacturer Contact Information
    if (payload.rtip_manufacturer_contact_information) {
        attributes.rtip_manufacturer_contact_information = [{
            value: payload.rtip_manufacturer_contact_information
        }];
    }

    // ✅ Is the Liquid Product Double Sealed
    if (payload.is_liquid_double_sealed) {
        attributes.is_liquid_double_sealed = [
            { value: Boolean(payload.is_liquid_double_sealed === "Yes") }
        ];
    }

    // ✅ Liquid Volume
    if (payload.liquid_volume?.value && payload.liquid_volume?.unit) {
        attributes.liquid_volume = [payload.liquid_volume];
    }

    // ✅ Item Volume
    if (payload.item_volume?.value && payload.item_volume?.unit) {
        attributes.item_volume = [payload.item_volume];
    }

    // ✅ Liquid Contents Description
    if (payload.liquid_contents_description) {
        attributes.liquid_contents_description = [{
            value: payload?.liquid_contents_description,
            language_tag: languageTag,
            marketplace_id: marketplaceId
        }];
    }

    // ✅ Vegetarian / Non-Vegetarian
    if (payload.is_vegetarian_non_vegetarian) {
        attributes.is_vegetarian_non_vegetarian = [
            {
                value: payload.is_vegetarian_non_vegetarian, // e.g. "Vegetarian" | "Non-Vegetarian" | "Vegan"
                language_tag: languageTag,
                marketplace_id: marketplaceId
            }
        ];
    }

    // ✅ Is the Item Heat Sensitive
    if (payload.is_heat_sensitive) {
        attributes.is_heat_sensitive = [{ value: Boolean(payload.is_liquid_double_sealed === "Yes"), marketplace_id: marketplaceId }];
    }

    // ✅ Product Benefits
    if (Array.isArray(payload.product_benefit) && payload.product_benefit.length > 0 && payload.product_benefit?.[0]) {
        attributes.product_benefit = payload.product_benefit.map(b => ({ value: b, language_tag: languageTag, marketplace_id: marketplaceId }));
    }

    // ✅ Melting Temperature
    if (payload.melting_temperature?.value && payload.melting_temperature?.unit) {
        attributes.melting_temperature = [payload.melting_temperature]
    }

    // ✅ Diet Type (multiple selection)
    if (payload.diet_type) {
        attributes.diet_type = [payload.diet_type].map(d => ({
            value: d,
            marketplace_id: marketplaceId
        }));
    }

    // ✅ Vegetarian / Non-Vegetarian
    if (payload.fssai_veg_non_veg_status) {
        attributes.fssai_veg_non_veg_status = [{ value: payload?.fssai_veg_non_veg_status, marketplace_id: marketplaceId }];
    }

    // ✅ Contains Food or Beverage
    if (payload.contains_food_or_beverage) {
        attributes.contains_food_or_beverage = [{ value: Boolean(payload.contains_food_or_beverage === "Yes"), marketplace_id: marketplaceId }];
    }

    // ✅ Age Range Description
    if (payload.age_range_description) {
        attributes.age_range_description = [{ value: payload?.age_range_description, marketplace_id: marketplaceId }];
    }

    // ✅ Flavor
    if (payload.flavor) {
        attributes.flavor = [{ value: payload?.flavor, marketplace_id: marketplaceId }];
    }

    // ✅ Hazmat
    if (Array.isArray(payload.hazmat) && payload.hazmat.length > 0) {
        attributes.hazmat = payload.hazmat.map(h => ({
            aspect: "united_nations_regulatory_id",
            value: h,
            marketplace_id: marketplaceId
        }));
    }

    // ✅ Age Range Description
    if (payload.form_factor) {
        attributes.form_factor = [{ value: payload?.form_factor, marketplace_id: marketplaceId }];
    }

    // ✅ Allergen Information
    if (Array.isArray(payload.allergen_information) && payload.allergen_information.length > 0 && payload.allergen_information?.[0]) {
        attributes.allergen_information = payload.allergen_information.map(f => ({ value: f, marketplace_id: marketplaceId }));
    }

    // ✅ Nutritional Information
    if (Array.isArray(payload.nutritional_info) && payload.nutritional_info.length > 0 && payload.nutritional_info?.[0]?.serving_quantity && payload.nutritional_info?.[0]?.serving_unit) {
        attributes.nutritional_info = payload?.nutritional_info;
    }

    // ✅ Final Amazon listing payload
    const listingBodyPayload = {
        sku: payload?.sku,
        productType,
        requirements: payload?.requirements,
        attributes,
    };

    return listingBodyPayload;
}

export function buildListingDynamicBodyPayload({ sku, payload, generated, marketplace_id, language_tag }) {
    const attributes = { ...payload };
    delete attributes?.productType
    delete attributes?.profileId
    delete attributes?.sku

    if (generated?.title) {
        attributes.item_name = [{ value: generated?.title, language_tag, marketplace_id }];
    }

    if (Array.isArray(generated?.bulletPoints) && generated.bulletPoints.length) {
        attributes.bullet_point = generated.bulletPoints.map(value => ({ value, language_tag, marketplace_id }));
    }

    if (generated?.backendKeywords) {
        attributes.generic_keyword = [{ value: generated?.backendKeywords, language_tag, marketplace_id }];
    }

    if (generated?.productDescription) {
        attributes.product_description = [{ value: generated?.productDescription, language_tag, marketplace_id }];
    }

    // ✅ Final Amazon listing payload
    const listingBodyPayload = {
        sku,
        productType: payload?.productType,
        attributes,
    };

    return listingBodyPayload;
}



export async function generateCronExpression(frequency, dates, days, times, interval, hours, minutes) {
    const system = `You are an expert in creating a 6 fields cron expression which support for node-cron library. 
    For Example, for Every 1 hour you should response in */1 instead of *. This instruction will be same for Every 1 Minute and Every 1 Seconds.
    For weekdays, please response in Mon, Tue format not in weekdays number`;

    const text = `Create a cron expression based on the given input, Make sure response should be in the given format.
    **CRITICAL: You MUST respond in valid JSON format with this exact structure:**
    {
        "isValid" : BOOLEAN
        "cronExpression": "",
        "message": ""
    }

    **INPUT DATA FROM MODULE 1:**
        - Frequency: ${frequency},
        - Dates: ${dates.join(",")},
        - Days: ${days.join(",")},
        - Times: ${times.join(",")},
        - Interval: ${interval},
        - Hours: ${hours.join(",")},
        - Minutes: ${minutes},

    I want only one cron expression. If my input generate more than 1 cron expression, the reponse as invalid with a propper error in messge. Error should says why cron expression is failed to generate from given input.
    `.trim();

    const messages = [
        { role: "system", content: system },
        { role: "user", content: [{ type: "text", text }] }
    ];

    const completion = await openai.chat.completions.create({
        model: "gpt-5-nano-2025-08-07",
        messages,
        response_format: { type: "json_object" }
    });

    try {
        const jsonResponse = safeJsonParse(completion.choices[0].message.content ?? {});
        return jsonResponse;

    } catch (error) {
        console.log(`Failed to parse Module 2 JSON response: ${error.message}`);
        return {
            isValid: false,
            message: JSON.stringify(error)
        };
    }
}


// ═══════════════════════════════════════════════════════════════
// LISTING OPTIMIZATION — analyzeExistingListingWithGPT
// Strategy: Gemini 2.5 Flash (text) + GPT-4o-mini (image vision)
// ═══════════════════════════════════════════════════════════════

function truncateField(text, maxChars = 300) {
    if (!text) return '';
    return text.length > maxChars ? text.substring(0, maxChars) + '...' : text;
}

async function analyzeImageWithGPT4oMini(imageURL) {
    if (!imageURL) {
        return { score: 0, issues: ["No image URL provided"], tips: ["Upload a high-quality main product image on a plain white background"] };
    }
    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: "You are an Amazon product image quality expert. You directly examine the actual image provided. Return ONLY valid JSON. No markdown. Be specific about what you actually see — do NOT give generic advice."
                },
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: `You are analyzing an Amazon product main image. Examine it carefully and be ACCURATE — do not give generic advice that does not apply to this specific image.

IMPORTANT RULES to avoid false positives:
1. If the product title/packaging says "Pack of 2", "Set of 2", "Combo", "Bundle" etc, showing MULTIPLE items is CORRECT and Amazon-compliant. Do NOT flag it as an issue.
2. Text printed ON THE PRODUCT LABEL (brand name, product name, size, ingredients) is NORMAL — do not flag it. Only flag text/watermarks that are OVERLAID on the image by the seller (e.g. "SALE", "NEW", "Best Seller" graphics).
3. White or very light off-white backgrounds are ACCEPTABLE. Only flag if the background is clearly colored (grey, blue, yellow, etc.) or has a gradient/pattern.
4. If you cannot clearly see the image or the URL is inaccessible, say score: 50 and a single issue: "Image could not be loaded for analysis".

Scoring (start at 100):
- Clearly non-white/colored/gradient background: -25
- Product not centered in frame: -20
- Seller-added text overlays, watermarks, or promotional graphics: -15
- Image is blurry, dark, or low resolution: -20
- Irrelevant props, lifestyle settings, or humans present: -15
- Product fills less than 80% of frame (without valid reason): -10

Return ONLY this JSON (no extra text):
{
  "score": <0-100>,
  "issues": ["<only list issues that are ACTUALLY present in this specific image>"],
  "tips": ["<specific actionable tip for each issue listed, or a positive note if the image is compliant>"]
}

If the image fully complies with Amazon standards, return empty issues array and tips like ["Image meets Amazon main image requirements"].`
                        },
                        {
                            type: "image_url",
                            image_url: { url: imageURL, detail: "high" }
                        }
                    ]
                }
            ],
            response_format: { type: "json_object" },
            max_tokens: 600,
        });
        return safeJsonParse(completion.choices[0].message.content);
    } catch (err) {
        console.warn("Image analysis failed:", err.message);
        return { score: 50, issues: ["Image could not be analyzed automatically"], tips: ["Ensure the product image uses a plain white background, is well-lit, and the product fills at least 85% of the frame"] };
    }
}



async function analyzeTextWithGemini(aiPayload) {
    const system = `You are a world-class Amazon India listing optimization expert with 10+ years of experience. Return ONLY valid JSON. No markdown, no preamble, no text outside JSON.

SCORING RULES — each section is scored 0 to 100 (use ANY integer, not just multiples of 25):

Title scoring guide (0-100):
  95-100 = contains brand + primary keyword + size/variant + key benefit + secondary keyword, 150-200 chars, reads naturally
  85-94  = has all required elements but could be more compelling or slightly outside ideal length
  70-84  = missing one element (e.g., no benefit phrase) or under 120 chars
  50-69  = missing two elements, under 100 chars, or awkward readability
  25-49  = very short (under 60 chars), keyword stuffed, or missing brand
  0-24   = empty, irrelevant, or nonsensical

Bullets scoring guide (0-100):
  95-100 = exactly 5 bullets, each starts with CAPS keyword header, benefit-first language, zero repetition, each 150-250 chars
  85-94  = 5 good bullets but minor repetition or some bullets lack benefit focus
  70-84  = 4-5 bullets present but feature-heavy with weak benefit language, or some are too short/long
  50-69  = 3 bullets only, or significant repetition across bullets
  25-49  = 1-2 bullets only, or bullets are generic copy-paste
  0-24   = empty or irrelevant

Description scoring guide (0-100):
  95-100 = 150-300 words, SEO-rich with natural keyword integration, includes USPs, mobile-readable short paragraphs, compelling narrative
  85-94  = good content and length but could integrate more keywords or improve structure
  70-84  = adequate content but under 150 words, or missing some important keywords
  50-69  = generic content under 100 words, reads like placeholder text
  25-49  = very short (under 50 words), no SEO value
  0-24   = empty or irrelevant

Backend Keywords scoring guide (0-100):
  95-100 = 200-249 characters, zero words repeated from title, all terms are high-relevance search terms buyers actually use
  85-94  = 200-249 chars but 1-2 low-relevance filler words
  70-84  = 150-199 characters, mostly relevant terms
  50-69  = 100-149 characters, some irrelevant terms mixed in
  25-49  = under 100 characters, many wasted or repeated words
  0-24   = empty or only contains words already in title

Price scoring guide (0-100) — USE COMPETITOR DATA PROVIDED:
  95-100 = price is 10-20% below average competitor price AND MRP discount >= 20%
  85-94  = price matches or slightly beats competitors AND MRP discount >= 15%
  70-84  = price is competitive (within 10% of competitor average) AND MRP discount >= 10%
  50-69  = price is slightly higher than competitors OR MRP discount 5-9%
  25-49  = price is significantly higher than competitors OR MRP discount under 5%
  0-24   = no MRP set, selling price equals MRP, or price is 25%+ above competitor average

Overall score = (title + bullets + description + keywords + price) / 5. Round to nearest whole number.`;

    const bulletsText = Array.isArray(aiPayload.currentBullets) && aiPayload.currentBullets.length
        ? aiPayload.currentBullets.map((b, i) => `  Bullet ${i + 1}: ${truncateField(b, 500)}`).join('\n')
        : '  (No bullet points set — score bullets as 0)';

    const discountPct = aiPayload.mrp && aiPayload.sellingPrice
        ? Math.round(((aiPayload.mrp - aiPayload.sellingPrice) / aiPayload.mrp) * 100)
        : 0;

    // Build competitor price context from real Amazon data
    let competitorSection = 'No competitor data available — score price based on MRP discount only.';
    if (Array.isArray(aiPayload.competitorPrices) && aiPayload.competitorPrices.length > 0) {
        const prices = aiPayload.competitorPrices.map(c => c.price);
        const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        competitorSection = `Competitor prices (same category, similar products):
${aiPayload.competitorPrices.map(c => `  - ASIN ${c.asin}: ₹${c.price}`).join('\n')}
  Average: ₹${avg} | Lowest: ₹${min} | Highest: ₹${max}
  → Compare seller's price ₹${aiPayload.sellingPrice} against these REAL competitor prices.`;
    }

    const userText = `Analyze this Amazon India product listing and return a full optimization report.

PRODUCT IDENTITY:
Title: ${truncateField(aiPayload.title, 250)}
Brand: ${aiPayload.currentBrand || "Unknown"}
Product Type: ${aiPayload.productType || "Unknown"}
Category: ${aiPayload.categoryName || "Unknown"}

CURRENT LISTING CONTENT:
Bullets:
${bulletsText}
Description: ${truncateField(aiPayload.currentDescription, 800) || "(No description set — score as 0)"}
Backend Keywords: ${truncateField(aiPayload.currentKeywords, 500) || "(No backend keywords set — score as 0)"}

PERFORMANCE DATA:
Selling Price: ₹${aiPayload.sellingPrice} | MRP: ₹${aiPayload.mrp} | Discount: ${discountPct}%
BSR Rank: ${aiPayload.bsrRank || "N/A"} | Total Orders: ${aiPayload.totalOrders || 0}
Sales/Day: ${aiPayload.salesPerDay || 0} | Stock: ${aiPayload.stockStatus || "Unknown"} | Days Left: ${aiPayload.daysLeft || "N/A"}

COMPETITOR PRICING DATA:
${competitorSection}

INSTRUCTIONS:
1. Score each section using the FULL 0-100 range. Be precise — do NOT round to multiples of 25.
2. CRITICAL: The 'score' field MUST reflect the quality of the CURRENT listing content, NOT your optimized content. If the current content is empty or "(No backend keywords set)", the score for that section MUST be 0.
3. overall score MUST equal (titleAnalysis.score + bulletAnalysis.score + descriptionAnalysis.score + backendKeywordsAnalysis.score + priceAnalysis.score) / 5. Round to nearest whole number.
3. optimized title MUST be under 200 characters.
4. optimized backendKeywords MUST be 249 characters or fewer including spaces. Count every character. Never exceed 249. Do NOT repeat any word already in the title. Focus on words real buyers type when searching for this product on Amazon India.
5. Return exactly 5 optimized bullets. Each bullet should start with a CAPS keyword header, followed by a benefit-first explanation.
6. issues array must list SPECIFIC problems found in THIS listing, not generic advice. If no issues, return empty array [].
7. For priceAnalysis, compare against the REAL competitor prices provided above. Your suggestion must reference actual competitor prices.
8. For backendKeywords, suggest terms buyers in the "${aiPayload.categoryName || 'this'}" category actually search for on Amazon India. Include Hindi transliterations and regional terms if relevant.

Return EXACTLY this JSON structure:
{
  "score": <average of all 5 section scores, rounded to whole number>,
  "titleAnalysis": {
    "score": <0-100 per scoring guide>,
    "issues": ["<specific issue found in this title>"],
    "optimized": "<rewritten title max 200 chars — brand + keyword + size + benefit>"
  },
  "bulletAnalysis": {
    "score": <0-100 per scoring guide>,
    "issues": ["<specific issue found in these bullets>"],
    "optimized": ["<bullet 1>", "<bullet 2>", "<bullet 3>", "<bullet 4>", "<bullet 5>"]
  },
  "descriptionAnalysis": {
    "score": <0-100 per scoring guide>,
    "issues": ["<specific issue found in this description>"],
    "optimized": "<150-300 word description improving on the current one>"
  },
  "backendKeywordsAnalysis": {
    "score": <0-100 per scoring guide>,
    "issues": ["<specific issue found in backend keywords>"],
    "optimized": "<comma-separated backend keywords, HARD LIMIT 249 characters total including commas, avoid repeating title words, include regional/search variation terms>"
  },
  "priceAnalysis": {
    "score": <0-100 per scoring guide>,
    "reasoning": "<2-3 sentences comparing price against REAL competitor data, BSR, and sales velocity>",
    "suggestion": "<specific actionable suggestion referencing competitor prices, or empty string if price is optimal>"
  },
  "priorityActions": ["<action1 — highest impact>", "<action2>", "<action3>"]
}`;

    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        systemInstruction: system,
    });

    const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: userText }] }],
        generationConfig: {
            temperature: 0,       // deterministic — same input = same output
            topP: 1,
            topK: 1,
            responseMimeType: "application/json",
        },
        safetySettings: [],
        tools: [],
    });

    const parsed = safeJsonParse(result.response.text());

    // Server-side override — average of all 5 sections, each out of 100
    const calculatedScore = Math.round((
        (parsed.titleAnalysis?.score || 0) +
        (parsed.bulletAnalysis?.score || 0) +
        (parsed.descriptionAnalysis?.score || 0) +
        (parsed.backendKeywordsAnalysis?.score || 0) +
        (parsed.priceAnalysis?.score || 0)
    ) / 5);

    parsed.score = calculatedScore; // always override with server-calculated value

    return parsed;
}
export async function analyzeExistingListingWithGPT(productData, options = { analyzeContent: true, analyzeImage: false }) {
    const { analyzeContent = true, analyzeImage = false } = options;

    const aiPayload = {
        title: productData.itemName,
        productType: productData.productType,
        imageURL: productData.imageURL,
        // Live content from Amazon — Gemini analyzes & improves these
        currentBullets: productData.currentBullets || [],
        currentDescription: productData.currentDescription || '',
        currentKeywords: productData.currentKeywords || '',
        currentBrand: productData.currentBrand || '',
        // Performance signals
        sellingPrice: productData.sellingPrice,
        mrp: productData.maximumRetailPrice,
        bsrRank: productData.classificationRank,
        totalOrders: productData.totalOrders,
        salesPerDay: productData.salesPerDay,
        daysLeft: productData.daysLeft,
        stockStatus: productData.stockStatus,
        fulfillmentType: productData.fulfillmentType,
        // Competitor data for accurate pricing
        competitorPrices: productData.competitorPrices || [],
        categoryName: productData.categoryName || '',
    };

    const promises = [];
    if (analyzeContent) {
        promises.push(analyzeTextWithGemini(aiPayload));
    } else {
        promises.push(Promise.resolve({
            score: 0,
            titleAnalysis: { score: 100, issues: [], optimized: productData.itemName || '' },
            bulletAnalysis: { score: 100, issues: [], optimized: productData.currentBullets || [] },
            descriptionAnalysis: { score: 100, issues: [], optimized: productData.currentDescription || '' },
            backendKeywordsAnalysis: { score: 100, issues: [], optimized: productData.currentKeywords || '' },
            priceAnalysis: { score: 100, reasoning: 'Content analysis was skipped.', suggestion: '' },
            priorityActions: []
        }));
    }

    if (analyzeImage) {
        promises.push(analyzeImageWithGPT4oMini(aiPayload.imageURL));
    } else {
        promises.push(Promise.resolve({
            score: 100,
            issues: [],
            tips: ["Image analysis was skipped."]
        }));
    }

    const [textResult, imageResult] = await Promise.all(promises);

    let finalScore = 0;
    if (analyzeContent && analyzeImage) {
        finalScore = Math.round((textResult.score * 0.8) + (imageResult.score * 0.2));
    } else if (analyzeContent) {
        finalScore = textResult.score;
    } else if (analyzeImage) {
        finalScore = imageResult.score;
    }

    return {
        ...textResult,
        imageAnalysis: imageResult,
        score: finalScore,
        analyzeContent,
        analyzeImage,
    };
}

export function buildOptimizationPatchPayload({ productType, title, bulletPoints, description, backendKeywords, languageTag = "en_IN", marketplaceId }) {
    const backendKeywordsArray = backendKeywords?.split(',')?.map(bp => ({ value: bp.trim(), language_tag: languageTag, marketplace_id: marketplaceId }))
    const patches = [];
    if (title) patches.push({ op: "replace", path: "/attributes/item_name", value: [{ value: title, language_tag: languageTag, marketplace_id: marketplaceId }] });
    if (Array.isArray(bulletPoints) && bulletPoints.length) patches.push({ op: "replace", path: "/attributes/bullet_point", value: bulletPoints.map(bp => ({ value: bp, language_tag: languageTag, marketplace_id: marketplaceId })) });
    if (description) patches.push({ op: "replace", path: "/attributes/product_description", value: [{ value: description, language_tag: languageTag, marketplace_id: marketplaceId }] });
    if (backendKeywordsArray && backendKeywordsArray.length) patches.push({ op: "replace", path: "/attributes/generic_keyword", value: backendKeywordsArray });
    return { productType, patches };
}

export function formatOfContentModuleList() {
    return {
        "contentModuleList": [
            {
                "contentModuleType": "STANDARD_COMPANY_LOGO",
                "standardCompanyLogo": {
                    "companyLogo": {
                        "uploadDestinationId": "aplus-media/company-logo.jpg",
                        "imageCropSpecification": {
                            "size": { "width": { "value": 600, "units": "pixels" }, "height": { "value": 180, "units": "pixels" } },
                            "offset": { "x": { "value": 0, "units": "pixels" }, "y": { "value": 0, "units": "pixels" } }
                        },
                        "altText": "Brand Logo"
                    }
                }
            },

            {
                "contentModuleType": "STANDARD_SINGLE_IMAGE_HIGHLIGHTS",
                "standardSingleImageHighlights": {
                    "image": {
                        "uploadDestinationId": "aplus-media/highlight-image.jpg",
                        "imageCropSpecification": {
                            "size": { "width": { "value": 300, "units": "pixels" }, "height": { "value": 300, "units": "pixels" } },
                            "offset": { "x": { "value": 0, "units": "pixels" }, "y": { "value": 0, "units": "pixels" } }
                        },
                        "altText": "Product Highlights"
                    },
                    "headline": { "value": "Main Benefit Headline" },
                    "textBlock1": {
                        "headline": { "value": "Benefit 1" },
                        "body": { "textList": [{ "value": "Benefit description" }] }
                    },
                    "textBlock2": {
                        "headline": { "value": "Benefit 2" },
                        "body": { "textList": [{ "value": "Benefit description" }] }
                    },
                    "textBlock3": {
                        "headline": { "value": "Benefit 3" },
                        "body": { "textList": [{ "value": "Benefit description" }] }
                    },
                    "bulletedListBlock": {
                        "headline": { "value": "Key Features" },
                        "block": {
                            "textList": [
                                { "position": 1, "text": { "value": "Feature 1" } },
                                { "position": 2, "text": { "value": "Feature 2" } }
                            ]
                        }
                    }
                }
            },

            {
                "contentModuleType": "STANDARD_PRODUCT_DESCRIPTION",
                "standardProductDescription": {
                    "body": { "textList": [{ "value": "SEO optimized long product description" }] }
                }
            },

            {
                "contentModuleType": "STANDARD_FOUR_IMAGE_TEXT",
                "standardFourImageText": {
                    "headline": { "value": "Why Customers Love It" },
                    "block1": {
                        "image": {
                            "uploadDestinationId": "aplus-media/four-1.jpg",
                            "imageCropSpecification": {
                                "size": { "width": { "value": 220, "units": "pixels" }, "height": { "value": 220, "units": "pixels" } },
                                "offset": { "x": { "value": 0, "units": "pixels" }, "y": { "value": 0, "units": "pixels" } }
                            },
                            "altText": "Feature 1"
                        },
                        "headline": { "value": "Feature 1" },
                        "body": { "textList": [{ "value": "Feature description" }] }
                    },
                    "block2": {},
                    "block3": {},
                    "block4": {}
                }
            },

            {
                "contentModuleType": "STANDARD_THREE_IMAGE_TEXT",
                "standardThreeImageText": {
                    "headline": { "value": "Core Advantages" },
                    "block1": {},
                    "block2": {},
                    "block3": {}
                }
            },

            {
                "contentModuleType": "STANDARD_HEADER_IMAGE_TEXT",
                "standardHeaderImageText": {
                    "headline": { "value": "Premium Lifestyle" },
                    "block": {
                        "image": {
                            "uploadDestinationId": "aplus-media/header.jpg",
                            "imageCropSpecification": {
                                "size": { "width": { "value": 970, "units": "pixels" }, "height": { "value": 600, "units": "pixels" } },
                                "offset": { "x": { "value": 0, "units": "pixels" }, "y": { "value": 0, "units": "pixels" } }
                            },
                            "altText": "Header Banner"
                        },
                        "headline": { "value": "Lifestyle Headline" },
                        "body": { "textList": [{ "value": "Lifestyle description" }] }
                    }
                }
            },

            {
                "contentModuleType": "STANDARD_IMAGE_TEXT_OVERLAY",
                "standardImageTextOverlay": {
                    "overlayColorType": "DARK",
                    "block": {
                        "image": {
                            "uploadDestinationId": "aplus-media/overlay.jpg",
                            "imageCropSpecification": {
                                "size": { "width": { "value": 970, "units": "pixels" }, "height": { "value": 300, "units": "pixels" } },
                                "offset": { "x": { "value": 0, "units": "pixels" }, "y": { "value": 0, "units": "pixels" } }
                            },
                            "altText": "Overlay Image"
                        },
                        "headline": { "value": "Overlay Headline" },
                        "body": { "textList": [{ "value": "Overlay body content" }] }
                    }
                }
            }
        ]
    }
}

export async function generateAPlusModulesAI({ asin, prompt, productData, type = "basic" }) {

    const apiKey = process.env.GOOGLE_AI_STUDIO_KEY;
    if (!apiKey) throw new Error("GOOGLE_AI_STUDIO_KEY not set");

    const ai = new GoogleGenAI({ apiKey });
    const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash";
    const PREMIUM_SIZES = ["970x600", "970x300"];

    // -----------------------------------------------------------------------
    // buildInstruction — ported from aplus-demo/server/src/services/geminiText.js
    // Steers Gemini to produce the right count + sizes per type.
    // -----------------------------------------------------------------------
    const count = type === "premium" ? 7 : 5;

    const BASIC_SIZE = "970x300";

    const sizeRules =
        type === "premium"
            ? `SIZE RULES (premium — ${count} modules, a deliberate MIX of two shapes):
- WIDE STORYTELLING modules use size "970x600" (~1.61:1 aspect ratio). Use these for
  big narrative beats: hero, competitor comparison, lifestyle / big-benefit, how-to / usage.
- COMPACT DETAIL modules use size "970x300" (~3.23:1, a wide short horizontal banner). Use these for
  information-dense beats: multi-feature callouts, sizing / what's-in-the-pack, testimonial, trust / badges.
- Aim for roughly 4 WIDE ("970x600") + 3 COMPACT ("970x300") across the ${count} modules.
- Pick a DIVERSE, non-repeating module mix (hero, comparison, multi-feature, sizing, testimonial,
  how-to, trust, lifestyle) — do not repeat the same module type.
- For EACH module, return its chosen "size" as EXACTLY one of "970x600" or "970x300", and design the
  composition specifically for that shape.`
            : `SIZE RULES (basic — ${count} modules, ALL the same shape):
- EVERY module must use size "970x300" — a WIDE, SHORT horizontal A+ banner (~3.23:1, a long thin strip).
- Design every composition for that very wide, short strip: keep the layout horizontal, product to one
  side and text to the other, nothing that needs vertical height.
- For EACH module, return its "size" as EXACTLY "970x300".`;

    const instruction = `You are a senior Amazon A+ content designer and image-prompt engineer.

You are given a PRODUCT (its real photo is attached) and its DESCRIPTION. Plan a cohesive set of
EXACTLY ${count} Amazon A+ content image modules for THIS product, then write ONE image-generation
prompt per module.

${sizeRules}

Pick the ${count} most relevant, non-repeating module types for this specific product, choosing a
DIVERSE mix from the list below (don't just do hero + benefits — vary the angles):
- Hero banner — a bold headline with the product as the star.
- Key benefit / lifestyle — the product in a real-life moment conveying one big benefit.
- Multi-feature callouts — the product with 3-5 labeled feature call-outs / icons and short labels
  pointing to different parts or selling points of the product.
- What's-inside / ingredients — the key ingredients or what the product is made of.
- How-to-use / directions / recipe — simple numbered steps or a clear usage scene.
- Competitor comparison — a clean "OURS vs. OTHERS" / "why choose us" comparison table with green
  check marks for our product and grey crosses for generic competitors across a few key criteria.
- Sizing / what's in the pack — size, quantity or servings info (e.g. "90 CAPSULES · 500MG EACH"),
  dimensions, or a scale/size reference so the shopper knows exactly what they get.
- Testimonial / social proof — a short realistic customer quote in quotation marks with a 5-star
  rating and, optionally, a happy reviewer; keep names generic (e.g. "— PRIYA S.").
- Problem to solution, before & after, trust badges (natural / vegan / non-GMO / cruelty-free), or a
  guarantee / money-back seal.
Order them as a persuasive story, e.g.: hero -> features/benefits -> comparison/proof -> usage -> trust.

For EACH module, write a single, self-contained prompt for an AI IMAGE MODEL that will ALSO receive
the product's own photo as a reference image. Every prompt MUST:
- Describe a complete, polished landscape marketing banner, filled edge to edge, designed for THIS
  module's assigned size. STATE the EXACT target pixel dimensions and aspect ratio inside the prompt
  text (e.g. "target 970x300 pixels, a wide short ~3.23:1 banner", or "target 1464x600 pixels ~2.44:1",
  or "target 600x450 pixels, a 4:3 rectangle") so the image model composes for the correct shape.
- State the EXACT on-image text to render: a short ALL-CAPS HEADLINE (max ~6 words) and, when useful,
  one short supporting line. Keep text minimal, correctly spelled and marketing-grade.
- Describe the background scene, a color palette derived from the product, the layout (where the
  product sits vs. where the text sits), the lighting and the mood — concrete and vivid.
- PRODUCT SIZE & LABEL LEGIBILITY (critical): render the product medium and prominent — it should be a
  hero element occupying a generous share of the frame (roughly 25-30% of the width), close to the
  camera, NOT small or distant, so its label has plenty of pixels. Keep EVERY line of the product's
  own label text razor-SHARP, crisp and fully LEGIBLE: the brand name, the sub-lines, the badges/seals
  and the small print must all be clearly readable and match the reference EXACTLY — never blurred,
  softened, warped, garbled, merged or approximated. Treat the label like real product photography where
  the text is in sharp focus.
- REALISM OF THE PRODUCT (most important — apply THIS specifically to the product/mockup, i.e. the
  bottle / jar / pack, NOT to the whole banner): the product must look like a REAL PHOTOGRAPHED product
  shot with a real camera — NOT a 3D render, NOT CGI, NOT a glossy product-visualization, NOT AI-looking.
  Render the PRODUCT itself a touch DARKER and deeper in tone than a bright catalog shot, with muted,
  true-to-life MATTE colors, real material texture, tiny real-world imperfections, and softened,
  reduced highlights. Explicitly forbid bright glossy reflections, plastic/wax sheen, mirror-perfect
  specular highlights on the label or cap, over-saturation and over-smoothing. The background scene may
  stay bright and natural — it is the PRODUCT that must read as a real, slightly darker photograph.
- Contain this exact preservation clause, verbatim:
  "Use the attached product image as the exact product. Keep the product's packaging, label, text,
  logo and colors EXACTLY as in the reference — do not redesign, relabel, recolor, or distort the
  product. Render the PRODUCT like a REAL photograph shot with a real camera — NOT a 3D render, NOT CGI,
  NOT a glossy visualization: natural soft lighting, true matte materials, real texture, and colors kept
  slightly DARKER and deeper (true to life) — never washed out, over-shiny, glossy, plasticky, or
  AI-looking. Place it naturally and undistorted into the scene, grounded with a soft realistic contact
  shadow."
- Avoid extra watermarks, third-party logos, and gibberish text.

Every image must read as professional real-world product photography — believable and photoreal, not
a digital illustration or an AI-looking composite.

Return ONLY JSON matching {"modules":[{"title":"<2-4 word label>","prompt":"<full image prompt>","size":"<one of the allowed sizes>"}]}
with EXACTLY ${count} items.`;

    // -----------------------------------------------------------------------
    // Build the parts array (product image + text prompt)
    // -----------------------------------------------------------------------
    const parts = [];

    // If we have product images, download the best one and pass as inlineData
    const productImages = productData?.images || [];
    if (productImages.length > 0) {
        try {
            // Pick highest-resolution MAIN image
            const mains = productImages.filter(i => i?.variant === "MAIN" && i?.link);
            const pool = mains.length ? mains : productImages.filter(i => i?.link);
            if (pool.length > 0) {
                const best = pool.reduce(
                    (a, b) => ((Number(b.width) * Number(b.height) || 0) > (Number(a.width) * Number(a.height) || 0) ? b : a),
                    pool[0]
                );
                const imgRes = await axios.get(best.link, { responseType: "arraybuffer" });
                const buf = Buffer.from(imgRes.data);
                const mimeType = imgRes.headers["content-type"] || "image/jpeg";
                parts.push({ inlineData: { mimeType, data: buf.toString("base64") } });
            }
        } catch (err) {
            // Non-fatal — continue without product image reference
            console.log(`Warning: Could not fetch product image for Gemini text prompt: ${err.message}`);
        }
    }

    // Build the product description from available data
    const bullets = productData?.bullets || [];
    const description = bullets.length
        ? bullets.join("\n")
        : productData?.description || productData?.title || "";

    parts.push({
        text: `${instruction}\n\nPRODUCT DESCRIPTION:\n${description}\n\nASIN: ${asin}\n\nCUSTOM PROMPT:\n${prompt || "No custom prompt"}`
    });

    // -----------------------------------------------------------------------
    // Structured output schema (matching aplus-demo)
    // -----------------------------------------------------------------------
    const RESPONSE_SCHEMA = {
        type: "object",
        properties: {
            modules: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        title: { type: "string" },
                        prompt: { type: "string" },
                        size: { type: "string" },
                    },
                    required: ["title", "prompt", "size"],
                },
            },
        },
        required: ["modules"],
    };

    const res = await ai.models.generateContent({
        model: TEXT_MODEL,
        contents: [{ role: "user", parts }],
        config: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA, temperature: 0.9 },
    });

    let json;
    try {
        json = JSON.parse(res.text);
    } catch {
        throw new Error("Model returned invalid JSON for the A+ prompt plan.");
    }

    // Coerce sizes to allowed values (matching aplus-demo)
    const mods = (Array.isArray(json?.modules) ? json.modules : [])
        .filter((m) => m && typeof m.prompt === "string" && m.prompt.trim())
        .slice(0, count)
        .map((m, i) => {
            let size = typeof m.size === "string" ? m.size.trim() : "";
            if (type === "premium") {
                if (!PREMIUM_SIZES.includes(size)) size = "970x600";
            } else {
                size = BASIC_SIZE;
            }
            return { title: (m.title || `Image ${i + 1}`).trim(), prompt: m.prompt.trim(), size };
        });

    return { _imageModules: mods, _type: type };
}
