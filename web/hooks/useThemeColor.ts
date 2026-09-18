import type { ThemeTokens } from '@/constants/Colors';
import { useAppTheme } from '@/contexts/ThemeContext';

/** A token of the active theme, unless the caller names a colour for that scheme. */
export function useThemeColor(props: { light?: string; dark?: string }, colorName: keyof ThemeTokens) {
  const { scheme, colors } = useAppTheme();
  return props[scheme] ?? colors[colorName];
}
