import React, { useState, Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import Loader from '../common/helper/loader/Loader';
import Footer from '../common/helper/footer/Footer';
import { ROLES } from 'src/common/constants';
import Filter, { HeaderProvider } from '../helper/filter/Filter';
import ErrorBoundary from '../common/helper/ErrorBoundary';


const Sidebar = React.lazy(() => import('../layout/component/sidebar/Sidebar'));
const OwnerSidebar = React.lazy(() => import('../layout/component/sidebar/OwnerSidebar'));

function DefaultLayout() {
  const [open, setOpen] = useState(false);
  const isLoaderActive = useSelector(state => Boolean(state.data?.loader));
  const role = localStorage.getItem('role');
  const isOwner = role === ROLES.SUPER_ADMIN;
  const location = useLocation();

  // Strictly enforce sidebar rules on breakpoint change and listen to header toggle events
  React.useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 992) {
        setOpen(false);
      }
    };
    const handleToggle = () => {
      setOpen(prev => !prev);
    };
    window.addEventListener("resize", handleResize);
    window.addEventListener("toggleSidebar", handleToggle);
    // Initial check
    handleResize();
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("toggleSidebar", handleToggle);
    };
  }, []);

  React.useEffect(() => {
    if (isLoaderActive) {
      document.body.classList.add("loader-active-lock");
    } else {
      document.body.classList.remove("loader-active-lock");
    }
    return () => {
      document.body.classList.remove("loader-active-lock");
    };
  }, [isLoaderActive]);

  return (
    <HeaderProvider>
      <div id="wrapper" className={`${open ? 'toggled' : ''} ${isOwner ? 'owner-layout' : ''}`}>
        <ErrorBoundary>
          <Suspense fallback={<div className="sidebar-placeholder" />}>
            {isOwner
              ? <OwnerSidebar open={open} setOpen={setOpen} />
              : <Sidebar open={open} setOpen={setOpen} />
            }
          </Suspense>
        </ErrorBoundary>
        <Filter isLayoutHeader={true} />
        <main className='outlet_wrapper'>
          <ErrorBoundary>
            <Suspense fallback={<Loader />}>
            <div className="route-transition-wrapper">
              {
                isLoaderActive &&
                <Loader scale={"1.2"} />
              }
              <Outlet />
            </div>
          </Suspense>
        </ErrorBoundary>
        </main>
        <Footer />
      </div>
    </HeaderProvider>
  );
}

export default React.memo(DefaultLayout);