import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, ScrollView, FlatList, TouchableOpacity, Platform } from 'react-native';
import { Text, Button, Searchbar, Card, DataTable, IconButton, Dialog, Portal, Snackbar, List, FAB, ActivityIndicator, TextInput } from 'react-native-paper';
import { supabase } from '../../lib/api';
import { styles as globalStyles } from '../../styles';
import { ClientForm } from '../../app/components/clientform';
import { useRouter } from 'expo-router';
import * as XLSX from 'xlsx';

type Client = {
  uid: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  created_at: string;
};

type Job = {
  uid: string;
  title: string;
  status: string;
  created_at: string;
};

type Invoice = {
  uid: string;
  invoice_number: string;
  total: number;
  status: string;
  created_at: string;
};

export default function ClientsScreen() {
  const router = useRouter();
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchClients();
  }, []);

  useEffect(() => {
    if (clients.length > 0) {
      filterClients();
    }
  }, [searchQuery, clients]);

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

  const handleEditClient = (client: Client) => {
    setEditingClient(client);
    setShowAddForm(true);
  };

  const handleAddClient = async (clientData) => {
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

  const handleUpdateClient = async (clientUid, updates) => {
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

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'completed':
      case 'paid':
        return '#4CAF50'; // Green
      case 'in_progress':
      case 'sent':
        return '#2196F3'; // Blue
      case 'pending':
      case 'draft':
        return '#9C27B0'; // Purple
      case 'cancelled':
      case 'overdue':
        return '#F44336'; // Red
      default:
        return '#757575'; // Gray
    }
  };

  const filterClients = () => {
    const query = searchQuery.toLowerCase();
    const filtered = clients.filter(client => 
      client.name.toLowerCase().includes(query) ||
      (client.email && client.email.toLowerCase().includes(query)) ||
      (client.phone && client.phone.includes(query))
    );
    setFilteredClients(filtered);
  };

  const handleSearch = (query) => {
    setSearchQuery(query);
  };

  const handleClientPress = (client) => {
    setSelectedClient(client);
    setEditingClient(client);
    setShowAddForm(true);
  };

  const handleAddClientPress = () => {
    setEditingClient(null);
    setShowAddForm(true);
  };

  const renderClientItem = ({ item }) => (
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

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = event.target.files?.[0];
      
      if (!file) {
        return;
      }
      
      // Read the Excel file
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          if (!e.target?.result) {
            alert('Could not read the file. Please try again.');
            return;
          }
          
          const data = new Uint8Array(e.target.result as ArrayBuffer);
          
          // Parse the Excel file
          const workbook = XLSX.read(data, { type: 'array' });
          
          // Get the first sheet
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          
          // Convert to JSON
          const jsonData = XLSX.utils.sheet_to_json(firstSheet);
          
          if (jsonData.length === 0) {
            alert('No data found in the Excel file.');
            return;
          }
          
          console.log('Imported data:', jsonData);
          
          // Confirm import
          if (confirm(`Are you sure you want to import ${jsonData.length} clients?`)) {
            await importClients(jsonData);
          }
        } catch (error: any) {
          console.error('Error processing Excel file:', error);
          alert(`Failed to process Excel file: ${error.message}`);
        }
      };
      
      reader.readAsArrayBuffer(file);
      
    } catch (error: any) {
      console.error('Error in handleFileSelected:', error);
      alert(`Failed to import clients: ${error.message}`);
    }
  };

  const importClients = async (data: any[]) => {
    try {
      setLoading(true);
      
      let addedCount = 0;
      let updatedCount = 0;
      let deletedCount = 0;
      let errorCount = 0;
      const errorDetails: string[] = [];
      
      // Process each client
      for (const client of data) {
        try {
          console.log('Processing client:', client);
          
          // Check if client should be deleted
          if (client.delete && (client.delete.toString().toLowerCase() === 'y' || client.delete.toString().toLowerCase() === 'yes')) {
            // If we have a uid directly, use it
            if (client.uid) {
              const { error } = await supabase
                .from('clients')
                .delete()
                .eq('uid', client.uid);
              
              if (error) {
                console.error('Error deleting client by uid:', error);
                errorCount++;
                errorDetails.push(`Failed to delete client ${client.name || client.uid}: ${error.message}`);
              } else {
                deletedCount++;
              }
            } 
            // If we have an id but not uid, try to find the client by id
            else if (client.id) {
              // First, find the client by name to get the uid
              const { data: existingClients, error: findError } = await supabase
                .from('clients')
                .select('uid')
                .eq('name', client.name);
              
              if (findError || !existingClients || existingClients.length === 0) {
                console.error('Error finding client to delete:', findError || 'Client not found');
                errorCount++;
                errorDetails.push(`Failed to find client ${client.name} for deletion`);
                continue;
              }
              
              // Now delete using the found uid
              const { error } = await supabase
                .from('clients')
                .delete()
                .eq('uid', existingClients[0].uid);
              
              if (error) {
                console.error('Error deleting client by id:', error);
                errorCount++;
                errorDetails.push(`Failed to delete client ${client.name}: ${error.message}`);
              } else {
                deletedCount++;
              }
            }
            continue;
          }
          
          // Prepare client data - only include fields that exist in the database schema
          const clientData: any = {
            name: client.name || '',
            email: client.email || '',
            phone: client.phone || '',
            address: client.address || ''
          };
          
          // Add optional fields if they exist in the import data
          if (client.city !== undefined) clientData.city = client.city || '';
          if (client.state !== undefined) clientData.state = client.state || '';
          if (client.zip !== undefined) clientData.zip = client.zip || '';
          if (client.notes !== undefined) clientData.notes = client.notes || '';
          
          // Validate required fields
          if (!clientData.name) {
            errorCount++;
            errorDetails.push(`Client missing required name field: ${JSON.stringify(client)}`);
            continue;
          }
          
          // Check if we should update or insert
          // If we have a uid directly, use it for update
          if (client.uid) {
            // Update existing client
            const { error } = await supabase
              .from('clients')
              .update(clientData)
              .eq('uid', client.uid);
            
            if (error) {
              console.error('Error updating client by uid:', error);
              errorCount++;
              errorDetails.push(`Failed to update client ${client.name}: ${error.message}`);
            } else {
              updatedCount++;
            }
          } 
          // If we have an id but not uid, try to find the client by name
          else if (client.id) {
            // First, check if a client with this name already exists
            const { data: existingClients, error: findError } = await supabase
              .from('clients')
              .select('uid')
              .eq('name', client.name);
            
            if (findError) {
              console.error('Error finding client:', findError);
              errorCount++;
              errorDetails.push(`Failed to check if client ${client.name} exists: ${findError.message}`);
              continue;
            }
            
            if (existingClients && existingClients.length > 0) {
              // Update existing client
              const { error } = await supabase
                .from('clients')
                .update(clientData)
                .eq('uid', existingClients[0].uid);
              
              if (error) {
                console.error('Error updating client by name:', error);
                errorCount++;
                errorDetails.push(`Failed to update client ${client.name}: ${error.message}`);
              } else {
                updatedCount++;
              }
            } else {
              // Add new client
              const { error } = await supabase
                .from('clients')
                .insert([clientData]);
              
              if (error) {
                console.error('Error adding client with id:', error);
                errorCount++;
                errorDetails.push(`Failed to add client ${client.name}: ${error.message}`);
              } else {
                addedCount++;
              }
            }
          } else {
            // No id or uid, this is a new client
            const { error } = await supabase
              .from('clients')
              .insert([clientData]);
            
            if (error) {
              console.error('Error adding new client:', error);
              errorCount++;
              errorDetails.push(`Failed to add client ${client.name}: ${error.message}`);
            } else {
              addedCount++;
            }
          }
        } catch (clientError: any) {
          console.error('Error processing client:', clientError);
          errorCount++;
          errorDetails.push(`Error processing client ${client.name || 'unknown'}: ${clientError.message || 'Unknown error'}`);
        }
      }
      
      // Refresh clients list
      await fetchClients();
      
      // Show results
      const resultMessage = `Import complete: ${addedCount} added, ${updatedCount} updated, ${deletedCount} deleted, ${errorCount} errors`;
      showSnackbar(resultMessage);
      
      // If there were errors, show detailed information in console and alert
      if (errorCount > 0) {
        console.error('Import errors:', errorDetails);
        
        // Create a formatted error message for display
        const errorMessage = `${errorCount} clients failed to import/update:\n\n${errorDetails.join('\n\n')}`;
        
        // Show error details in an alert for the user to see
        setTimeout(() => {
          alert(errorMessage);
        }, 500);
      }
    } catch (error: any) {
      console.error('Error importing clients:', error);
      showSnackbar(`Error importing clients: ${error.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{
      flex: 1,
      padding: 16,
      backgroundColor: '#ffffff',
    }}>
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
              <DataTable.Row key={client.uid} style={{ backgroundColor: '#ffffff' }}>
                <DataTable.Cell>{client.name}</DataTable.Cell>
                <DataTable.Cell>{client.email || '-'}</DataTable.Cell>
                <DataTable.Cell>{client.phone || '-'}</DataTable.Cell>
                <DataTable.Cell>{client.address || '-'}</DataTable.Cell>
                <DataTable.Cell>
                  <View style={styles.actionButtons}>
                    <Button
                      icon="pencil"
                      mode="text"
                      compact
                      onPress={() => handleEditClient(client)}
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