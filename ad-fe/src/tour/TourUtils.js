/**
 * Utility functions for the Tour System
 */

/**
 * Smoothly scroll to a given DOM element.
 * @param {HTMLElement} element
 * @param {number} offset
 */
export const smoothScrollTo = (element, offset = 120) => {
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const targetY = window.scrollY + rect.top - offset;
    window.scrollTo({ top: targetY, behavior: "smooth" });
};

/**
 * Wait for a DOM element to exist.
 * @param {string} selector
 * @param {number} timeout
 * @returns {Promise<HTMLElement>}
 */
export const waitForElement = (selector, timeout = 5000) => {
    return new Promise((resolve, reject) => {
        const el = document.querySelector(selector);
        if (el) {
            return resolve(el);
        }

        const observer = new MutationObserver((mutations, me) => {
            const found = document.querySelector(selector);
            if (found) {
                me.disconnect();
                resolve(found);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
        });

        if (timeout > 0) {
            setTimeout(() => {
                observer.disconnect();
                reject(new Error(`Timeout waiting for element: ${selector}`));
            }, timeout);
        }
    });
};

/**
 * Parse step target which might be a string selector or a function/promise
 */
export const resolveTarget = async (target, timeout = 5000) => {
    if (typeof target === 'string') {
        try {
            return await waitForElement(target, timeout);
        } catch (error) {
            console.warn(error.message);
            return null;
        }
    }
    return target;
};
