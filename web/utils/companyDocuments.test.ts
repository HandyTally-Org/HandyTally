import {
  MAX_DOCUMENT_FILE_BYTES,
  base64ByteLength,
  diffDocumentRows,
  fileTooLargeMessage,
  formatFileSize,
  hasDocumentChanges,
  newDocumentRow,
  recordToRow,
  validateDocumentRows,
  type CompanyDocumentRow,
} from './companyDocuments';

const saved = (id: number, label: string, value = '', fileName: string | null = null): CompanyDocumentRow =>
  recordToRow({ id, label, value, name: fileName, file_type: fileName ? 'application/pdf' : null, file_size: fileName ? 1000 : null });

describe('formatFileSize', () => {
  it('picks a unit', () => {
    expect(formatFileSize(12)).toBe('12 B');
    expect(formatFileSize(340 * 1024)).toBe('340 KB');
    expect(formatFileSize(1.25 * 1024 * 1024)).toBe('1.3 MB');
    expect(formatFileSize(null)).toBe('—');
  });

  it('names the file and the cap when too large', () => {
    expect(fileTooLargeMessage('policy.pdf', 3 * 1024 * 1024)).toBe('policy.pdf is 3.0 MB; documents can be up to 2.0 MB.');
    expect(MAX_DOCUMENT_FILE_BYTES).toBe(2 * 1024 * 1024);
  });
});

describe('base64ByteLength', () => {
  it('accounts for padding', () => {
    expect(base64ByteLength('YQ==')).toBe(1);
    expect(base64ByteLength('YWI=')).toBe(2);
    expect(base64ByteLength('YWJj')).toBe(3);
  });
});

describe('validateDocumentRows', () => {
  it('accepts distinct named rows', () => {
    expect(validateDocumentRows([saved(1, 'Insurance'), saved(2, 'License')])).toBeNull();
    expect(validateDocumentRows([])).toBeNull();
  });

  it('rejects a blank name and a duplicate, ignoring case and spaces', () => {
    expect(validateDocumentRows([saved(1, 'Insurance'), newDocumentRow('   ', '')])).toBe('Every document needs a name.');
    expect(validateDocumentRows([saved(1, 'Insurance'), newDocumentRow(' insurance ', '')])).toBe(
      'Two documents are called "Insurance"; give each a different name.',
    );
  });
});

describe('diffDocumentRows', () => {
  const before = [saved(1, 'Insurance', 'GL-1'), saved(2, 'License', '', 'license.pdf')];

  it('is empty when nothing changed', () => {
    const diff = diffDocumentRows(before, before.map(row => ({ ...row })));
    expect(diff).toEqual({ inserts: [], updates: [], deletedIds: [] });
    expect(hasDocumentChanges(before, before)).toBe(false);
  });

  it('separates inserts, text updates, file updates and deletes', () => {
    const added = newDocumentRow('EMR', '0.85');
    const renamed = { ...before[0], label: 'General liability' };
    const fileRemoved = { ...before[1], fileName: null, fileType: null, fileSize: null, fileChanged: true };
    const diff = diffDocumentRows(before, [renamed, fileRemoved, added]);
    expect(diff.inserts).toEqual([added]);
    expect(diff.updates.map(row => row.id)).toEqual([1, 2]);
    expect(diff.deletedIds).toEqual([]);

    const afterDelete = diffDocumentRows(before, [before[0]]);
    expect(afterDelete.deletedIds).toEqual([2]);
    expect(afterDelete.updates).toEqual([]);
    expect(hasDocumentChanges(before, [before[0]])).toBe(true);
  });

  it('ignores whitespace-only edits', () => {
    const padded = { ...before[0], value: '  GL-1 ' };
    expect(diffDocumentRows(before, [padded, before[1]]).updates).toEqual([]);
  });
});
