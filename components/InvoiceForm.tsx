import { useState, useEffect } from 'react';
import { View, ScrollView, Modal, TouchableOpacity, FlatList, Platform, StyleSheet } from 'react-native';
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

export function InvoiceForm({ jobs, clients, lastInvoiceNumber, onSubmit, onCancel, initialInvoice, initialItems = [], isEditing = false }: InvoiceFormProps) {
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
    job_id: initialInvoice?.job_id?.toString() || '',
    client_id: initialInvoice?.client_id?.toString() || '',
    invoice_number: initialInvoice?.invoice_number?.toString() || generateNextInvoiceNumber(),
    issue_date: initialInvoice?.issue_date || new Date().toISOString().split('T')[0],
    due_date: initialInvoice?.due_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    subtotal: initialInvoice?.subtotal || 0,
    tax_rate: initialInvoice?.tax_rate || 0,
    tax_amount: initialInvoice?.tax_amount || 0,
    total: initialInvoice?.total || 0,
    notes: initialInvoice?.notes || '',
    status: initialInvoice?.status || 'draft' as Invoice['status'],
  });
  const [invoiceItems, setInvoiceItems] = useState<Omit<InvoiceItem, 'id' | 'invoice_id'>[]>([]);
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
      console.log('Initializing form with invoice:', initialInvoice);
      
      // Set form data from the initial invoice
      setFormData({
        ...initialInvoice,
        // Ensure these are set correctly
        job_id: initialInvoice.job_id || (initialInvoice.job ? initialInvoice.job.id || initialInvoice.job.uid : null),
        client_id: initialInvoice.client_id || (initialInvoice.client ? initialInvoice.client.id || initialInvoice.client.uid : null)
      });
      
      // Set selected job and client for display
      if (initialInvoice.job) {
        setSelectedJob(initialInvoice.job);
      } else if (initialInvoice.job_id) {
        // Find the job in the jobs array
        const job = jobs.find(j => j.id === initialInvoice.job_id || j.uid === initialInvoice.job_id);
        if (job) setSelectedJob(job);
      }
      
      if (initialInvoice.client) {
        setSelectedClient(initialInvoice.client);
      } else if (initialInvoice.client_id) {
        // Find the client in the clients array
        const client = clients.find(c => c.id === initialInvoice.client_id || c.uid === initialInvoice.client_id);
        if (client) setSelectedClient(client);
      }
      
      // Initialize with the provided items
      if (initialItems && initialItems.length > 0) {
        setInvoiceItems(initialItems);
      }
    }
  }, [initialInvoice, initialItems, jobs, clients]);

  async function fetchServices() {
    try {
      const { data, error } = await supabase
        .from('services')
        .select('*')
        .order('name');

      if (error) {
        throw error;
      }

      if (data) {
        setServices(data);
      }
    } catch (error) {
      console.error('Error fetching services:', error);
    }
  }

  async function fetchMaterials() {
    try {
      const { data, error } = await supabase
        .from('materials')
        .select('*')
        .order('name');

      if (error) {
        throw error;
      }

      if (data) {
        setMaterials(data);
      }
    } catch (error) {
      console.error('Error fetching materials:', error);
    }
  }

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

  const handleAddService = (service: Service) => {
    const newItem: Omit<InvoiceItem, 'id' | 'invoice_id'> = {
      description: service.name,
      quantity: 1,
      unit_price: service.rate,
      amount: service.rate,
      type: 'service',
      service_id: service.id
    };
    setInvoiceItems([...invoiceItems, newItem]);
    setShowServiceMenu(false);
  };

  const handleAddMaterial = (material: Material) => {
    console.log('Adding material to invoice:', material);
    
    // Create a new item with the material's price
    const newItem: Omit<InvoiceItem, 'id' | 'invoice_id'> = {
      description: material.name,
      quantity: 1,
      unit_price: material.cost || 0, // Use material.cost instead of unit_price
      amount: material.cost || 0, // Initial amount is just the cost
      type: 'material',
      material_id: material.id || material.uid,
    };
    
    console.log('New invoice item from material:', newItem);
    
    // Add the new item to the invoice items and recalculate totals
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
    
    // Close the material menu
    setShowMaterialMenu(false);
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

  const handleSubmit = async () => {
    if (validate()) {
      try {
        setSubmitting(true);
        
        // Log the data being submitted for debugging
        console.log('Submitting invoice data:', formData);
        console.log('Submitting invoice items:', invoiceItems);
        
        // Ensure all IDs are properly formatted as strings
        const safeInvoice = {
          client_id: formData.client_id,
          job_id: formData.job_id || null,
          invoice_number: formData.invoice_number,
          issue_date: formData.issue_date,
          due_date: formData.due_date,
          subtotal: safeParseNumber(formData.subtotal),
          tax_rate: safeParseNumber(formData.tax_rate),
          tax_amount: safeParseNumber(formData.tax_amount),
          total: safeParseNumber(formData.total),
          notes: formData.notes || '',
          status: formData.status || 'draft'
        };

        // Ensure all invoice items have proper types
        const safeItems = invoiceItems.map(item => ({
          description: item.description || 'No description',
          quantity: safeParseNumber(item.quantity),
          unit_price: safeParseNumber(item.unit_price),
          amount: safeParseNumber(item.amount),
          type: item.type || 'other',
          service_id: item.service_id || null,
          material_id: item.material_id || null
        }));

        console.log('Safe invoice data:', safeInvoice);
        console.log('Safe invoice items:', safeItems);

        // Call the onSubmit function with the properly formatted data
        await onSubmit(safeInvoice as Omit<Invoice, 'id'>, safeItems as Omit<InvoiceItem, 'id' | 'invoice_id'>[]);
      } catch (error) {
        console.error('Error submitting invoice:', error);
        // Show error to user
        alert(`Failed to create invoice: ${error.message || 'Unknown error'}`);
      } finally {
        setSubmitting(false);
      }
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

  return (
    <Card style={combinedStyles.card}>
      <Card.Title title={isEditing ? "Edit Invoice" : "Create New Invoice"} />
      <Card.Content>
        <ScrollView style={{ maxHeight: 500 }}>
          <View style={[combinedStyles.row, { gap: 8 }]}>
            <View style={{ flex: 1 }}>
              <TextInput
                label="Invoice Number *"
                value={formData.invoice_number}
                onChangeText={(value) => handleChange('invoice_number', value)}
                style={combinedStyles.input}
                error={!!errors.invoice_number}
              />
              {errors.invoice_number && <Text style={combinedStyles.error}>{errors.invoice_number}</Text>}
            </View>
            
            <View style={{ flex: 1 }}>
              <TextInput
                label="Status"
                value={formData.status.charAt(0).toUpperCase() + formData.status.slice(1)}
                disabled
                style={combinedStyles.input}
              />
            </View>
          </View>
          
          <View style={[combinedStyles.row, { gap: 8 }]}>
            <View style={{ flex: 1 }}>
              <TextInput
                label="Issue Date *"
                value={formData.issue_date}
                onChangeText={(value) => handleChange('issue_date', value)}
                placeholder="YYYY-MM-DD"
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
                placeholder="YYYY-MM-DD"
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
                const selectedJob = jobs.find(j => (j.id || j.uid) == jobId);
                setSelectedJob(selectedJob || null);
                setFormData({
                  ...formData,
                  job_id: jobId
                });
              }}
            >
              <option value="">Select a job</option>
              {jobs.map((job) => (
                <option key={job.id || job.uid} value={job.id || job.uid}>
                  {job.name || job.title || `Job #${job.id || job.uid}`}
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
                const selectedClient = clients.find(c => (c.id || c.uid) == clientId);
                setSelectedClient(selectedClient || null);
                setFormData({
                  ...formData,
                  client_id: clientId
                });
              }}
              required
            >
              <option value="">Select a client</option>
              {clients.map((client) => (
                <option key={client.id || client.uid} value={client.id || client.uid}>
                  {client.name}
                </option>
              ))}
            </select>
            {errors.client_id && <HelperText type="error">{errors.client_id}</HelperText>}
          </View>
          
          <Divider style={{ marginVertical: 16 }} />
          
          <Text variant="titleMedium" style={{ marginBottom: 8 }}>Invoice Items</Text>
          
          <View style={[combinedStyles.row, { gap: 8, marginBottom: 16 }]}>
            <Menu
              visible={showServiceMenu}
              onDismiss={() => setShowServiceMenu(false)}
              anchor={
                <Button 
                  mode="outlined" 
                  onPress={() => setShowServiceMenu(true)}
                  icon="plus"
                >
                  Add Service
                </Button>
              }
            >
              {services.map((service) => (
                <Menu.Item
                  key={service.id}
                  title={`${service.name} - ${formatCurrency(service.rate)}/${service.unit}`}
                  onPress={() => handleAddService(service)}
                />
              ))}
            </Menu>
            
            <Menu
              visible={showMaterialMenu}
              onDismiss={() => setShowMaterialMenu(false)}
              anchor={
                <Button 
                  mode="outlined" 
                  onPress={() => setShowMaterialMenu(true)}
                  icon="plus"
                >
                  Add Material
                </Button>
              }
            >
              {materials.map((material) => (
                <Menu.Item
                  key={material.id}
                  title={`${material.name} - ${formatCurrency(material.cost)}/${material.unit}`}
                  onPress={() => handleAddMaterial(material)}
                />
              ))}
            </Menu>
            
            <Button 
              mode="outlined" 
              onPress={handleAddCustomItem}
              icon="plus"
            >
              Add Custom Item
            </Button>
          </View>
          
          {errors.items && <Text style={combinedStyles.error}>{errors.items}</Text>}
          
          <DataTable>
            <DataTable.Header>
              <DataTable.Title style={{ flex: 3 }}>Description</DataTable.Title>
              <DataTable.Title numeric style={{ width: 80 }}>Qty</DataTable.Title>
              <DataTable.Title numeric style={{ width: 120 }}>Price</DataTable.Title>
              <DataTable.Title numeric style={{ width: 120 }}>Amount</DataTable.Title>
              <DataTable.Title style={{ width: 50 }}></DataTable.Title>
            </DataTable.Header>
            
            {invoiceItems.map((item, index) => (
              <DataTable.Row key={`item-${index}`}>
                <DataTable.Cell style={{ flex: 3 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
                    <TextInput
                      multiline
                      value={item.description}
                      onChangeText={(value) => handleUpdateItem(index, 'description', value)}
                      style={{
                        minHeight: item.type === 'other' ? 80 : 40,
                        maxHeight: 300,
                        borderWidth: 1,
                        borderColor: '#ccc',
                        borderRadius: 4,
                        padding: 8,
                        flex: 1,
                        ...(Platform.OS === 'web' ? { resize: 'vertical' } : {}),
                      }}
                    />
                    {item.type === 'other' && (
                      <IconButton
                        icon="pencil"
                        size={20}
                        onPress={() => openDescriptionModal(index)}
                        style={{ marginLeft: 4 }}
                      />
                    )}
                  </View>
                </DataTable.Cell>
                <DataTable.Cell numeric style={{ width: 80 }}>
                  <TextInput
                    value={safeToString(item.quantity)}
                    onChangeText={(value) => handleUpdateItem(index, 'quantity', parseFloat(value) || 0)}
                    keyboardType="numeric"
                    style={{ textAlign: 'right', width: 50 }}
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
            ))}
          </DataTable>
          
          <View style={[combinedStyles.row, { justifyContent: 'flex-end', marginTop: 16 }]}>
            <View style={{ width: '50%' }}>
              <View style={[combinedStyles.row, { justifyContent: 'space-between' }]}>
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
        </ScrollView>
        
        <View style={[combinedStyles.row, { justifyContent: 'flex-end', gap: 8, marginTop: 16 }]}>
          <Button mode="outlined" onPress={onCancel}>
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
      </Card.Content>
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
    </Card>
  );
} 