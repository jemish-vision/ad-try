import { tourRegistry } from '../TourRegistry';
import {
    ListBullets, Lightbulb, Table, CheckCircle, XCircle
} from '@phosphor-icons/react';

export const recommandationTourConfig = {
    id: "recommandation",
    title: "Recommendation Tour",
    steps: [
        { target: "#recommandation-header", icon: Lightbulb, title: "Recommendations", content: "Actionable insights based on your campaign performance.", blockTargetInteraction: true },
        { target: "#recommendation-item-0", icon: ListBullets, title: "Available Recommendations", content: "Click on any recommendation in this list to view its details and apply the suggested changes.", childTourId: "apply-recommandation" }
    ]
};

export const applyRecommandationTourConfig = {
    id: "apply-recommandation",
    title: "Apply Recommendation Tour",
    steps: [
        { target: "#recommandation-modal", icon: Lightbulb, title: "Recommendation Details", content: "Here you can review exactly what changes will be made to your campaigns.", blockTargetInteraction: true },
        { target: "#recommandation-modal-grid", icon: Table, title: "Impacted Items", content: "Review the specific items that will be affected and select which ones you want to apply the recommendation to.", blockTargetInteraction: true },
        { target: "#recommandation-apply", icon: CheckCircle, title: "Apply Changes", content: "Click here to execute the recommended changes on your selected items.", blockTargetInteraction: true },
        { target: "#recommandation-modal-close", icon: XCircle, title: "Close Window", content: "Click here to close the details window without making changes.", requireClick: true }
    ]
};

tourRegistry.register(recommandationTourConfig);
tourRegistry.register(applyRecommandationTourConfig);
