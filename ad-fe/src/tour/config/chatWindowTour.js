import { tourRegistry } from '../TourRegistry';
import { Headset, X } from '@phosphor-icons/react';

export const chatWindowTourConfig = {
    id: "chat-window",
    title: "Help & Support",
    steps: [
        { target: "#chat-window", icon: Headset, title: "Chat Support", content: "You can interact with our smart chatbot here to find answers instantly, or connect with a support agent.", placement: "left", blockTargetInteraction: true },
        { target: "#chat-close-btn", icon: X, title: "Close Window", content: "Click here to close the support window when you're finished.", placement: "bottom", requireClick: true }
    ]
};

tourRegistry.register(chatWindowTourConfig);
