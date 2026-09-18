import { StyleSheet } from 'react-native';

// Document palette and layout shared by the invoice editor (InvoiceForm) and
// the read-only invoice view (InvoiceDetails), so the two screens look like
// the same sheet of paper. Kept local to the invoice screens so the global
// theme (primary #444) is untouched everywhere else in the app.
export const GREEN = '#0b8a3d';
export const GREEN_DARK = '#0a7534';
export const NAVY = '#1b365d';
export const BORDER = '#d5d8dc';
export const LABEL = '#6b7280';
export const INK = '#1f2937';
export const PAGE_BG = '#e9ebee';
export const MAX_ITEM_PHOTOS = 4;

export const doc = StyleSheet.create({
  screen: {
    minHeight: '100%',
    backgroundColor: PAGE_BG,
  },
  actionBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: PAGE_BG,
  },
  sheet: {
    backgroundColor: '#ffffff',
    width: '100%',
    maxWidth: 960,
    alignSelf: 'center',
    paddingVertical: 40,
    paddingHorizontal: 40,
    marginBottom: 32,
    borderWidth: 1,
    borderColor: '#e2e4e8',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 32,
    marginBottom: 40,
  },
  headerLeft: {
    flex: 1,
    minWidth: 220,
  },
  headerRight: {
    width: 300,
  },
  logo: {
    width: 160,
    height: 84,
    resizeMode: 'contain',
    marginBottom: 24,
  },
  logoPlaceholder: {
    width: 160,
    height: 84,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#eceef1',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  companyLine: {
    fontSize: 13,
    lineHeight: 20,
    color: '#33507a',
  },
  companyLink: {
    fontSize: 13,
    lineHeight: 20,
    color: '#2563eb',
  },
  clientBox: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 3,
    minHeight: 110,
    padding: 16,
    marginBottom: 20,
    justifyContent: 'center',
  },
  clientBoxEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  addClientButton: {
    backgroundColor: NAVY,
    borderRadius: 3,
    paddingVertical: 12,
    paddingHorizontal: 28,
  },
  addClientText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  // Outlined field with a floating label sitting on the border, like the mock.
  field: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 3,
    height: 52,
    justifyContent: 'center',
    paddingHorizontal: 12,
    marginBottom: 16,
    backgroundColor: '#ffffff',
  },
  fieldLabel: {
    position: 'absolute',
    top: -8,
    left: 10,
    paddingHorizontal: 4,
    backgroundColor: '#ffffff',
    fontSize: 11,
    color: LABEL,
  },
  fieldError: {
    borderColor: '#dc2626',
  },
  errorText: {
    color: '#dc2626',
    fontSize: 12,
    marginTop: -12,
    marginBottom: 12,
  },
  columnHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderBottomWidth: 2,
    borderBottomColor: '#111827',
    paddingBottom: 10,
    marginBottom: 16,
  },
  columnHeaderText: {
    fontSize: 13,
    fontWeight: '700',
    color: INK,
  },
  colDescription: {
    flex: 1,
    minWidth: 160,
  },
  colNumeric: {
    width: 110,
    alignItems: 'center',
  },
  colTotal: {
    width: 110,
    alignItems: 'center',
  },
  colGutter: {
    width: 44,
  },
  // Line item card — the boxed row from the mock.
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  itemCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 3,
    backgroundColor: '#ffffff',
  },
  itemCells: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 52,
  },
  cellDescription: {
    flex: 1,
    minWidth: 160,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 12,
    paddingRight: 4,
  },
  cell: {
    width: 110,
    borderLeftWidth: 1,
    borderLeftColor: BORDER,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  cellInput: {
    height: 40,
    backgroundColor: 'transparent',
    fontSize: 14,
  },
  itemListButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  itemListText: {
    color: GREEN,
    fontSize: 13,
    fontWeight: '600',
  },
  itemNotesRow: {
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingHorizontal: 12,
    paddingVertical: 2,
  },
  itemPhotosRow: {
    borderTopWidth: 1,
    borderTopColor: BORDER,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: NAVY,
    borderRadius: 18,
    paddingLeft: 14,
    paddingRight: 10,
    paddingVertical: 6,
  },
  uploadButtonText: {
    color: NAVY,
    fontSize: 13,
    fontWeight: '600',
  },
  uploadHint: {
    color: LABEL,
    fontSize: 12,
  },
  thumb: {
    width: 46,
    height: 46,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: BORDER,
  },
  thumbWrap: {
    position: 'relative',
  },
  thumbRemove: {
    position: 'absolute',
    top: -8,
    right: -8,
  },
  addFeeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: 10,
  },
  addFeeText: {
    color: GREEN,
    fontSize: 14,
    fontWeight: '600',
  },
  feeControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  feeToggle: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 3,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  feeToggleActive: {
    backgroundColor: NAVY,
    borderColor: NAVY,
  },
  feeToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: LABEL,
  },
  feeToggleTextActive: {
    color: '#ffffff',
  },
  removeButton: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -6,
    zIndex: 2,
  },
  addLineItem: {
    borderWidth: 1,
    borderColor: GREEN,
    borderRadius: 3,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
    marginBottom: 32,
    marginLeft: 28,
    marginRight: 44,
  },
  addLineItemText: {
    color: GREEN,
    fontSize: 15,
    fontWeight: '600',
  },
  totalsWrap: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  totals: {
    width: 320,
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eceef1',
  },
  totalsLabel: {
    fontSize: 14,
    color: '#4b5563',
  },
  totalsValue: {
    fontSize: 14,
    color: INK,
  },
  grandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 20,
  },
  grandTotalLabel: {
    fontSize: 24,
    fontWeight: '700',
    color: '#7a1f1f',
  },
  grandTotalValue: {
    fontSize: 26,
    fontWeight: '700',
    color: '#7a1f1f',
  },
  notesSection: {
    marginTop: 40,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: INK,
    marginBottom: 8,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalCard: {
    width: '80%',
    maxWidth: 640,
    maxHeight: '80%',
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 16,
  },
  pickerRow: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  pickerGroupLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: LABEL,
    marginTop: 12,
    marginBottom: 4,
  },
  pickerSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pickerSearch: {
    marginBottom: 8,
  },
});
