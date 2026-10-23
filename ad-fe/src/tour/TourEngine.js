import { STATUS, EVENTS, ACTIONS } from "react-joyride";
import { tourRegistry } from "./TourRegistry";
import { TourManager } from "./TourManager";
import { TOUR_EVENTS } from "./tourConstants";
import { smoothScrollTo } from "./TourUtils";

export const createTourEngine = (state, dispatch, activeSteps) => {
    const { activeTourId, parentStack } = state;
    const currentTourConfig = tourRegistry.getTour(activeTourId);
    const steps = activeSteps && activeSteps.length > 0 ? activeSteps : (currentTourConfig ? currentTourConfig.steps : []);

    const handleJoyrideCallback = async (data) => {
        const { status, type, action, index, step } = data;

        if (type === EVENTS.STEP_BEFORE) {
            // Check if step requires routing
            if (step.route && typeof step.route === 'function') {
                step.route(); // Trigger navigation
            }
        }

        if (type === EVENTS.STEP_AFTER) {
            TourManager.trackEvent(TOUR_EVENTS.STEP_CHANGE, { tourId: activeTourId, stepIndex: index, action });

            // Moving forward
            if (action === ACTIONS.NEXT) {
                const currentStepConfig = steps[index];
                if (currentStepConfig && currentStepConfig.requireClick) {
                    return;
                }
                if (index + 1 < steps.length) {
                    dispatch({ type: 'SET_STEP', payload: index + 1 });
                } else {
                    TourManager.trackEvent(TOUR_EVENTS.TOUR_END, { tourId: activeTourId });
                    dispatch({ type: 'COMPLETE_TOUR', payload: activeTourId });
                    if (parentStack.length > 0) {
                        setTimeout(() => dispatch({ type: 'POP_PARENT' }), 400);
                    }
                }
            }

            // Moving backward
            if (action === ACTIONS.PREV) {
                dispatch({ type: 'SET_STEP', payload: Math.max(0, index - 1) });
            }
        }

        // Handle missing target element or errors gracefully - NEVER abort the tour
        if (type === EVENTS.TARGET_NOT_FOUND || type === EVENTS.ERROR) {
            console.warn(`[Tour] Target not found for step ${index}:`, step?.target);
            if (index + 1 < steps.length) {
                dispatch({ type: 'SET_STEP', payload: index + 1 });
            } else {
                TourManager.trackEvent(TOUR_EVENTS.TOUR_END, { tourId: activeTourId });
                dispatch({ type: 'COMPLETE_TOUR', payload: activeTourId });
            }
            return;
        }

        // Finish current tour
        if (status === STATUS.FINISHED) {
            TourManager.trackEvent(TOUR_EVENTS.TOUR_END, { tourId: activeTourId });
            dispatch({ type: 'COMPLETE_TOUR', payload: activeTourId });
            
            // Resume parent if exists
            if (parentStack.length > 0) {
                setTimeout(() => dispatch({ type: 'POP_PARENT' }), 400);
            }
            return;
        }

        // Skip current tour or closed via explicit Close button / Skip button / ESC key
        // Must NOT skip when user clicked NEXT or PREV or during target resolution
        if ((action === ACTIONS.CLOSE || action === ACTIONS.SKIP) && status !== STATUS.FINISHED) {
            dispatch({ type: 'SKIP_TOUR', payload: activeTourId });
            dispatch({ type: 'STOP_TOUR' });
        }
    };

    return {
        handleJoyrideCallback,
        currentSteps: steps
    };
};
