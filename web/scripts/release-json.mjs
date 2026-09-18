// HT-41: describe the bundle that was just exported.
//
// Writes dist/release.json next to the static export so that scripts, the
// promote guard and a curious human can ask any host what it is running:
//
//   curl -s https://prod.handytally.com/release.json
//   { "version": "v1.5.0", "sha": "3f2a1c9…", "builtAt": "2026-09-20T14:03:11Z" }
//
// CI sets EXPO_PUBLIC_APP_VERSION (the tag, or master-<sha7> for demo builds)
// and EXPO_PUBLIC_BUILD_SHA before `expo export`; the same values are inlined
// into the bundle for the drawer footer. Run after the export:
//
//   npx expo export --platform web && node scripts/release-json.mjs
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
if (!existsSync(dist)) mkdirSync(dist, { recursive: true });

const release = {
  version: process.env.EXPO_PUBLIC_APP_VERSION || 'dev',
  sha: process.env.EXPO_PUBLIC_BUILD_SHA || '',
  builtAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
};

const target = path.join(dist, 'release.json');
writeFileSync(target, JSON.stringify(release, null, 2) + '\n');
console.log(`wrote ${path.relative(process.cwd(), target)}: ${release.version} (${release.sha || 'no sha'})`);
