// HT-47: the pure part of Company > Documents. A document is one
// company_attachments row with is_logo = false: a label, free-text details
// and an optional attached file kept as base64 in file_data. The editor
// holds a draft of rows and saves the difference against what was loaded;
// everything here is plain data so it can be tested without React or
// Supabase.

/** Largest file the Documents section accepts. Base64 in a text column, so keep it modest. */
export const MAX_DOCUMENT_FILE_BYTES = 2 * 1024 * 1024;

export type CompanyDocumentRow = {
  /** company_attachments.id, or null for a row added since the last save. */
  id: number | null;
  /** Stable client-side key for React and for matching draft rows to saved ones. */
  key: string;
  label: string;
  value: string;
  /** The attachment as saved or as picked; null when the document has no file. */
  fileName: string | null;
  fileType: string | null;
  fileSize: number | null;
  /** Base64 body of a file picked since the last save. Never loaded for a saved file. */
  pendingFileData: string | null;
  /** True once the attachment was replaced or removed since the last save. */
  fileChanged: boolean;
  /** HT-78: shows this document's name and details on invoices, estimates and the approval email. */
  includeOnInvoices: boolean;
};

/** The columns the list query reads; file_data stays on the server until it is opened. */
export type CompanyDocumentRecord = {
  id: number;
  label: string | null;
  value: string | null;
  name: string | null;
  file_type: string | null;
  file_size: number | null;
  include_on_invoices?: boolean | null;
};

export function recordToRow(record: CompanyDocumentRecord): CompanyDocumentRow {
  return {
    id: record.id,
    key: `saved-${record.id}`,
    label: record.label ?? '',
    value: record.value ?? '',
    fileName: record.name,
    fileType: record.file_type,
    fileSize: record.file_size,
    pendingFileData: null,
    fileChanged: false,
    includeOnInvoices: record.include_on_invoices ?? false,
  };
}

let nextDraftKey = 0;
export function newDocumentRow(label: string, value: string): CompanyDocumentRow {
  nextDraftKey += 1;
  return {
    id: null,
    key: `new-${nextDraftKey}`,
    label,
    value,
    fileName: null,
    fileType: null,
    fileSize: null,
    pendingFileData: null,
    fileChanged: false,
    includeOnInvoices: false,
  };
}

/** "1.2 MB", "340 KB", "12 B"; an em dash when unknown. */
export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The message shown when a picked file is over the cap. */
export function fileTooLargeMessage(fileName: string, bytes: number): string {
  return `${fileName} is ${formatFileSize(bytes)}; documents can be up to ${formatFileSize(MAX_DOCUMENT_FILE_BYTES)}.`;
}

/** Bytes a base64 body decodes to, for a picker that reports no size. */
export function base64ByteLength(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

/** The first problem with the draft, or null when it can be saved. */
export function validateDocumentRows(rows: readonly CompanyDocumentRow[]): string | null {
  const seen = new Map<string, string>();
  for (const row of rows) {
    const label = row.label.trim();
    if (!label) return 'Every document needs a name.';
    const folded = label.toLowerCase();
    const earlier = seen.get(folded);
    if (earlier !== undefined) return `Two documents are called "${earlier}"; give each a different name.`;
    seen.set(folded, label);
  }
  return null;
}

export type DocumentDiff = {
  inserts: CompanyDocumentRow[];
  updates: CompanyDocumentRow[];
  deletedIds: number[];
};

/** What Save has to write: rows added, rows whose text or file changed, and ids no longer in the draft. */
export function diffDocumentRows(saved: readonly CompanyDocumentRow[], draft: readonly CompanyDocumentRow[]): DocumentDiff {
  const savedById = new Map<number, CompanyDocumentRow>();
  for (const row of saved) if (row.id !== null) savedById.set(row.id, row);

  const inserts: CompanyDocumentRow[] = [];
  const updates: CompanyDocumentRow[] = [];
  const draftIds = new Set<number>();

  for (const row of draft) {
    if (row.id === null) {
      inserts.push(row);
      continue;
    }
    draftIds.add(row.id);
    const before = savedById.get(row.id);
    if (!before) {
      // Loaded from a stale list; treat as an update so the text still lands.
      updates.push(row);
      continue;
    }
    if (
      row.fileChanged ||
      row.label.trim() !== before.label.trim() ||
      row.value.trim() !== before.value.trim() ||
      row.includeOnInvoices !== before.includeOnInvoices
    ) {
      updates.push(row);
    }
  }

  const deletedIds = [...savedById.keys()].filter(id => !draftIds.has(id));
  return { inserts, updates, deletedIds };
}

export function hasDocumentChanges(saved: readonly CompanyDocumentRow[], draft: readonly CompanyDocumentRow[]): boolean {
  const diff = diffDocumentRows(saved, draft);
  return diff.inserts.length > 0 || diff.updates.length > 0 || diff.deletedIds.length > 0;
}
