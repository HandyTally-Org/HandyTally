import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

// HT-25: hand a CSV to the user the same two ways utils/excel.ts hands over a
// workbook: a download in the browser, the share sheet on a phone. The text is
// written with a UTF-8 BOM so Excel (which the bookkeeper will open the file
// in to check it) reads accents correctly; QuickBooks ignores the BOM.

const CSV_MIME = 'text/csv';
const BOM = '﻿';

export async function exportCsv(fileName: string, text: string): Promise<void> {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([BOM + text], { type: `${CSV_MIME};charset=utf-8` }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
    return;
  }

  const uri = `${FileSystem.cacheDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(uri, BOM + text, { encoding: FileSystem.EncodingType.UTF8 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: CSV_MIME, dialogTitle: fileName, UTI: 'public.comma-separated-values-text' });
  }
}
