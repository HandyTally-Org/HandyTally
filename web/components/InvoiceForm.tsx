import { useState, useEffect } from 'react';
import { View, TouchableOpacity, Platform, StyleSheet, Modal, ScrollView, Image } from 'react-native';
import { TextInput, Button, Text, IconButton } from 'react-native-paper';
import * as ImagePicker from 'expo-image-picker';
import { Invoice, InvoiceItem } from '../app/(app)/invoices';
import { Job } from '../app/(app)/jobs';
import { Client } from '../app/(app)/clients';
import { supabase } from '../lib/supabase';
import { Service } from '../app/(app)/services';
import { Material } from '../app/(app)/materials';

type InvoiceFormProps = {
  jobs: Job[];
  clients: Client[];
  lastInvoiceNumber: string;
  onSubmit: (invoice: Omit<Invoice, 'id'>, items: Omit<InvoiceItem, 'id' | 'invoice_id'>[]) => void;
  onCancel: () => void;
  initialInvoice?: Invoice;
  initialItems?: InvoiceItem[];
  isEditing?: boolean;
  hideTitle?: boolean;
  forceInvoiceNumber?: string | null;
  companyLogo?: string | null;
};

// Document palette. Kept local to the form so the global theme (primary #444)
// is untouched everywhere else in the app.
const GREEN = '#0b8a3d';
const GREEN_DARK = '#0a7534';
const NAVY = '#1b365d';
const BORDER = '#d5d8dc';
const LABEL = '#6b7280';
const INK = '#1f2937';
const PAGE_BG = '#e9ebee';
const MAX_ITEM_PHOTOS = 4;

const doc = StyleSheet.create({
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
});

// Raw DOM controls are used for the date and select inputs, matching the
// existing web-first approach in this screen.
const nativeSelectStyle = {
  width: '100%',
  height: '100%',
  border: 'none',
  outline: 'none',
  backgroundColor: 'transparent',
  fontSize: 14,
  color: INK,
} as any;

const nativeInputStyle = {
  width: '100%',
  height: '100%',
  border: 'none',
  outline: 'none',
  backgroundColor: 'transparent',
  fontSize: 14,
  color: INK,
} as any;

// Helper function to safely convert values
function safeToString(value: any): string {
  if (value === undefined || value === null) return '';
  return String(value);
}

// Helper function to safely parse numbers
function safeParseNumber(value: any): number {
  if (value === undefined || value === null) return 0;
  const num = Number(value);
  return isNaN(num) ? 0 : num;
}

export function InvoiceForm({ jobs, clients, lastInvoiceNumber, onSubmit, onCancel, initialInvoice, initialItems = [], isEditing = false, hideTitle = false, forceInvoiceNumber = null, companyLogo }: InvoiceFormProps) {
  const generateNextInvoiceNumber = () => {
    if (!lastInvoiceNumber) {
      return '1001';
    }

    const numericPart = parseInt(lastInvoiceNumber.replace(/\D/g, ''), 10);
    if (isNaN(numericPart)) {
      return '1001';
    }

    return (numericPart + 1).toString().padStart(4, '0');
  };

  const [invoiceNumber] = useState(
    forceInvoiceNumber ||
    (isEditing ? initialInvoice.invoice_number :
      generateNextInvoiceNumber())
  );

  const [formData, setFormData] = useState({
    job_id: safeToString(initialInvoice?.job_id),
    client_id: safeToString(initialInvoice?.client_id),
    invoice_number: invoiceNumber,
    issue_date: initialInvoice?.issue_date || new Date().toISOString().split('T')[0],
    due_date: initialInvoice?.due_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    subtotal: initialInvoice?.subtotal || 0,
    fee_type: initialInvoice?.fee_type || 'fixed',
    fee_value: initialInvoice?.fee_value || 0,
    fee_amount: initialInvoice?.fee_amount || 0,
    tax_rate: initialInvoice?.tax_rate || 0,
    tax_amount: initialInvoice?.tax_amount || 0,
    total: initialInvoice?.total || 0,
    notes: initialInvoice?.notes || '',
    status: initialInvoice?.status || 'estimate',
    invoice_items: initialInvoice?.invoice_items || []
  });
  const [invoiceItems, setInvoiceItems] = useState<Omit<InvoiceItem, 'id' | 'invoice_id'>[]>(
    Array.isArray(initialItems) && initialItems.length > 0
      ? initialItems.map(item => ({
          description: item.description || '',
          notes: item.notes || '',
          photos: Array.isArray(item.photos) ? item.photos : [],
          quantity: item.quantity || 0,
          unit_price: item.unit_price || 0,
          amount: item.amount || 0,
          service_id: item.service_id || null,
          material_id: item.material_id || null,
          type: item.type || 'custom'
        }))
      : []
  );
  const [feeEnabled, setFeeEnabled] = useState(
    safeParseNumber(initialInvoice?.fee_value) > 0
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [services, setServices] = useState<Service[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [companyInfo, setCompanyInfo] = useState<any>(null);
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [notesModalVisible, setNotesModalVisible] = useState(false);
  const [tempNotes, setTempNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [clientModalVisible, setClientModalVisible] = useState(false);
  const [itemListModalVisible, setItemListModalVisible] = useState(false);
  const [itemListTargetIndex, setItemListTargetIndex] = useState<number | null>(null);
  const [itemDescriptionModalVisible, setItemDescriptionModalVisible] = useState(false);
  const [editingItemDescription, setEditingItemDescription] = useState('');

  useEffect(() => {
    fetchServices();
    fetchMaterials();
    fetchCompanyInfo();
  }, []);

  useEffect(() => {
    // Calculate totals whenever items, the fee, or the tax rate change.
    const subtotal = invoiceItems.reduce((sum, item) => {
      const itemAmount = safeParseNumber(item.amount);
      return sum + itemAmount;
    }, 0);

    // An untouched or blank fee contributes nothing.
    const feeValue = feeEnabled ? safeParseNumber(formData.fee_value) : 0;
    const feeAmount = formData.fee_type === 'percent'
      ? subtotal * (feeValue / 100)
      : feeValue;

    // Fees are taxable: they land in the base the tax rate applies to.
    const taxableBase = subtotal + feeAmount;
    const taxRate = safeParseNumber(formData.tax_rate);
    const taxAmount = taxableBase * (taxRate / 100);
    const total = taxableBase + taxAmount;

    setFormData(prev => ({
      ...prev,
      subtotal,
      fee_amount: feeAmount,
      tax_amount: taxAmount,
      total
    }));
  }, [invoiceItems, formData.tax_rate, formData.fee_type, formData.fee_value, feeEnabled]);

  useEffect(() => {
    if (initialInvoice) {
      const formDataToSet = {
        ...initialInvoice,
        invoice_number: initialInvoice.invoice_number || '',
        job_id: initialInvoice.job_id || null,
        client_id: initialInvoice.client_id || null,
      };
      setFormData(formDataToSet);

      if (initialInvoice.job_id) {
        const job = jobs.find(j => j.uid === initialInvoice.job_id || j.id === initialInvoice.job_id);
        setSelectedJob(job || null);
      }

      if (initialInvoice.client_id) {
        const client = clients.find(c => c.uid === initialInvoice.client_id || c.id === initialInvoice.client_id);
        setSelectedClient(client || null);
      }

      if (initialInvoice.invoice_items && initialInvoice.invoice_items.length > 0) {
        setInvoiceItems([...initialInvoice.invoice_items]);
      } else if (initialItems && initialItems.length > 0) {
        setInvoiceItems([...initialItems]);
      }
    }
  }, [initialInvoice, initialItems, jobs, clients]);

  const fetchServices = async () => {
    try {
      const { data, error } = await supabase
        .from('services')
        .select('*')
        .order('name');

      if (error) throw error;
      setServices(data || []);
    } catch (error) {
      console.error('Error fetching services:', error);
    }
  };

  const fetchMaterials = async () => {
    try {
      const { data, error } = await supabase
        .from('materials')
        .select('*')
        .order('name');

      if (error) throw error;
      setMaterials(data || []);
    } catch (error) {
      console.error('Error fetching materials:', error);
    }
  };

  const fetchCompanyInfo = async () => {
    try {
      const { data, error } = await supabase
        .from('company')
        .select('*')
        .single();

      if (!error && data) {
        setCompanyInfo(data);
      }
    } catch (error) {
      console.error('Error fetching company info:', error);
    }
  };

  const handleChange = (field: keyof typeof formData, value: any) => {
    setFormData(prevData => ({ ...prevData, [field]: value }));

    // Clear error when field is edited
    if (errors[field as string]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleSelectClient = (client: Client) => {
    setSelectedClient(client);
    setFormData(prev => ({ ...prev, client_id: (client.uid || client.id) as any }));
    setErrors(prev => ({ ...prev, client_id: '' }));
    setClientModalVisible(false);
  };

  const handleClearClient = () => {
    setSelectedClient(null);
    setFormData(prev => ({ ...prev, client_id: null as any }));
  };

  const handleJobSelect = (jobId: string) => {
    const job = jobs.find(j => (j.uid || j.id) === jobId);
    setSelectedJob(job || null);

    setFormData(prevData => ({
      ...prevData,
      job_id: jobId || null,
      // Selecting a job still pulls its client through, as before.
      client_id: job?.client_id || prevData.client_id
    }));

    if (job?.client_id && !selectedClient) {
      const client = clients.find(c => (c.uid || c.id) === job.client_id);
      if (client) setSelectedClient(client);
    }
  };

  const handleStatusChange = (newStatus: string) => {
    setFormData(prevData => ({ ...prevData, status: newStatus }));
  };

  // Applies a catalog service to an existing line item row.
  const applyServiceToItem = (index: number, service: any) => {
    const updatedItems = [...invoiceItems];
    const quantity = safeParseNumber(updatedItems[index]?.quantity) || 1;
    const rate = safeParseNumber(service.rate);

    updatedItems[index] = {
      ...updatedItems[index],
      description: `${service.name}${service.description ? ` - ${service.description}` : ''}`,
      quantity,
      unit_price: rate,
      amount: quantity * rate,
      type: 'service',
      service_id: service.id || service.uid,
      material_id: null,
    };

    setInvoiceItems(updatedItems);
  };

  // Applies a catalog material to an existing line item row.
  const applyMaterialToItem = (index: number, material: any) => {
    const updatedItems = [...invoiceItems];
    const quantity = safeParseNumber(updatedItems[index]?.quantity) || 1;
    const cost = safeParseNumber(material.cost);

    updatedItems[index] = {
      ...updatedItems[index],
      description: `${material.name}${material.description ? ` - ${material.description}` : ''}`,
      quantity,
      unit_price: cost,
      amount: quantity * cost,
      type: 'material',
      material_id: material.id || material.uid,
      service_id: null,
    };

    setInvoiceItems(updatedItems);
  };

  const openItemList = (index: number) => {
    setItemListTargetIndex(index);
    setItemListModalVisible(true);
  };

  const handleAddLineItem = () => {
    const newItem: Omit<InvoiceItem, 'id' | 'invoice_id'> = {
      description: '',
      notes: '',
      photos: [],
      quantity: 1,
      unit_price: 0,
      amount: 0,
      type: 'other'
    };
    setInvoiceItems([...invoiceItems, newItem]);
    setErrors(prev => ({ ...prev, items: '' }));
  };

  // Photos are stored inline on the item as base64, matching how the company
  // logo is stored in company_attachments.file_data. Items are deleted and
  // re-inserted on every save, so a separate photos table keyed by item id
  // would lose its rows each time.
  const fileToBase64 = async (uri: string): Promise<string> => {
    const response = await fetch(uri);
    const blob = await response.blob();

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        resolve(base64String.includes(',') ? base64String.split(',')[1] : base64String);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const handleAddItemPhoto = async (index: number) => {
    const existing = invoiceItems[index]?.photos || [];
    if (existing.length >= MAX_ITEM_PHOTOS) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.6,
      });

      if (result.canceled) return;

      const file = result.assets[0];
      const fileExt = file.uri.split('.').pop()?.toLowerCase() || 'jpg';
      const fileType = fileExt === 'png' ? 'image/png' : 'image/jpeg';
      const base64Data = await fileToBase64(file.uri);

      const updatedItems = [...invoiceItems];
      updatedItems[index] = {
        ...updatedItems[index],
        photos: [...existing, { file_type: fileType, file_data: base64Data }],
      };
      setInvoiceItems(updatedItems);
    } catch (error) {
      console.error('Error attaching photo:', error);
    }
  };

  const handleRemoveItemPhoto = (index: number, photoIndex: number) => {
    const updatedItems = [...invoiceItems];
    updatedItems[index] = {
      ...updatedItems[index],
      photos: (updatedItems[index].photos || []).filter((_, i) => i !== photoIndex),
    };
    setInvoiceItems(updatedItems);
  };

  const handleToggleFee = () => {
    if (feeEnabled) {
      // Clearing the fee resets it to zero rather than leaving a stale value.
      setFormData(prev => ({ ...prev, fee_value: 0, fee_amount: 0 }));
    }
    setFeeEnabled(!feeEnabled);
  };

  const handleUpdateItem = (index: number, field: keyof InvoiceItem, value: any) => {
    const updatedItems = [...invoiceItems];
    updatedItems[index] = {
      ...updatedItems[index],
      [field]: value
    };

    // Recalculate amount if quantity or unit_price changes
    if (field === 'quantity' || field === 'unit_price') {
      const quantity = safeParseNumber(field === 'quantity' ? value : updatedItems[index].quantity);
      const unitPrice = safeParseNumber(field === 'unit_price' ? value : updatedItems[index].unit_price);
      updatedItems[index].amount = quantity * unitPrice;
    }

    setInvoiceItems(updatedItems);
  };

  const handleRemoveItem = (index: number) => {
    setInvoiceItems(invoiceItems.filter((_, i) => i !== index));
  };

  const handleMoveItem = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= invoiceItems.length) return;

    const updatedItems = [...invoiceItems];
    const [moved] = updatedItems.splice(index, 1);
    updatedItems.splice(target, 0, moved);
    setInvoiceItems(updatedItems);
  };

  const handleSubmit = () => {
    const validationErrors: Record<string, string> = {};

    if (!formData.client_id) {
      validationErrors.client_id = 'Client is required';
    }

    if (!formData.invoice_number) {
      validationErrors.invoice_number = 'Invoice number is required';
    }

    if (!formData.issue_date) {
      validationErrors.issue_date = 'Issue date is required';
    }

    if (!formData.due_date) {
      validationErrors.due_date = 'Due date is required';
    }

    if (invoiceItems.length === 0) {
      validationErrors.items = 'At least one item is required';
    }

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setSubmitting(true);

    try {
      const invoiceData = {
        ...formData,
        status: formData.status || 'draft'
      };

      onSubmit(invoiceData, invoiceItems);
      setErrors({});
    } catch (error) {
      console.error('Error submitting form:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const formatCurrency = (value: any): string => {
    if (value === undefined || value === null || isNaN(Number(value))) {
      return '$0.00';
    }
    return `$${Number(value).toFixed(2)}`;
  };

  const openNotesModal = () => {
    setTempNotes(formData.notes);
    setNotesModalVisible(true);
  };

  const saveNotes = () => {
    handleChange('notes', tempNotes);
    setNotesModalVisible(false);
  };

  const openItemDescriptionModal = (index: number, description: string) => {
    setEditingItemIndex(index);
    setEditingItemDescription(description);
    setItemDescriptionModalVisible(true);
  };

  const saveItemDescription = () => {
    if (editingItemIndex !== null) {
      handleUpdateItem(editingItemIndex, 'description', editingItemDescription);
      setItemDescriptionModalVisible(false);
      setEditingItemIndex(null);
    }
  };

  const documentLabel = (formData.status === 'estimate' || formData.status === 'work_order')
    ? 'Estimate'
    : 'Invoice';

  const clientAddressLines = selectedClient
    ? [
        selectedClient.address,
        [selectedClient.city, selectedClient.state].filter(Boolean).join(', '),
        selectedClient.zip,
        selectedClient.email,
        selectedClient.phone,
      ].filter(Boolean)
    : [];

  return (
    <View style={doc.screen}>
      {/* Sticky-feeling action bar, matching the Cancel / Save pair in the mock */}
      <View style={doc.actionBar}>
        <Button
          mode="contained"
          onPress={onCancel}
          buttonColor="#c9cdd2"
          textColor={INK}
          style={{ borderRadius: 4, minWidth: 120 }}
          labelStyle={{ fontSize: 14, fontWeight: '600' }}
        >
          Cancel
        </Button>
        <Button
          mode="contained"
          onPress={handleSubmit}
          disabled={submitting}
          buttonColor={GREEN}
          textColor="#ffffff"
          style={{ borderRadius: 4, minWidth: 140 }}
          labelStyle={{ fontSize: 14, fontWeight: '600' }}
        >
          Save
        </Button>
      </View>

      {/* The parent screen owns vertical scrolling, so this is a plain View. */}
      <View style={{ paddingHorizontal: 16 }}>
        <View style={doc.sheet}>
          {!hideTitle && (
            <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 24 }}>
              {isEditing ? `Edit ${documentLabel}` : `Create ${documentLabel}`}
            </Text>
          )}

          {/* ── Header: company block on the left, document meta on the right ── */}
          <View style={doc.headerRow}>
            <View style={doc.headerLeft}>
              {companyLogo ? (
                <Image
                  source={{ uri: `data:image/png;base64,${companyLogo}` }}
                  style={doc.logo}
                />
              ) : (
                <View style={doc.logoPlaceholder}>
                  <Text style={{ color: '#b0b6bd', fontSize: 12 }}>Company logo</Text>
                </View>
              )}

              {companyInfo?.address ? (
                String(companyInfo.address)
                  .split('\n')
                  .map((line: string, i: number) => (
                    <Text key={`addr-${i}`} style={doc.companyLine}>{line}</Text>
                  ))
              ) : null}
              {companyInfo?.email ? (
                <Text style={doc.companyLink}>{companyInfo.email}</Text>
              ) : null}
              {companyInfo?.phone ? (
                <Text style={doc.companyLine}>{companyInfo.phone}</Text>
              ) : null}
            </View>

            <View style={doc.headerRight}>
              {/* Client */}
              <View style={doc.clientBox}>
                {selectedClient ? (
                  <View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: INK, flex: 1 }}>
                        {selectedClient.name}
                      </Text>
                      <View style={{ flexDirection: 'row' }}>
                        <IconButton
                          icon="pencil"
                          size={16}
                          onPress={() => setClientModalVisible(true)}
                          style={{ margin: 0 }}
                        />
                        <IconButton
                          icon="close"
                          size={16}
                          onPress={handleClearClient}
                          style={{ margin: 0 }}
                        />
                      </View>
                    </View>
                    {clientAddressLines.map((line, i) => (
                      <Text key={`client-line-${i}`} style={{ fontSize: 13, lineHeight: 19, color: '#4b5563' }}>
                        {line}
                      </Text>
                    ))}
                  </View>
                ) : (
                  <View style={doc.clientBoxEmpty}>
                    <TouchableOpacity
                      style={doc.addClientButton}
                      onPress={() => setClientModalVisible(true)}
                    >
                      <Text style={doc.addClientText}>Add Client</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
              {errors.client_id && <Text style={doc.errorText}>{errors.client_id}</Text>}

              {/* Invoice number */}
              <View style={doc.field}>
                <Text style={doc.fieldLabel}>{documentLabel} #</Text>
                <Text style={{ fontSize: 14, color: INK }}>{formData.invoice_number}</Text>
              </View>

              {/* Issue date */}
              <View style={[doc.field, errors.issue_date ? doc.fieldError : null]}>
                <Text style={doc.fieldLabel}>Date</Text>
                <input
                  type="date"
                  style={nativeInputStyle}
                  value={formData.issue_date || ''}
                  onChange={(e: any) => handleChange('issue_date', e.target.value)}
                />
              </View>
              {errors.issue_date && <Text style={doc.errorText}>{errors.issue_date}</Text>}

              {/* Due date */}
              <View style={[doc.field, errors.due_date ? doc.fieldError : null]}>
                <Text style={doc.fieldLabel}>Due Date</Text>
                <input
                  type="date"
                  style={nativeInputStyle}
                  value={formData.due_date || ''}
                  onChange={(e: any) => handleChange('due_date', e.target.value)}
                />
              </View>
              {errors.due_date && <Text style={doc.errorText}>{errors.due_date}</Text>}

              {/* Job */}
              <View style={doc.field}>
                <Text style={doc.fieldLabel}>Job</Text>
                <select
                  style={nativeSelectStyle}
                  value={formData.job_id || ''}
                  onChange={(e: any) => handleJobSelect(e.target.value)}
                >
                  <option value="">Select a job</option>
                  {(jobs || []).map((job) => (
                    <option key={job.uid || job.id} value={job.uid || job.id}>
                      {job.title || job.name || `Job #${job.uid || job.id}`}
                    </option>
                  ))}
                </select>
              </View>

              {/* Status */}
              <View style={doc.field}>
                <Text style={doc.fieldLabel}>Status</Text>
                <select
                  style={nativeSelectStyle}
                  value={formData.status || 'estimate'}
                  onChange={(e: any) => handleStatusChange(e.target.value)}
                >
                  <option value="estimate">Estimate</option>
                  <option value="work_order">Work Order</option>
                  <option value="draft">Draft</option>
                  <option value="sent">Sent</option>
                  <option value="partial_paid">Partial Paid</option>
                  <option value="paid">Paid</option>
                  <option value="overdue">Overdue</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </View>
            </View>
          </View>

          {/* ── Line items ── */}
          <View style={doc.columnHeader}>
            <View style={doc.colGutter} />
            <View style={doc.colDescription}>
              <Text style={doc.columnHeaderText}>Description</Text>
            </View>
            <View style={doc.colNumeric}>
              <Text style={doc.columnHeaderText}>Rate</Text>
            </View>
            <View style={doc.colNumeric}>
              <Text style={doc.columnHeaderText}>Quantity</Text>
            </View>
            <View style={doc.colTotal}>
              <Text style={doc.columnHeaderText}>Total</Text>
            </View>
            <View style={doc.colGutter} />
          </View>

          {errors.items && <Text style={doc.errorText}>{errors.items}</Text>}

          {invoiceItems.map((item, index) => (
            <View key={`item-${index}`} style={doc.itemRow}>
              {/* Remove control, sitting on the card edge like the mock */}
              <View style={doc.removeButton}>
                <IconButton
                  icon="minus-circle"
                  iconColor="#e2543a"
                  size={20}
                  onPress={() => handleRemoveItem(index)}
                  style={{ margin: 0 }}
                />
              </View>

              <View style={doc.itemCard}>
                <View style={doc.itemCells}>
                  <View style={doc.cellDescription}>
                    <TextInput
                      placeholder="Description"
                      value={item.description}
                      onChangeText={(value) => handleUpdateItem(index, 'description', value)}
                      style={[doc.cellInput, { flex: 1 }]}
                      underlineColor="transparent"
                      activeUnderlineColor="transparent"
                      dense
                    />
                    <IconButton
                      icon="pencil"
                      size={16}
                      onPress={() => openItemDescriptionModal(index, item.description)}
                      style={{ margin: 0 }}
                    />
                    <TouchableOpacity style={doc.itemListButton} onPress={() => openItemList(index)}>
                      <IconButton icon="format-list-bulleted" size={16} iconColor={GREEN} style={{ margin: 0 }} />
                      <Text style={doc.itemListText}>Item List</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={doc.cell}>
                    <TextInput
                      value={safeToString(item.unit_price)}
                      onChangeText={(value) => handleUpdateItem(index, 'unit_price', parseFloat(value) || 0)}
                      keyboardType="numeric"
                      style={[doc.cellInput, { textAlign: 'center' }]}
                      underlineColor="transparent"
                      activeUnderlineColor="transparent"
                      dense
                    />
                  </View>

                  <View style={doc.cell}>
                    <TextInput
                      value={safeToString(item.quantity)}
                      onChangeText={(value) => handleUpdateItem(index, 'quantity', parseFloat(value) || 0)}
                      keyboardType="numeric"
                      style={[doc.cellInput, { textAlign: 'center' }]}
                      underlineColor="transparent"
                      activeUnderlineColor="transparent"
                      dense
                    />
                  </View>

                  <View style={[doc.cell, { alignItems: 'center' }]}>
                    <Text style={{ fontSize: 14, color: INK }}>{formatCurrency(item.amount)}</Text>
                  </View>
                </View>

                {/* Per-item notes */}
                <View style={doc.itemNotesRow}>
                  <TextInput
                    placeholder="Notes"
                    value={item.notes || ''}
                    onChangeText={(value) => handleUpdateItem(index, 'notes', value)}
                    multiline
                    style={{
                      backgroundColor: 'transparent',
                      fontSize: 14,
                      minHeight: 44,
                      ...(Platform.OS === 'web' ? { resize: 'vertical' } : {}),
                    }}
                    underlineColor="transparent"
                    activeUnderlineColor="transparent"
                  />
                </View>

                {/* Per-item photos */}
                <View style={doc.itemPhotosRow}>
                  <TouchableOpacity
                    style={[
                      doc.uploadButton,
                      (item.photos || []).length >= MAX_ITEM_PHOTOS ? { opacity: 0.4 } : null,
                    ]}
                    disabled={(item.photos || []).length >= MAX_ITEM_PHOTOS}
                    onPress={() => handleAddItemPhoto(index)}
                  >
                    <Text style={doc.uploadButtonText}>Upload Photos</Text>
                    <IconButton icon="cloud-upload-outline" size={16} iconColor={NAVY} style={{ margin: 0 }} />
                  </TouchableOpacity>
                  <Text style={doc.uploadHint}>
                    (Max {MAX_ITEM_PHOTOS})
                  </Text>

                  {(item.photos || []).map((photo: any, photoIndex: number) => (
                    <View key={`photo-${index}-${photoIndex}`} style={doc.thumbWrap}>
                      <Image
                        source={{ uri: `data:${photo.file_type || 'image/jpeg'};base64,${photo.file_data}` }}
                        style={doc.thumb}
                      />
                      <IconButton
                        icon="close-circle"
                        size={16}
                        iconColor="#e2543a"
                        style={doc.thumbRemove}
                        onPress={() => handleRemoveItemPhoto(index, photoIndex)}
                      />
                    </View>
                  ))}
                </View>
              </View>

              {/* Reorder control, where the drag handle sits in the mock */}
              <View style={{ width: 44, alignItems: 'center' }}>
                <IconButton
                  icon="chevron-up"
                  size={18}
                  disabled={index === 0}
                  onPress={() => handleMoveItem(index, -1)}
                  style={{ margin: 0, height: 24 }}
                />
                <IconButton
                  icon="chevron-down"
                  size={18}
                  disabled={index === invoiceItems.length - 1}
                  onPress={() => handleMoveItem(index, 1)}
                  style={{ margin: 0, height: 24 }}
                />
              </View>
            </View>
          ))}

          <TouchableOpacity style={doc.addLineItem} onPress={handleAddLineItem}>
            <Text style={doc.addLineItemText}>+  Add Line Item</Text>
          </TouchableOpacity>

          {/* ── Totals ── */}
          <View style={doc.totalsWrap}>
            <View style={doc.totals}>
              <View style={doc.totalsRow}>
                <Text style={doc.totalsLabel}>Subtotal</Text>
                <Text style={doc.totalsValue}>{formatCurrency(formData.subtotal)}</Text>
              </View>

              {/* Fees, charged either as a percentage of the subtotal or a
                  fixed amount. Left off, the fee contributes nothing. */}
              {feeEnabled ? (
                <View style={doc.totalsRow}>
                  <View style={doc.feeControls}>
                    <Text style={doc.totalsLabel}>Fee</Text>
                    <TouchableOpacity
                      style={[doc.feeToggle, formData.fee_type === 'fixed' ? doc.feeToggleActive : null]}
                      onPress={() => handleChange('fee_type', 'fixed')}
                    >
                      <Text style={[doc.feeToggleText, formData.fee_type === 'fixed' ? doc.feeToggleTextActive : null]}>
                        $
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[doc.feeToggle, formData.fee_type === 'percent' ? doc.feeToggleActive : null]}
                      onPress={() => handleChange('fee_type', 'percent')}
                    >
                      <Text style={[doc.feeToggleText, formData.fee_type === 'percent' ? doc.feeToggleTextActive : null]}>
                        %
                      </Text>
                    </TouchableOpacity>
                    <TextInput
                      value={safeToString(formData.fee_value)}
                      onChangeText={(value) => handleChange('fee_value', value)}
                      keyboardType="numeric"
                      style={{ width: 70, height: 36, backgroundColor: 'transparent', textAlign: 'right' }}
                      underlineColor="transparent"
                      activeUnderlineColor={GREEN}
                      dense
                    />
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={doc.totalsValue}>{formatCurrency(formData.fee_amount)}</Text>
                    <IconButton
                      icon="close"
                      size={16}
                      onPress={handleToggleFee}
                      style={{ margin: 0 }}
                    />
                  </View>
                </View>
              ) : (
                <TouchableOpacity style={doc.addFeeButton} onPress={handleToggleFee}>
                  <Text style={doc.addFeeText}>+  Add Fee</Text>
                </TouchableOpacity>
              )}

              <View style={doc.totalsRow}>
                <Text style={doc.totalsLabel}>Tax Rate</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <TextInput
                    value={safeToString(formData.tax_rate)}
                    onChangeText={(value) => handleChange('tax_rate', value)}
                    keyboardType="numeric"
                    style={{ width: 64, height: 36, backgroundColor: 'transparent', textAlign: 'right' }}
                    underlineColor="transparent"
                    activeUnderlineColor={GREEN}
                    dense
                  />
                  <Text style={doc.totalsValue}>%</Text>
                </View>
              </View>

              <View style={doc.totalsRow}>
                <Text style={doc.totalsLabel}>Tax</Text>
                <Text style={doc.totalsValue}>{formatCurrency(formData.tax_amount)}</Text>
              </View>

              <View style={doc.grandTotalRow}>
                <Text style={doc.grandTotalLabel}>Total (USD)</Text>
                <Text style={doc.grandTotalValue}>{formatCurrency(formData.total)}</Text>
              </View>
            </View>
          </View>

          {/* ── Notes ── */}
          <View style={doc.notesSection}>
            <Text style={doc.sectionLabel}>Notes</Text>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', width: '100%' }}>
              <TextInput
                value={formData.notes}
                onChangeText={(value) => handleChange('notes', value)}
                multiline
                style={{
                  minHeight: 80,
                  borderWidth: 1,
                  borderColor: BORDER,
                  borderRadius: 3,
                  padding: 8,
                  flex: 1,
                  backgroundColor: '#ffffff',
                  ...(Platform.OS === 'web' ? { resize: 'vertical' } : {}),
                }}
                underlineColor="transparent"
                activeUnderlineColor="transparent"
              />
              <IconButton
                icon="pencil"
                size={20}
                onPress={openNotesModal}
                style={{ marginLeft: 4 }}
              />
            </View>
          </View>
        </View>
      </View>

      {/* ── Client picker ── */}
      <Modal
        visible={clientModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setClientModalVisible(false)}
      >
        <View style={doc.modalBackdrop}>
          <View style={doc.modalCard}>
            <Text style={doc.modalTitle}>Select Client</Text>
            <ScrollView style={{ maxHeight: 380 }}>
              {(clients || []).length === 0 ? (
                <Text style={{ color: LABEL, padding: 8 }}>No clients found.</Text>
              ) : (
                (clients || []).map((client) => (
                  <TouchableOpacity
                    key={client.uid || client.id}
                    style={doc.pickerRow}
                    onPress={() => handleSelectClient(client)}
                  >
                    <Text style={{ fontSize: 15, fontWeight: '600', color: INK }}>
                      {client.name || `Client #${client.uid || client.id}`}
                    </Text>
                    {client.address ? (
                      <Text style={{ fontSize: 13, color: '#6b7280' }}>{client.address}</Text>
                    ) : null}
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
            <View style={doc.modalActions}>
              <Button mode="outlined" onPress={() => setClientModalVisible(false)}>
                Cancel
              </Button>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Item list picker (services + materials) ── */}
      <Modal
        visible={itemListModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setItemListModalVisible(false)}
      >
        <View style={doc.modalBackdrop}>
          <View style={doc.modalCard}>
            <Text style={doc.modalTitle}>Item List</Text>
            <ScrollView style={{ maxHeight: 380 }}>
              <Text style={doc.pickerGroupLabel}>SERVICES</Text>
              {(services || []).length === 0 ? (
                <Text style={{ color: LABEL, padding: 8 }}>No services found.</Text>
              ) : (
                (services || []).map((service: any) => (
                  <TouchableOpacity
                    key={`service-${service.id || service.uid}`}
                    style={doc.pickerRow}
                    onPress={() => {
                      if (itemListTargetIndex !== null) {
                        applyServiceToItem(itemListTargetIndex, service);
                      }
                      setItemListModalVisible(false);
                    }}
                  >
                    <Text style={{ color: INK }}>
                      {service.name} - {formatCurrency(service.rate)}/{service.unit}
                    </Text>
                  </TouchableOpacity>
                ))
              )}

              <Text style={doc.pickerGroupLabel}>MATERIALS</Text>
              {(materials || []).length === 0 ? (
                <Text style={{ color: LABEL, padding: 8 }}>No materials found.</Text>
              ) : (
                (materials || []).map((material: any) => (
                  <TouchableOpacity
                    key={`material-${material.id || material.uid}`}
                    style={doc.pickerRow}
                    onPress={() => {
                      if (itemListTargetIndex !== null) {
                        applyMaterialToItem(itemListTargetIndex, material);
                      }
                      setItemListModalVisible(false);
                    }}
                  >
                    <Text style={{ color: INK }}>
                      {material.name} - {formatCurrency(material.cost)}/{material.unit}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
            <View style={doc.modalActions}>
              <Button mode="outlined" onPress={() => setItemListModalVisible(false)}>
                Cancel
              </Button>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Notes editor ── */}
      <Modal
        visible={notesModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setNotesModalVisible(false)}
      >
        <View style={doc.modalBackdrop}>
          <View style={[doc.modalCard, { height: '70%' }]}>
            <Text style={doc.modalTitle}>Edit Notes</Text>
            <TextInput
              multiline
              value={tempNotes}
              onChangeText={setTempNotes}
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: BORDER,
                borderRadius: 4,
                padding: 10,
                marginBottom: 16,
                ...(Platform.OS === 'web' ? { resize: 'both' } : {}),
              }}
              autoFocus
            />
            <View style={doc.modalActions}>
              <Button mode="outlined" onPress={() => setNotesModalVisible(false)}>
                Cancel
              </Button>
              <Button mode="contained" buttonColor={GREEN} onPress={saveNotes}>
                Save
              </Button>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Line item description editor ── */}
      <Modal
        visible={itemDescriptionModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setItemDescriptionModalVisible(false)}
      >
        <View style={doc.modalBackdrop}>
          <View style={[doc.modalCard, { width: '90%', height: '80%' }]}>
            <Text style={doc.modalTitle}>Edit Item Description</Text>
            <TextInput
              multiline
              value={editingItemDescription}
              onChangeText={setEditingItemDescription}
              style={{
                flex: 1,
                minHeight: 240,
                borderWidth: 1,
                borderColor: BORDER,
                borderRadius: 4,
                padding: 16,
                marginBottom: 20,
                backgroundColor: 'white',
                ...(Platform.OS === 'web' ? { resize: 'vertical' } : {}),
              }}
              autoFocus
            />
            <View style={doc.modalActions}>
              <Button mode="outlined" onPress={() => setItemDescriptionModalVisible(false)}>
                Cancel
              </Button>
              <Button mode="contained" buttonColor={GREEN} onPress={saveItemDescription}>
                Save
              </Button>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
