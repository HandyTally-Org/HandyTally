import * as React from 'react';
import renderer, { act } from 'react-test-renderer';
import { PaperProvider } from 'react-native-paper';

import { DateTimePickerDialog } from '../DateTimePickerDialog';

// The dialog's icon button pulls in @expo/vector-icons, which checks
// expo-font's native loader on mount; that loader isn't mocked for this
// jest-expo web preset, so it throws before the colour bug this test guards
// against even gets a chance to run.
jest.mock('expo-font', () => ({ isLoaded: () => true, loadAsync: () => Promise.resolve() }));

// HT-73: the picker's Paper colour props must be hex, not the `themed.*` CSS
// var() strings — Paper's colour parser throws on those, and with no error
// boundary in the app that blanks the whole page. A render (not snapshot)
// test catches that class of crash; every other test here is pure-logic and
// none of them render a component, which is how this shipped.
it('opens without throwing', () => {
  jest.useFakeTimers();

  let tree: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <PaperProvider>
        <DateTimePickerDialog
          visible
          title="Start"
          value={null}
          fallback={null}
          onDismiss={() => {}}
          onConfirm={() => {}}
        />
      </PaperProvider>,
    );
  });

  expect(tree!.toJSON()).toBeTruthy();

  // Dialog's mount animation schedules further timers; flush and unmount
  // inside act so nothing fires after the jest environment tears down.
  act(() => {
    jest.runOnlyPendingTimers();
  });
  act(() => {
    tree!.unmount();
  });

  jest.useRealTimers();
});
