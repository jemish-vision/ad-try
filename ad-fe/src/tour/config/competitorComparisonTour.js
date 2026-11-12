import { tourRegistry } from '../TourRegistry';
import {
    MagnifyingGlass, Scales, ArrowClockwise, Package, Cards, Storefront, Table, UsersThree, ListMagnifyingGlass
} from '@phosphor-icons/react';

export const competitorComparisonTourConfig = {
    id: "competitor-comparison",
    title: "Competitor Comparison Tour",
    steps: [
        { target: "#cc-search", icon: MagnifyingGlass, title: "Find Your Product", content: "Search your products by name, SKU or ASIN, then pick one from the list.", blockTargetInteraction: true },
        { target: "#cc-compare-btn", icon: Scales, title: "Compare", content: "Load the latest offers and rival products for the selected ASIN from Amazon.", blockTargetInteraction: true },
        { target: "#cc-refresh-btn", icon: ArrowClockwise, title: "Refresh", content: "Results are cached for a few minutes. Click Refresh to fetch fresh data from Amazon.", blockTargetInteraction: true },
        { target: "#cc-product", icon: Package, title: "Product Overview", content: "Your product's title, brand, Best Seller Rank and fulfillment at a glance.", blockTargetInteraction: true },
        { target: "#cc-summary", icon: Cards, title: "Summary Cards", content: "Your price, the Buy Box price and owner, number of sellers, and how you compare with the cheapest rival brand.", blockTargetInteraction: true },
        { target: "#cc-tab-sellers", icon: Storefront, title: "Sellers on this ASIN", content: "Click to compare your offer with other sellers on the same product page.", requireClick: true },
        { target: "#cc-seller-matrix", icon: Scales, title: "Offer vs Buy Box", content: "Side-by-side view of your offer against the Buy Box winner (or the cheapest seller): price, shipping, FBA/FBM, Prime and seller rating. Green means you are ahead, red means the rival is.", blockTargetInteraction: true },
        { target: "#cc-offers", icon: Table, title: "All Offers", content: "Every seller on this ASIN sorted by landed price, with the Buy Box owner highlighted.", blockTargetInteraction: true },
        { target: "#cc-tab-rivals", icon: UsersThree, title: "Rival Brands", content: "Click to compare your product with similar products from other brands.", requireClick: true },
        { target: "#cc-rival-compare", icon: Scales, title: "Product vs Rival Brand", content: "Compare price, price per unit, Best Seller Rank, size and pack count with the selected rival.", blockTargetInteraction: true },
        { target: "#cc-rivals", icon: ListMagnifyingGlass, title: "Rival Brand Products", content: "All rival products found for this item. Sort by price or rank, and click Compare on any row to see it side by side.", blockTargetInteraction: true }
    ]
};

tourRegistry.register(competitorComparisonTourConfig);
