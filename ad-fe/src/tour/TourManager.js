import { TOUR_EVENTS } from './tourConstants';

const STORAGE_KEY = 'advertiq_tour_state';

/**
 * TourManager handles persistence (localStorage) and analytics events.
 */
export class TourManager {
    static getSavedState() {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error("Failed to read tour state from localStorage", error);
            return null;
        }
    }

    static saveState(state) {
        try {
            // We only save completed/skipped history to prevent repeating tours unnecessarily.
            // We do NOT save activeTourId or stepIndex, so if they close/refresh, it starts from the beginning next time.
            const dataToSave = {
                completedTours: state.completedTours || [],
                skippedTours: state.skippedTours || []
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
        } catch (error) {
            console.error("Failed to save tour state to localStorage", error);
        }
    }

    static clearState() {
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch (error) {
            console.error("Failed to clear tour state", error);
        }
    }

    static trackEvent(eventName, payload = {}) {
        // Analytics hook. Can be connected to Amplitude, Mixpanel, etc.
        console.log(`[Analytics Event] ${eventName}:`, payload);

        switch (eventName) {
            case TOUR_EVENTS.TOUR_START:
            case TOUR_EVENTS.TOUR_END:
            case TOUR_EVENTS.STEP_CHANGE:
            case TOUR_EVENTS.CHILD_START:
                // Call actual tracking service here
                break;
            default:
                break;
        }
    }
}
