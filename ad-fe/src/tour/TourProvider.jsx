import React, { createContext, useReducer, useEffect } from 'react';
import { TourManager } from './TourManager';
import './config'; // Register all tours

export const TourContext = createContext();

const initialState = {
    activeTourId: null,
    stepIndex: 0,
    parentStack: [],
    completedTours: [],
    skippedTours: [],
    run: false, // For joyride run prop
};

const tourReducer = (state, action) => {
    switch (action.type) {
        case 'INIT_STATE':
            return { ...state, ...action.payload };
        
        case 'START_TOUR':
            return {
                ...state,
                activeTourId: action.payload.tourId,
                stepIndex: action.payload.stepIndex || 0,
                run: true,
                parentStack: action.payload.parentStack || state.parentStack
            };
            
        case 'SET_STEP':
            return {
                ...state,
                stepIndex: action.payload
            };

        case 'PAUSE_TOUR':
            return {
                ...state,
                run: false
            };
            
        case 'RESUME_TOUR':
            return {
                ...state,
                run: true
            };

        case 'PUSH_PARENT':
            return {
                ...state,
                parentStack: [...state.parentStack, action.payload]
            };

        case 'POP_PARENT':
            const newStack = [...state.parentStack];
            const parent = newStack.pop();
            if (!parent) return state;
            return {
                ...state,
                parentStack: newStack,
                activeTourId: parent.tourId,
                stepIndex: parent.stepIndex,
                run: true
            };

        case 'COMPLETE_TOUR':
            return {
                ...state,
                run: false,
                activeTourId: null,
                stepIndex: 0,
                completedTours: [...new Set([...state.completedTours, action.payload])]
            };

        case 'SKIP_TOUR':
            return {
                ...state,
                run: false,
                activeTourId: null,
                stepIndex: 0,
                skippedTours: [...new Set([...state.skippedTours, action.payload])]
            };

        case 'STOP_TOUR':
            return {
                ...state,
                run: false,
                activeTourId: null,
                stepIndex: 0,
                parentStack: []
            };

        case 'RESET_ALL':
            return {
                ...initialState
            };

        default:
            return state;
    }
};

export const TourProvider = ({ children }) => {
    const [state, dispatch] = useReducer(tourReducer, initialState);

    // Load state from local storage on mount
    useEffect(() => {
        const savedState = TourManager.getSavedState();
        if (savedState) {
            dispatch({ type: 'INIT_STATE', payload: savedState });
            // If there was an active tour, wait a bit for app to render, then resume
            if (savedState.activeTourId) {
                 setTimeout(() => {
                    dispatch({ type: 'RESUME_TOUR' });
                 }, 1000);
            }
        }
    }, []);

    // Save state on every change
    useEffect(() => {
        TourManager.saveState(state);
    }, [state]);

    return (
        <TourContext.Provider value={{ state, dispatch }}>
            {children}
        </TourContext.Provider>
    );
};
