/**
 * TourRegistry manages all tour configurations dynamically.
 * Tours can be registered at boot time or lazily loaded.
 */
class TourRegistry {
    constructor() {
        this.tours = new Map();
    }

    /**
     * Register a new tour configuration
     * @param {Object} config - The tour configuration object
     */
    register(config) {
        if (!config || !config.id) {
            console.warn("Tour registration failed: Invalid config or missing ID.");
            return;
        }
        this.tours.set(config.id, config);
    }

    /**
     * Register multiple tours at once
     * @param {Array<Object>} configs 
     */
    registerAll(configs) {
        configs.forEach(config => this.register(config));
    }

    /**
     * Get a tour configuration by ID
     * @param {string} id 
     * @returns {Object|undefined}
     */
    getTour(id) {
        return this.tours.get(id);
    }

    /**
     * Get all registered tour IDs
     * @returns {Array<string>}
     */
    getAllTourIds() {
        return Array.from(this.tours.keys());
    }
}

export const tourRegistry = new TourRegistry();
