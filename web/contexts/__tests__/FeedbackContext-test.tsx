import * as React from 'react';
import renderer, { act } from 'react-test-renderer';
import { PaperProvider } from 'react-native-paper';

import { FeedbackHost, FeedbackProvider, feedback } from '../FeedbackContext';

jest.mock('expo-font', () => ({ isLoaded: () => true, loadAsync: () => Promise.resolve() }));

// HT-85: utils/excel.ts asks through the `feedback` bridge rather than a
// hook, so the bridge must reach the mounted provider's dialog and resolve
// with the user's answer; before the provider mounts it falls back to the
// browser's own confirm() so nothing is silently swallowed.
describe('feedback bridge', () => {
  it('falls back to window.confirm when no provider is mounted', async () => {
    const original = window.confirm;
    window.confirm = jest.fn(() => true);
    await expect(feedback.confirm({ title: 'Please confirm', message: 'Import 3 rows?' })).resolves.toBe(true);
    expect(window.confirm).toHaveBeenCalledWith('Please confirm\n\nImport 3 rows?');
    window.confirm = original;
  });

  it('opens the in-app dialog once the provider is mounted and resolves on the answer', async () => {
    jest.useFakeTimers();
    const original = window.confirm;
    window.confirm = jest.fn(() => true);

    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <FeedbackProvider>
          <PaperProvider>
            <FeedbackHost />
          </PaperProvider>
        </FeedbackProvider>,
      );
    });

    let answer: Promise<boolean>;
    act(() => {
      answer = feedback.confirm({ title: 'Please confirm', message: 'Import 3 rows?', confirmLabel: 'Import' });
    });
    expect(window.confirm).not.toHaveBeenCalled();

    const texts = tree!.root.findAllByProps({ children: 'Import 3 rows?' });
    expect(texts.length).toBeGreaterThan(0);

    const importButton = tree!.root.findAll(node => node.props.children === 'Import' && typeof node.props.onPress === 'function')[0];
    act(() => {
      importButton.props.onPress();
    });
    await expect(answer!).resolves.toBe(true);

    act(() => {
      jest.runOnlyPendingTimers();
      tree!.unmount();
    });
    jest.useRealTimers();
    window.confirm = original;
  });
});
