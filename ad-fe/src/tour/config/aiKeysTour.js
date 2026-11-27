import { tourRegistry } from '../TourRegistry';
import { Key, ShieldCheck, ToggleLeft, Wallet, Lock } from '@phosphor-icons/react';

export const aiKeysTourConfig = {
    id: "ai-keys",
    title: "AI API Keys Tour",
    steps: [
        { target: "#ai-keys-mode", icon: ShieldCheck, title: "How AI Requests Are Paid", content: "Choose whether AI features run on your organization's own provider keys (no AI credits used) or on the platform's keys with AI credits.", blockTargetInteraction: true },
        { target: "#ai-keys-use-own", icon: ToggleLeft, title: "Use Our Own API Keys", content: "The organization owner turns this on once at least one key is saved. Each feature keeps the AI model it uses today; only the key changes.", blockTargetInteraction: true },
        { target: "#ai-keys-wallet-fallback", icon: Wallet, title: "Credits as a Backup", content: "Off by default: if a key is missing, rejected or out of quota, the request stops and nothing is charged. Turn it on to use AI credits in that case instead.", blockTargetInteraction: true },
        { target: "#ai-keys-providers", icon: Key, title: "Provider Keys", content: "Add, replace, check or remove the key for each provider. Every key is checked with the provider before it is saved, and its status shows here.", blockTargetInteraction: true },
        { target: "#ai-keys-security", icon: Lock, title: "Kept Safe", content: "Keys are stored encrypted and never shown again; only the last 4 characters are displayed. Requests on your keys are still listed in AI Credits, marked \"Your key\".", blockTargetInteraction: true }
    ]
};

tourRegistry.register(aiKeysTourConfig);
