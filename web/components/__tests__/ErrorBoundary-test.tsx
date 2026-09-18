import * as React from 'react';
import renderer from 'react-test-renderer';
import { Text } from 'react-native';

import { ErrorBoundary } from '../ErrorBoundary';

function Bomb(): React.ReactElement {
  throw new Error('boom');
}

it('renders the error card instead of unmounting the tree', () => {
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

  const tree = renderer.create(
    <ErrorBoundary>
      <Bomb />
    </ErrorBoundary>,
  );

  expect(tree.toJSON()).toBeTruthy();
  expect(renderer.create(<ErrorBoundary>{<Text>ok</Text>}</ErrorBoundary>).toJSON()).toBeTruthy();

  spy.mockRestore();
});
