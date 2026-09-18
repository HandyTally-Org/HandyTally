import { useCallback, useRef, type DependencyList } from 'react';
import { useFocusEffect } from 'expo-router';

// HT-13: every screen loads its rows once, in a mount-only effect, and the
// drawer keeps a screen mounted after the first visit. Saving on a detail
// page and coming back therefore showed the list as it was before the save
// until a manual reload. Screens call this instead of the mount effect: the
// loader runs when the screen first gains focus and again every time the
// user navigates back to it.
//
// The loader is read through a ref so the callback always sees the latest
// render's closure (state guards, ids) without re-running the effect while
// the screen stays focused; `deps` names the values whose change should
// trigger a reload in place, such as the route's `id`.
export function useRefreshOnFocus(refresh: () => unknown, deps: DependencyList = []): void {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useFocusEffect(
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useCallback(() => {
      refreshRef.current();
    }, deps)
  );
}
