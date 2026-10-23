import { useContext, useEffect, useRef } from "react";
import { useSelector } from "react-redux";
import { ProfileContext } from "../../helper/usecontext/useContext";
import { ApiSiteTourCompleted } from "../../api-wrapper/customer/ApiCustomer";
import { Toast } from "../../helper/links/Link";
import { useTour } from "../hooks/useTour";
import { ROLES } from "src/common/constants";

export const TourController = () => {
    const { state, dispatch } = useTour();
    const { run, activeTourId } = state;

    const Loading = useSelector((state) => state.data);
    const { loginUser, setLoginUser, selectedAdType } = useContext(ProfileContext);

    // Use role from localStorage just like SystemLearningTour
    const role = localStorage.getItem('role');

    const apiCalledRef = useRef(false);
    const autoStartedRef = useRef(false);

    // Auto-start for first-time users
    useEffect(() => {
        const isAppTourFinished = state.completedTours.includes('app') || state.skippedTours.includes('app');
        const isAppstoreFlowActive = localStorage.getItem("amazon_appstore_flow") === "true" || sessionStorage.getItem("amazon_appstore_flow") === "true" || Boolean(localStorage.getItem("appstore_seller_id") || sessionStorage.getItem("appstore_seller_id"));
        const checkIsModalOpen = () => Boolean(
            typeof document !== "undefined" && (
                document.querySelector('[role="dialog"]') ||
                document.querySelector('.cm-confirm-dialog') ||
                document.querySelector('.modal-content')
            )
        );
        const isModalOpen = checkIsModalOpen();

        const isPageDataLoading = () => Boolean(
            typeof document !== "undefined" && (
                document.querySelector('.animate-pulse') ||
                document.querySelector('.loader') ||
                Loading?.loader
            )
        );

        if (
            !isAppstoreFlowActive &&
            !isModalOpen &&
            !isPageDataLoading() &&
            loginUser &&
            loginUser?.isTourCompleted === false &&
            !isAppTourFinished && // Prevent auto-start if already finished locally
            selectedAdType &&
            role !== ROLES.SUPER_ADMIN &&
            !Loading?.loader &&
            !apiCalledRef.current &&
            !autoStartedRef.current &&
            !activeTourId &&
            !run
        ) {
            autoStartedRef.current = true;
            // Introduce a slight delay for better UX
            setTimeout(() => {
                const isStillModalOpen = checkIsModalOpen();
                const isStillLoading = isPageDataLoading();
                if (!isStillModalOpen && !isStillLoading) {
                    dispatch({ type: 'START_TOUR', payload: { tourId: 'app' } });
                } else {
                    autoStartedRef.current = false;
                }
            }, 1200);
        }
    }, [loginUser, selectedAdType, role, Loading?.loader, activeTourId, run, dispatch, state.completedTours, state.skippedTours]);

    // Handle saving tour status API on completion or skip
    // We simply check if the 'app' tour is in the completed or skipped list.
    // If it is, and the backend (loginUser) thinks it's still false, we sync it.
    useEffect(() => {
        const isAppTourFinished = state.completedTours.includes('app') || state.skippedTours.includes('app');

        if (
            isAppTourFinished &&
            loginUser &&
            loginUser?.isTourCompleted === false &&
            !apiCalledRef.current
        ) {
            apiCalledRef.current = true;
            ApiSiteTourCompleted()
                .then(res => {
                    if (res?.isSuccess || res?.statusCode === 200) {
                        // Update user state so the tour doesn't start next time
                        setLoginUser(prev => ({ ...prev, isTourCompleted: true }));
                    } else {
                        Toast.error(res?.message ?? "Unable to update tour status");
                        apiCalledRef.current = false; // allow retry if failed
                    }
                })
                .catch(err => {
                    Toast.error(err?.message);
                    apiCalledRef.current = false; // allow retry if failed
                });
        }
    }, [state.completedTours, state.skippedTours, loginUser, setLoginUser]);

    return null;
};
