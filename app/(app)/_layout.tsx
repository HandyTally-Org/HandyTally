import { Stack } from 'expo-router';
import { PaperProvider, MD3LightTheme } from 'react-native-paper';
import { Sidebar } from '../../components/Sidebar';
import { View, StyleSheet } from 'react-native';

// Create a custom theme with dark gray primary color
const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#444444',
    onPrimary: 'white',
    primaryContainer: '#444444',
    onPrimaryContainer: 'white',
  },
};

export default function AppLayout() {
  return (
    <PaperProvider theme={theme}>
      <View style={styles.container}>
        <Sidebar />
        <View style={styles.content}>
          <Stack screenOptions={{ headerShown: false }} />
        </View>
      </View>
    </PaperProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
  },
  content: {
    flex: 1,
  },
}); 