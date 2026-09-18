import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { Colors, type ThemeScheme, type ThemeTokens } from '../constants/Colors';
import { useAuth } from './AuthContext';

// HT-68: which of the two token sets applies. The organisation's Settings row
// decides (organization_settings.theme, saved on Admin > Settings >
// Appearance) and the choice covers every member; the OS colour scheme is not
// consulted. On web the provider publishes the choice as data-theme on
// <html>, which is what styles/theme.css keys the CSS variables on, so every
// `themed.x` style follows without a re-render. Paper and the navigation
// container get their themes from useAppTheme() in app/_layout.tsx.
//
// The saved theme arrives with the settings row, after sign-in and the
// membership lookup. To spare a returning user a light flash on every reload
// the last saved scheme is kept in localStorage and applied right after
// mount, until the row confirms or corrects it. The static render and the
// first client render are always light, so hydration matches.

export const THEME_CACHE_KEY = 'ht.theme';

export type AppTheme = {
  scheme: ThemeScheme;
  dark: boolean;
  /** The hex tokens of the active scheme, for Paper props and themes. */
  colors: ThemeTokens;
};

const LIGHT: AppTheme = { scheme: 'light', dark: false, colors: Colors.light };

const ThemeContext = createContext<AppTheme>(LIGHT);

// useLayoutEffect warns on the server; it never runs there anyway.
const useClientLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

function readCachedScheme(): ThemeScheme | null {
  try {
    const value = window.localStorage.getItem(THEME_CACHE_KEY);
    return value === 'dark' || value === 'light' ? value : null;
  } catch {
    return null;
  }
}

function writeCachedScheme(scheme: ThemeScheme) {
  try {
    window.localStorage.setItem(THEME_CACHE_KEY, scheme);
  } catch {
    // Private windows and blocked storage: the flash comes back, nothing else.
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { organization, settings, settingsLoaded } = useAuth();
  const [cached, setCached] = useState<ThemeScheme | null>(null);

  useClientLayoutEffect(() => {
    setCached(readCachedScheme());
  }, []);

  // Only a row read for an organisation counts; the defaults a signed-out
  // visitor gets must not overwrite the cache.
  const saved = settingsLoaded && organization ? settings.theme : null;
  const scheme: ThemeScheme = saved ?? cached ?? 'light';

  useEffect(() => {
    if (saved) writeCachedScheme(saved);
  }, [saved]);

  useClientLayoutEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-theme', scheme);
  }, [scheme]);

  const value = useMemo<AppTheme>(
    () => (scheme === 'dark' ? { scheme, dark: true, colors: Colors.dark } : LIGHT),
    [scheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** The active scheme and its hex tokens. Light outside a ThemeProvider. */
export function useAppTheme(): AppTheme {
  return useContext(ThemeContext);
}
