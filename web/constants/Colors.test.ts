import { readFileSync } from 'fs';
import { join } from 'path';
import { Colors, THEME_TOKEN_KEYS, cssVariableName, themed } from './Colors';

// HT-68: styles/theme.css is the stylesheet copy of Colors.ts, so the static
// page is styled before the bundle loads. Keep the two equal.

function cssBlock(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  expect(start).toBeGreaterThanOrEqual(0);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  const vars: Record<string, string> = {};
  for (const match of body.matchAll(/(--ht-[a-z-]+)\s*:\s*([^;]+);/g)) {
    vars[match[1]] = match[2].trim().toLowerCase();
  }
  return vars;
}

describe('theme.css mirrors Colors.ts', () => {
  const css = readFileSync(join(__dirname, '..', 'styles', 'theme.css'), 'utf8');

  it.each([
    ['light', ':root {'],
    ['dark', ':root[data-theme="dark"]'],
  ] as const)('%s set', (scheme, selector) => {
    const expected = Object.fromEntries(THEME_TOKEN_KEYS.map(key => [cssVariableName(key), Colors[scheme][key].toLowerCase()]));
    expect(cssBlock(css, selector)).toEqual(expected);
  });
});

describe('themed', () => {
  it('names every token', () => {
    expect(Object.keys(themed)).toEqual(THEME_TOKEN_KEYS);
  });

  it('turns camelCase keys into kebab-case custom properties', () => {
    expect(cssVariableName('navDashboard')).toBe('--ht-nav-dashboard');
    expect(cssVariableName('bg')).toBe('--ht-bg');
  });
});
