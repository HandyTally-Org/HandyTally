import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, ScrollView, FlatList, TouchableOpacity, Platform } from 'react-native';
import { Text, Button, Searchbar, Card, DataTable, IconButton, Dialog, Portal, Snackbar, List, FAB, ActivityIndicator, TextInput } from 'react-native-paper';
import { supabase } from '../../lib/api';
import { styles as globalStyles } from '../../styles';
import { ClientForm } from '../../app/components/clientform';
import { useRouter } from 'expo-router';
import * as XLSX from 'xlsx';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { MaterialIcons } from '@expo/vector-icons';

type Client = {
  uid: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  created_at: string;
  tag: string;
  city?: string;
  state?: string;
  zip?: string;
  notes?: string;
};

type Job = {
  uid: string;
  title: string;
  status: string;
  created_at: string;
  start_date?: string;
  end_date?: string;
};

type Invoice = {
  uid: string;
  invoice_number: string;
  total: number;
  status: string;
  created_at: string;
  issue_date?: string;
  due_date?: string;
};

// Tags a client can be assigned, matching the tag filter buttons.
const CLIENT_TAGS: { value: string; label: string }[] = [
  { value: 'existing', label: 'Existing' },
  { value: 'pending', label: 'Pending' },
  { value: 'prospect', label: 'Prospect' },
];

export default function ClientsScreen() {
  const router = useRouter();
  console.log('Router object:', router);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [sortColumn, setSortColumn] = useState<string>('name');
  const [sortDirection, setSortDirection] = useState<'ascending' | 'descending'>('ascending');
  const [relatedJobs, setRelatedJobs] = useState<Job[]>([]);
  const [relatedInvoices, setRelatedInvoices] = useState<Invoice[]>([]);
  const [showRelatedItemsDialog, setShowRelatedItemsDialog] = useState(false);
  const [filteredClients, setFilteredClients] = useState<Client[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showClientDetails, setShowClientDetails] = useState(false);
  const [activeDetailTab, setActiveDetailTab] = useState('info');

  useEffect(() => {
    fetchClients();
  }, []);

  useEffect(() => {
    if (clients.length > 0) {
      filterClients();
    }
  }, [searchQuery, clients, selectedTags, sortColumn, sortDirection]);

  async function fetchClients() {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('name');
      
      if (error) throw error;
      
      if (data) {
        setClients(data);
        setFilteredClients(data);
      }
    } catch (error) {
      console.error('Error fetching clients:', error);
      showSnackbar('Error loading clients');
    } finally {
      setLoading(false);
    }
  }

  const showSnackbar = (message: string) => {
    setSnackbarMessage(message);
    setSnackbarVisible(true);
  };

  const fetchRelatedItems = async (clientUid: string) => {
    setLoading(true);
    try {
      // Fetch related jobs
      const { data: jobsData, error: jobsError } = await supabase
        .from('jobs')
        .select('uid, title, status, created_at')
        .eq('client_id', clientUid);
        
      if (jobsError) {
        if (!jobsError.message.includes('relation') && !jobsError.message.includes('does not exist')) {
          console.error('Error fetching related jobs:', jobsError);
          throw new Error('Error fetching related jobs');
        }
      } else if (jobsData) {
        setRelatedJobs(jobsData);
      }
      
      // Fetch related invoices
      const { data: invoicesData, error: invoicesError } = await supabase
        .from('invoices')
        .select('uid, invoice_number, total, status, created_at')
        .eq('client_id', clientUid);
        
      if (invoicesError) {
        if (!invoicesError.message.includes('relation') && !invoicesError.message.includes('does not exist')) {
          console.error('Error fetching related invoices:', invoicesError);
          throw new Error('Error fetching related invoices');
        }
      } else if (invoicesData) {
        setRelatedInvoices(invoicesData);
      }
      
      // Show the dialog if there are any related items
      if ((jobsData && jobsData.length > 0) || (invoicesData && invoicesData.length > 0)) {
        setShowRelatedItemsDialog(true);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error fetching related items:', error);
      showSnackbar(error instanceof Error ? error.message : 'Error checking related items');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClient = async () => {
    if (!selectedClient) return;
    
    try {
      setLoading(true);
      
      // First check if the client has any related records and show them
      const hasRelatedItems = await fetchRelatedItems(selectedClient.uid);
      
      if (hasRelatedItems) {
        // The related items dialog will be shown, so we'll exit here
        return;
      }
      
      // If no related items, proceed with deletion
      console.log('Proceeding with client deletion, UID:', selectedClient.uid);
      const { error: deleteError } = await supabase
        .from('clients')
        .delete()
        .eq('uid', selectedClient.uid);
      
      if (deleteError) {
        console.error('Error deleting client:', deleteError);
        throw new Error(`Database error: ${deleteError.message}`);
      }
      
      // Update local state
      setClients(clients.filter(client => client.uid !== selectedClient.uid));
      showSnackbar('Client deleted successfully');
      setShowDeleteDialog(false);
      setSelectedClient(null);
    } catch (error) {
      console.error('Error in delete operation:', error);
      // Show a more specific error message
      showSnackbar(error instanceof Error ? error.message : 'Error deleting client');
    } finally {
      setLoading(false);
      setShowDeleteDialog(false); // Always close the delete dialog, even on error
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const fetchClientJobs = async (clientId: string) => {
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      return data || [];
    } catch (error) {
      console.error('Error fetching client jobs:', error);
      showSnackbar('Error loading jobs');
      return [];
    }
  };

  const fetchClientInvoices = async (clientId: string) => {
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      return data || [];
    } catch (error) {
      console.error('Error fetching client invoices:', error);
      showSnackbar('Error loading invoices');
      return [];
    }
  };

  const handleEditClient = async (client: Client) => {
    setSelectedClient(client);
    setEditingClient(client);
    setShowClientDetails(true);
    setActiveDetailTab('info');
    
    // Fetch related data
    const jobs = await fetchClientJobs(client.uid);
    setRelatedJobs(jobs);
    
    const invoices = await fetchClientInvoices(client.uid);
    setRelatedInvoices(invoices);
  };

  const handleAddClient = async (clientData: any) => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('clients')
        .insert([clientData])
        .select();
      
      if (error) throw error;
      
      if (data) {
        setClients([...clients, data[0]]);
        setShowAddForm(false);
        showSnackbar('Client added successfully');
      }
    } catch (error) {
      console.error('Error adding client:', error);
      showSnackbar('Error adding client');
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'ascending' ? 'descending' : 'ascending');
    } else {
      setSortColumn(column);
      setSortDirection('ascending');
    }
  };

  const getFilteredClients = () => {
    let filtered = [...clients];
    
    if (searchQuery) {
      filtered = filtered.filter(client => 
        client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        client.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        client.phone?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (sortColumn) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'email':
          comparison = (a.email || '').localeCompare(b.email || '');
          break;
        case 'phone':
          comparison = (a.phone || '').localeCompare(b.phone || '');
          break;
        case 'address':
          comparison = (a.address || '').localeCompare(b.address || '');
          break;
        default:
          comparison = 0;
      }
      
      return sortDirection === 'ascending' ? comparison : -comparison;
    });
    
    return filtered;
  };

  const handleUpdateClient = async (clientUid: string, updates: any) => {
    try {
      setLoading(true);
      
      const { error } = await supabase
        .from('clients')
        .update(updates)
        .eq('uid', clientUid);
      
      if (error) {
        throw new Error(error.message);
      }
      
      setClients(clients.map(client => 
        client.uid === clientUid ? { ...client, ...updates } : client
      ));
      
      setShowAddForm(false);
      setEditingClient(null);
      
      showSnackbar('Client updated successfully');
      
    } catch (error) {
      console.error('Error updating client:', error);
      showSnackbar(error instanceof Error ? error.message : 'Error updating client');
    } finally {
      setLoading(false);
    }
  };

  // Set a client's tag straight from the list, without opening the client page.
  const handleTagChange = async (clientUid: string, tag: string) => {
    const previousClients = clients;

    // Update locally first so the dropdown lands on the new value immediately.
    setClients(clients.map(client =>
      client.uid === clientUid ? { ...client, tag } : client
    ));

    try {
      const { error } = await supabase
        .from('clients')
        .update({ tag })
        .eq('uid', clientUid);

      if (error) {
        throw new Error(error.message);
      }

      showSnackbar('Tag updated');
    } catch (error) {
      console.error('Error updating tag:', error);
      setClients(previousClients);
      showSnackbar(error instanceof Error ? error.message : 'Error updating tag');
    }
  };

  const getStatusColor = (status: string | null | undefined): string => {
    if (!status) return '#999999'; // Default gray for null/undefined
    
    switch (status.toLowerCase()) {
      case 'active':
      case 'completed':
      case 'paid':
        return '#4CAF50'; // Green
      case 'pending':
      case 'in_progress':
      case 'draft':
        return '#FFC107'; // Yellow/Amber
      case 'cancelled':
      case 'overdue':
        return '#F44336'; // Red
      case 'estimate':
        return '#2196F3'; // Blue
      default:
        return '#9E9E9E'; // Gray for unknown status
    }
  };

  const filterClients = () => {
    let filtered = [...clients];
    
    // Apply tag filter (multi-select)
    if (selectedTags.length > 0) {
      filtered = filtered.filter(client => 
        selectedTags.includes(client.tag?.toLowerCase() || '')
      );
    }
    
    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(client => 
        client.name.toLowerCase().includes(query) ||
        client.email.toLowerCase().includes(query) ||
        client.phone.toLowerCase().includes(query) ||
        client.address.toLowerCase().includes(query)
      );
    }
    
    // Return filtered and sorted clients
    return filtered;
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const handleClientPress = (client: Client) => {
    setSelectedClient(client);
    setEditingClient(client);
    setShowAddForm(true);
  };

  const handleAddClientPress = () => {
    setEditingClient(null);
    setShowAddForm(true);
  };

  const renderClientItem = ({ item }: { item: Client }) => (
    <TouchableOpacity onPress={() => handleClientPress(item)}>
      <Card style={styles.card}>
        <Card.Content>
          <Text style={styles.clientName}>{item.name}</Text>
          {item.email && <Text>{item.email}</Text>}
          {item.phone && <Text>{item.phone}</Text>}
        </Card.Content>
      </Card>
    </TouchableOpacity>
  );

  const handleExport = async () => {
    try {
      // Prepare data for export
      const exportData = clients.map(client => ({
        id: client.uid,
        name: client.name,
        email: client.email || '',
        phone: client.phone || '',
        address: client.address || '',
        city: client.city || '',
        state: client.state || '',
        zip: client.zip || '',
        tag: client.tag || '',
        notes: client.notes || '',
        delete: 'n'  // Default to 'n' (don't delete)
      }));
      
      // Create worksheet from the data
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      
      // Set column widths for better readability
      if (!worksheet['!cols']) worksheet['!cols'] = [];
      worksheet['!cols'] = [
        { wch: 36 }, // id
        { wch: 25 }, // name
        { wch: 30 }, // email
        { wch: 15 }, // phone
        { wch: 30 }, // address
        { wch: 15 }, // city
        { wch: 10 }, // state
        { wch: 10 }, // zip
        { wch: 15 }, // tag
        { wch: 40 }, // notes
        { wch: 10 }  // delete
      ];
      
      // Create workbook and add the worksheet
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'clients');
      
      // Generate Excel file
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      
      // For web, create a download link
      const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'clients.xlsx';
      a.click();
      URL.revokeObjectURL(url);
      
      alert('Clients exported successfully. This file can be used for import.\n\nTo delete a client, change the "delete" column value to "y".');
    } catch (error) {
      console.error('Error exporting clients:', error);
      alert('Failed to export clients. Please try again.');
    }
  };

  const handleFileSelected = async (event: any) => {
    try {
      console.log('File selection event triggered', event);
      let file;
      
      if (Platform.OS === 'web') {
        // For web, get the file from the input element
        if (event?.target?.files && event.target.files.length > 0) {
          file = event.target.files[0];
          console.log('Web file selected:', file.name, file.type, file.size);
        } else {
          console.log('No file selected in web environment');
          return; // No file selected
        }
      } else {
        // For mobile, use Expo's DocumentPicker
        const result = await DocumentPicker.getDocumentAsync({
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          copyToCacheDirectory: true
        });
        
        console.log('Mobile document picker result:', result);
        
        if (result.canceled === false && result.assets && result.assets.length > 0) {
          file = result.assets[0];
          console.log('Mobile file selected:', file.name, file.uri);
        } else {
          console.log('No file selected or picker canceled on mobile');
          return; // No file selected or canceled
        }
      }
      
      if (file) {
        console.log('Proceeding to import with file:', file.name);
        await handleImport(file);
      } else {
        console.log('No valid file to import');
      }
    } catch (error) {
      console.error('Error in handleFileSelected:', error);
      showSnackbar('Error selecting file: ' + error.message);
    }
  };

  const handleImport = async (file: any) => {
    try {
      setLoading(true);
      console.log('Starting import process with file:', file.name);
      
      // Read the file data differently based on platform
      let data;
      if (Platform.OS === 'web') {
        // For web, use FileReader API which is more reliable
        data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const result = e.target?.result;
            if (result) {
              // Convert to ArrayBuffer if it's a string
              if (typeof result === 'string') {
                // Base64 string - convert to ArrayBuffer
                const binary = atob(result.split(',')[1]);
                const array = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) {
                  array[i] = binary.charCodeAt(i);
                }
                resolve(array.buffer);
              } else {
                // Already an ArrayBuffer
                resolve(result);
              }
            } else {
              reject(new Error('Failed to read file'));
            }
          };
          reader.onerror = (e) => {
            reject(new Error('Error reading file: ' + e.target?.error));
          };
          reader.readAsArrayBuffer(file);
        });
        
        console.log('Web file read complete, data size:', data.byteLength);
      } else {
        // For mobile
        const fileUri = file.uri;
        console.log('Reading mobile file from URI:', fileUri);
        const fileContent = await FileSystem.readAsStringAsync(fileUri, {
          encoding: FileSystem.EncodingType.Base64
        });
        console.log('Mobile file read complete, content length:', fileContent.length);
        data = _base64ToArrayBuffer(fileContent);
      }
      
      console.log('File data loaded, parsing XLSX...');
      const workbook = XLSX.read(data, { type: 'array' });
      console.log('Workbook parsed, sheets:', workbook.SheetNames);
      
      // Get the first worksheet
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      
      // Convert to JSON
      const jsonData = XLSX.utils.sheet_to_json(worksheet);
      console.log('Parsed data:', jsonData.length, 'rows');
      
      // Track import stats
      let updated = 0;
      let inserted = 0;
      let deleted = 0;
      let errors = 0;
      
      // Process each row
      for (const row of jsonData) {
        try {
          console.log('Processing row:', row);
          
          // Check if this is a delete operation
          if (row.delete && row.delete.toLowerCase() === 'y' && row.id) {
            console.log('Deleting client with ID:', row.id);
            // Delete the client
            const { error } = await supabase
              .from('clients')
              .delete()
              .eq('uid', row.id);
            
            if (error) {
              console.error('Error deleting client:', error);
              errors++;
            } else {
              deleted++;
            }
          } else {
            // Prepare client data
            const clientData = {
              name: row.name || '',
              email: row.email || '',
              phone: row.phone || '',
              address: row.address || '',
              tag: row.tag || '',  // Make sure tag is included
            };
            
            // Add city, state, zip if they exist
            if (row.city) clientData.city = row.city;
            if (row.state) clientData.state = row.state;
            if (row.zip) clientData.zip = row.zip;
            if (row.notes) clientData.notes = row.notes;
            
            console.log('Client data to save:', clientData);
            
            // Update or insert
            if (row.id) {
              console.log('Updating existing client with ID:', row.id);
              // Update existing client
              const { error } = await supabase
                .from('clients')
                .update(clientData)
                .eq('uid', row.id);
              
              if (error) {
                console.error('Error updating client:', error);
                errors++;
              } else {
                updated++;
              }
            } else {
              console.log('Inserting new client');
              // Insert new client
              const { error } = await supabase
                .from('clients')
                .insert(clientData);
              
              if (error) {
                console.error('Error inserting client:', error);
                errors++;
              } else {
                inserted++;
              }
            }
          }
        } catch (rowError) {
          console.error('Error processing row:', rowError);
          errors++;
        }
      }
      
      // Refresh the client list
      await fetchClients();
      
      // Show detailed results
      const resultMessage = `Import complete: ${inserted} added, ${updated} updated, ${deleted} deleted${errors > 0 ? `, ${errors} errors` : ''}`;
      console.log(resultMessage);
      showSnackbar(resultMessage);
    } catch (error) {
      console.error('Error importing clients:', error);
      showSnackbar('Error importing clients: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Helper function to convert base64 to ArrayBuffer
  const _base64ToArrayBuffer = (base64: string) => {
    const binary_string = atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
  };

  const toggleTagFilter = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter(t => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  return (
    <View style={styles.container}>
      {!showClientDetails ? (
        <>
      <Text style={{
        fontFamily: 'System',
        fontSize: 26,
        fontWeight: '600',
        marginBottom: 16,
        color: '#333333',
      }}>Clients</Text>
      
      <View style={styles.searchAndAddContainer}>
        <Searchbar
          placeholder="Search clients..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={[styles.searchBar, { backgroundColor: '#f5f5f5' }]}
        />
        
        <View style={{ 
          flexDirection: 'row', 
          alignItems: 'center',
          height: 40 // Set a fixed height to ensure vertical alignment
        }}>
        <Button
          mode="contained"
            onPress={() => setShowAddForm(true)}
            style={[styles.addButton, { marginLeft: 16 }]}
        >
          Add New Client
        </Button>
          
          <View 
            style={{ marginLeft: 8 }}
            accessibilityLabel="Export"
          >
            <IconButton
              icon="file-export"
              mode="contained"
              onPress={handleExport}
              iconColor="#fff"
              containerColor="#4CAF50"
              size={20}
              aria-label="Export"
            />
            {Platform.OS === 'web' && (
              <div 
                style={{ 
                  position: 'absolute', 
                  bottom: -30, 
                  left: 0, 
                  backgroundColor: '#333', 
                  color: 'white', 
                  padding: '4px 8px', 
                  borderRadius: 4, 
                  fontSize: 12,
                  whiteSpace: 'nowrap',
                  opacity: 0,
                  transition: 'opacity 0.2s',
                  pointerEvents: 'none'
                }}
                className="tooltip"
              >
                Export
              </div>
            )}
          </View>
          
          <View 
            style={{ marginLeft: 8 }}
            accessibilityLabel="Import"
          >
            <IconButton
              icon="file-import"
              mode="contained"
              onPress={() => {
                // Explicitly trigger the file input click
                if (fileInputRef.current) {
                  fileInputRef.current.click();
                } else {
                  console.error("File input ref is null");
                  alert("Could not open file selector. Please try again.");
                }
              }}
              iconColor="#fff"
              containerColor="#2196F3"
              size={20}
              aria-label="Import"
            />
            {Platform.OS === 'web' && (
              <div 
                style={{ 
                  position: 'absolute', 
                  bottom: -30, 
                  left: 0, 
                  backgroundColor: '#333', 
                  color: 'white', 
                  padding: '4px 8px', 
                  borderRadius: 4, 
                  fontSize: 12,
                  whiteSpace: 'nowrap',
                  opacity: 0,
                  transition: 'opacity 0.2s',
                  pointerEvents: 'none'
                }}
                className="tooltip"
              >
                Import
              </div>
            )}
          </View>
        </View>
      </View>
      
      {/* Hidden file input for Excel import */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelected}
        accept=".xlsx,.xls"
        style={{ display: 'none' }}
        id="client-excel-import"
      />
      
          <View style={{ 
            flexDirection: 'row', 
            marginBottom: 16, 
            marginTop: 16,
            justifyContent: 'flex-start',
            gap: 8
          }}>
            <Button
              mode={selectedTags.length === 0 ? 'contained' : 'outlined'}
              onPress={() => setSelectedTags([])}
              style={{ minWidth: 80, borderRadius: 4 }}
            >
              All
            </Button>
            <Button
              mode={selectedTags.includes('existing') ? 'contained' : 'outlined'}
              onPress={() => toggleTagFilter('existing')}
              style={{ 
                minWidth: 80, 
                borderRadius: 4,
                backgroundColor: selectedTags.includes('existing') ? '#2196F3' : undefined 
              }}
            >
              Existing
            </Button>
            <Button
              mode={selectedTags.includes('pending') ? 'contained' : 'outlined'}
              onPress={() => toggleTagFilter('pending')}
              style={{ 
                minWidth: 80, 
                borderRadius: 4,
                backgroundColor: selectedTags.includes('pending') ? '#FFC107' : undefined 
              }}
            >
              Pending
            </Button>
            <Button
              mode={selectedTags.includes('prospect') ? 'contained' : 'outlined'}
              onPress={() => toggleTagFilter('prospect')}
              style={{ 
                minWidth: 80, 
                borderRadius: 4,
                backgroundColor: selectedTags.includes('prospect') ? '#4CAF50' : undefined 
              }}
            >
              Prospect
            </Button>
          </View>
          
          <View style={{
            margin: 0,
            padding: 0,
            borderWidth: 0,
            borderColor: 'transparent',
            backgroundColor: 'transparent',
            shadowOpacity: 0,
            elevation: 0
          }}>
            <DataTable style={{ 
              backgroundColor: '#ffffff', 
              borderWidth: 0,
              borderColor: 'transparent',
              margin: 0,
              padding: 0,
              shadowOpacity: 0,
              elevation: 0
            }}>
              <DataTable.Header style={{ backgroundColor: '#f5f5f5', borderBottomWidth: 1, borderBottomColor: '#e0e0e0' }}>
            <DataTable.Title 
              sortDirection={sortColumn === 'name' ? sortDirection : undefined}
                  onPress={() => handleSort('name')}
            >
              Name
            </DataTable.Title>
            <DataTable.Title 
              sortDirection={sortColumn === 'email' ? sortDirection : undefined}
                  onPress={() => handleSort('email')}
            >
              Email
            </DataTable.Title>
            <DataTable.Title 
              sortDirection={sortColumn === 'phone' ? sortDirection : undefined}
                  onPress={() => handleSort('phone')}
            >
              Phone
            </DataTable.Title>
            <DataTable.Title 
              sortDirection={sortColumn === 'address' ? sortDirection : undefined}
                  onPress={() => handleSort('address')}
            >
              Address
            </DataTable.Title>
                <DataTable.Title>Tag</DataTable.Title>
            <DataTable.Title>Actions</DataTable.Title>
          </DataTable.Header>
          
          {loading ? (
            <DataTable.Row style={{ backgroundColor: '#ffffff' }}>
              <DataTable.Cell>Loading clients...</DataTable.Cell>
            </DataTable.Row>
          ) : filteredClients.length === 0 ? (
            <DataTable.Row style={{ backgroundColor: '#ffffff' }}>
              <DataTable.Cell>No clients found</DataTable.Cell>
            </DataTable.Row>
          ) : (
            filteredClients.map(client => (
                  <DataTable.Row 
                    key={client.uid} 
                    style={{ backgroundColor: '#ffffff' }}
                    onPress={() => router.push(`/client-details?id=${client.uid}`)}
                  >
                <DataTable.Cell>{client.name}</DataTable.Cell>
                <DataTable.Cell>{client.email || '-'}</DataTable.Cell>
                <DataTable.Cell>{client.phone || '-'}</DataTable.Cell>
                <DataTable.Cell>{client.address || '-'}</DataTable.Cell>
                <DataTable.Cell>
                  {/* onClick stops the row's navigation firing when the dropdown is used */}
                  <select
                    value={client.tag || ''}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => handleTagChange(client.uid, e.target.value)}
                    style={{
                      padding: 8,
                      borderRadius: 4,
                      borderColor: '#ccc',
                      backgroundColor: '#ffffff',
                      color: '#000000',
                      fontWeight: 'bold'
                    }}
                  >
                    <option value="">No Tag</option>
                    {CLIENT_TAGS.map(tag => (
                      <option key={tag.value} value={tag.value}>{tag.label}</option>
                    ))}
                  </select>
                </DataTable.Cell>
                <DataTable.Cell>
                  <View style={styles.actionButtons}>
                    <Button
                      icon="pencil"
                      mode="text"
                      compact
                          onPress={() => {
                            console.log('Edit button clicked for client:', client.uid);
                            router.push(`/client-details?id=${client.uid}`);
                          }}
                      style={styles.actionButton}
                      labelStyle={styles.actionButtonLabel}
                    >
                      <Text style={{ width: 0, height: 0, opacity: 0 }}></Text>
                    </Button>
                    <Button
                      icon="delete"
                      mode="text"
                      compact
                      onPress={() => {
                        setSelectedClient(client);
                        setShowDeleteDialog(true);
                      }}
                      style={styles.actionButton}
                      labelStyle={styles.actionButtonLabel}
                      textColor="red"
                    >
                      <Text style={{ width: 0, height: 0, opacity: 0 }}></Text>
                    </Button>
                  </View>
                </DataTable.Cell>
              </DataTable.Row>
            ))
          )}
        </DataTable>
          </View>
      
      {showAddForm && (
        <View style={{ 
          backgroundColor: '#ffffff',
          borderRadius: 8,
          marginTop: 16,
          padding: 0,
          elevation: 4,
          shadowColor: 'rgba(0,0,0,0.1)',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.8,
          shadowRadius: 2,
        }}>
          <ClientForm
            client={editingClient}
            onSubmit={(clientData) => {
              if (editingClient) {
                handleUpdateClient(editingClient.uid, clientData);
              } else {
                handleAddClient(clientData);
              }
            }}
            onCancel={() => {
              setShowAddForm(false);
              setEditingClient(null);
            }}
            submitting={loading}
          />
        </View>
      )}
      
      {/* Delete Client Dialog */}
      <Portal>
        <Dialog visible={showDeleteDialog} onDismiss={() => setShowDeleteDialog(false)}>
          <Dialog.Title>Delete Client</Dialog.Title>
          <Dialog.Content>
            <Text>Are you sure you want to delete the client "{selectedClient?.name}"?</Text>
            <Text>This action cannot be undone.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setShowDeleteDialog(false)}>Cancel</Button>
            <Button onPress={handleDeleteClient} textColor="red">Delete</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
      
      {/* Related Items Dialog */}
      <Portal>
        <Dialog 
          visible={showRelatedItemsDialog} 
          onDismiss={() => setShowRelatedItemsDialog(false)}
          style={styles.relatedItemsDialog}
        >
          <Dialog.Title>Cannot Delete Client</Dialog.Title>
          <Dialog.ScrollArea style={styles.dialogScrollArea}>
            <ScrollView>
              {relatedJobs.length > 0 && (
                <View style={styles.relatedSection}>
                  <Text style={styles.relatedSectionTitle}>
                    This client has {relatedJobs.length} associated job{relatedJobs.length !== 1 ? 's' : ''}:
                  </Text>
                  {relatedJobs.map(job => (
                    <Card key={job.uid} style={styles.relatedItemCard}>
                      <Card.Content>
                        <View style={styles.relatedItemHeader}>
                          <Text style={styles.relatedItemTitle}>{job.title}</Text>
                          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(job.status) }]}>
                            <Text style={styles.statusText}>
                              {job.status?.replace('_', ' ').toUpperCase()}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.relatedItemDate}>Created: {formatDate(job.created_at)}</Text>
                      </Card.Content>
                    </Card>
                  ))}
                </View>
              )}
              
              {relatedInvoices.length > 0 && (
                <View style={styles.relatedSection}>
                  <Text style={styles.relatedSectionTitle}>
                    This client has {relatedInvoices.length} associated invoice{relatedInvoices.length !== 1 ? 's' : ''}:
                  </Text>
                  {relatedInvoices.map(invoice => (
                    <Card key={invoice.uid} style={styles.relatedItemCard}>
                      <Card.Content>
                        <View style={styles.relatedItemHeader}>
                          <Text style={styles.relatedItemTitle}>Invoice #{invoice.invoice_number}</Text>
                          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(invoice.status) }]}>
                            <Text style={styles.statusText}>
                              {invoice.status?.toUpperCase()}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.relatedItemAmount}>
                          Amount: {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(invoice.total || 0)}
                        </Text>
                        <Text style={styles.relatedItemDate}>Created: {formatDate(invoice.created_at)}</Text>
                      </Card.Content>
                    </Card>
                  ))}
                </View>
              )}
              
              <Text style={styles.relatedItemsMessage}>
                You must delete these items before you can delete this client.
              </Text>
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setShowRelatedItemsDialog(false)}>Close</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
      
      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={3000}
      >
        {snackbarMessage}
      </Snackbar>
        </>
      ) : (
        <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
          <View style={{ flexDirection: 'row', padding: 16, backgroundColor: '#f5f5f5', alignItems: 'center' }}>
            <Text style={{ fontSize: 14, fontWeight: 'normal' }}>Client Details</Text>
          </View>
          
          <View style={{ flexDirection: 'row', flex: 1 }}>
            {/* Left sidebar with icons */}
            <View style={{ width: 60, backgroundColor: '#f5f5f5', borderRightWidth: 1, borderRightColor: '#e0e0e0' }}>
              <TouchableOpacity 
                style={{ alignItems: 'center', marginTop: 16 }}
                onPress={() => setShowClientDetails(false)}
              >
                <MaterialIcons name="menu" size={24} color="#666" />
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={{ alignItems: 'center', marginTop: 16 }}
                onPress={() => router.push('/dashboard')}
              >
                <MaterialIcons name="dashboard" size={24} color="#666" />
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={{ alignItems: 'center', marginTop: 16 }}
                onPress={() => {}}
              >
                <MaterialIcons name="person" size={24} color="#666" />
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={{ alignItems: 'center', marginTop: 16 }}
                onPress={() => {}}
              >
                <MaterialIcons name="folder" size={24} color="#666" />
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={{ alignItems: 'center', marginTop: 16 }}
                onPress={() => {}}
              >
                <MaterialIcons name="build" size={24} color="#666" />
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={{ alignItems: 'center', marginTop: 16 }}
                onPress={() => {}}
              >
                <MaterialIcons name="settings" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            
            {/* Right sidebar with navigation options */}
            <View style={{ width: 200, backgroundColor: '#f5f5f5', borderRightWidth: 1, borderRightColor: '#e0e0e0' }}>
              {/* Info section */}
              <TouchableOpacity 
                style={{ 
                  padding: 16,
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: activeDetailTab === 'info' ? '#f0f0f0' : 'transparent'
                }}
                onPress={() => setActiveDetailTab('info')}
              >
                <View style={{ width: 24, marginRight: 12 }}>
                  <MaterialIcons name="grid-view" size={20} color="#333" />
                </View>
                <Text style={{ color: '#333' }}>Info</Text>
              </TouchableOpacity>
              
              {/* Invoices section */}
              <TouchableOpacity 
                style={{ 
                  padding: 16,
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: activeDetailTab === 'invoices' ? '#f0f0f0' : 'transparent'
                }}
                onPress={() => setActiveDetailTab('invoices')}
              >
                <View style={{ width: 24, marginRight: 12 }}>
                  <MaterialIcons name="description" size={20} color="#333" />
                </View>
                <Text style={{ color: '#333' }}>Invoices</Text>
              </TouchableOpacity>
              
              {/* Costs section */}
              <TouchableOpacity 
                style={{ 
                  padding: 16,
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: activeDetailTab === 'costs' ? '#f0f0f0' : 'transparent'
                }}
                onPress={() => setActiveDetailTab('costs')}
              >
                <View style={{ width: 24, marginRight: 12 }}>
                  <MaterialIcons name="attach-money" size={20} color="#333" />
                </View>
                <Text style={{ color: '#333' }}>Costs</Text>
              </TouchableOpacity>
              
              {/* Calendar section */}
              <TouchableOpacity 
                style={{ 
                  padding: 16,
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: activeDetailTab === 'calendar' ? '#f0f0f0' : 'transparent'
                }}
                onPress={() => setActiveDetailTab('calendar')}
              >
                <View style={{ width: 24, marginRight: 12 }}>
                  <MaterialIcons name="calendar-today" size={20} color="#333" />
                </View>
                <Text style={{ color: '#333' }}>Calendar</Text>
              </TouchableOpacity>
              
              {/* Documentation header */}
              <View style={{ padding: 16, paddingBottom: 8 }}>
                <Text style={{ color: '#666', fontWeight: 'bold', fontSize: 12 }}>DOCUMENTATION</Text>
              </View>
              
              {/* Attachments section */}
              <TouchableOpacity 
                style={{ 
                  padding: 16,
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: activeDetailTab === 'attachments' ? '#f0f0f0' : 'transparent'
                }}
                onPress={() => setActiveDetailTab('attachments')}
              >
                <View style={{ width: 24, marginRight: 12 }}>
                  <MaterialIcons name="attach-file" size={20} color="#333" />
                </View>
                <Text style={{ color: '#333' }}>Attachments</Text>
              </TouchableOpacity>
              
              {/* Logs section */}
              <TouchableOpacity 
                style={{ 
                  padding: 16,
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: activeDetailTab === 'logs' ? '#f0f0f0' : 'transparent'
                }}
                onPress={() => setActiveDetailTab('logs')}
              >
                <View style={{ width: 24, marginRight: 12 }}>
                  <MaterialIcons name="list-alt" size={20} color="#333" />
                </View>
                <Text style={{ color: '#333' }}>Logs</Text>
              </TouchableOpacity>
            </View>
            
            {/* Content area */}
            <ScrollView style={{ flex: 1, padding: 16, backgroundColor: '#ffffff' }}>
              {activeDetailTab === 'info' && (
                <ClientForm
                  client={editingClient}
                  onSubmit={(clientData) => {
                    handleUpdateClient(editingClient.uid, clientData);
                  }}
                  onCancel={() => {
                    setShowClientDetails(false);
                  }}
                  submitting={loading}
                />
              )}
              
              {activeDetailTab === 'jobs' && (
                <View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
                    <Text style={{ fontSize: 20, fontWeight: 'bold' }}>Jobs</Text>
                    <Button 
                      mode="contained" 
                      onPress={() => router.push(`/jobs?client_id=${selectedClient?.uid}`)}
                    >
                      Add New Job
                    </Button>
                  </View>
                  
                  {relatedJobs.length === 0 ? (
                    <Card>
                      <Card.Content>
                        <Text>No jobs found for this client</Text>
                      </Card.Content>
                    </Card>
                  ) : (
                    <DataTable>
                      <DataTable.Header>
                        <DataTable.Title>Title</DataTable.Title>
                        <DataTable.Title>Status</DataTable.Title>
                        <DataTable.Title>Start Date</DataTable.Title>
                        <DataTable.Title>End Date</DataTable.Title>
                        <DataTable.Title>Actions</DataTable.Title>
                      </DataTable.Header>
                      
                      {relatedJobs.map(job => (
                        <DataTable.Row key={job.uid}>
                          <DataTable.Cell>{job.title}</DataTable.Cell>
                          <DataTable.Cell>
                            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(job.status) }]}>
                              <Text style={styles.statusText}>{job.status?.replace('_', ' ').toUpperCase()}</Text>
                            </View>
                          </DataTable.Cell>
                          <DataTable.Cell>{formatDate(job.start_date)}</DataTable.Cell>
                          <DataTable.Cell>{formatDate(job.end_date)}</DataTable.Cell>
                          <DataTable.Cell>
                            <View style={{ flexDirection: 'row' }}>
                              <IconButton 
                                icon="eye" 
                                onPress={() => router.push(`/jobs?id=${job.uid}`)} 
                              />
                              <IconButton 
                                icon="pencil" 
                                onPress={() => router.push(`/jobs?id=${job.uid}`)} 
                              />
                            </View>
                          </DataTable.Cell>
                        </DataTable.Row>
                      ))}
                    </DataTable>
                  )}
                </View>
              )}
              
              {activeDetailTab === 'invoices' && (
                <View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
                    <Text style={{ fontSize: 20, fontWeight: 'bold' }}>Invoices</Text>
                    <Button 
                      mode="contained" 
                      onPress={() => router.push(`/invoices?client_id=${selectedClient?.uid}`)}
                    >
                      Create New Invoice
                    </Button>
                  </View>
                  
                  {relatedInvoices.length === 0 ? (
                    <Card>
                      <Card.Content>
                        <Text>No invoices found for this client</Text>
                      </Card.Content>
                    </Card>
                  ) : (
                    <DataTable>
                      <DataTable.Header>
                        <DataTable.Title>Invoice #</DataTable.Title>
                        <DataTable.Title>Issue Date</DataTable.Title>
                        <DataTable.Title>Due Date</DataTable.Title>
                        <DataTable.Title>Total</DataTable.Title>
                        <DataTable.Title>Status</DataTable.Title>
                        <DataTable.Title>Actions</DataTable.Title>
                      </DataTable.Header>
                      
                      {relatedInvoices.map(invoice => (
                        <DataTable.Row key={invoice.uid}>
                          <DataTable.Cell>{invoice.invoice_number}</DataTable.Cell>
                          <DataTable.Cell>{formatDate(invoice.issue_date)}</DataTable.Cell>
                          <DataTable.Cell>{formatDate(invoice.due_date)}</DataTable.Cell>
                          <DataTable.Cell>
                            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(invoice.total || 0)}
                          </DataTable.Cell>
                          <DataTable.Cell>
                            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(invoice.status) }]}>
                              <Text style={styles.statusText}>{invoice.status?.toUpperCase()}</Text>
                            </View>
                          </DataTable.Cell>
                          <DataTable.Cell>
                            <View style={{ flexDirection: 'row' }}>
                              <IconButton 
                                icon="eye" 
                                onPress={() => router.push(`/invoices?id=${invoice.uid}`)} 
                              />
                              <IconButton 
                                icon="pencil" 
                                onPress={() => router.push(`/invoices?id=${invoice.uid}`)} 
                              />
                            </View>
                          </DataTable.Cell>
                        </DataTable.Row>
                      ))}
                    </DataTable>
                  )}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#ffffff',
  },
  searchAndAddContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    alignItems: 'center',
  },
  searchBar: {
    flex: 1,
    marginRight: 16,
  },
  addButton: {
    minWidth: 150,
  },
  tableCard: {
    flex: 1,
    marginBottom: 16,
    backgroundColor: '#ffffff',
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  actionButton: {
    padding: 0,
  },
  actionButtonLabel: {
    padding: 0,
  },
  relatedItemsDialog: {
    maxWidth: 500,
    alignSelf: 'center',
  },
  dialogScrollArea: {
    maxHeight: 400,
  },
  relatedSection: {
    marginBottom: 16,
  },
  relatedSectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  relatedItemCard: {
    marginBottom: 8,
  },
  relatedItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  relatedItemTitle: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  relatedItemDate: {
    fontSize: 12,
    color: '#666',
  },
  relatedItemAmount: {
    fontSize: 13,
    marginBottom: 4,
  },
  relatedItemsMessage: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#F44336',
    marginTop: 8,
    marginBottom: 16,
    textAlign: 'center',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  statusText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  listContainer: {
    paddingBottom: 80,
  },
  card: {
    marginBottom: 12,
  },
  clientName: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
  },
}); 