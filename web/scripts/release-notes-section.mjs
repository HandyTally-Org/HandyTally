// HT-41: print the GitHub Release body for one tag.
//
//   node web/scripts/release-notes-section.mjs v1.5.0 > release-body.md
//
// The body is the tag's section of RELEASE_NOTES.md (customer-facing) plus a
// link to the technical CHANGELOG.md at that tag. When RELEASE_NOTES.md has
// no section for the tag the body says so instead of failing: a missing note
// is a release-PR mistake to fix in the file, not a reason to leave prod
// without the build.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { findRelease } from './lib/releaseNotes.mjs';

const tag = process.argv[2];
if (!tag) {
  console.error('usage: release-notes-section.mjs <tag>');
  process.exit(2);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const notesPath = path.join(root, 'RELEASE_NOTES.md');
const repo = process.env.GITHUB_REPOSITORY || 'HandyTally-Org/HandyTally';
const changelog = `https://github.com/${repo}/blob/${tag}/CHANGELOG.md`;

let body;
const release = existsSync(notesPath) ? findRelease(readFileSync(notesPath, 'utf8'), tag) : null;
if (release && release.body) {
  body = release.date ? `_${release.date}_\n\n${release.body}` : release.body;
} else {
  body = `No customer-facing notes were written for ${tag} in RELEASE_NOTES.md.`;
  console.error(`warning: ${body}`);
}

process.stdout.write(`${body}\n\n---\n\nTechnical changelog: ${changelog}\n`);
