import React, { useEffect, useRef, useState, useContext } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useLocation } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Button } from "../../../components/ui/button";
import { ROLES } from "../../constants";
import { ProfileContext } from "../../../helper/usecontext/useContext";

function Footer() {
  const { t } = useTranslation();
  const footerRef = useRef(null);
  const [marqueeMsg] = useState([]);
  const navigate = useNavigate();
  const location = useLocation();
  const { isPlanActive } = useContext(ProfileContext);
  const [storageTrigger, setStorageTrigger] = useState(0);

  useEffect(() => {
    const handleStorageChange = () => setStorageTrigger(prev => prev + 1);
    window.addEventListener("planStatusChanged", handleStorageChange);
    window.addEventListener("organizationChanged", handleStorageChange);
    window.addEventListener("storage", handleStorageChange);
    return () => {
      window.removeEventListener("planStatusChanged", handleStorageChange);
      window.removeEventListener("organizationChanged", handleStorageChange);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  useEffect(() => {
    const getSidebar = () => document.getElementById("sidebar-wrapper") || document.getElementById("owner-sidebar");
    const sidebar = getSidebar();
    if (!sidebar || !footerRef.current) return;

    const updateFooter = () => {
      const activeSidebar = getSidebar();
      if (!activeSidebar || !footerRef.current) return;

      const isOwner = document.getElementById("wrapper")?.classList.contains("owner-layout");
      const sidebarWidth = activeSidebar.getBoundingClientRect().width;
      if (window.innerWidth >= 992) {
        if (isOwner) {
          footerRef.current.style.left = '275px';
          footerRef.current.style.width = 'calc(100% - 290px)';
        } else {
          footerRef.current.style.left = `${sidebarWidth}px`;
          footerRef.current.style.width = `calc(100% - ${sidebarWidth}px - 15px)`;
        }
      } else {
        footerRef.current.style.left = '0';
        footerRef.current.style.width = '100%';
      }
    };

    // Initial set
    updateFooter();

    // Watch sidebar width changes
    const resizeObserver = new ResizeObserver(updateFooter);
    resizeObserver.observe(sidebar);

    // Also listen for window resize to handle breakpoint changes
    window.addEventListener('resize', updateFooter);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateFooter);
    };
  }, []);

  const role = localStorage.getItem("role");
  const sellerToken = localStorage.getItem("sellerToken");
  const orgId = localStorage.getItem("organizationId");
  const hasUsedTrial = localStorage.getItem("hasUsedTrial") === "true";
  const isPlanActiveStorage = localStorage.getItem("isPlanActive") === "true";

  const isSubUserPlanExpired = Boolean(sellerToken) &&
    Boolean(orgId) &&
    role !== ROLES.ADMIN &&
    role !== ROLES.SUPER_ADMIN &&
    (hasUsedTrial || (!isPlanActiveStorage && !isPlanActive)) &&
    location.pathname !== "/select-organization";
  if (location.pathname === "/ai-assistant") return null;


  return (
    <>
      <div
        ref={footerRef}
        className="footer_container"
      >
        <div className="footer_wrapper flex justify-between items-center">

          {/* Left */}
          <div className="flex-shrink-0 text-nowrap">
            <span id="content">
              <span id="title">{t("Powered by : ")}</span>Advertise IQ
            </span>
          </div>

          {marqueeMsg.length > 0 && (
            <div className="flex-grow-1 overflow-hidden pb-0">
              {/* eslint-disable-next-line jsx-a11y/no-distracting-elements */}
              <marquee
                behavior="scroll"
                direction="left"
                scrollamount="5"
                onMouseOver={(e) => e?.currentTarget?.stop()}
                onMouseOut={(e) => e?.currentTarget?.start()}
                className="footer-marquee"
              >
                {marqueeMsg.map((msg, index) => (
                  <span key={index} className="pr-5 mr-5">
                    {index + 1}. {msg}
                  </span>
                ))}
              </marquee>
            </div>
          )}

        </div>
      </div>

      <Dialog open={isSubUserPlanExpired}>
        <DialogContent className="max-w-md p-6" hideCloseButton={true}>
          <DialogHeader className="sr-only">
            <DialogTitle>Organization Plan Expired</DialogTitle>
          </DialogHeader>

          <div className="text-center pb-2">
            <div className="text-4xl mb-2">🔒</div>
            <h4 className="text-xl font-bold text-slate-800 dark:text-slate-100">Plan Expired</h4>

            <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm">
              The subscription plan or free trial for this organization has expired.
            </p>

            <p className="text-slate-500 dark:text-slate-400 text-sm mt-2">
              Only the Organization Owner can purchase or renew a plan. Please contact your Organization Admin to continue access or switch to another active organization.
            </p>

            <div className="flex justify-center mt-6">
              <Button
                onClick={() => window.location.href = "/select-organization?mode=switch"}
                className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2 px-5 py-2.5 rounded-lg shadow-sm font-semibold"
              >
                <i className="fa fa-exchange-alt" />
                Switch Organization
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default React.memo(Footer);
