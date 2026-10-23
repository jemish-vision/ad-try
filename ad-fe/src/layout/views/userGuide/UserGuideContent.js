export const userGuideSections = [
  {
    id: "getting-started",
    title: "1. Introduction & Dashboard",
    icon: "Dashboard",
    color: "#6366f1",
    role: "client",
    content: `
### Welcome to AdvertiseIQ
**AdvertiseIQ** is a comprehensive Amazon Advertising management and optimization platform. It connects to the Amazon Ads API and Selling Partner API to automate campaign management, bid optimization, budget control, and performance analytics — all from a single unified interface.

### Profile Selection & Navigation
After logging in with your credentials, you will be prompted to select an **Advertising Profile**. Each profile represents a specific Amazon seller/advertiser account and marketplace.
- Use the **profile selector** (top-right corner) to switch between linked Amazon accounts.
- The selected profile determines which campaigns, keywords, and data you see across all modules.

### Admin Dashboard
![AdvertiseIQ Prime Dashboard — Performance Analytics](/guide-images/dashboard.png)
The **Dashboard** is the primary analytics hub available to Admin users. It provides a bird's-eye view of your entire advertising ecosystem.

### Multi-Campaign Type Context
![Campaign Type Selector — Dynamic Context Switching](/guide-images/dashboard_type_switch.png)
AdvertiseIQ allows you to seamlessly switch between different Amazon Ad types. Use the **Campaign Type Selector** (located at the top-left of the main dashboard) to switch the entire application context between:
- **Sponsored Products** – Core product-based advertising.
- **Sponsored Brands** – Brand-level advertisements and storefronts.
- **Sponsored Display** – Targeted display ads across Amazon and external sites.

### Global Profile Selection
![Profile Switcher — Account Management](/guide-images/profile_switcher.png)
Manage multiple Amazon accounts effortlessly. Use the **Profile Selector** in the top-right corner of the dashboard to switch between different advertising profiles.

**KPI Metric Cards** (top strip):
- **Total Sales** – Combined organic + ad-attributed revenue.
- **Ad Sales** – Revenue directly attributed to advertising.
- **TACoS** (Total ACoS) – Ad spend as a percentage of total sales.
- **ACoS** (Advertising Cost of Sale) – Ad spend as a percentage of ad sales.
- **ROAS** (Return on Ad Spend) – Revenue earned per unit of ad spend.
- **Conversion Rate** – Percentage of clicks that convert to orders (with sparkline trend).
- **Inventory Health** – Aggregate stock health score across your catalog.

### Performance Matrix
The 2×2 Performance Matrix classifies your products into four quadrants:
- **SCALE** (High Demand / High Profit) – Products performing well; increase ad spend.
- **OPTIMIZE** (High Demand / Low Profit) – Popular but unprofitable; improve targeting or pricing.
- **IMPROVE** (Low Demand / High Profit) – Profitable but low visibility; boost the listing or ads.
- **STOP** (Low Demand / Low Profit) – Not performing; consider pausing ads.

### Performance Charts
![AdvertiseIQ Dynamic Charts — Visualizing Trends](/guide-images/dashboard_charts.png)
The dashboard includes a **multi-metric trend chart** (Sales, Spend, ACoS, ROAS, Orders over time).
- **Add Metrics** (Center toggle): Customize which metrics appear on the chart.
- **View Data Labels** (Right toggle): Display or hide numeric values directly on the data points.
- **Time Granularity**: Switch between Daily, Weekly, or Monthly views.

### Product Performance Grid & Smart Insights
![Product Analytics — Performance Grid & Smart Insights](/guide-images/dashboard_insights.png)
The **Top Products** grid is a sortable, filterable AG Grid table showing per-product metrics including Title, ASIN, SKU and AI-driven labels like **Scale**, **Optimize**, **Fix Listing**, or **Stop Ads**.
    `
  },
  {
    id: "campaign-management",
    title: "2. Campaign Management",
    icon: "Campaign",
    color: "#ec4899",
    role: "client",
    content: `
### Campaign Listing
The **Campaigns** page displays all your Amazon advertising campaigns in a rich AG Grid table with the following columns:
- **Campaign Name** – Clickable link to navigate to the campaign's targeting details.
- **Health Score** – System-calculated badge: **Healthy**, **Budget Leak**, or **Needs Optimization**.
- **Bid Adjustment / New Bid Adjustment** – Current and proposed keyword bid.
- **Target ACoS / Delta ACoS** – Target vs. actual ACoS differential.
- **Target CPC** – System-computed ideal CPC based on target ACoS.
- **Budget / Budget Type / Time in Budget** – Budget details with a progress bar.
- **Spend, Sales, ACoS, ROAS, Orders, Impressions, CPC, Clicks, Conversion, CVR, CTR** – Core performance metrics.

### Column Customization
![Customize Columns — Drag & Drop Reordering](/guide-images/customize_columns.png)
Tailor the campaign grid to your specific workflow:
- **Select Columns**: Use the checkboxes on the left to show or hide specific metrics.
- **Draggable Reordering**: Use the **handle icon** (⋮⋮) on the right side to drag and drop columns.

### Campaign Actions
Access the following tools for any campaign row:
- **View** – Open the campaign detail panel for structure and metrics.
- **Campaign Setting** – Configure notification preference, rename, or adjust settings.
- **AI Analysis** – Generate an AI-powered campaign analysis with recommendations.
- **Hourly Tracking** – View an hour-by-hour breakdown of campaign metrics.

### Campaign Metrics & Chart Customization
![Campaign Dashboard — Dynamic Metrics & Charts](/guide-images/campaign_metrics.png)
The **Campaign Dashboard** allows for deep performance analysis:
- **Dynamic Metric Cards**: The top cards show aggregate totals for selected metrics.
- **Add Metric**: Click the **+ Add Metric** button to display up to 4 metrics at once.

### Ads Performance Trends & Synchronization
![Campaign Management Controls — Sync & Notifications](/guide-images/campaign_controls.png)
- **Ads Performance Trends**: Visual chart area with a **Quick Snapshot** modal.
- **Sync Campaign**: Click the **Sync** button (refresh icon) to pull from Amazon.
- **Campaign Notification Setting**: Click the **Bell Icon** to configure alert preferences.

![Ads Performance Trends Snapshot](/guide-images/trends_modal.png) ![Campaign Notification Thresholds](/guide-images/notifications_modal.png)

### Adding New Campaigns
![Add Campaign Interface — Creating a New Strategy](/guide-images/add_campaign.png)
To create a new advertising strategy, click the **+ Add Campaign** button. The creation process is organized into four main tabs:
1. **Campaign Tab**: General info, Ad Groups, Bidding Strategy.
2. **Add Products**: Select the ASINs for the campaign.
3. **Targeting**: Define keywords or products to target.
4. **Negative Targeting**: Add exclusions to prevent irrelevant clicks.

### Bid Thresholds & Placement Expansion
![Bid Thresholds Modal](/guide-images/bid_threshold_modal.png) ![Placement Expansion View](/guide-images/placement_expansion.png)
- **Bid Threshold Configuration**: Set your **Max Bid**, **Min Bid**, and **Target ACoS** guardrails.
- **Placement Expansion**: Click the **expand arrow** (>) to reveal performance across **Top of Search**, **Product Pages**, and **Rest of Search**.
    `
  },
  {
    id: "bidding-placements",
    title: "3. Placement Management",
    icon: "AdsClick",
    color: "#f59e0b",
    role: "client",
    content: `
### Placement Analytics
![Placement Dashboard — Performance Breakdown](/guide-images/placement_dashboard.png)
The **Placement** module gives you a detailed view of how your ads perform across different Amazon ad placements:
- **Top of Search (first page)** – Ads at the very top of search results.
- **Product Pages** – Ads on product detail pages.
- **Rest of Search** – Ads in other positions within search results.

### Placement Data Grid & Bulk Actions
![Placement Bulk Actions — Mass Bid Adjustments](/guide-images/placement_bulk_actions.png)
Optimize multiple placements simultaneously using the **Bulk Actions** workflow:
- **Select Placements**: Use the checkboxes on the left.
- **Bulk Actions Menu**: Apply **Increase Bid Adjustment (%)**, **Decrease Bid Adjustment (%)**, or **Set Bid (%)**.

### Placement Rules (Automation)
![Placement Rules — Automation Dashboard](/guide-images/bid_placement_rules.png)
Automate your placement bidding strategy using the **Placement Rule** engine.

### Creating a Placement Rule
![Add Placement Rule Modal](/guide-images/bid_placement_rule_modal.png)
1. **Rule Setup**: Provide a Rule Name and select the **Date Filter**.
2. **Conditions**: Define performance triggers (e.g., "Sales > 1" AND "ACoS < 20%").
3. **Action Type**: Specify the reaction for each placement (e.g., "Top of Search Increase Bid by 5%").
4. **Scheduling**: Select the **Rule Days** and **Rule Times**.

### Rule Actions & Execution
![Rule Icons — Assign & Run](/guide-images/rules_assign_run_icons.png)
- **Assign Campaign** (Blue Profile Icon): Link your rule to campaigns.
- **Run Rule** (Blue Run Button): Manually trigger execution with a safety preview modal showing impact analysis.

![Assign Campaign Modal](/guide-images/rule_assign_modal.png){small} ![Rule Execution Confirmation](/guide-images/rule_run_confirmation.png){small}

### Rule History & Audit Trail
![Placement Rule History — Automated Log](/guide-images/placement_rule_history.png)
Every execution is recorded with a transparent audit trail of affected placements and completion status.

### Reverting Automated Changes
![Rule Revert Modal — Undoing Adjustments](/guide-images/rule_revert_modal.png){small}
If an adjustment needs to be rolled back, use the **Revert All** or individual **Revert** buttons to return to the **Old Value**.
    `
  },
  {
    id: "budget-rules",
    title: "4. Budget Rules & History",
    icon: "MonetizationOn",
    color: "#10b981",
    role: "client",
    content: `
### Budget Rules Dashboard
![Budget Rules — Performance Automation](/guide-images/budget_rules_dashboard.png)
The **Budget Rules** dashboard provides an overview of your automated budgeting strategies.
- **Rule Name & Conditions**: The logic triggering the budget change.
- **Action Type**: The specific adjustment (e.g., "Increase budget by 10%").
- **Assigned Campaigns**: The number of campaigns currently governed by this rule.
- **Trigger Schedule**: The days and times the rule is active.

### Bulk Actions: Export & Import
AdvertiseIQ supports mass-management of budget rules via the **Bulk Actions** menu:
- **Export**: Download your current rule configurations as an Excel file (.xlsx) for offline editing.
- **Import**: Upload a rule configuration file to quickly apply complex strategies.

### Using the Import Modal
![Budget Rules — Import Configuration](/guide-images/budget_rule_import_modal.png){small}
1. **File Upload**: Click the upload area to select your .xlsx or .xls file.
2. **Conflict Resolution**: Choose to **Replace existing** or **Skip duplicate**.
3. **Validation**: Click **Import** to process the file and apply the rules.

### Budget Rule History & Audit Trail
![Budget Rule History — Change Logs](/guide-images/budget_rule_history.png)
Every automated or manual budget adjustment is meticulously logged in the **Budget Rule History** tab.
- **Run Date & Last Run**: See the exact date and timestamp for every execution.
- **Affected Campaigns**: View a count of campaigns that were modified. Click the badge to open the Details Modal.
- **Execution Status**: Verify that the rule finished successfully (COMPLETED).

### Budget History
The **Budget History** page logs every automated and manual budget change, including the rule that triggered it, the old value, new value, and timestamp.
    `
  },
  {
    id: "recommendations",
    title: "5. AIRecommendations",
    icon: "AutoAwesome",
    color: "#3b82f6",
    role: "client",
    content: `
### Smart Recommendations Dashboard
![Smart Recommendations — Data-Driven Insights](/guide-images/recommendations_dashboard.png)
The **Recommendations** module identifies high-impact optimization opportunities refreshed daily with a rolling **7-day history**.

**Category Classification**:
- **Critical (Red)**: High ACoS terms or zero-sale keywords needing immediate adjustment.
- **Growth (Green)**: Scaling opportunities for high-performing targets with low ACoS and room for budget increases.
- **Keyword (Blue)**: New keyword discovery based on profitable search terms not currently targeted.

### Applying Recommendations
![Recommendation Modal — Granular Application](/guide-images/recommendation_modal.png)
1. **Analyze Data**: View the specific campaign, ad group, and target associated with the recommendation.
2. **Review Metrics**: Examine the Clicks, Sales, Spend, and ACoS trends.
3. **Selective Application**: Use the checkboxes to choose which specific targeting items to update.
4. **Confirm Update**: Click **Apply** to push the optimizations directly to Amazon.

### Managing Suggestions
- **Deletion Feature**: Use the **Trash icon** to delete suggestions and clear your focused view.
- **Auto-Clearing**: Successful applications are cleared on the next daily refresh.
    `
  },
  {
    id: "targeting",
    title: "6. Targeting & Keyword Management",
    icon: "TrackChanges",
    color: "#ef4444",
    role: "client",
    content: `
### Targeting Overview & Dynamic Dashboard
![Targeting Dashboard — Analytics at a Glance](/guide-images/targeting_dashboard.png)
The **Targeting** module is the central engine for bid optimization. The top-level dashboard provides a high-level summary of your targeting performance.

#### Performance KPI Cards & Dynamic Charting
- **Focused Metrics**: Instantly view account-wide **Impressions, Spend, Orders, and Sales**.
- **Interactive Multi-Axis Chart**: Plot different metrics (e.g., Spend vs. Sales) on separate Y-axes.
- **View Changes Toggle**: Overlay optimization events (like bid changes) directly onto the graph to see their impact.

### Targeting Segmentation
![Targeting Segmentation — Strategic Bifurcation](/guide-images/targeting_segmentation.png)
- **Keyword Targets**: Isolate all manual and automatic keyword targets.
- **Product Targets**: Focus exclusively on ASIN and Category-based targeting.

### Targeting Data Grid
![Targeting Grid — Granular Control](/guide-images/targeting_grid.png)
- **Active State**: Toggle targeting items on or off instantly.
- **Inline Bid Editing**: Click the cell to directly modify the bid amount.
- **Campaign Context**: View the parent campaign and ad group for each target.

### Targeting Change History
![Targeting Change History — Audit Log](/guide-images/targeting_change_history.png)
- **Audit Details**: View the exact **Old Value** and **New Value** for every bid adjustment.
- **Traceability**: See **who** made the change and which **module** triggered it.

### Targeting Rules (Automation)
![Targeting Rules — Bid Optimization Dash](/guide-images/targeting_rules_dashboard.png)
- **Automated Actions**: Automatically adjust bids or pause items based on criteria (e.g., "Pause Keyword if Spend > $20 and Sales = 0").
- **Flexible Scheduling**: Set rules to run on specific days and times.

### Keyword Tracker & Suggestions
![Keyword Tracker — Account-Wide Analysis](/guide-images/keyword_tracker_dashboard.png)
Analyze the current performance and health of all active and paused targeting items across your entire account.

### Keyword Suggestions & Dynamic Actions
![Keyword Suggestions — AI-Driven Growth](/guide-images/keyword_suggestions_dashboard.png)
Identifies new targeting opportunities from your high-performing search terms.
- **Add As Keyword**: Graduate profitable terms into your campaigns.
- **Add As Negative Keyword**: Quickly eliminate wasteful spend by adding low-performing suggestions as negatives.
    `
  },
  {
    id: "search-terms",
    title: "7. Search Term Analysis",
    icon: "Search",
    color: "#06b6d4",
    role: "client",
    content: `
### Search Term Dashboard & Action Insights
![Search Term Grid — Customer Queries](/guide-images/search_term_dashboard.png)
The **Search Term** module provides transparency into exact queries shoppers use.

### Negative Targeting & Bulk Actions
![Search Term Bulk Actions — Waste Elimination](/guide-images/search_term_bulk_actions.png){small}
When a search term is identified as wasteful, use **Bulk Actions** to instantly protect your budget:
- **In Current Campaign/Ad Group**: Add as Negative Keyword/Product.
- **In Other Campaign/Ad Group**: Select specific segments across your account to protect.

### Search Term Automation Rules
![Search Term Rules Dashboard](/guide-images/search_term_rules_dashboard.png)
Automate the process of harvesting profitable keywords or eliminating wasteful search terms.
- **Asset Assignment**: Use the **Assign Campaign** icon to select which campaigns the rule should monitor.
- **Manual Control**: Instantly trigger any rule using the **Run** button to audit and apply changes immediately.
    `
  },
  {
    id: "product-management",
    title: "8. Product Management",
    icon: "Inventory",
    color: "#84cc16",
    role: "client",
    content: `
### Product Catalog & Insights
![Product List Dashboard](/guide-images/product_list_dashboard.png)
The **Product Management** module serves as the central hub for your entire inventory, combining catalog data with pricing analytics.

**Product List Features**:
- **Pricing Comparison**: Monitor Base Price, Selling Price, and MRP.
- **Notification Management**: Toggle alerts for order placement and low stock.
- **Favorites**: Bookmark key SKUs for rapid access.

### Adding New Products & Listings
AdvertiseIQ simplifies the product onboarding journey through an intelligent 3-step workflow:

**Step 1: Onboarding Method**
![Method A: Copy Listing](/guide-images/product_add_step1_copy.png) ![Method B: New Setup](/guide-images/product_add_step1_new.png){small}
- **Method A (Copy Listing)**: Automatically fetch metadata directly from Amazon via ASIN.
- **Method B (Add New Listing)**: Manual creation for brand-new products with custom category schemas.

**Step 2: Attribute Selection**
![Step 2: Field Configuration](/guide-images/product_add_step2_fields.png)
Customize your listing form by selecting exactly which attributes you want to manage (Mandatory vs. Optional).

**Step 3: Structured Data Entry**
![Step 3: Multi-Tab Form](/guide-images/product_add_step3_form.png)
Complete setup via a multi-tab interface: Identity, Details & Offer, Compliance, and Variations.

### Product Configuration Drawer
![Product Settings Drawer](/guide-images/product_config_drawer.png)
Personalize tracking and automation settings at the individual SKU level, including Review Requests and Stock Alert thresholds.

### Product Ads & Performance
![Product Performance Dashboard](/guide-images/product_ads_performance.png)
- **Top Performer Analysis**: Visualizing Orders, Sales, and CVR trends.
- **Campaign Drill-Down**: Click expansion arrows on the grid to see every campaign featuring a specific SKU.
![Expanded Product Ad Grid](/guide-images/product_ads_grid_expanded.png)
    `
  },
  {
    id: "promotion-management",
    title: "9. Promotion Management",
    icon: "Campaign",
    color: "#84cc16",
    role: "client",
    content: `
### Promotions & Coupon Strategy
![Coupons Dashboard](/guide-images/coupons_dashboard.png)
The **Promotions** module allows you to track and analyze your Amazon Coupons and Lightning Deals directly within AdvertiseIQ. By synchronizing promotional data with your advertising spend, you can determine the true ROI of your marketing efforts.

**Coupons Dashboard Features**:
- **Performance Triage**: Quickly identify which coupons are **Profitable** or have **No Data** via the color-coded status badges.
- **Run-time Monitoring**: Track active (**Running**) vs. **Expired** coupons with precise start and end dates.
- **Commercial Visibility**: View Discount percentages, total Budget allocation, and real-time Clip/Redemption rates alongside Sales and Spend data.

### Deep-Dive Coupon Analytics
![Coupon Details Modal](/guide-images/coupon_details_modal.png)
Clicking on any coupon title or the **"View coupon page"** link opens a comprehensive analytics modal:

1. **Budget & Activity**: 
    - Monitor **Budget Spent** vs. **Budget Remaining** in real-time.
    - Track total **Clips / Redeemed** count to gauge customer interest.

2. **Performance Metrics**:
    - Evaluate financial health with dedicated KPIs: **Revenue**, **Coupon Cost**, **Profit**, **ROI**, and **Margin %**.

3. **Product Association**:
    - View the exact list of 17+ products associated with the coupon, including images, ASINs, and SKUs, to ensure your promotions are targeting the right inventory.

### Strategic Oversight: Deals Dashboard
![Deals Dashboard](/guide-images/deals_dashboard.png)
The **Deals Dashboard** provides a macro-view of your high-impact promotional events (e.g., Lightning Deals). Use this module to correlate major sales spikes with specific promotional windows.

**Performance Summary Cards**:
- **Total Sales & Units Sold**: Quantitative tracking of deal velocity.
- **Glance Views & Conversion Rate**: Qualitative assessment of deal visibility and customer intent.

**Granular Deal Auditing**:
- **Deal Lifecycle**: Monitor the **Start/End Date** and **Status** (e.g., Ended, Upcoming) of every deal.
- **Product-Level Breakdown**: Click the expansion arrow (pointed by the red arrow in the image) on any deal row to reveal the **Product Details** sub-grid. This allows you to audit the specific Glance Views, Units Sold, and Sales contribution of every individual product included within the bundle deal.
    `
  },
  {
    id: "inventory-management",
    title: "10. Inventory",
    icon: "Store",
    color: "#3b82f6",
    role: "client",
    content: `
### Multi-Channel Inventory Dashboard
![Inventory Overview Dashboard](/guide-images/inventory_dashboard_overview.png)
The **Inventory** module ensures visibility across all Amazon fulfillment channels.

**Real-Time KPI Tracking**:
- **Total SKUs**: Active products tracked.
- **FBA vs. FBM Stock**: Units in Amazon FCs vs. Merchant-fulfilled.
- **Stock Alerts**: Out of Stock and Low Stock (≤7 days) counters.

**Visual Stock Breakdown**:
- **Inventory Overview Chart**: Comparative FBA vs. FBM distribution.
- **Avg Days Left**: AI-projected runway showing days of stock remaining for both channels.

### Synchronized Inventory Grid
![FBA / FBM Filtered Grid](/guide-images/inventory_grid_switching.png)
Detailed row-by-row analysis with channel switching (All / FBA / FBM) and inbound stock visibility.
    `
  },
  {
    id: "history",
    title: "11. History & Audit Logs",
    icon: "History",
    color: "#64748b",
    role: "client",
    content: `
### Centralized Change Auditing
![History & Audit Logs Dashboard](/guide-images/history_page.png)
The **History** page provides a comprehensive, account-wide audit trail of all modifications made to your advertising ecosystem, whether triggered manually or automatically.

**Data Transparency & Accountability**:
- **Change Level & Type**: Identification of the affected segment (Campaign, Ad Group, Keyword) and the nature of the change.
- **Audit Values (From/To)**: View the exact quantitative shift (e.g., bid changed from $11.34 to $11.45).
- **Traceability**: Full visibility into the **Source Module** and the **User/Email responsible**.
    `
  },
  {
    id: "scheduling-automation",
    title: "12. Cron Jobs & Task Scheduling",
    icon: "Sync",
    color: "#6366f1",
    role: "client",
    content: `
### System Orchestration: Cron Job Scheduler
![Cron Job Scheduler Dashboard](/guide-images/cron_job_scheduler_dashboard.png)
AdvertiseIQ utilizes a robust **Cron Job** engine to handle all background operations, from syncing Amazon sales data to executing complex rules.

**Dashboard Overview**:
- **Cron Name & Description**: Identifies the specific purpose (e.g., *Best Performer Report*, *Budget Rule Schedules*).
- **Status Indicators**: Real-time tracking of task health—**Completed** (Green), **Pending** (Red), or **Running**.
- **Manual Execution**: Click the **Blue Play Icon** to manually trigger any sync immediately.

### Automated Task History
![Cron Job Execution History](/guide-images/cron_job_history.png)
The **Cron Job History** page provides a deep-dive audit trail of every background execution, ensuring transparency and data integrity.
    `
  },
  {
    id: "strategic-timing",
    title: "13. Strategic Timing (Dayparting)",
    icon: "Schedule",
    color: "#f97316",
    role: "client",
    content: `
### Hourly Bid Optimization (Dayparting)
![Hourly Performance Dashboard](/guide-images/dayparting_dashboard_hourly.png)
The **Dayparting** module enables 24-hour analysis and automated bid adjustments to capture peak traffic windows. Visualize hourly trends, spot "Best Hours" and "Worst Hours," and assign custom multipliers to maximize ROAS.

**Performance Visualization**:
- **Hourly Trends**: Identify the exact hours of the day when your sales are highest.
- **Dynamic Charting**: Overlay Spend vs. Sales to spot inefficient bidding hours.
![Hourly Performance Multi-Metric Chart](/guide-images/hourly_performance.png)
- **Quick Snapshot**: Use the popup modal to see aggregate performance for selected periods.

### Dayparting Rules
![Dayparting Grid](/guide-images/dayparting_rules_grid.png)
Automate your bid multipliers based on the hour of the day.
- **Rule Dashboard**: Manage all your time-based bidding logic in a central grid.
- **Creation Workflow**: Define the multiplier ($) or percentage (%) adjustment.
![Create Dayparting Rule Modal](/guide-images/dayparting_create_modal.png){small}
    `
  },
  {
    id: "pl-calculator",
    title: "14. Profit & Loss (P/L) Calculator",
    icon: "Calculate",
    color: "#06b6d4",
    role: "client",
    content: `
### Net Margin Simulation Engine
![P/L Calculator Dashboard](/guide-images/pl_calculator_dashboard.png)
Compute the true net profitability of your products by aggregating all commercial data points.

**13.1 Order & Sales Data**: Total units ordered vs. gross product sales.
**13.2 Comprehensive Cost Analysis**: COGS, Amazon Referral/Fulfillment fees, and Shipping expenses.
**13.3 Advertising Impact**: How campaign investment erodes or optimizes final margin.

### Simulation Controls & History
- **Calculate**: Instantly generate Net Profit, Margin %, and **Break-even ACoS**.
- **Audit History**: Access past profit simulations via the history sidemenu drawer.
    `
  },
  {
    id: "users-management-client",
    title: "15. Users Management",
    icon: "People",
    color: "#8b5cf6",
    role: "client",
    content: `
### Users Module
![Users Management Grid](/guide-images/users_dashboard_client.png)
The **Users** page allows you to manage additional user accounts within your organization. 

**User List & Access**:
- **Name & Email**: Identify every user with access to your AdvertiseIQ dashboard.
- **Account Status**: Monitor active and pending user invitations.
- **Role Visibility**: See the assigned role for each team member.

**Adding New Team Members**:
![Add New User Modal](/guide-images/add_user_modal_client.png){small}
1. **Initiate**: Click the **Add Users** button (top-right) to open the creation form.
2. **Details**: Provide the user's **Full Name**, **Company**, and a valid **Email address**.
3. **Configuration**: Secure the account with a **Password** and assign a **Role** (e.g., Member, Admin) to control their level of access.
4. **Finalize**: Click **Create** to grant platform access immediately.
    `
  },
  {
    id: "settings-client",
    title: "16. Settings & Configuration",
    icon: "Settings",
    color: "#475569",
    role: "client",
    content: `
### Settings Module (Seller View)
The **Settings** page is your central station for account authorization and platform-wide safety guardrails.

### 1. Ads Config
![Ads Configuration Dashboard](/guide-images/ads_config_dashboard.png)
Manage your Amazon Advertising API authorizations.
- **Link Token Status**: Monitor the health and refresh timestamps for your secure connection.
- **Linking a New Account**:
![Link Amazon Account Modal](/guide-images/ads_link_modal.png){small}
  1. Enter **Company Name**.
  2. Click **Login with Amazon** to grant data access via official OAuth flow.

### 2. Seller Config
![Seller Configuration Dashboard](/guide-images/seller_config_dashboard.png)
Manage the connection to the Amazon Selling Partner (SP) API for inventory, orders, and P/L data.
- **Identity Mapping**: Monitor Marketplace ID, Seller ID, and SP Refresh Token health.

### 3. Campaign Setting
![Campaign Global Settings](/guide-images/campaign_settings.png)
Configure global defaults and health logic:
- **ACoS Targets**: Set your **Default Target ACoS**.
- **Health Indicators**: Define thresholds for **Budget Leak** and **Needs Optimization**.

### 4. Rule Setting
![Global Rule Thresholds](/guide-images/rule_settings.png)
Establish account-wide "Guardrails" that limit automated changes:
- **Min/Max Bids**: Define absolute bid boundaries.
- **Min/Max Budgets**: Control absolute budget ranges.
    `
  },
  {
    id: "packages-client",
    title: "17. Subscription Plans (Plans)",
    icon: "CardMembership",
    color: "#10b981",
    role: "client",
    content: `
### Plans Overview
![Subscription Plans Dashboard](/guide-images/packages_dashboard.png)
The **Plans** module provides a centralized interface for viewing and managing your platform subscription tier.

**Subscription Plans Grid**:
- **Plan Name**: Identifies your active tier (e.g., Starter, Growth, Pro / Agency).
- **Trial Status**: Monitor remaining days in your free trial period.
- **Amazon Connection**: View the maximum number of Amazon Seller accounts permitted under your current plan.

### Upgrade Workflow
![Add Subscription Plan Modal](/guide-images/package_add_modal.png){small}
When scaling your business, you can review and select higher tiers to increase your Amazon account connection limits and unlock advanced automation features.
    `
  },
  {
    id: "holiday-management-client",
    title: "18. Holiday Management",
    icon: "Event",
    color: "#f59e0b",
    role: "client",
    content: `
### Holiday Protection & Special Events
![Holiday/Special Days Calendar Dashboard](/guide-images/holiday_calendar.png)
The **Holiday** module use an interactive calendar to proactively protect campaigns from budget spikes during significant events. 

**Feature Set**:
- **Event Selection**: Map specific dates (e.g., Black Friday, Prime Day) to your strategy.
- **Holiday Protection Mode**: Automatically reduce bids or pause rules to avoid volatile data periods.
- **Custom Notifications**: Set reminders for upcoming promotional windows.
![Add Holiday Modal](/guide-images/holiday_modal.png){small}
    `
  },
  {
    id: "super-admin-dashboard",
    title: "19. Super Admin Dashboard",
    icon: "Dashboard",
    color: "#0284c7",
    role: "superadmin",
    group: "Super Admin Panels",
    content: `
### Super Admin Dashboard Overview
![Super Admin Dashboard Overview](/guide-images/super_admin_dashboard.png)
The central command center for overseeing the entire platform's commercial performance.
- **Revenue Analytics**: Visibility into gross earnings from active client subscriptions.
- **Lifecycle Filters**: Segment subscribers into **Active**, **Canceled**, or **Expired**.
- **Marketplace Distribution**: Monitor account health across global Amazon regions.
    `
  },
  {
    id: "users-management",
    title: "20. Users Management",
    icon: "People",
    color: "#8b5cf6",
    role: "superadmin",
    group: "Super Admin Panels",
    content: `
### Users Module
![Users Management Grid](/guide-images/users_dashboard.png)
The primary interface for managing platform access and user profiles across the organization.

**User Selection & Audit**:
- **Role Assignment**: Define Super Admin, Admin, or Client permissions.
- **Profile Access**: Restrict or grant access to specific advertising profiles.

**Creation Workflow**: 
![Add New User Modal](/guide-images/add_user_modal.png){small}
1. **User Identity**: Click **Add Users** to launch the creation modal. Enter the **Company Name**, **Full Name**, and a unique **Email** address.
2. **Security**: Assign a secure **Password** and provide a **Phone Number** for account communication.
3. **Role Assignment**: Select from predefined roles (e.g., Client, Admin, Manager) to control platform-wide permissions.
    `
  },
  {
    id: "role-management",
    title: "21. Role Management",
    icon: "Security",
    color: "#6366f1",
    role: "superadmin",
    group: "Super Admin Panels",
    content: `
### Roles Overview
![Roles Management Grid](/guide-images/roles_dashboard.png)
Define the permission hierarchy for the platform.

**Permission Granularity**:
- **Custom Roles**: Create standardized access levels and configure granular visibility for every module.
- **Permission Matrix**: 
![Add Role Modal](/guide-images/add_role_modal.png){small}
  Define exactly which side-menu items and platform features each role can view or interact with (View, Create, Update, Remove).
    `
  },
  {
    id: "settings-admin",
    title: "22. Settings & Configuration",
    icon: "Settings",
    color: "#475569",
    role: "superadmin",
    group: "Administrative Configuration",
    content: `
### Admin Configuration (Super Admin View)
![Ads Configuration Dashboard](/guide-images/ads_config_dashboard.png)
Platform-wide account authorization and API health monitoring center.

**Marketplace Hub**:
- **Global Auth Audit**: Monitor the health of every linked Amazon Ads account across all clients.
- **SP-API Mapping**:
![Seller Configuration Dashboard](/guide-images/seller_config_dashboard.png)
  Audit SP Refresh Token health for all seller accounts to ensure uninterrupted sales and inventory data ingestion.
    `
  },
  {
    id: "packages-admin",
    title: "23. Subscription Plans (Plans)",
    icon: "CardMembership",
    color: "#10b981",
    role: "superadmin",
    group: "Super Admin Panels",
    content: `
### Subscription Tiers & Billing Management
![Super Admin Subscription Plans Dashboard](/guide-images/super_admin_packages.png)
The **Plans** module allows Super Admins to define the commercial structure of the platform by managing the various subscription tiers available to users.

**Plan Configuration Grid**:
- **Plan Name**: Descriptive name of the tier (e.g., Free Trial, Starter, Pro / Agency).
- **Status Toggle**: Instantly activate or de-activate a plan platform-wide.
- **Price**: The cost associated with the plan (e.g., 99 INR, 499 INR).
- **Trial Days**: The duration of the initial free period (e.g., 14 days).
- **Amazon Connection**: The hard limit for linked Amazon accounts permitted on this tier.

### Creating New Subscription Tiers
![Add Subscription Plan Modal](/guide-images/super_admin_add_package_modal.png){small}
Super Admins can rapidly scale the platform's offering by creating custom plans:
1. **Definition**: Provide a **Plan Name** and determine the **Price**.
2. **Growth Limits**: Specify the **Amazon Connection** limit to segment users by account size.
3. **Incentives**: Set **Trial Days** to encourage onboarding.
4. **Activation**: Toggle **Active Status** to make the plan immediately available for selection.
    `
  },
  {
    id: "holiday-management",
    title: "24. Holiday/Special Days",
    icon: "Event",
    color: "#f59e0b",
    role: "superadmin",
    group: "Super Admin Panels",
    content: `
### Global Holiday Management
![Holiday/Special Days Calendar Dashboard](/guide-images/holiday_calendar.png)
Establish platform-wide event calendars to coordinate automated behavior protective measures during major peaks.

**Feature Set**:
- **Event Selection**: Map specific dates (e.g., Black Friday, Prime Day) to your global platform strategy.
- **Protection Logic**: Define automated bid reductions or rule pauses that apply to all relevant campaigns during the event window.
![Add Holiday Modal](/guide-images/holiday_modal.png){small}
    `
  },
  {
    id: "cron-job",
    title: "25. Global Cron Jobs",
    icon: "Timer",
    color: "#06b6d4",
    role: "superadmin",
    group: "Super Admin Panels",
    content: `
### Global Sync & Automation Control
![Super Admin Cron Job Dashboard](/guide-images/super_admin_cron_jobs.png)
The **Cron Job** module is the technical heart of AdvertiseIQ's automation engine. It allows Super Admins to manage the high-frequency background tasks that power all client data syncs and rule executions.

**Comprehensive Task Management**:
- **Cron Name**: Identifies the primary engine (e.g., *AdGroup Report*, *Holiday Reminder*, *Budget Rule Schedules*).
- **Status Monitoring**: Real-time visibility into whether a job is currently **Active** or suspended.
- **Cron Expression**: Define exact execution intervals using cron syntax (e.g., \`0 12 */1 * * *\` for hourly runs).
- **Actions**: Use the **Edit (Pencil Icon)** to modify execution intervals or job descriptions.
- **Creation**: Click **+ Add Cron Job** to register new background processes.

### Key Automation Engines
1. **AdGroup Report**: Aggregates all statistics by default (Spend, Sales, ACoS, etc.) at the ad group level.
2. **Apply Holiday Protection**: Automatically applies holiday protection rules when a holiday period begins.
3. **Best Performer Report**: Identifies top performers daily and synchronizes data with Google Sheets.
4. **Best Seller Rank**: Periodically retrieves product Best Seller Rank (BSR) directly from Amazon.
5. **Budget Rule Schedules**: Evaluates campaigns against predefined rules and applies budget adjustments.
6. **Campaign Listing**: Synchronizes latest campaign metadata (Name, Type, Budget, State) from Amazon.
7. **Campaign Monitor**: real-time tracking of performance metrics to detect ACoS spikes or budget depletion.
8. **Dayparting Rule Schedules**: Runs hourly to evaluate active Dayparting rules and apply targeting bid changes.
9. **Holiday Reminder**: Dispatches automated holiday reminders to platform users.
    `
  },
  {
    id: "asana-users",
    title: "26. ASANA Users",
    icon: "Link",
    color: "#e11d48",
    role: "superadmin",
    group: "Super Admin Panels",
    content: `
### External Project Management Integration
The **ASANA Users** page manages the mapping between AdvertiseIQ identities and external task management profiles.
- **Identity Sync**: Link client and admin profiles to their respective ASANA identifiers.
- **Task Routing**: Ensure that automated notifications and manual support updates are correctly directed to the integrated PM ecosystem.
    `
  },
  {
    id: "blocked-time",
    title: "27. Rule Execution Timing & Blocked Windows",
    icon: "Block",
    color: "#f43f5e",
    role: "superadmin",
    group: "Super Admin Panels",
    content: `
### Strategic Automation Control
![Super Admin Rule Blocked Time Dashboard](/guide-images/super_admin_rule_blocked_time.png)
The **Rule Blocked Time** module allows Super Admins to define precision blackout windows during which global automation rules (Budget, Dayparting, Inventory) are suspended. This is critical for preventing rule conflicts during high-volatility events or system maintenance periods.

**Administrative Workflows**:
- **Defining Blackout Windows**: Click the **+ Add Rule Blocked Time** button to register a new restricted execution period.
- **Precision Scheduling**: Use the **Time Range** picker in the creation modal to set exact Start and End times (e.g., 00:00 to 02:00).
- **Global Enforcement**: Once created, these windows apply across all client campaigns, ensuring no automated adjustments occur during the designated time.

**Management & Audit**:
- **Active Windows**: View and audit all currently enforced blocked times in the main grid.
- **Deletion**: Use the **Delete (Trash Icon)** to remove a restriction and resume standard rule execution schedules.
    `
  },
  {
    id: "support",
    title: "28. Support Ticket & Help",
    icon: "SupportAgent",
    color: "#3b82f6",
    role: "superadmin",
    group: "Super Admin Panels",
    content: `
### Global Support Center
![Support Tickets Dashboard](/guide-images/super_admin_support_tickets.png)
The **Support Ticket** module is the primary helpdesk interface for managing client inquiries and technical assistance across the entire platform.

**Administrative Management**:
- **Search & Filter**: Instantly locate tickets by user name or email, and filter by status (Open, Pending, Resolved).
- **Ticket Tracking**: Audit active and pending support requests with high-speed visibility into creation and update timestamps.
- **Status Indicators**: Segment tickets into **OPEN** (Green) or **PENDING** (Orange) for prioritized handling.

### Real-Time Support Chat
![Support Chat View](/guide-images/super_admin_support_chat.png)
Closing the gap between technical issues and resolutions via an integrated chat interface.
- **Integrated Messaging**: Click the **View (Eye Icon)** in the tickets grid to launch the unified chat view.
- **Interactive Communication**: Engage with clients through a real-time message stream, complete with timestamps and read receipts.
- **Media Support**: Send and receive diagnostic screenshots or file attachments directly within the chat window.
    `
  },
  {
    id: "orders",
    title: "19. Orders",
    icon: "ShoppingCart",
    color: "#6366f1",
    role: "client",
    content: `
### Orders Management
![Orders Page](/guide-images/orders_page.png)
The **Orders** module displays all Amazon orders associated with your linked seller accounts.

**Order List Features**:
- **Order Listing**: View order ID, purchase date, order status, SKU, quantity, and item price.
- **Order Filtering**: Filter orders by date range, fulfillment method, or order status.
- **Search**: Quickly find specific orders by order ID or ASIN.
    `
  },
  {
    id: "order-report",
    title: "20. Order Analytics Report",
    icon: "Receipt",
    color: "#8b5cf6",
    role: "client",
    content: `
### Order Report Dashboard
![Order Report Page](/guide-images/order_report_page.png)
The **Order Report** module provides analytics on order performance, shipping, and fulfillment metrics.

**Report Features**:
- **Order Analytics**: Visualize order volume, revenue, and unit sales over time.
- **Fulfillment Breakdown**: Compare FBA vs. FBM order performance.
- **Export**: Download order report data as CSV or Excel for external analysis.
    `
  },
  {
    id: "warehouse-inventory",
    title: "21. Warehouse Inventory",
    icon: "Warehouse",
    color: "#10b981",
    role: "client",
    content: `
### Warehouse Inventory Details
![Warehouse Inventory Page](/guide-images/warehouse_inventory_page.png)
The **Warehouse Inventory** module provides granular details on stock levels across your fulfillment centers.

**Warehouse Inventory Features**:
- **Stock Visibility**: View real-time inventory balances by SKU, ASIN, and fulfillment center.
- **Warehouse Details**: Drill into specific warehouse locations to see in-bound, on-hand, and reserved quantities.
- **Alerts**: Monitor stock alerts for low inventory or stranded inventory.
    `
  },
  {
    id: "fba-planning",
    title: "22. FBA Planning",
    icon: "Truck",
    color: "#f59e0b",
    role: "client",
    content: `
### FBA Inventory Planning
![FBA Planning Page](/guide-images/fba_planning_page.png)
The **FBA Planning** module helps optimize your Amazon Fulfilled inventory allocation to minimize costs and stockouts.

**Planning Features**:
- **Inventory Planning Dashboard**: Analyze optimal FBA vs. FBM split with AI recommendations.
- **Warehouse Planning**: Use the planning accordion to evaluate and adjust inventory across warehouses.
- **Planning Modal**: Open the detailed planning modal to simulate inventory allocation changes before applying.
    `
  },
  {
    id: "brand-analytics",
    title: "23. Brand Analytics",
    icon: "ChartPie",
    color: "#06b6d4",
    role: "client",
    content: `
### Brand Analytics Dashboard
![Brand Analytics Page](/guide-images/brand_analytics_page.png)
The **Brand Analytics** module (under the *Analytics* navigation group) provides insights into your brand's visibility and market position on Amazon.

**Analytics Features**:
- **Market Intelligence**: Track brand share, search query rankings, and competitor performance.
- **Visibility Metrics**: Monitor how often your brand appears in search results and product listings.
- **Data Export**: Save analytics dashboards for reporting and stakeholder review.
    `
  },
  {
    id: "retention",
    title: "24. Retention Analytics",
    icon: "ClockCountdown",
    color: "#ec4899",
    role: "client",
    content: `
### Customer Retention Analytics
![Retention Page](/guide-images/retention_page.png)
The **Retention** module analyzes repeat purchase patterns and customer lifetime value for your product catalog.

**Retention Features**:
- **Retention Rate Tracking**: Visualize customer retention trends over weekly, monthly, or quarterly periods.
- **Repeat Purchase Analysis**: Identify which SKUs drive repeat buyers.
- **Actionable Insights**: Pinpoint underperforming products and optimize campaigns to improve retention.
    `
  },
  {
    id: "keyword-analysis",
    title: "25. Keyword Analysis",
    icon: "MagnifyingGlass",
    color: "#84cc16",
    role: "client",
    content: `
### Keyword Analysis Dashboard
![Keyword Analysis Page](/guide-images/keyword_analysis_page.png)
The dedicated **Keyword Analysis** module provides deep insights into keyword performance, search volume trends, and competitive ranking data.

**Analysis Features**:
- **Keyword Performance Grid**: Sortable table showing impressions, clicks, CTR, CPC, and ACoS per keyword.
- **Search Volume Trends**: Visualize monthly search volume and seasonal fluctuations.
- **Competitor Benchmarking**: Compare your keyword rankings against marketplace competitors.
- **Customizable Columns**: Save and load custom column configurations for the keyword grid.
    `
  },
  {
    id: "reconciliation-reimbursement",
    title: "26. Reconciliation & Reimbursement",
    icon: "Receipt",
    color: "#f97316",
    role: "client",
    content: `
### Automated Reconciliation & Reimbursement
![Reconciliation Page](/guide-images/reconciliation_reimbursement_page.png)
The **Reconciliation & Reimbursement** module automatically detects billing discrepancies and missing credits from Amazon advertising invoices.

**Features**:
- **Reimbursement Detection**: System scans for under-billed charges, over-delivered clicks, and currency mismatches.
- **Reimbursement Handling**: Track detected claims and their resolution status.
- **Export Reports**: Download reconciliation reports for finance and accounting teams.
    `
  },
  {
    id: "returns-refunds",
    title: "27. Returns & Refunds",
    icon: "ArrowUUpLeft",
    color: "#3b82f6",
    role: "client",
    content: `
### Returns & Refunds Management
![Returns Page](/guide-images/returns_page.png)
The **Returns & Refunds** module provides visibility into returned items and refund processing.

**Features**:
- **Return Tracking**: View return request ID, SKU, quantity, reason, and refund status.
- **Refund Monitoring**: Track refund amounts and processing timelines.
- **Bulk Actions**: Export return data or take action on multiple returns at once.
    `
  },
  {
    id: "purchase-plans",
    title: "28. Purchase Plans",
    icon: "CardMembership",
    color: "#10b981",
    role: "client",
    content: `
### Subscription Purchase Flow
![Purchase Plans Page](/guide-images/purchase_plans_page.png)
The **Purchase Plans** module allows Admin users to review and purchase higher-tier subscription plans.

**Purchase Flow**:
- **Plan Comparison**: View pricing and feature limits for Starter, Growth, and Pro/Agency tiers.
- **Amazon Connection Limits**: Each tier specifies the maximum linked Amazon seller accounts.
- **Checkout**: Complete payment to unlock increased limits and advanced automation features.
    `
  },
  {
    id: "enhanced-recommendations",
    title: "29. Enhanced AIRecommendations",
    icon: "AutoAwesome",
    color: "#3b82f6",
    role: "client",
    content: `
### Campaign History & Enhanced Recommendation Actions
![Recommendation Modal with Campaign History](/guide-images/recommendation_campaign_history.png)
Recent enhancements to the **Recommendations** module include the following:

### Campaign History
A new **Campaign History** modal can be opened from the Recommendation Modal to view the full change history for the associated campaign, including old values, new values, timestamps, and the user/module responsible.

### Dynamic Cell Renderers
The Recommendation modal now supports dynamic cell renderers, allowing direct inline navigation to campaign actions—such as opening campaign settings or targeting details—directly from recommendation rows.

### Minimum Bid Validation
When applying bid changes through recommendations, the system validates against a minimum bid threshold with currency-aware handling, preventing invalid bid submissions.
    `
  },
  {
    id: "enhanced-placement-rules",
    title: "30. Enhanced Placement & Targeting Rules",
    icon: "Target",
    color: "#f59e0b",
    role: "client",
    content: `
### Peak Hours Placement Boost Rule
![Peak Hours Boost Rule](/guide-images/peak_hours_boost.png)
A new rule type has been added for **Peak Hours Placement Boost** — automatically increases bid adjustments for the Top of Search placement during high-traffic hours to capture peak conversion windows.

### Enhanced Bulk Actions Dropdown
The Bulk Actions dropdown menus in Placement Rule, Targeting Rule, Budget Rule, and Search Term Rule components have been updated with refined action categorization and conflict evaluation.

### Revert Changes with Configurable Period
The Revert Changes functionality in rule components now supports a configurable time period, allowing you to roll back automated adjustments to any point within the configured range.
    `
  },
  {
    id: "enhanced-hourly-tracking",
    title: "31. Hourly Performance Tracking (formerly Dayparting)",
    icon: "CalendarCheck",
    color: "#f97316",
    role: "client",
    content: `
### Performance Metrics Timeline & History
![Hourly Performance Timeline](/guide-images/hourly_performance_timeline.png)
The **Hourly Performance Tracking** module (renamed from *Dayparting*) now includes enhanced timeline and monitoring features:

### Performance Metrics History
The Performance Metrics History page tracks all changes to bid multipliers and budget adjustments, displayed with a timeline view for easy auditing.

### Revert Changes
Use the **Revert** button in the rule history to undo automated bid or budget changes and restore the previous multiplier value.

### Latest ACoS & ROAS Tooltips
Info tooltips have been added to the Affected History modal for **Latest ACoS** and **Latest ROAS** columns, providing quick access to metric definitions and context.
    `
  },
  {
    id: "enhanced-columns-filters",
    title: "32. Customizable Columns Enhancement",
    icon: "List",
    color: "#603fba",
    role: "client",
    content: `
### Improved Column State Management
The customizable columns feature has been enhanced with improved column state management across Campaign, Targeting, Keyword Analysis, Search Term, Product Ads, and Lifetime Tracker modules.

**Enhancements**:
- **Column Preferences Persistence**: Saved column configurations are now stored per-profile and persist across sessions.
- **Draggable Reordering**: Reorder visible columns using the drag handle (⋮⋮) in the Customize Columns panel.
- **Checkbox Removal**: The redundant "Checkbox" title in column configurations has been removed for a cleaner interface.

### New Navigation Items
The following navigation items have been recently added or renamed in the sidebar:
- **Hourly Performance Tracking** (Optimize category) — renamed from "Dayparting Rules".
- **Returns & Refunds** (Operations category) — under the Inventory group.
- **Reconciliation & Reimbursement** (Operations category) — under the Inventory group.
- **Warehouse Inventory** (Operations category) — under the Inventory group.
- **Brand Analytics** (Analytics category) — new Analytics group with dedicated sub-navigation.
    `
  },
  {
    id: "chatbot-support",
    title: "33. AI-Powered Chatbot & Support Ticket",
    icon: "ChatCircleDots",
    color: "#2563eb",
    role: "client",
    content: `
### AI-Powered Chatbot Assistant
![Chatbot Widget](/guide-images/chatbot_widget.png)
An **AI-Powered Chatbot** widget is now available on all pages for subscribed users (non-Super Admin). The chatbot is docked at the bottom-right corner of the screen.

**Chatbot Features**:
- **24/7 AI Assistance**: Ask questions about campaigns, billing, reporting, and more—the bot responds instantly with AI-generated answers.
- **Interactive Messaging**: Chat with an AI assistant that can escalate to human support when needed via an integrated conversation flow.
- **Ticket Creation**: When the AI cannot resolve an issue, the chatbot can create a support ticket automatically, with optional CC email fields.
- **Ticket Case Log**: View previously created support tickets, their status (open, pending, resolved), and timestamps directly from the chatbot.
    `
  },
];

export const generateMarkdownDownload = () => {
  let markdown = "# AdvertiseIQ User Guide\n\n";
  markdown += `> Generated on ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}\n\n`;
  markdown += "---\n\n";
  userGuideSections.forEach(section => {
    markdown += `## ${section.title}\n`;
    markdown += `${section.content}\n\n`;
    markdown += "---\n\n";
  });
  return markdown;
};
