import { resolveProfileSelection, getAvailableProfileGroups } from './profileSelection';

const paused = { profileId: 1, name: 'CHAKUDEE', isAdsSyncEnabled: false, isSpSyncEnabled: false, isFavorite: true };
const enabled = { profileId: 2, name: 'TOPLOT', isAdsActive: true };
const groups = [{ configId: 'a', profiles: [paused, enabled] }];

test('disabled saved favorite falls back to an enabled profile', () => {
    expect(resolveProfileSelection(groups, { config: { configId: 'a' }, profile: paused }).profile).toBe(enabled);
    expect(getAvailableProfileGroups(groups)[0].profiles).toEqual([enabled]);
});

test('restores fresh profile data, preserving config identity with duplicate profile IDs', () => {
    const fresh = { ...enabled, name: 'Updated' };
    const list = [...groups, { configId: 'b', profiles: [fresh] }];
    expect(resolveProfileSelection(list, { config: { configId: 'b' }, profile: enabled })).toEqual({ config: list[1], profile: fresh });
});

test('seller-enabled profile remains available when ads are paused', () => {
    const seller = { ...paused, isAdsActive: false, isSpActive: true };
    expect(resolveProfileSelection([{ configId: 'a', profiles: [seller] }], null).profile).toBe(seller);
});

test('explicit inactive flags override legacy defaults', () => {
    expect(resolveProfileSelection([{ configId: 'a', profiles: [{ ...enabled, isAdsActive: false, isSpActive: false }] }], null)).toBeNull();
});

test('all disabled or no profiles clears selection', () => {
    expect(resolveProfileSelection([{ configId: 'a', profiles: [paused] }], { profile: paused })).toBeNull();
    expect(resolveProfileSelection([], null)).toBeNull();
});

test('favorite enabled profile is preferred and legacy profiles remain supported', () => {
    const favorite = { profileId: 3, isFavorite: true };
    expect(resolveProfileSelection([...groups, { configId: 'b', profiles: [favorite] }], null).profile).toBe(favorite);
});
