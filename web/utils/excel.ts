import { Alert, Platform } from 'react-native';
import * as XLSX from 'xlsx';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { feedback } from '../contexts/FeedbackContext';

// Excel import and export shared by the Clients, Jobs, Invoices, Labor and
// Inventory screens. Files are always .xlsx. In the browser an export is a
// download and an import opens the file picker; on a phone an export opens the
// share sheet and an import uses the document picker.

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const XLS_MIME = 'application/vnd.ms-excel';

export type SheetSpec = {
  /** Tab name inside the workbook. */
  name: string;
  /** One object per row; the keys become the header row. */
  rows: Record<string, unknown>[];
  /** Column widths in characters, in the order the keys appear. */
  columnWidths?: number[];
};

/** Build a workbook from one or more sheets and hand it to the user. */
export async function exportWorkbook(fileName: string, sheets: SheetSpec[]): Promise<void> {
  const workbook = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const worksheet = XLSX.utils.json_to_sheet(sheet.rows);
    if (sheet.columnWidths) worksheet['!cols'] = sheet.columnWidths.map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
  }

  if (Platform.OS === 'web') {
    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const url = URL.createObjectURL(new Blob([buffer], { type: XLSX_MIME }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
    return;
  }

  const base64 = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' });
  const uri = `${FileSystem.cacheDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: XLSX_MIME, dialogTitle: fileName, UTI: 'org.openxmlformats.spreadsheetml.sheet' });
  }
}

/** Let the user choose a spreadsheet and parse it. Resolves null when they cancel. */
export async function pickWorkbook(): Promise<XLSX.WorkBook | null> {
  if (Platform.OS === 'web') {
    const buffer = await pickFileInBrowser();
    return buffer ? XLSX.read(buffer, { type: 'array' }) : null;
  }
  const base64 = await pickFileOnDevice();
  return base64 ? XLSX.read(base64, { type: 'base64' }) : null;
}

function pickFileInBrowser(): Promise<ArrayBuffer | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls,.csv';
    input.style.display = 'none';
    const finish = () => input.remove();
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      finish();
      if (!file) {
        resolve(null);
        return;
      }
      file.arrayBuffer().then(resolve, reject);
    });
    input.addEventListener('cancel', () => {
      finish();
      resolve(null);
    });
    document.body.appendChild(input);
    input.click();
  });
}

async function pickFileOnDevice(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: [XLSX_MIME, XLS_MIME, 'text/csv', 'text/comma-separated-values'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets?.length) return null;
  return FileSystem.readAsStringAsync(result.assets[0].uri, { encoding: FileSystem.EncodingType.Base64 });
}

/**
 * Rows of one sheet as objects keyed by header. Pass the tab names to accept
 * (matched ignoring case); with none, the first tab is used. Returns null when
 * no acceptable tab exists.
 */
export function sheetRows<T extends object = Record<string, unknown>>(workbook: XLSX.WorkBook, ...sheetNames: string[]): T[] | null {
  const wanted = sheetNames.map((name) => name.toLowerCase());
  const name = wanted.length
    ? workbook.SheetNames.find((candidate) => wanted.includes(candidate.toLowerCase()))
    : workbook.SheetNames[0];
  if (!name) return null;
  return XLSX.utils.sheet_to_json<T>(workbook.Sheets[name]);
}

/** True when the first row has a column with this header, ignoring case. */
export function hasColumn(rows: object[], column: string): boolean {
  const first = rows[0];
  if (!first) return false;
  return Object.keys(first).some((key) => key.toLowerCase() === column.toLowerCase());
}

/** A yes/no prompt: the in-app dialog in the browser (HT-85), the native sheet on a phone. */
export function confirmAction(message: string, confirmLabel = 'Continue'): Promise<boolean> {
  if (Platform.OS === 'web') return feedback.confirm({ title: 'Please confirm', message, confirmLabel });
  return new Promise((resolve) => {
    Alert.alert(
      'Please confirm',
      message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: confirmLabel, onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}

/**
 * A spreadsheet date as YYYY-MM-DD, or null when blank. Excel stores a date
 * cell as a day count, which is what a typed-over cell comes back as; text
 * such as "2026-09-15" passes through untouched.
 */
export function toIsoDate(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
  }
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim() || null;
}
