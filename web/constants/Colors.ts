import { Platform } from 'react-native';

// HT-68: the app's colour tokens, one set per theme, from the approved
// mockup. The organisation's Settings row picks which set applies
// (organization_settings.theme, saved on Admin > Settings > Appearance and
// read by contexts/ThemeContext.tsx); the OS colour scheme is not consulted.
//
// Two ways to consume a token:
//
//   Colors[scheme].x   The hex value. For anything that is not a style: the
//                      Paper and navigation themes (constants/paperTheme.ts)
//                      and the props Paper runs through the `color` package
//                      (textColor, iconColor, buttonColor), which throw on a
//                      CSS var(). `scheme` comes from useAppTheme().
//
//   themed.x           A reference that follows the active theme by itself,
//                      for StyleSheet.create() blocks, inline styles and the
//                      colour prop of @expo/vector-icons glyphs. On web it is
//                      `var(--ht-x)`, which react-native-web passes through
//                      to the browser, resolved from styles/theme.css; the
//                      ThemeProvider switches the set by putting data-theme
//                      on <html>, so a static StyleSheet re-skins without a
//                      re-render. Elsewhere it is the light value (dark mode
//                      is web-only until the native apps exist, HT-9 / HT-20).
//
// styles/theme.css carries the same values; constants/Colors.test.ts fails
// when the two drift.

export type ThemeScheme = 'light' | 'dark';

export const THEME_SCHEMES: readonly ThemeScheme[] = ['light', 'dark'];

/** One token set. A key becomes a CSS custom property: `navJobs` is `--ht-nav-jobs`. */
export type ThemeTokens = {
  /** Page background. */
  bg: string;
  /** Sidebar, detail rails, cards, dialogs, table bodies. */
  panel: string;
  /** Selected row. */
  active: string;
  /** Table header rows, search bars, hover fills. */
  soft: string;
  /** Borders and dividers. */
  line: string;
  /** Labels, headings, body text. */
  text: string;
  /** Captions, group headers, secondary text. */
  muted: string;
  /** Disabled and placeholder text. */
  faint: string;
  /** Contained buttons and the on-state of switches. */
  primary: string;
  /** Text on `primary`. */
  onPrimary: string;
  // Sidebar icons. Admin's children share navAdmin. The hues line up with the
  // Category colours on the DevIssues board, so the same colour means the
  // same module in the tracker and the app.
  navDashboard: string;
  navSchedule: string;
  navJobs: string;
  navInvoices: string;
  navLabor: string;
  navInventory: string;
  navClients: string;
  navAdmin: string;
  // Detail-rail icons. Info takes navDashboard; Invoices and Jobs reuse the
  // sidebar hues.
  railCosts: string;
  railNotes: string;
  railLogs: string;
};

export const Colors: Record<ThemeScheme, ThemeTokens> = {
  light: {
    bg: '#ffffff',
    panel: '#ffffff',
    active: '#e7e9ec',
    soft: '#f5f5f5',
    line: '#e6e7e9',
    text: '#202124',
    muted: '#6b6f76',
    faint: '#9ca3af',
    primary: '#444444',
    onPrimary: '#ffffff',
    navDashboard: '#5b6acf',
    navSchedule: '#8a5bd6',
    navJobs: '#e08a2e',
    navInvoices: '#2e9e6b',
    navLabor: '#c9971a',
    navInventory: '#9c6b3f',
    navClients: '#2f80c7',
    navAdmin: '#c94a5a',
    railCosts: '#1f9a8f',
    railNotes: '#d1a22a',
    railLogs: '#6b7a8c',
  },
  dark: {
    bg: '#16181d',
    panel: '#1c1f26',
    active: '#2c313a',
    soft: '#20242b',
    line: '#2e333c',
    text: '#e8eaee',
    muted: '#9aa1ab',
    faint: '#6e7683',
    primary: '#c9ccd1',
    onPrimary: '#16181d',
    navDashboard: '#8d99ee',
    navSchedule: '#b394ec',
    navJobs: '#f0a95a',
    navInvoices: '#5cc493',
    navLabor: '#e2b640',
    navInventory: '#c9976a',
    navClients: '#6fb1e8',
    navAdmin: '#e37c8a',
    railCosts: '#4fc2b6',
    railNotes: '#e8bf4a',
    railLogs: '#9aa9bb',
  },
};

export const THEME_TOKEN_KEYS = Object.keys(Colors.light) as (keyof ThemeTokens)[];

/** The CSS custom property a token is published as: `navJobs` -> `--ht-nav-jobs`. */
export function cssVariableName(key: keyof ThemeTokens): string {
  return `--ht-${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`;
}

/** Every token as a `var()` reference on web, or its light value elsewhere. */
export const themed: ThemeTokens = Object.fromEntries(
  THEME_TOKEN_KEYS.map(key => [key, Platform.OS === 'web' ? `var(${cssVariableName(key)})` : Colors.light[key]]),
) as ThemeTokens;
