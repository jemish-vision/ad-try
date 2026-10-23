import './App.scss';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation, matchPath } from "react-router-dom";
import { Suspense, useContext, useEffect, lazy } from 'react';
import { ToastContainer } from "react-toastify";
import 'react-toastify/dist/ReactToastify.css';
import "react-tippy/dist/tippy.css";
import DefaultLayout from './defaultLayout/DefaultLayout';
import routes from './router/routes';
import { UseContext, ProfileContext } from './helper/usecontext/useContext';
import { onMessage } from 'firebase/messaging';
import { messaging } from './common/helper/firebase/FirebaseInitialize';
import ChatbotWidget from './helper/chatbot/ChatbotWidget';
import Spinner from './common/helper/loader/Loader';
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";
import { AllCommunityModule } from "ag-grid-community";
import { AgGridProvider } from 'ag-grid-react';
import { RowGroupingModule, MasterDetailModule, TreeDataModule, PivotModule } from 'ag-grid-enterprise';
import './assets/scss/forceStyle.scss';
import NoPagePermission from './common/pages/NoPagePermission';
import { TourProvider, JoyrideWrapper } from './tour';
import { ROLES, PAGE_ACTIONS, SYSTEM_PAGES } from './common/constants';
import AmazonAuthHandler from './components/AmazonAuthHandler';
import ErrorBoundary from './common/helper/ErrorBoundary';

const Login = lazy(() => import('./common/pages/Login'));
const Registration = lazy(() => import('./common/pages/Registration'));
const ForgotPassword = lazy(() => import('./common/pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./common/pages/ResetPassword'));
const PurchasePlans = lazy(() => import('./layout/views/PurchasePlans'));
const PaymentFailed = lazy(() => import('./layout/views/PaymentFailed'));
const PaymentSuccess = lazy(() => import('./layout/views/PaymentSuccess'));
const MaintenancePage = lazy(() => import('./common/pages/MaintenancePage/MaintenancePage'));
const SelectOrganization = lazy(() => import('./layout/views/SelectOrganization'));
const SelectPlan = lazy(() => import('./layout/views/SelectPlan'));
const AcceptInvitation = lazy(() => import('./layout/views/users/AcceptInvitation'));

function App() {

  function RequireAuth() {
    const token = localStorage.getItem('sellerToken');
    const { pagePermission, isPlanActive } = useContext(ProfileContext);
    const location = useLocation();

    if (!token) {
      localStorage.clear();
      return <Navigate to="/login" state={{ from: location }} replace />;
    }

    if (token && pagePermission === undefined) {
      return <Spinner />;
    }

    if (pagePermission) {
      const isConnected = localStorage.getItem("connection") !== "false";
      const role = localStorage.getItem("role");

      // Enforce organization selection for ADMIN role before allowing access to dashboard or layout pages
      if (role === ROLES.ADMIN && !localStorage.getItem("organizationId") && !["/select-organization", "/select-plan", "/purchase-plans", "/update-subscription", "/maintenance-mode", "/payment-success", "/payment-failed", "/accept-invitation"].includes(location.pathname)) {
        return <Navigate to="/select-organization" replace />;
      }

      // Enforce plan purchase restriction if free trial has expired or plan is not active
      const hasUsedTrial = localStorage.getItem("hasUsedTrial") === "true";
      const isPlanActiveStorage = localStorage.getItem("isPlanActive") === "true";
      const isPlanActiveEffective = isPlanActive && isPlanActiveStorage;
      if (role !== ROLES.SUPER_ADMIN && (hasUsedTrial || !isPlanActiveEffective) && !["/select-organization", "/select-plan", "/purchase-plans", "/update-subscription", "/maintenance-mode", "/payment-success", "/payment-failed", "/accept-invitation"].includes(location.pathname)) {
        return <Navigate to="/select-plan" replace />;
      }
      const allowedNames = pagePermission.map(p => p.pageName);

      // Always allow basic pages
      const alwaysAllow = ["User Guide", "Profile", "Purchase Plans", "Update Subscription", "Plans", "Warehouse Details", "Warehouse Inventory", "Product Performance", "MFN to FBA"];

      // Find current route config
      const currentRoute = routes.find(r =>
        matchPath({ path: r.path, end: true, caseSensitive: false }, location.pathname)
      );

      if (currentRoute && currentRoute.name) {
        // 1. Check connection status restriction
        if (!isConnected && !alwaysAllow.includes(currentRoute.name)) {
          return <Navigate to="/" replace />;
        }

        // 2. Explicitly prevent non-Owners from accessing /admin-dashboard
        if (location.pathname === "/admin-dashboard" && role !== ROLES.SUPER_ADMIN) {
          return <Navigate to="/" replace />;
        }

        // 3. Check dynamic permissions from BE
        let isAllowed = role === ROLES.SUPER_ADMIN || allowedNames.some(name => currentRoute.name === name || currentRoute.name.includes(name)) || alwaysAllow.includes(currentRoute.name);

        if (currentRoute.name === SYSTEM_PAGES.DASHBOARD && role !== ROLES.SUPER_ADMIN) {
          const dashPerm = pagePermission.find(p => p.pageName === SYSTEM_PAGES.DASHBOARD);
          const hasDashView = dashPerm?.allocatedActions?.some(a => (a.actionType === PAGE_ACTIONS?.VIEW_ONLY) && a.status === true);
          if (!hasDashView) isAllowed = false;
        }

        if (!isAllowed) {
          let firstPath = null;
          if (pagePermission && pagePermission.length) {
            for (let p of pagePermission) {
              const hasView = p.allocatedActions?.some((action) => (action.actionType === PAGE_ACTIONS?.VIEW_ONLY) && action.status === true);
              if (hasView) {
                const matchingRoute = routes.find(r => r.name === p.pageName && r.path !== "/");
                if (matchingRoute) {
                  firstPath = matchingRoute.path;
                  break;
                }
              }
            }
          }
          if (firstPath && firstPath !== location.pathname) {
            return <Navigate to={firstPath} replace />;
          }
          return null;
        }
      }
    }

    return <Outlet />;
  }

  function PublicRoute() {
    const token = localStorage.getItem('sellerToken');
    if (token) {
      return <Navigate to="/" replace />;
    }
    return <Outlet />;
  }

  useEffect(() => {
    const getSystemTheme = () => window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    const currentTheme = localStorage.getItem("theme") || getSystemTheme();
    document.documentElement.setAttribute("data-theme", currentTheme);

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      if (!localStorage.getItem("theme")) {
        const newSystemTheme = mediaQuery.matches ? "dark" : "light";
        document.documentElement.setAttribute("data-theme", newSystemTheme);
        window.dispatchEvent(new Event("themeChanged"));
      }
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handleChange);
    } else {
      mediaQuery.addListener(handleChange);
    }

    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener("change", handleChange);
      } else {
        mediaQuery.removeListener(handleChange);
      }
    };
  }, []);

  useEffect(() => {
    const unsubscribe = onMessage(messaging, async (payload) => {
      const { title, body } = payload.notification;
      new Notification(title, { body, icon: "https://app.advertiseiq.co/advertise%20IQ.png" });
    });
    return () => unsubscribe();
  }, []);

  return (
    <>
      <ToastContainer autoClose={3000} pauseOnFocusLoss={false} pauseOnHover={false} />
      <UseContext>
        <TourProvider>
          <AgGridProvider modules={[AllCommunityModule, RowGroupingModule, MasterDetailModule, TreeDataModule, PivotModule]}>
            <BrowserRouter>
              <AmazonAuthHandler />
              {/* Floating bottom-right chatbot widget commented out per request */}
              {/* <ChatbotWidget isGlobal /> */}
              <ErrorBoundary>
                <Suspense fallback={<Spinner />}>
                  <Routes>
                    <Route path="/maintenance-mode" element={<MaintenancePage />} />
                    <Route path="/accept-invitation" element={<AcceptInvitation />} />
                    <Route element={<PublicRoute />}>
                      <Route path="/no-page-permission" element={<NoPagePermission />} />
                      <Route path="/login" element={<Login />} />
                      <Route path="/registration" element={<Registration />} />
                      <Route path="/forgot-password" element={<ForgotPassword />} />
                      <Route path="/reset-password" element={<ResetPassword />} />
                    </Route>
                    <Route element={<RequireAuth />}>
                      <Route path="/maintenance-mode" element={<MaintenancePage />} />
                      <Route path={"/payment-success"} element={<PaymentSuccess />} />
                      <Route path={"/payment-failed"} element={<PaymentFailed />} />
                      <Route path={"/select-organization"} element={<SelectOrganization />} />
                      <Route path={"/select-plan"} element={<SelectPlan />} />
                      <Route element={<DefaultLayout />}>
                        <Route path={"/purchase-plans"} element={<PurchasePlans />} />
                        <Route path={"/update-subscription"} element={<PurchasePlans />} />
                        {routes.map((r, i) => <Route key={i} path={r.path} element={r.component} />)}
                      </Route>
                    </Route>
                    <Route path='*' element={<Navigate to="/login" />} />
                  </Routes>
                </Suspense>
              </ErrorBoundary>
              <JoyrideWrapper />
            </BrowserRouter>
          </AgGridProvider>
        </TourProvider>
      </UseContext>
    </>
  );
}

export default App;
