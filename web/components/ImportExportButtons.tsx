import { View, StyleSheet } from 'react-native';
import { IconButton, Tooltip } from 'react-native-paper';

// The Excel export and import buttons that sit next to the Add button on the
// list screens. One place so every screen gets the same icons, colours and
// hover labels.

type ImportExportButtonsProps = {
  onExport: () => void;
  onImport: () => void;
  disabled?: boolean;
  exportLabel?: string;
  importLabel?: string;
};

export function ImportExportButtons({
  onExport,
  onImport,
  disabled = false,
  exportLabel = 'Export to Excel',
  importLabel = 'Import from Excel',
}: ImportExportButtonsProps) {
  return (
    <View style={styles.row}>
      <Tooltip title={exportLabel}>
        <IconButton
          icon="file-export"
          mode="contained"
          onPress={onExport}
          disabled={disabled}
          iconColor="#fff"
          containerColor="#4CAF50"
          size={20}
          accessibilityLabel={exportLabel}
        />
      </Tooltip>
      <Tooltip title={importLabel}>
        <IconButton
          icon="file-import"
          mode="contained"
          onPress={onImport}
          disabled={disabled}
          iconColor="#fff"
          containerColor="#2196F3"
          size={20}
          accessibilityLabel={importLabel}
        />
      </Tooltip>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
});
