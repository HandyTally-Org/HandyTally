import { Component, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Props = { children: ReactNode };
type State = { error: Error | null };

// HT-73: a throw anywhere in the render tree used to unmount the whole app to
// a blank page (no boundary existed). This is the root net; it renders fixed
// colours rather than `useAppTheme()` so it still works if the crash came
// from inside the theme/auth providers it wraps.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('Unhandled render error', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>{this.state.error.message}</Text>
          <Text style={styles.hint}>Reload the page to try again.</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#ffffff',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: '#6b6f76',
    textAlign: 'center',
    marginBottom: 16,
  },
  hint: {
    fontSize: 13,
    color: '#9aa1ab',
  },
});
