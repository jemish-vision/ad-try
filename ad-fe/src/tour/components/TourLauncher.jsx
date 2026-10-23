import React from 'react';
import { useTranslation } from 'react-i18next';
import { useTour } from '../hooks/useTour';
import { tourRegistry } from '../TourRegistry';

/**
 * UI Component to launch any registered tour manually.
 */
export const TourLauncher = () => {
    const { t } = useTranslation();
    const { startTour, activeTourId } = useTour();
    const allTours = tourRegistry.getAllTourIds();

    return (
        <div className="tour-launcher" style={{ padding: '20px', border: '1px solid #ccc', borderRadius: '8px', background: '#f9f9f9', maxWidth: '300px' }}>
            <h3 style={{ marginTop: 0 }}>{t("Product Tours")}</h3>
            <ul style={{ listStyle: 'none', padding: 0 }}>
                {allTours.map(tourId => (
                    <li key={tourId} style={{ marginBottom: '10px' }}>
                        <button 
                            onClick={() => startTour(tourId)}
                            disabled={activeTourId === tourId}
                            style={{
                                width: '100%',
                                padding: '10px',
                                background: activeTourId === tourId ? '#ccc' : '#2F6FCC',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: activeTourId === tourId ? 'not-allowed' : 'pointer'
                            }}
                        >
                            {t("Start {{tourId}} Tour", { tourId })}
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
};
