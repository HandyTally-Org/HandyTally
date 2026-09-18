import { DarkTheme, DefaultTheme, type Theme as NavigationTheme } from '@react-navigation/native';
import { MD3DarkTheme, MD3LightTheme, type MD3Theme } from 'react-native-paper';
import { Colors, type ThemeScheme } from './Colors';

// HT-68: the react-native-paper and react-navigation themes for a scheme,
// built from the same tokens as styles/theme.css so Paper's Text, Card,
// DataTable, TextInput, Dialog and Switch land on the same surfaces as the
// hand-styled views around them. Material's dark elevation tints are replaced
// by the flat panel colour of the mockup.

export function paperThemeFor(scheme: ThemeScheme): MD3Theme {
  const base = scheme === 'dark' ? MD3DarkTheme : MD3LightTheme;
  const c = Colors[scheme];
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: c.primary,
      onPrimary: c.onPrimary,
      primaryContainer: c.primary,
      onPrimaryContainer: c.onPrimary,
      background: c.bg,
      onBackground: c.text,
      surface: c.panel,
      onSurface: c.text,
      surfaceVariant: c.active,
      onSurfaceVariant: c.muted,
      outline: scheme === 'dark' ? c.muted : base.colors.outline,
      outlineVariant: c.line,
      surfaceDisabled: c.soft,
      onSurfaceDisabled: c.faint,
      elevation: {
        level0: 'transparent',
        level1: c.panel,
        level2: scheme === 'dark' ? '#20242b' : c.panel,
        level3: scheme === 'dark' ? '#242931' : c.panel,
        level4: scheme === 'dark' ? '#262b34' : c.panel,
        level5: scheme === 'dark' ? '#2a2f38' : c.panel,
      },
    },
  };
}

export function navigationThemeFor(scheme: ThemeScheme): NavigationTheme {
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const c = Colors[scheme];
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: c.primary,
      background: c.bg,
      card: c.panel,
      text: c.text,
      border: c.line,
    },
  };
}
