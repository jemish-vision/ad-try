import { lazy } from "react";

const Campaign = lazy(() => import("../layout/views/Campaign/Campaign"));
const AddNewCampaign = lazy(() => import("../layout/views/Campaign/AddNewCampaign"));
const BudgetRule = lazy(() => import("../layout/views/budgetRule/BudgetRule"));
const Recommandation = lazy(() => import("../layout/views/recommandation/Recommandation"));
const BidPlacementRuleHistory = lazy(() => import("../layout/views/bidPlacementRuleHistory/BidPlacementRuleHistory"));
const Targeting = lazy(() => import("../layout/views/Targeting/Targeting"));
const TargetingDetail = lazy(() => import("../layout/views/Targeting/TargetingDetail"));
const TargetingRule = lazy(() => import("../layout/views/Targeting/TargetingRule"));
const LifetimeTracker = lazy(() => import("../layout/views/Targeting/LifetimeTracker"));
const Product = lazy(() => import("../layout/views/productAds/Product"));
const BudgetHistory = lazy(() => import("../layout/views/budgetHistory/BudgetHistory"));
const CronJobHistory = lazy(() => import("../layout/views/cronJobHistory/CronJobHistory"));
const CronJobSchedular = lazy(() => import("../layout/views/cronJobSchedular/CronJobSchedular"));
const ProductList = lazy(() => import("../layout/views/productList/ProductList"));
const InventoryManagement = lazy(() => import("../layout/views/inventoryManagement/Inventory"));
const WarehouseDetails = lazy(() => import("../layout/views/warehouseDetails/WarehouseDetails"));
const ProductPerformance = lazy(() => import("../layout/views/productPerformance/ProductPerformance"));
const FbaPlanning = lazy(() => import("../layout/views/fbaPlanning/FbaPlanning"));
const MfnToFbaPage = lazy(() => import("../layout/views/fbaPlanning/MfnToFbaPage"));
const ReconciliationReimbursement = lazy(() => import("../layout/views/reconciliationReimbursement/ReconciliationReimbursement"));
const Returns = lazy(() => import("../layout/views/returns/Returns"));
const KeywordAnalysis = lazy(() => import("../layout/views/keywordAnalysis/KeywordAnalysis"));
const ProfitAnalysis = lazy(() => import("../layout/views/profitAnalysis/ProfitAnalysis"));
const Orders = lazy(() => import("../layout/views/orders/Orders"));
const OrderReport = lazy(() => import("../layout/views/orders/OrderReport"));
const TargetingRuleHistory = lazy(() => import("../layout/views/Targeting/TargetingRuleHistory"));
const CampaignSetting = lazy(() => import("../layout/views/campaignSetting/CampaignSetting"));
const Settings = lazy(() => import("../layout/views/globalSettings/Settings"));
const PlacementRule = lazy(() => import("../layout/views/bidPlacementRule/PlacementRule"));
const History = lazy(() => import("../layout/views/History/History"));
const AuditLog = lazy(() => import("../layout/views/Audit Log/AuditLog"));
const BrandAnalysis = lazy(() => import("../layout/views/BrandAnalysis/BrandAnalysis"));
const ProductTypeSchema = lazy(() => import("../layout/views/productList/ProductTypeSchema"));
const DaypartingStretegy = lazy(() => import("../layout/views/dayparting-stretegy/DaypartingStretegy"));
const DaypartingStretegyHistory = lazy(() => import("../layout/views/dayparting-stretegy/DaypartingStretegyHistory"));
const PLCalculater = lazy(() => import("../layout/views/pl-calculater/PLCalculater"));
const SearchTerm = lazy(() => import("../layout/views/search-Term/SearchTerm"));
const SearchTermRule = lazy(() => import("../layout/views/search-Term/SearchTermRule"));
const SearchTermHistory = lazy(() => import("../layout/views/searchTermHistory/SearchTermHistory"));
const Placement = lazy(() => import("../layout/views/placement/Placement"));
const Holidays = lazy(() => import("../layout/views/holidays/Holidays"));
const Coupons = lazy(() => import("../layout/views/coupons/Coupons"));
const AiAssistantPage = lazy(() => import("../layout/views/aiAssistant/AiAssistantPage"));

const AdminDashboard = lazy(() => import("../layout/views/adminDashboard/AdminDashboard"));
const OwnerDashboard = lazy(() => import("../layout/views/adminDashboard/OwnerDashboard"));
const Users = lazy(() => import("../layout/views/users/Users"));
const Organizations = lazy(() => import("../layout/views/organizations/Organizations"));
const AsanaUsers = lazy(() => import("../layout/views/asanaUsers/AsanaUsers"));
const AdminRoles = lazy(() => import("../layout/views/role/AdminRoles"));
const Pages = lazy(() => import("../layout/views/pages/Pages"));
const CronJob = lazy(() => import("../layout/views/cronJob/CronJob"));
const Packages = lazy(() => import("../layout/views/packages/Packages"));
const Retention = lazy(() => import("../layout/views/retention/Retention"));
const SupportTicket = lazy(() => import("../layout/views/supportTicket/SupportTicket"));
const UnansweredQuestions = lazy(() => import("../layout/views/unansweredQuestions/UnansweredQuestions"));
const ApiCapacity = lazy(() => import("../layout/views/apiCapacity/ApiCapacity"));
const AuthSupportChat = lazy(() => import("../layout/views/supportTicket/AuthSupportChat"));
const RuleBlockedTime = lazy(() => import("../layout/views/ruleBlockedTime/RuleBlockedTime"));
const DealsDashboard = lazy(() => import("../layout/views/deals-dashboard/DealsDashboard"));
const UserGuide = lazy(() => import("../layout/views/userGuide/UserGuide"));
const Profile = lazy(() => import("../layout/views/Profile/Profile"));
const PurchasePlans = lazy(() => import("../layout/views/PurchasePlans"));

const PagesRoutes = [
  {
    path: "/",
    component: <AdminDashboard />,
    exact: true,
    name: "Dashboard",
  },
  {
    path: "/user-guide",
    component: <UserGuide />,
    exact: true,
    name: "User Guide",
  },
  {
    path: "/profile",
    component: <Profile />,
    exact: true,
    name: "Profile",
  },
  {
    path: "/campaigns",
    component: <Campaign />,
    exact: true,
    name: "Campaigns",
  },
  {
    path: "/add-campagin",
    component: <AddNewCampaign />,
    exact: true,
    name: "Campaigns",
  },
  {
    path: "/campaign/setting",
    component: <CampaignSetting />,
    exact: true,
    name: "Campaigns",
  },
  {
    path: "/placement",
    component: <Placement />,
    exact: true,
    name: "Placement",
  },
  {
    path: "/placement-rule",
    component: <PlacementRule />,
    exact: true,
    name: "Placement Rule",
  },
  {
    path: "/placement-rule-history",
    component: <BidPlacementRuleHistory />,
    exact: true,
    name: "Placement Rule",
  },
  {
    path: "/budget-rule",
    component: <BudgetRule />,
    exact: true,
    name: "Budget Rules",
  },
  {
    path: "/recommandation",
    component: <Recommandation />,
    exact: true,
    name: "Recommendation",
  },
  {
    path: "/targeting",
    component: <Targeting />,
    exact: true,
    name: "Targeting",
  },
  {
    path: "/targeting/detail/:targetId",
    component: <TargetingDetail />,
    exact: true,
    name: "Targeting",
  },
  {
    path: "/targeting/:campaignId",
    component: <Targeting />,
    exact: true,
    name: "Targeting",
  },
  {
    path: "/targeting/history/:campaignId?",
    component: <History type="Targeting" />,
    exact: true,
    name: "Targeting",
  },
  {
    path: "/targeting-rule",
    component: <TargetingRule />,
    exact: true,
    name: "Targeting Rule",
  },
  {
    path: "/keyword-tracker",
    component: <LifetimeTracker />,
    exact: true,
    name: "Keyword Tracker",
  },
  {
    path: "/search-term",
    component: <SearchTerm />,
    exact: true,
    name: "Search Term",
  },
  {
    path: "/search-term-rule",
    component: <SearchTermRule />,
    exact: true,
    name: "Search Term Rule",
  },
  {
    path: "/search-term-history",
    component: <SearchTermHistory />,
    exact: true,
    name: "Search Term",
  },
  {
    path: "/keyword-analysis",
    component: <KeywordAnalysis />,
    exact: true,
    name: "Keyword Analysis",
  },
  {
    path: "/product-list",
    component: <ProductList />,
    exact: true,
    name: "Product List",
  },
  {
    path: "/product-list/schema/:productType",
    component: <ProductTypeSchema />,
    exact: true,
    name: "Product List",
  },
  {
    path: "/profit-analysis",
    component: <ProfitAnalysis />,
    exact: true,
    name: "Profit Analysis",
  },
  {
    path: "/orders",
    component: <Orders />,
    exact: true,
    name: "Orders",
  },
  {
    path: "/order-report",
    component: <OrderReport />,
    exact: true,
    name: "Order Report",
  },
  {
    path: "/products",
    component: <Product />,
    exact: true,
    name: "Product Ads",
  },
  {
    path: "/deals",
    component: <DealsDashboard />,
    exact: true,
    name: "Deals",
  },
  {
    path: "/inventory-management",
    component: <InventoryManagement />,
    exact: true,
    name: "Inventory",
  },
  {
    path: "/warehouse-inventory",
    component: <WarehouseDetails />,
    exact: true,
    name: "Warehouse Inventory",
  },
  {
    path: "/product-performance",
    component: <ProductPerformance />,
    exact: true,
    name: "Product Performance",
  },
  {
    path: "/fba-planning",
    component: <FbaPlanning />,
    exact: true,
    name: "FBA Planning"
  },
  {
    path: "/mfn-to-fba",
    component: <MfnToFbaPage />,
    exact: true,
    name: "MFN to FBA"
  },
  {
    path: "/reconciliation-reimbursement",
    component: <ReconciliationReimbursement />,
    exact: true,
    name: "Reconciliation & Reimbursement",
  },
  {
    path: "/returns",
    component: <Returns />,
    exact: true,
    name: "Returns & Refunds",
  },
  {
    path: "/coupons",
    component: <Coupons />,
    exact: true,
    name: "Coupons",
  },
  {
    path: "/budget-history",
    component: <BudgetHistory />,
    exact: true,
    name: "Budget Rules",
  },
  {
    path: "/cron-history",
    component: <CronJobHistory />,
    exact: true,
    name: "Cron Job Scheduler",
  },
  {
    path: "/cron-schedular",
    component: <CronJobSchedular />,
    exact: true,
    name: "Cron Job Scheduler",
  },
  {
    path: "/targeting-rule-history",
    component: <TargetingRuleHistory />,
    exact: true,
    name: "Targeting",
  },
  {
    path: "/history",
    component: <History />,
    exact: true,
    name: "History",
  },
  {
    path: "/brand-analytics",
    component: <BrandAnalysis />,
    exact: true,
    name: "Brand Analytics",
  },
  {
    path: "/audit-log",
    component: <AuditLog />,
    exact: true,
    name: "Audit Log",
  },
  {
    path: "/hourly-performance-tracking",
    component: <DaypartingStretegy />,
    exact: true,
    name: "Hourly Performance Tracking",
  },
  {
    path: "/hourly-performance-tracking/rule-history",
    component: <DaypartingStretegyHistory />,
    exact: true,
    name: "Hourly Performance Tracking",
  },
  {
    path: "/dayparting-stretegy",
    component: <DaypartingStretegy />,
    exact: true,
    name: "Hourly Performance Tracking",
  },
  {
    path: "/dayparting-stretegy/rule-history",
    component: <DaypartingStretegyHistory />,
    exact: true,
    name: "Hourly Performance Tracking",
  },
  {
    path: "/pl-calculater",
    component: <PLCalculater />,
    exact: true,
    name: "P/L Calculater",
  },
  {
    path: "/settings",
    component: <Settings />,
    exact: true,
    name: "Settings",
  },
  {
    path: "/admin-dashboard",
    component: <OwnerDashboard />,
    exact: true,
    name: "Dashboard",
  },
  {
    path: "/dashboard",
    component: <AdminDashboard />,
    exact: true,
    name: "Dashboard",
  },
  {
    path: "/users",
    component: <Users />,
    exact: true,
    name: "Users",
  },
  {
    path: "/organizations",
    component: <Organizations />,
    exact: true,
    name: "Organizations",
  },
  {
    path: "/pages",
    component: <Pages />,
    exact: true,
    name: "Pages",
  },
  {
    path: "/role",
    component: <AdminRoles />,
    exact: true,
    name: "Role",
  },
  {
    path: "/packages",
    component: <Packages />,
    exact: true,
    name: "Plans",
  },
  {
    path: "/purchase-plans",
    component: <PurchasePlans />,
    exact: true,
    name: "Purchase Plans",
  },
  {
    path: "/update-subscription",
    component: <PurchasePlans />,
    exact: true,
    name: "Update Subscription",
  },
  {
    path: "/retention",
    component: <Retention />,
    exact: true,
    name: "Retention",
  },
  {
    path: "/cron-job",
    component: <CronJob />,
    exact: true,
    name: "Cron Job",
  },
  {
    path: "/support-ticket",
    component: <SupportTicket />,
    exact: true,
    name: "Support Ticket",
  },
  {
    path: "/unanswered-questions",
    component: <UnansweredQuestions />,
    exact: true,
    name: "Chatbot Gaps",
  },
  {
    path: "/api-capacity",
    component: <ApiCapacity />,
    exact: true,
    name: "API Capacity & Usage",
  },
  {
    path: "/support-ticket/:ticketId?",
    component: <AuthSupportChat />,
    exact: true,
    name: "Support Ticket",
  },
  {
    path: "/asana-users",
    component: <AsanaUsers />,
    exact: true,
    name: "ASANA Users",
  },
  {
    path: "/rule-blocked-time",
    component: <RuleBlockedTime />,
    exact: true,
    name: "Rule Blocked Time",
  },
  {
    path: "/holiday",
    component: <Holidays />,
    exact: true,
    name: "Holiday/Special Days",
  },
  {
    path: "/ai-assistant",
    component: <AiAssistantPage />,
    exact: true,
    name: "AI Assistant",
  },
];
export default PagesRoutes;
