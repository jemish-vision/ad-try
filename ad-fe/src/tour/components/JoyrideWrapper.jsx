import React, { useMemo, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { Joyride } from 'react-joyride';
import { useTour } from '../hooks/useTour';
import { createTourEngine } from '../TourEngine';
import { tourRegistry } from '../TourRegistry';
import { CustomTooltip } from './CustomTooltip';
import { CustomArrow } from './CustomArrow';
import { TourController } from './TourController';

export const JoyrideWrapper = () => {
    const { state, dispatch } = useTour();
    const { run, stepIndex, activeTourId } = state;
    const [isTargetReady, setIsTargetReady] = useState(false);
    const Loading = useSelector((state) => state.data);

    // Get the full list of steps defined for this tour
    const currentTourConfig = tourRegistry.getTour(activeTourId);
    const rawSteps = currentTourConfig?.steps || [];

    // Filter available steps to only those whose targets exist in the DOM (or body/document/center)
    const validSteps = useMemo(() => {
        if (!rawSteps.length) return [];
        const filtered = rawSteps.filter((step) => {
            if (!step.target || step.target === 'body' || step.target === 'document') return true;
            try {
                const el = typeof step.target === 'string' ? document.querySelector(step.target) : step.target;
                return Boolean(el);
            } catch {
                return false;
            }
        });
        return filtered.length > 0 ? filtered : rawSteps;
    }, [activeTourId, rawSteps, run, Loading?.loader]);

    const engine = useMemo(() => createTourEngine(state, dispatch, validSteps), [state, dispatch, validSteps]);

    // Target check effect: Wait for background data and target to appear before displaying tour
    useEffect(() => {
        if (!run || !engine.currentSteps || engine.currentSteps.length === 0) {
            setIsTargetReady(false);
            return;
        }

        const safeIndex = Math.min(stepIndex, Math.max(0, engine.currentSteps.length - 1));
        const currentStep = engine.currentSteps[safeIndex];
        if (!currentStep) return;

        if (!currentStep.target || currentStep.target === 'body' || currentStep.target === 'document') {
            if (!Loading?.loader) {
                setIsTargetReady(true);
            }
            return;
        }

        const targetSelector = currentStep.target;
        const checkTarget = () => {
            // Don't show tour while global page loader is spinning
            if (Loading?.loader) return false;

            const targetEl = typeof targetSelector === 'string'
                ? document.querySelector(targetSelector)
                : targetSelector;

            if (!targetEl) return false;

            // Ensure target is rendered with non-zero dimensions
            const rect = targetEl.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) return false;

            // Wait if target or container is still showing skeleton placeholders or table loaders
            const isSkeletonLoading = targetEl.querySelector('.animate-pulse') ||
                                     targetEl.classList.contains('animate-pulse') ||
                                     targetEl.querySelector('.ag-overlay-loading-center') ||
                                     targetEl.querySelector('.spinner-border') ||
                                     targetEl.querySelector('.loading-spinner');

            if (isSkeletonLoading) return false;

            return true;
        };

        if (checkTarget()) {
            setIsTargetReady(true);
            return;
        }

        setIsTargetReady(false);

        let elapsed = 0;
        const intervalTime = 150;
        const timeoutTime = 2000;

        const intervalId = setInterval(() => {
            if (checkTarget()) {
                clearInterval(intervalId);
                setIsTargetReady(true);
            } else {
                elapsed += intervalTime;
                if (elapsed >= timeoutTime) {
                    clearInterval(intervalId);
                    const targetEl = typeof targetSelector === 'string'
                        ? document.querySelector(targetSelector)
                        : targetSelector;
                    if (targetEl) {
                        setIsTargetReady(true);
                    } else if (safeIndex + 1 < engine.currentSteps.length) {
                        dispatch({ type: 'SET_STEP', payload: safeIndex + 1 });
                    } else {
                        dispatch({ type: 'COMPLETE_TOUR', payload: activeTourId });
                    }
                }
            }
        }, intervalTime);

        return () => clearInterval(intervalId);
    }, [run, stepIndex, engine.currentSteps, Loading?.loader, dispatch, activeTourId]);

    useEffect(() => {
        if (!run || !engine.currentSteps || engine.currentSteps.length === 0) return;

        const safeIndex = Math.min(stepIndex, Math.max(0, engine.currentSteps.length - 1));
        const currentStep = engine.currentSteps[safeIndex];
        if (!currentStep) return;

        const handler = (e) => {
            if (!currentStep.target) return;
            const targetEl = typeof currentStep.target === 'string'
                ? document.querySelector(currentStep.target)
                : currentStep.target;

            if (targetEl && targetEl.contains(e.target)) {
                if (currentStep.childTourId) {
                    // Start child tour when icon/button is clicked
                    dispatch({
                        type: 'PUSH_PARENT',
                        payload: { tourId: activeTourId, stepIndex: safeIndex + 1 }
                    });

                    setTimeout(() => {
                        dispatch({
                            type: 'START_TOUR',
                            payload: { tourId: currentStep.childTourId, stepIndex: 0 }
                        });
                    }, 50);
                } else if (currentStep.requireClick) {
                    if (safeIndex + 1 >= engine.currentSteps.length) {
                        engine.handleJoyrideCallback({ status: 'finished' });
                    } else {
                        dispatch({ type: 'SET_STEP', payload: safeIndex + 1 });
                    }
                }
            }
        };

        document.addEventListener('click', handler, true);
        return () => document.removeEventListener('click', handler, true);
    }, [run, stepIndex, engine.currentSteps, activeTourId, dispatch]);

    const steps = useMemo(() => {
        return (engine.currentSteps || []).map((step) => ({
            ...step,
            blockTargetInteraction: false,
            skipBeacon: true,
            scrollOffset: 120,
            targetWaitTimeout: 2000,
        }));
    }, [engine.currentSteps]);

    const hasSteps = steps && steps.length > 0;
    const safeStepIndex = Math.min(stepIndex, Math.max(0, steps.length - 1));

    return (
        <>
            <TourController />

            <style>
                {`
                #custom-site-tour,
                .react-joyride__floater,
                .react-joyride__tooltip {
                    pointer-events: auto !important;
                }
                `}
            </style>

            {hasSteps && (
                <div
                    id="custom-site-tour"
                    style={{
                        opacity: isTargetReady ? 1 : 0,
                        pointerEvents: isTargetReady ? 'auto' : 'none',
                        transition: 'opacity 0.2s ease-in-out'
                    }}
                >
                    <Joyride
                        key={`${activeTourId}-${steps.length}`}
                        steps={steps}
                        run={run}
                        stepIndex={safeStepIndex}
                        continuous
                        keyboardNavigation={!(steps[safeStepIndex]?.requireClick)}
                        showSkipButton={true}
                        scrollToFirstStep={true}
                        tooltipComponent={CustomTooltip}
                        arrowComponent={CustomArrow}
                        onEvent={engine.handleJoyrideCallback}
                        options={{
                            zIndex: 999999,
                            arrowColor: "var(--body-bg-color, #ffffff)",
                            overlayColor: "rgba(0, 0, 0, 0.65)",
                            showProgress: false,
                            overlayClickAction: "close",
                            dismissKeyAction: "close",
                            blockTargetInteraction: false,
                            buttons: ['back', 'close', 'primary', 'skip'],
                            offset: 12,
                            arrowSize: 16,
                            arrowBase: 32,
                            skipBeacon: true,
                            targetWaitTimeout: 2000,
                            scrollOffset: 120,
                            spotlightPadding: 8,
                            spotlightRadius: 12,
                        }}
                        floatingOptions={{
                            flipOptions: {
                                fallbackPlacements: ['bottom', 'top', 'right', 'left'],
                                padding: 16,
                            },
                            shiftOptions: {
                                padding: 16,
                                crossAxis: true,
                            },
                        }}
                        styles={{
                            spotlight: {
                                stroke: "var(--save-bg-color, #1A82F4)",
                                strokeWidth: 2,
                                fill: "transparent",
                            },
                        }}
                    />
                </div>
            )}
        </>
    );
};
