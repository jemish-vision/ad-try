import { useEffect } from 'react';
import { tourRegistry } from '../TourRegistry';

/**
 * Hook to dynamically register a tour configuration.
 * Useful for lazy-loaded modules.
 */
export const useRegisterTour = (config) => {
    useEffect(() => {
        if (config && config.id) {
            tourRegistry.register(config);
        }
    }, [config]);
};
