// HT-41: parse RELEASE_NOTES.md (repository root) into release sections.
//
// The file is customer-facing and hand-written. Each release is one level-2
// heading in the form
//
//   ## v1.5.0 — 2026-09-20
//
// (a leading `v` is optional and an em dash, en dash or hyphen may separate
// the version from the date). Everything below the heading, up to the next
// level-2 heading, is that release's body, in Markdown. Text above the first
// release heading (title, intro) is ignored.
//
// Shared by release-notes-section.mjs (the GitHub Release body) and by the
// generator that feeds the in-app What's new page, so both read one source.

const HEADING = /^##\s+v?(\d+\.\d+\.\d+)\s*(?:[—–-]\s*(\S.*?))?\s*$/;

/**
 * @param {string} markdown
 * @returns {{ version: string, date: string | null, body: string }[]}
 *   In file order (newest first by convention). `version` always carries
 *   the `v` prefix.
 */
export function parseReleaseNotes(markdown) {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const sections = [];
  let current = null;
  for (const line of lines) {
    const match = line.match(HEADING);
    if (match) {
      current = { version: `v${match[1]}`, date: match[2] ? match[2].trim() : null, body: [] };
      sections.push(current);
    } else if (current) {
      current.body.push(line);
    }
  }
  return sections.map(section => ({ ...section, body: section.body.join('\n').trim() }));
}

/** The section for one tag (`v1.5.0` or `1.5.0`), or null. */
export function findRelease(markdown, tag) {
  const wanted = tag.startsWith('v') ? tag : `v${tag}`;
  return parseReleaseNotes(markdown).find(section => section.version === wanted) ?? null;
}
