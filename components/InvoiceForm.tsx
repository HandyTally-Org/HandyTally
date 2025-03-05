import { useState, useEffect } from 'react';
import { View, TouchableOpacity, FlatList, Platform, StyleSheet, Modal, ScrollView } from 'react-native';
import { TextInput, Button, Card, Text, Divider, Menu, IconButton, DataTable, HelperText, List, Portal, Dialog } from 'react-native-paper';
import { styles as globalStyles } from '../styles';
import { Invoice, InvoiceItem } from '../app/(app)/invoices';
import { Job } from '../app/(app)/jobs';
import { Client } from '../app/(app)/clients';
import { supabase } from '../lib/supabase';
import { Service } from '../app/(app)/services';
import { Material } from '../app/(app)/materials';

// Create a local styles object that extends the global styles
const styles = {
  ...globalStyles,
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    padding: 8,
    paddingLeft: 12,
    backgroundColor: '#fff',
    height: 50,
  },
  
  dropdownText: {
    color: '#000',
    fontSize: 16,
  },
  
  dropdownPlaceholder: {
    color: '#888',
    fontSize: 16,
  },
};

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
};

const webStyles = Platform.OS === 'web' 
  ? StyleSheet.create({
      dropdownItemHover: {
        ':hover': {
          backgroundColor: '#e0e0e0',
        },
      },
    })
  : {};

// Add the dropdown styles to the imported styles
const formStyles = StyleSheet.create({
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    padding: 8,
    paddingLeft: 12,
    backgroundColor: '#fff',
    height: 50,
  },
  
  dropdownText: {
    color: '#000',
    fontSize: 16,
  },
  
  dropdownPlaceholder: {
    color: '#888',
    fontSize: 16,
  },
});

// Merge the styles
const combinedStyles = {
  ...styles,
  ...formStyles,
  dropdownContainer: {
    position: 'relative',
    zIndex: 9999,
  },
  dropdownMenu: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    maxHeight: 200,
    zIndex: 9999,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  dropdownItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: 'white',
  },
  dropdownItemHovered: {
    backgroundColor: '#f0f0f0',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
};

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

export function InvoiceForm({ jobs, clients, lastInvoiceNumber, onSubmit, onCancel, initialInvoice, initialItems = [], isEditing = false, hideTitle = false }: InvoiceFormProps) {
  // DEBUGGING - Log all props received
  console.log('INVOICE FORM PROPS:', {
    initialInvoice: JSON.stringify(initialInvoice, null, 2),
    initialItems: JSON.stringify(initialItems, null, 2),
    jobs: JSON.stringify(jobs, null, 2),
    clients: JSON.stringify(clients, null, 2),
    isEditing
  });

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

  const [formData, setFormData] = useState({
    job_id: safeToString(initialInvoice?.job_id),
    client_id: safeToString(initialInvoice?.client_id),
    invoice_number: initialInvoice?.invoice_number ? safeToString(initialInvoice.invoice_number) : generateNextInvoiceNumber(),
    issue_date: initialInvoice?.issue_date || new Date().toISOString().split('T')[0],
    due_date: initialInvoice?.due_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    subtotal: initialInvoice?.subtotal || 0,
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
          quantity: item.quantity || 0,
          unit_price: item.unit_price || 0,
          amount: item.amount || 0,
          service_id: item.service_id || null,
          material_id: item.material_id || null,
          type: item.type || 'custom'
        }))
      : []
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [services, setServices] = useState<Service[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [showServiceMenu, setShowServiceMenu] = useState(false);
  const [showMaterialMenu, setShowMaterialMenu] = useState(false);
  const [jobMenuVisible, setJobMenuVisible] = useState(false);
  const [clientMenuVisible, setClientMenuVisible] = useState(false);
  const [hoveredJobId, setHoveredJobId] = useState<string | null>(null);
  const [hoveredClientId, setHoveredClientId] = useState<string | null>(null);
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [descriptionModalVisible, setDescriptionModalVisible] = useState(false);
  const [tempDescription, setTempDescription] = useState('');
  const [notesModalVisible, setNotesModalVisible] = useState(false);
  const [tempNotes, setTempNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [selectedService, setSelectedService] = useState(null);
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [itemDescriptionModalVisible, setItemDescriptionModalVisible] = useState(false);
  const [editingItemDescription, setEditingItemDescription] = useState('');

  useEffect(() => {
    // Ensure all arrays are initialized
    if (!Array.isArray(invoiceItems)) {
      setInvoiceItems([]);
    }
    if (!Array.isArray(services)) {
      setServices([]);
    }
    if (!Array.isArray(materials)) {
      setMaterials([]);
    }
  }, []);

  useEffect(() => {
    fetchServices();
    fetchMaterials();
  }, []);

  useEffect(() => {
    // Calculate totals whenever invoice items change
    const subtotal = invoiceItems.reduce((sum, item) => {
      const itemAmount = safeParseNumber(item.amount);
      return sum + itemAmount;
    }, 0);
    
    const taxRate = safeParseNumber(formData.tax_rate);
    const taxAmount = subtotal * (taxRate / 100);
    const total = subtotal + taxAmount;
    
    setFormData(prev => ({
      ...prev,
      subtotal,
      tax_amount: taxAmount,
      total
    }));
  }, [invoiceItems, formData.tax_rate]);

  useEffect(() => {
    console.log('Jobs received in InvoiceForm:', JSON.stringify(jobs, null, 2));
    
    if (Array.isArray(jobs) && jobs.length > 0) {
      // Log the exact structure of the first job
      console.log('First job keys:', Object.keys(jobs[0]));
      console.log('First job values:', Object.values(jobs[0]));
      
      // Create job options for the dropdown using the exact field names
      const jobOptions = jobs.map(job => {
        // Log each job to see its structure
        console.log('Job:', job);
        
        return {
          // Use title if it exists, otherwise try name, otherwise use the ID
          label: job.title || job.name || `Job ${job.uid || job.id}`,
          // Use uid if it exists, otherwise use id
          value: job.uid || job.id
        };
      });
      
      console.log('Job options for dropdown:', jobOptions);
    }
  }, [jobs]);

  useEffect(() => {
    console.log('Clients received in InvoiceForm:', JSON.stringify(clients, null, 2));
    
    if (Array.isArray(clients) && clients.length > 0) {
      // Log the structure of the first client
      console.log('First client keys:', Object.keys(clients[0]));
      console.log('First client data:', clients[0]);
    }
  }, [clients]);

  useEffect(() => {
    if (initialInvoice) {
      console.log('INITIALIZING FORM WITH INVOICE:', JSON.stringify(initialInvoice, null, 2));
      
      // FORCE SET THE FORM DATA
      const formDataToSet = {
        ...initialInvoice,
        invoice_number: initialInvoice.invoice_number || '',
        job_id: initialInvoice.job_id || null,
        client_id: initialInvoice.client_id || null,
      };
      console.log('SETTING FORM DATA TO:', formDataToSet);
      setFormData(formDataToSet);
      
      // FORCE SET THE SELECTED JOB
      if (initialInvoice.job_id) {
        const job = jobs.find(j => j.uid === initialInvoice.job_id || j.id === initialInvoice.job_id);
        console.log('SETTING SELECTED JOB TO:', job);
        setSelectedJob(job || null);
      }
      
      // FORCE SET THE SELECTED CLIENT
      if (initialInvoice.client_id) {
        const client = clients.find(c => c.uid === initialInvoice.client_id || c.id === initialInvoice.client_id);
        console.log('SETTING SELECTED CLIENT TO:', client);
        setSelectedClient(client || null);
      }
      
      // FORCE SET THE INVOICE ITEMS - Make sure this is working
      console.log('CHECKING INVOICE ITEMS:');
      console.log('initialInvoice.invoice_items:', initialInvoice.invoice_items);
      console.log('initialItems:', initialItems);
      
      if (initialInvoice.invoice_items && initialInvoice.invoice_items.length > 0) {
        console.log('SETTING INVOICE ITEMS FROM initialInvoice.invoice_items:', initialInvoice.invoice_items);
        setInvoiceItems([...initialInvoice.invoice_items]);
      } else if (initialItems && initialItems.length > 0) {
        console.log('SETTING INVOICE ITEMS FROM initialItems:', initialItems);
        setInvoiceItems([...initialItems]);
      }
    }
  }, [initialInvoice, initialItems, jobs, clients]);

  useEffect(() => {
    console.log('INVOICE ITEMS STATE:', invoiceItems);
    console.log('INITIAL ITEMS PROP:', initialItems);
    console.log('INITIAL INVOICE ITEMS:', initialInvoice?.invoice_items);
  }, [invoiceItems]);

  useEffect(() => {
    console.log('Form data status changed:', formData.status);
  }, [formData.status]);

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

  const handleChange = (field: keyof typeof formData, value: any) => {
    console.log(`Changing ${field} to:`, value);
    
    // Use a callback to ensure we're working with the latest state
    setFormData(prevData => {
      const newData = { ...prevData, [field]: value };
      console.log('New form data:', newData);
      return newData;
    });
    
    // Clear error when field is edited
    if (errors[field as string]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleJobChange = (jobId: string) => {
    console.log('handleJobChange called with jobId:', jobId);
    
    // Try to find the job using either uid or id
    const job = jobs.find(j => (j.uid === jobId) || (j.id === jobId));
    console.log('Found job:', job);
    
    if (job) {
      console.log('Setting job_id to:', jobId);
      console.log('Setting client_id to:', job.client_id);
      
      setFormData(prevData => ({
        ...prevData,
        job_id: jobId,
        client_id: job.client_id || prevData.client_id
      }));
    } else {
      console.log('Job not found, only updating job_id');
      setFormData(prevData => ({
        ...prevData,
        job_id: jobId
      }));
    }
  };

  const handleAddService = (service) => {
    setShowServiceMenu(false);
    setSelectedService(service);
    
    const newItem = {
      description: `${service.name} - ${service.description || ''}`,
      quantity: 1,
      unit_price: service.rate || 0,
      amount: service.rate || 0,
      type: 'service',
      service_id: service.id || service.uid
    };
    
    const updatedItems = [...invoiceItems, newItem];
    setInvoiceItems(updatedItems);
    
    // Calculate new totals
    const subtotal = updatedItems.reduce((sum, item) => sum + (item.amount || 0), 0);
    const taxRate = formData.tax_rate || 0;
    const taxAmount = subtotal * (taxRate / 100);
    const total = subtotal + taxAmount;
    
    // Update the form data with new totals
    setFormData(prev => ({
      ...prev,
      subtotal,
      tax_amount: taxAmount,
      total
    }));
  };

  const handleAddMaterial = (material) => {
    setShowMaterialMenu(false);
    setSelectedMaterial(material);
    
    const newItem = {
      description: `${material.name} - ${material.description || ''}`,
      quantity: 1,
      unit_price: material.cost || 0,
      amount: material.cost || 0,
      type: 'material',
      material_id: material.id || material.uid
    };
    
    const updatedItems = [...invoiceItems, newItem];
    setInvoiceItems(updatedItems);
    
    // Calculate new totals
    const subtotal = updatedItems.reduce((sum, item) => sum + (item.amount || 0), 0);
    const taxRate = formData.tax_rate || 0;
    const taxAmount = subtotal * (taxRate / 100);
    const total = subtotal + taxAmount;
    
    // Update the form data with new totals
    setFormData(prev => ({
      ...prev,
      subtotal,
      tax_amount: taxAmount,
      total
    }));
  };

  const handleAddCustomItem = () => {
    const newItem: Omit<InvoiceItem, 'id' | 'invoice_id'> = {
      description: 'Custom item',
      quantity: 1,
      unit_price: 0,
      amount: 0,
      type: 'other'
    };
    setInvoiceItems([...invoiceItems, newItem]);
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

  const validate = () => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.client_id) {
      newErrors.client_id = 'Client is required';
    }
    
    if (!formData.invoice_number) {
      newErrors.invoice_number = 'Invoice number is required';
    }
    
    if (!formData.issue_date) {
      newErrors.issue_date = 'Issue date is required';
    }
    
    if (!formData.due_date) {
      newErrors.due_date = 'Due date is required';
    }
    
    if (invoiceItems.length === 0) {
      newErrors.items = 'At least one item is required';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    // Log the current form data before submission
    console.log('SUBMITTING FORM WITH DATA:', {
      ...formData,
      status: formData.status
    });
    
    // Validate form
    const validationErrors: Record<string, string> = {};
    
    if (!formData.client_id) {
      validationErrors.client_id = 'Client is required';
    }
    
    if (!formData.invoice_number) {
      validationErrors.invoice_number = 'Invoice number is required';
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
      // Create a copy of the form data to ensure we don't lose any fields
      const invoiceData = {
        ...formData,
        status: formData.status || 'draft'  // Explicitly include status
      };
      
      console.log('Final invoice data being submitted:', invoiceData);
      console.log('Status being submitted:', invoiceData.status);
      
      // Call the onSubmit function with the invoice data and items
      onSubmit(invoiceData, invoiceItems);
      
      // Clear form
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

  const openDescriptionModal = (index: number) => {
    setEditingItemIndex(index);
    setTempDescription(invoiceItems[index].description);
    setDescriptionModalVisible(true);
  };

  const saveDescription = () => {
    if (editingItemIndex !== null) {
      handleUpdateItem(editingItemIndex, 'description', tempDescription);
    }
    setDescriptionModalVisible(false);
  };

  const openNotesModal = () => {
    setTempNotes(formData.notes);
    setNotesModalVisible(true);
  };

  const saveNotes = () => {
    handleChange('notes', tempNotes);
    setNotesModalVisible(false);
  };

  // Add this debugging function at the top of the component
  const logFormData = () => {
    console.log('CURRENT FORM DATA:', {
      ...formData,
      status: formData.status
    });
  };

  // Add this function to directly update the status
  const handleStatusChange = (newStatus) => {
    console.log(`Changing status to: ${newStatus}`);
    // Update the form data
    setFormData(prevData => {
      const updatedData = {
        ...prevData,
        status: newStatus
      };
      console.log('Updated form data with new status:', updatedData);
      return updatedData;
    });
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

  return (
    <View style={{ flex: 1 }}>
      <Card style={{ backgroundColor: '#ffffff' }}>
        {!hideTitle && (
          <Card.Title 
            title={isEditing ? "Edit Invoice" : "Create Invoice"} 
            titleStyle={{ fontSize: 20, fontWeight: 'bold' }}
          />
        )}
        <Card.Content>
          <View style={{ flexDirection: 'row', gap: 16, marginBottom: 16 }}>
            <View style={{ flex: 1 }}>
              <Text>Invoice Number *</Text>
              <TextInput
                value={formData.invoice_number}
                style={{
                  height: 50,
                  borderWidth: 1,
                  borderColor: '#ccc',
                  borderRadius: 4,
                  padding: 8,
                  backgroundColor: '#f0f0f0',
                }}
                editable={false}
                required
              />
            </View>
            
            <View style={{ flex: 1 }}>
              <Text>Status</Text>
              <select
                style={{
                  width: '100%',
                  height: 50,
                  padding: 8,
                  borderWidth: 1,
                  borderColor: '#ccc',
                  borderRadius: 4,
                  backgroundColor: '#fff',
                  fontSize: 16
                }}
                value={formData.status || 'estimate'}
                onChange={(e) => handleStatusChange(e.target.value)}
              >
                <option value="estimate">Estimate</option>
                <option value="work_order">Work Order</option>
                <option value="sent">Sent</option>
                <option value="partial_paid">Partial Paid</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </View>
          </View>
          
          <View style={{ flexDirection: 'row', gap: 16, marginBottom: 16 }}>
            <View style={{ flex: 1 }}>
              <TextInput
                label="Issue Date *"
                value={formData.issue_date}
                onChangeText={(value) => handleChange('issue_date', value)}
                style={combinedStyles.input}
                error={!!errors.issue_date}
              />
              {errors.issue_date && <Text style={combinedStyles.error}>{errors.issue_date}</Text>}
            </View>
            
            <View style={{ flex: 1 }}>
              <TextInput
                label="Due Date *"
                value={formData.due_date}
                onChangeText={(value) => handleChange('due_date', value)}
                style={combinedStyles.input}
                error={!!errors.due_date}
              />
              {errors.due_date && <Text style={combinedStyles.error}>{errors.due_date}</Text>}
            </View>
          </View>
          
          <View style={combinedStyles.formGroup}>
            <Text>Job (Optional)</Text>
            <select
              style={{
                width: '100%',
                height: 50,
                padding: 8,
                borderWidth: 1,
                borderColor: '#ccc',
                borderRadius: 4,
                backgroundColor: '#fff',
                fontSize: 16
              }}
              value={formData.job_id || ''}
              onChange={(e) => {
                const jobId = e.target.value;
                console.log('Selected job ID:', jobId);
                const selectedJob = jobs.find(j => (j.uid || j.id) === jobId);
                console.log('Found job:', selectedJob);
                setSelectedJob(selectedJob || null);
                setFormData({
                  ...formData,
                  job_id: jobId || null
                });
              }}
            >
              <option value="">Select a job</option>
              {(jobs || []).map((job) => (
                <option 
                  key={job.uid || job.id} 
                  value={job.uid || job.id}
                >
                  {job.title || job.name || `Job #${job.uid || job.id}`}
                </option>
              ))}
            </select>
          </View>
          
          <View style={combinedStyles.formGroup}>
            <Text>Client *</Text>
            <select
              style={{
                width: '100%',
                height: 50,
                padding: 8,
                borderWidth: 1,
                borderColor: '#ccc',
                borderRadius: 4,
                backgroundColor: '#fff',
                fontSize: 16
              }}
              value={formData.client_id || ''}
              onChange={(e) => {
                const clientId = e.target.value;
                console.log('Selected client ID:', clientId);
                const selectedClient = clients.find(c => (c.uid || c.id) === clientId);
                console.log('Found client:', selectedClient);
                setSelectedClient(selectedClient || null);
                setFormData({
                  ...formData,
                  client_id: clientId || null
                });
              }}
              required
            >
              <option value="">Select a client</option>
              {(clients || []).map((client) => (
                <option 
                  key={client.uid || client.id} 
                  value={client.uid || client.id}
                >
                  {client.name || `Client #${client.uid || client.id}`}
                </option>
              ))}
            </select>
            {errors.client_id && <Text style={combinedStyles.error}>{errors.client_id}</Text>}
          </View>
          
          <View style={combinedStyles.formGroup}>
            <Text>Status</Text>
            <select
              style={{
                width: '100%',
                height: 50,
                padding: 8,
                borderWidth: 1,
                borderColor: '#ccc',
                borderRadius: 4,
                backgroundColor: '#fff',
                fontSize: 16
              }}
              value={formData.status || 'draft'}
              onChange={(e) => handleStatusChange(e.target.value)}
            >
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </View>
          
          <Divider style={{ marginVertical: 16 }} />
          
          <Text style={{ fontSize: 18, fontWeight: 'bold', marginTop: 24, marginBottom: 16, backgroundColor: '#ffffff' }}>
            Invoice Items
          </Text>
          
          <View style={{ marginBottom: 16, backgroundColor: '#ffffff' }}>
            <Text style={{ fontSize: 16, marginBottom: 8 }}>Services</Text>
            <View style={{ 
              borderWidth: 1, 
              borderColor: '#ccc', 
              borderRadius: 4, 
              backgroundColor: '#ffffff',
              position: 'relative',
              marginBottom: 16,
              zIndex: 1000
            }}>
              <TouchableOpacity
                onPress={() => setShowServiceMenu(!showServiceMenu)}
                style={{
                  padding: 12,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Text>
                  {selectedService 
                    ? `${selectedService.name} - ${formatCurrency(selectedService.rate)}/${selectedService.unit}`
                    : "Select a service to add"}
                </Text>
                <IconButton icon={showServiceMenu ? "chevron-up" : "chevron-down"} size={20} />
              </TouchableOpacity>
              
              {showServiceMenu && (
                <View style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  backgroundColor: '#ffffff',
                  borderWidth: 1,
                  borderColor: '#e0e0e0',
                  borderRadius: 4,
                  zIndex: 10000,
                  elevation: 10,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.2,
                  shadowRadius: 4,
                  overflow: 'visible',
                }}>
                  <ScrollView style={{ maxHeight: 200 }}>
                    {(services || []).map((service) => (
                      <TouchableOpacity
                        key={service.id || service.uid}
                        onPress={() => handleAddService(service)}
                        style={{
                          padding: 12,
                          borderBottomWidth: 1,
                          borderBottomColor: '#f0f0f0',
                          backgroundColor: '#ffffff',
                        }}
                        className="dropdown-item"
                        onMouseEnter={(e) => {
                          if (Platform.OS === 'web') {
                            e.currentTarget.style.backgroundColor = '#f5f5f5';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (Platform.OS === 'web') {
                            e.currentTarget.style.backgroundColor = '#ffffff';
                          }
                        }}
                      >
                        <Text>{service.name} - {formatCurrency(service.rate)}/{service.unit}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>
            
            <Text style={{ fontSize: 16, marginBottom: 8 }}>Materials</Text>
            <View style={{ 
              borderWidth: 1, 
              borderColor: '#ccc', 
              borderRadius: 4, 
              backgroundColor: '#ffffff',
              position: 'relative',
              marginBottom: 16,
              zIndex: 999
            }}>
              <TouchableOpacity
                onPress={() => setShowMaterialMenu(!showMaterialMenu)}
                style={{
                  padding: 12,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Text>
                  {selectedMaterial 
                    ? `${selectedMaterial.name} - ${formatCurrency(selectedMaterial.cost)}/${selectedMaterial.unit}`
                    : "Select a material to add"}
                </Text>
                <IconButton icon={showMaterialMenu ? "chevron-up" : "chevron-down"} size={20} />
              </TouchableOpacity>
              
              {showMaterialMenu && (
                <View style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  backgroundColor: '#ffffff',
                  borderWidth: 1,
                  borderColor: '#e0e0e0',
                  borderRadius: 4,
                  zIndex: 9999,
                  elevation: 9,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.2,
                  shadowRadius: 4,
                  overflow: 'visible',
                }}>
                  <ScrollView style={{ maxHeight: 200 }}>
                    {(materials || []).map((material) => (
                      <TouchableOpacity
                        key={material.id || material.uid}
                        onPress={() => handleAddMaterial(material)}
                        style={{
                          padding: 12,
                          borderBottomWidth: 1,
                          borderBottomColor: '#f0f0f0',
                          backgroundColor: '#ffffff',
                        }}
                        className="dropdown-item"
                        onMouseEnter={(e) => {
                          if (Platform.OS === 'web') {
                            e.currentTarget.style.backgroundColor = '#f5f5f5';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (Platform.OS === 'web') {
                            e.currentTarget.style.backgroundColor = '#ffffff';
                          }
                        }}
                      >
                        <Text>{material.name} - {formatCurrency(material.cost)}/{material.unit}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>
            
            <Button 
              mode="outlined" 
              onPress={handleAddCustomItem}
              style={{ backgroundColor: '#ffffff' }}
            >
              Add Custom Item
            </Button>
          </View>
          
          {errors.items && <Text style={combinedStyles.error}>{errors.items}</Text>}
          
          <DataTable style={{ backgroundColor: '#ffffff' }}>
            <DataTable.Header>
              <DataTable.Title 
                style={{ flex: 3 }}
              >
                <Text style={{ fontSize: 18, fontWeight: 'bold' }}>Description</Text>
              </DataTable.Title>
              <DataTable.Title 
                numeric 
                style={{ width: 80 }}
              >
                <Text style={{ fontSize: 18, fontWeight: 'bold', textAlign: 'center' }}>Qty</Text>
              </DataTable.Title>
              <DataTable.Title 
                numeric 
                style={{ width: 120 }}
              >
                <Text style={{ fontSize: 18, fontWeight: 'bold' }}>Price</Text>
              </DataTable.Title>
              <DataTable.Title 
                numeric 
                style={{ width: 120 }}
              >
                <Text style={{ fontSize: 18, fontWeight: 'bold' }}>Amount</Text>
              </DataTable.Title>
              <DataTable.Title 
                style={{ width: 50 }}
              >
                <Text style={{ fontSize: 18, fontWeight: 'bold' }}></Text>
              </DataTable.Title>
            </DataTable.Header>
            
            {invoiceItems.length === 0 ? (
              <DataTable.Row>
                <DataTable.Cell style={{ flex: 1 }}>No items added yet</DataTable.Cell>
              </DataTable.Row>
            ) : (
              invoiceItems.map((item, index) => (
                <DataTable.Row key={`item-${index}`}>
                  <DataTable.Cell style={{ flex: 3 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
                      <TextInput
                        multiline
                        value={item.description}
                        onChangeText={(value) => handleUpdateItem(index, 'description', value)}
                        style={{
                          minHeight: 40,
                          borderWidth: 1,
                          borderColor: '#ccc',
                          borderRadius: 4,
                          padding: 8,
                          flex: 1,
                          ...(Platform.OS === 'web' ? { resize: 'vertical' } : {}),
                        }}
                      />
                      <IconButton
                        icon="pencil"
                        size={20}
                        onPress={() => openItemDescriptionModal(index, item.description)}
                        style={{ marginLeft: 4 }}
                      />
                    </View>
                  </DataTable.Cell>
                  <DataTable.Cell numeric style={{ width: 80, justifyContent: 'center' }}>
                    <TextInput
                      value={safeToString(item.quantity)}
                      onChangeText={(value) => handleUpdateItem(index, 'quantity', parseFloat(value) || 0)}
                      keyboardType="numeric"
                      style={{ textAlign: 'center', width: 50 }}
                    />
                  </DataTable.Cell>
                  <DataTable.Cell numeric style={{ width: 120 }}>
                    <TextInput
                      value={safeToString(item.unit_price)}
                      onChangeText={(value) => handleUpdateItem(index, 'unit_price', parseFloat(value) || 0)}
                      keyboardType="numeric"
                      style={{ textAlign: 'right', width: 80 }}
                    />
                  </DataTable.Cell>
                  <DataTable.Cell numeric style={{ width: 120 }}>
                    {formatCurrency(item.amount)}
                  </DataTable.Cell>
                  <DataTable.Cell style={{ width: 50 }}>
                    <IconButton
                      icon="delete"
                      size={20}
                      onPress={() => handleRemoveItem(index)}
                    />
                  </DataTable.Cell>
                </DataTable.Row>
              ))
            )}
          </DataTable>
          
          <View style={{ marginTop: 24, backgroundColor: '#ffffff' }}>
            <View style={[combinedStyles.row, { justifyContent: 'flex-end', gap: 8 }]}>
              <Text>Subtotal:</Text>
              <Text>{formatCurrency(formData.subtotal)}</Text>
            </View>
            
            <View style={[combinedStyles.row, { justifyContent: 'space-between', alignItems: 'center' }]}>
              <Text>Tax Rate:</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TextInput
                  value={formData.tax_rate.toString()}
                  onChangeText={(value) => handleChange('tax_rate', value)}
                  keyboardType="numeric"
                  style={{ width: 60, height: 40 }}
                />
                <Text>%</Text>
              </View>
            </View>
            
            <View style={[combinedStyles.row, { justifyContent: 'space-between' }]}>
              <Text>Tax Amount:</Text>
              <Text>{formatCurrency(formData.tax_amount)}</Text>
            </View>
            
            <Divider style={{ marginVertical: 8 }} />
            
            <View style={[combinedStyles.row, { justifyContent: 'space-between' }]}>
              <Text variant="titleMedium">Total:</Text>
              <Text variant="titleMedium">{formatCurrency(formData.total)}</Text>
            </View>
          </View>
          
          <View style={{ marginTop: 16 }}>
            <Text>Notes</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
              <TextInput
                value={formData.notes}
                onChangeText={(value) => handleChange('notes', value)}
                multiline
                style={{
                  minHeight: 60,
                  borderWidth: 1,
                  borderColor: '#ccc',
                  borderRadius: 4,
                  padding: 8,
                  flex: 1,
                  ...(Platform.OS === 'web' ? { resize: 'vertical' } : {}),
                }}
              />
              <IconButton
                icon="pencil"
                size={20}
                onPress={openNotesModal}
                style={{ marginLeft: 4 }}
              />
            </View>
          </View>
        </Card.Content>
        
        <View style={[
          combinedStyles.row, 
          { 
            justifyContent: 'flex-end', 
            gap: 8, 
            marginTop: 16,
            backgroundColor: '#ffffff',
            padding: 16
          }
        ]}>
          <Button mode="outlined" onPress={onCancel} style={{ backgroundColor: '#ffffff' }}>
            Cancel
          </Button>
          <Button 
            mode="contained" 
            onPress={handleSubmit}
            disabled={submitting}
          >
            {isEditing ? "Update Invoice" : "Create Invoice"}
          </Button>
        </View>
      </Card>
      <Modal
        visible={descriptionModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setDescriptionModalVisible(false)}
      >
        <View style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
        }}>
          <View style={{
            width: '80%',
            height: '70%',
            backgroundColor: 'white',
            borderRadius: 10,
            padding: 20,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.25,
            shadowRadius: 3.84,
            elevation: 5,
          }}>
            <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 16 }}>Edit Description</Text>
            
            <TextInput
              multiline
              value={tempDescription}
              onChangeText={setTempDescription}
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: '#ccc',
                borderRadius: 4,
                padding: 10,
                marginBottom: 16,
                ...(Platform.OS === 'web' ? { resize: 'both' } : {}),
              }}
              autoFocus
            />
            
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
              <Button 
                mode="outlined" 
                onPress={() => setDescriptionModalVisible(false)}
              >
                Cancel
              </Button>
              <Button 
                mode="contained" 
                onPress={saveDescription}
              >
                Save
              </Button>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        visible={notesModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setNotesModalVisible(false)}
      >
        <View style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
        }}>
          <View style={{
            width: '80%',
            height: '70%',
            backgroundColor: 'white',
            borderRadius: 10,
            padding: 20,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.25,
            shadowRadius: 3.84,
            elevation: 5,
          }}>
            <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 16 }}>Edit Notes</Text>
            
            <TextInput
              multiline
              value={tempNotes}
              onChangeText={setTempNotes}
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: '#ccc',
                borderRadius: 4,
                padding: 10,
                marginBottom: 16,
                ...(Platform.OS === 'web' ? { resize: 'both' } : {}),
              }}
              autoFocus
            />
            
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
              <Button 
                mode="outlined" 
                onPress={() => setNotesModalVisible(false)}
              >
                Cancel
              </Button>
              <Button 
                mode="contained" 
                onPress={saveNotes}
              >
                Save
              </Button>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        visible={itemDescriptionModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setItemDescriptionModalVisible(false)}
      >
        <View style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
        }}>
          <View style={{
            width: '90%',
            height: '80%',
            backgroundColor: 'white',
            borderRadius: 10,
            padding: 30,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.25,
            shadowRadius: 3.84,
            elevation: 5,
          }}>
            <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 20 }}>Edit Item Description</Text>
            <TextInput
              multiline
              value={editingItemDescription}
              onChangeText={setEditingItemDescription}
              style={{
                flex: 1,
                minHeight: 300,
                borderWidth: 1,
                borderColor: '#ccc',
                borderRadius: 4,
                padding: 16,
                marginBottom: 20,
                backgroundColor: 'white',
                ...(Platform.OS === 'web' ? { resize: 'vertical' } : {}),
              }}
              autoFocus
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 16 }}>
              <Button 
                mode="outlined" 
                onPress={() => setItemDescriptionModalVisible(false)}
                style={{ paddingHorizontal: 20 }}
              >
                Cancel
              </Button>
              <Button 
                mode="contained" 
                onPress={saveItemDescription}
                style={{ paddingHorizontal: 20 }}
              >
                Save
              </Button>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
} 