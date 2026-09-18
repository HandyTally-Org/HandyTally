import { useAppTheme } from '@/contexts/ThemeContext';

// HT-68: the organisation's theme, not the OS scheme (contexts/ThemeContext.tsx).
export function useColorScheme(): 'light' | 'dark' {
  return useAppTheme().scheme;
}
