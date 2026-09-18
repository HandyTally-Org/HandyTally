// HT-41: which build is this?
//
// CI (.github/workflows/build-web.yml) sets EXPO_PUBLIC_APP_VERSION to the
// release tag (`v1.5.0`) for a tagged build and to `master-<sha7>` for a demo
// build, plus EXPO_PUBLIC_BUILD_SHA. Expo inlines EXPO_PUBLIC_* at export
// time, so these are constants in the bundle; the same values are written to
// dist/release.json for scripts. A local `expo start` has neither and shows
// `dev`.
//
// The release *channel* (demo / prod / customer) is not a build property: the
// same bundle is promoted from prod to a customer host unchanged. It comes
// from the hostname, see releaseChannel() in lib/tenant.ts.

export const APP_VERSION: string = process.env.EXPO_PUBLIC_APP_VERSION || 'dev';
export const BUILD_SHA: string = process.env.EXPO_PUBLIC_BUILD_SHA || '';

const RELEASE_TAG = /^v\d+\.\d+\.\d+$/;

/** True for a tagged release build (`v1.5.0`); false for `master-3f2a1c9` and `dev`. */
export function isReleaseVersion(version: string = APP_VERSION): boolean {
  return RELEASE_TAG.test(version);
}

/**
 * The footer text: `v1.5.0 · prod`, `v1.5.0 · wgelectricus`,
 * `master-3f2a1c9 · demo`, or just the version where the host has no channel
 * (localhost, the apex).
 */
export function formatVersionLabel(version: string, channelLabel: string | null | undefined): string {
  return channelLabel ? `${version} · ${channelLabel}` : version;
}
