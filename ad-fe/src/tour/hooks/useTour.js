import { useContext } from 'react';
import { TourContext } from '../TourProvider';
import { TOUR_EVENTS } from '../tourConstants';
import { TourManager } from '../TourManager';
import { tourRegistry } from '../TourRegistry';

/**
 * Custom hook to interact with the Tour System
 */
export const useTour = () => {
    const { state, dispatch } = useContext(TourContext);

    const startTour = (tourId, stepIndex = 0) => {
        const tour = tourRegistry.getTour(tourId);
        if (!tour) {
            console.warn(`Tour ID ${tourId} not found in registry.`);
            return;
        }
        dispatch({ type: 'START_TOUR', payload: { tourId, stepIndex } });
        TourManager.trackEvent(TOUR_EVENTS.TOUR_START, { tourId });
    };

    const stopTour = () => {
        dispatch({ type: 'STOP_TOUR' });
        TourManager.trackEvent(TOUR_EVENTS.TOUR_END, { tourId: state.activeTourId });
    };

    const pauseTour = () => {
        dispatch({ type: 'PAUSE_TOUR' });
        TourManager.trackEvent(TOUR_EVENTS.TOUR_PAUSE, { tourId: state.activeTourId });
    };

    const resumeTour = () => {
        dispatch({ type: 'RESUME_TOUR' });
        TourManager.trackEvent(TOUR_EVENTS.TOUR_RESUME, { tourId: state.activeTourId });
    };

    const skipTour = () => {
        dispatch({ type: 'SKIP_TOUR', payload: state.activeTourId });
    };

    const completeTour = () => {
        dispatch({ type: 'COMPLETE_TOUR', payload: state.activeTourId });
    };

    return {
        ...state,
        state,
        startTour,
        stopTour,
        pauseTour,
        resumeTour,
        skipTour,
        completeTour,
        dispatch
    };
};
