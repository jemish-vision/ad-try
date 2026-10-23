import { useContext, useMemo } from "react";
import { ProfileContext } from "../usecontext/useContext";

/**
 * Hook to determine if the currently active Amazon profile has its
 * Selling Partner (SP) API account connected (isSpSyncEnabled === true).
 *
 * @returns {{
 *   isConnected: boolean,
 *   isLoaded: boolean,
 *   profile: object | null,
 *   profileId: number | string | null
 * }}
 */
export const useSpConnection = () => {
    const { selectedConfig, profileData, profileId } = useContext(ProfileContext);

    const result = useMemo(() => {
        // 1. Context selectedConfig profile
        const contextProfile = selectedConfig?.profile;

        // 2. localStorage fallback
        let storedProfile = null;
        try {
            const raw = localStorage.getItem("profile");
            if (raw) {
                const parsed = JSON.parse(raw);
                storedProfile = parsed?.profile || null;
            }
        } catch (e) {}

        // 3. Match from profileData list if available
        const currentProfileId = profileId?.value || contextProfile?.profileId || storedProfile?.profileId;
        const listMatch = profileData?.profiles?.find(
            (p) => String(p.profileId) === String(currentProfileId)
        );

        const activeProfile = listMatch || contextProfile || storedProfile;
        const isLoaded = Boolean(activeProfile && currentProfileId);
        const isConnected = Boolean(activeProfile?.isSpSyncEnabled === true);

        return {
            isConnected,
            isLoaded,
            profile: activeProfile,
            profileId: currentProfileId || null,
        };
    }, [selectedConfig, profileData, profileId]);

    return result;
};

export default useSpConnection;
