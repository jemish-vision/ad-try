// Keep restored selections consistent with the profiles visible in the header.
export const isProfileAvailable = (profile) => {
    const adsActive = profile.isAdsActive ?? (profile.isAdsSyncEnabled !== false);
    const spActive = profile.isSpActive ?? (profile.isSpSyncEnabled === true);
    return adsActive || spActive;
};

export const getAvailableProfileGroups = (list = []) => list
    .map(config => ({ ...config, profiles: (config.profiles || []).filter(isProfileAvailable) }))
    .filter(config => config.profiles.length > 0);

export const resolveProfileSelection = (list, stored) => {
    const groups = getAvailableProfileGroups(list);
    const savedConfigId = stored?.config?.configId ?? stored?.config?._id;
    const config = groups.find(cfg => String(cfg.configId ?? cfg._id) === String(savedConfigId)
        && cfg.profiles.some(p => String(p.profileId) === String(stored?.profile?.profileId)));
    if (config) {
        return { config, profile: config.profiles.find(p => String(p.profileId) === String(stored.profile.profileId)) };
    }
    const defaultConfig = groups.find(cfg => cfg.profiles.some(p => p.isFavorite)) ?? groups[0];
    return defaultConfig ? {
        config: defaultConfig,
        profile: defaultConfig.profiles.find(p => p.isFavorite) ?? defaultConfig.profiles[0],
    } : null;
};
