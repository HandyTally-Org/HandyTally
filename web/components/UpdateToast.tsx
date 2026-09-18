import { useEffect, useState } from 'react';
import { Portal, Snackbar } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { APP_VERSION, isReleaseVersion } from '../constants/release';

// HT-41: "Updated to v1.5.0 · What's new" once, on the first load after a
// host has been promoted to a new release.
//
// The last version this browser saw is kept in localStorage. Nothing is shown
// on the very first visit (there is nothing to compare with), on demo or
// local builds (no release to announce), or when storage is unavailable.
// Mount once inside the Paper tree; the (app) layout does.
const STORAGE_KEY = 'handytally.lastSeenVersion';

export function UpdateToast() {
  const [visible, setVisible] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!isReleaseVersion() || typeof window === 'undefined') return;
    let previous: string | null = null;
    try {
      previous = window.localStorage.getItem(STORAGE_KEY);
      window.localStorage.setItem(STORAGE_KEY, APP_VERSION);
    } catch {
      return;
    }
    if (previous && previous !== APP_VERSION) setVisible(true);
  }, []);

  return (
    <Portal>
      <Snackbar
        visible={visible}
        onDismiss={() => setVisible(false)}
        duration={8000}
        action={{
          label: "What's new",
          onPress: () => {
            setVisible(false);
            router.push('/whats-new');
          },
        }}
      >
        {`HandyTally was updated to ${APP_VERSION}`}
      </Snackbar>
    </Portal>
  );
}
