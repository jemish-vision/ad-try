/**
 * Pure helpers for the read-only "Competitor Comparison" (same ASIN / Buy Box) view.
 *
 * Input shapes are the raw SP-API payloads:
 *  - Product Pricing v0 getItemOffers  -> payload { ASIN, Summary, Offers[] }
 *  - Catalog Items 2022-04-01 getCatalogItem -> { summaries[], images[], salesRanks[], attributes }
 *
 * Delta convention everywhere: delta = ours - theirs.
 *   delta > 0  -> we are more expensive (bad / red)
 *   delta < 0  -> we are cheaper (good / green)
 */

const round2 = (n) => (n === null || n === undefined || Number.isNaN(Number(n)) ? null : Math.round(Number(n) * 100) / 100);

const money = (m) => (m && m.Amount !== undefined && m.Amount !== null ? Number(m.Amount) : null);

/** Normalize one getItemOffers offer. */
const normalizeOffer = (offer, ourSellerId) => {
    if (!offer) return null;
    const listingPrice = money(offer.ListingPrice);
    const shipping = money(offer.Shipping) ?? 0;
    const points = offer.Points?.PointsNumber ?? null;
    const sellerId = offer.SellerId ?? null;
    const isOurs = Boolean(offer.MyOffer) || (Boolean(ourSellerId) && sellerId === ourSellerId);

    return {
        sellerId,
        isOurs,
        isBuyBoxWinner: Boolean(offer.IsBuyBoxWinner),
        isFeaturedMerchant: Boolean(offer.IsFeaturedMerchant),
        subCondition: offer.SubCondition ?? null,
        currency: offer.ListingPrice?.CurrencyCode ?? offer.Shipping?.CurrencyCode ?? null,
        listingPrice: round2(listingPrice),
        shipping: round2(shipping),
        landedPrice: listingPrice === null ? null : round2(listingPrice + shipping),
        points,
        fulfillment: offer.IsFulfilledByAmazon ? "FBA" : "FBM",
        isPrime: Boolean(offer.PrimeInformation?.IsPrime),
        isNationalPrime: Boolean(offer.PrimeInformation?.IsNationalPrime),
        feedbackPercent: offer.SellerFeedbackRating?.SellerPositiveFeedbackRating ?? null,
        feedbackCount: offer.SellerFeedbackRating?.FeedbackCount ?? null,
        shipsFrom: offer.ShipsFrom?.Country ?? null,
        shippingTime: offer.ShippingTime
            ? {
                minHours: offer.ShippingTime.minimumHours ?? null,
                maxHours: offer.ShippingTime.maximumHours ?? null,
                availability: offer.ShippingTime.availabilityType ?? null,
            }
            : null,
        source: "offers",
    };
};

/** Summary block: Buy Box price, lowest prices, offer counts. Prefers condition "New". */
const normalizeSummary = (summary) => {
    if (!summary) return null;
    const pickNew = (arr) => (arr || []).find((x) => String(x.condition || "").toLowerCase() === "new") || (arr || [])[0] || null;

    const bb = pickNew(summary.BuyBoxPrices);
    const lowestList = (summary.LowestPrices || [])
        .filter((x) => String(x.condition || "").toLowerCase() === "new")
        .map((x) => ({
            fulfillmentChannel: x.fulfillmentChannel === "Amazon" ? "FBA" : "FBM",
            landedPrice: round2(money(x.LandedPrice)),
            listingPrice: round2(money(x.ListingPrice)),
            shipping: round2(money(x.Shipping)),
        }));

    const totalNew = (summary.NumberOfOffers || [])
        .filter((x) => String(x.condition || "").toLowerCase() === "new")
        .reduce((acc, x) => acc + (Number(x.OfferCount) || 0), 0);

    return {
        totalOfferCount: summary.TotalOfferCount ?? null,
        newOfferCount: totalNew || null,
        buyBoxPrice: bb
            ? {
                landedPrice: round2(money(bb.LandedPrice)),
                listingPrice: round2(money(bb.ListingPrice)),
                shipping: round2(money(bb.Shipping)),
            }
            : null,
        lowestPrices: lowestList,
        listPrice: round2(money(summary.ListPrice)),
        competitivePriceThreshold: round2(money(summary.CompetitivePriceThreshold)),
        salesRankings: (summary.SalesRankings || []).map((r) => ({ category: r.ProductCategoryId, rank: r.Rank })),
    };
};

/** Catalog item -> display fields. */
const normalizeCatalog = (item, marketplaceId) => {
    if (!item) return null;
    const summary = (item.summaries || []).find((s) => s.marketplaceId === marketplaceId) || item.summaries?.[0] || {};
    const imageSet = (item.images || []).find((s) => s.marketplaceId === marketplaceId) || item.images?.[0];
    const images = imageSet?.images || [];
    const main = images.filter((i) => i.variant === "MAIN").sort((a, b) => (b.width || 0) - (a.width || 0))[0] || images[0];
    const rankSet = (item.salesRanks || []).find((s) => s.marketplaceId === marketplaceId) || item.salesRanks?.[0];
    const classification = rankSet?.classificationRanks?.[0];
    const displayGroup = rankSet?.displayGroupRanks?.[0];
    const a = item.attributes || {};

    return {
        asin: item.asin ?? null,
        title: summary.itemName ?? a.item_name?.[0]?.value ?? null,
        brand: summary.brand ?? summary.brandName ?? a.brand?.[0]?.value ?? null,
        image: main?.link ?? null,
        bulletPoints: (a.bullet_point || []).map((b) => b.value).filter(Boolean),
        size: summary.size ?? a.size?.[0]?.value ?? null,
        unitValue: a.unit_count?.[0]?.value ?? a.number_of_items?.[0]?.value ?? a.item_package_quantity?.[0]?.value ?? null,
        unitType: a.unit_count?.[0]?.type?.value ?? (a.number_of_items?.[0]?.value || a.item_package_quantity?.[0]?.value ? "count" : null),
        category: classification?.title ?? summary.browseClassification?.displayName ?? null,
        salesRank: classification
            ? { rank: classification.rank, category: classification.title }
            : displayGroup
                ? { rank: displayGroup.rank, category: displayGroup.title }
                : null,
    };
};

const deltaBlock = (ours, theirs) => {
    if (!ours || !theirs) return null;
    const d = (a, b) => (a === null || a === undefined || b === null || b === undefined ? null : round2(a - b));
    return {
        listingPrice: d(ours.listingPrice, theirs.listingPrice),
        shipping: d(ours.shipping, theirs.shipping),
        landedPrice: d(ours.landedPrice, theirs.landedPrice),
    };
};

/**
 * Build the comparison payload.
 * @param {object} args
 * @param {object} args.offersPayload  getItemOffers payload
 * @param {object} args.catalogItem    getCatalogItem response body
 * @param {string} args.ourSellerId
 * @param {string} args.marketplaceId
 * @param {object} [args.ourListing]   our productListing doc (fallback when our offer is not in the returned offers)
 */
const buildComparison = ({ offersPayload, catalogItem, ourSellerId, marketplaceId, ourListing = null }) => {
    const rawOffers = offersPayload?.Offers || [];
    const offers = rawOffers.map((o) => normalizeOffer(o, ourSellerId)).filter(Boolean);
    const summary = normalizeSummary(offersPayload?.Summary);

    let ourOffer = offers.find((o) => o.isOurs) || null;
    if (!ourOffer && ourListing) {
        // A 0 / empty price in Product List means "no price" (e.g. listing inactive) — never compare against it.
        const positive = (v) => (Number(v) > 0 ? Number(v) : null);
        const price = positive(ourListing.sellingPrice) ?? positive(ourListing.basePrice) ?? null;
        if (price !== null) ourOffer = {
            sellerId: ourSellerId || null,
            isOurs: true,
            isBuyBoxWinner: false,
            isFeaturedMerchant: null,
            subCondition: null,
            currency: ourListing.currency ?? null,
            listingPrice: round2(price),
            shipping: null,
            landedPrice: round2(price),
            points: null,
            fulfillment: null,
            isPrime: null,
            isNationalPrime: null,
            feedbackPercent: null,
            feedbackCount: null,
            shipsFrom: null,
            shippingTime: null,
            source: "listing", // not present in Amazon's returned offers (inactive, or outside the top offers)
        };
    }

    const competitors = offers.filter((o) => !o.isOurs).sort((a, b) => (a.landedPrice ?? Infinity) - (b.landedPrice ?? Infinity));
    const buyBoxOffer = offers.find((o) => o.isBuyBoxWinner) || null;
    const lowestCompetitor = competitors.find((o) => o.landedPrice !== null) || null;

    const weHaveBuyBox = Boolean(ourOffer?.isBuyBoxWinner);
    let status;
    if (!ourOffer) status = "no_offer";
    else if (competitors.length === 0) status = "only_seller";
    else if (weHaveBuyBox) status = "winning";
    else status = "losing";

    // Who we compare against in the side-by-side card: the Buy Box owner if it isn't us, else the cheapest rival.
    const primaryRival = buyBoxOffer && !buyBoxOffer.isOurs ? buyBoxOffer : lowestCompetitor;

    const currency =
        ourOffer?.currency || offers.find((o) => o.currency)?.currency || offersPayload?.Summary?.BuyBoxPrices?.[0]?.LandedPrice?.CurrencyCode || null;

    return {
        asin: offersPayload?.ASIN || catalogItem?.asin || null,
        marketplaceId,
        currency,
        product: normalizeCatalog(catalogItem, marketplaceId),
        summary,
        ourOffer,
        buyBoxOffer,
        lowestCompetitor,
        primaryRival,
        competitors,
        comparison: {
            status,
            weHaveBuyBox,
            buyBoxSuppressed: Boolean(summary) && !summary.buyBoxPrice && !buyBoxOffer,
            vsPrimaryRival: deltaBlock(ourOffer, primaryRival),
            vsBuyBox: buyBoxOffer && !buyBoxOffer.isOurs ? deltaBlock(ourOffer, buyBoxOffer) : null,
            vsLowest: deltaBlock(ourOffer, lowestCompetitor),
            competitorCount: competitors.length,
        },
    };
};

module.exports = { normalizeOffer, normalizeSummary, normalizeCatalog, buildComparison };
