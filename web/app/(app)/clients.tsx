import React, { useState, useMemo } from 'react';
import { View, StyleSheet, ScrollView, FlatList, TouchableOpacity } from 'react-native';
import { Text, Button, Searchbar, Card, DataTable, IconButton, Dialog, Portal, Snackbar, List, FAB, ActivityIndicator, TextInput } from 'react-native-paper';
import { supabase } from '../../lib/api';
import { styles as globalStyles } from '../../styles';
import { ClientForm } from '../../app/components/clientform';
import { ClientDialog } from '../../components/ClientDialog';
import { useRouter } from 'expo-router';
import { exportWorkbook, pickWorkbook, sheetRows, confirmAction } from '../../utils/excel';
import { ImportExportButtons } from '../../components/ImportExportButtons';
import { MaterialIcons } from '@expo/vector-icons';
import { useLabels } from '../../hooks/useLabels';
import { labelColor, labelText, labelTextColor } from '../../constants/labels';
import { LabelPill, LabelPillRow } from '../../components/LabelPill';
import { useRefreshOnFocus } from '../../hooks/useRefreshOnFocus';
import { themed } from '../../constants/Colors';

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

export default function ClientsScreen() {
  // HT-49: the tags a client can carry, with their filter-button colours.
  const CLIENT_TAGS = useLabels('client_tag');
  // Badge colours for the jobs and invoices listed in the client panel.
  const jobStatuses = useLabels('job_status');
  const invoiceStatuses = useLabels('invoice_status');
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
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showClientDetails, setShowClientDetails] = useState(false);
  const [activeDetailTab, setActiveDetailTab] = useState('info');

  useRefreshOnFocus(fetchClients);

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
        // Refetch rather than splicing the insert response locally, so the
        // row also picks up DB-generated columns (uid, created_at, organization_id).
        await fetchClients();
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


  // The rows actually rendered: tag filter, search, then sort, in one place
  // derived from `clients` so add/edit/tag/delete are all reflected immediately.
  const visibleClients = useMemo(() => {
    let filtered = clients;

    if (selectedTags.length > 0) {
      filtered = filtered.filter(client =>
        selectedTags.includes(client.tag?.toLowerCase() || '')
      );
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(client =>
        client.name.toLowerCase().includes(query) ||
        (client.email || '').toLowerCase().includes(query) ||
        (client.phone || '').toLowerCase().includes(query) ||
        (client.address || '').toLowerCase().includes(query)
      );
    }

    return [...filtered].sort((a, b) => {
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
  }, [clients, searchQuery, selectedTags, sortColumn, sortDirection]);

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
      
      await exportWorkbook('clients.xlsx', [
        { name: 'clients', rows: exportData, columnWidths: [36, 25, 30, 15, 30, 15, 10, 10, 15, 40, 10] },
      ]);
      
      alert('Clients exported successfully. This file can be used for import.\n\nTo delete a client, change the "delete" column value to "y".');
    } catch (error) {
      console.error('Error exporting clients:', error);
      alert('Failed to export clients. Please try again.');
    }
  };

  const handleImport = async () => {
    try {
      const workbook = await pickWorkbook();
      if (!workbook) return;

      const jsonData = sheetRows<any>(workbook);
      if (!jsonData || jsonData.length === 0) {
        showSnackbar('No data found in the spreadsheet');
        return;
      }
      const proceed = await confirmAction(
        `Import ${jsonData.length} clients? Rows with an id update that client, and rows with delete set to "y" remove it.`,
        'Import'
      );
      if (!proceed) return;

      setLoading(true);
      
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
        color: themed.text,
      }}>Clients</Text>
      
      <View style={styles.searchAndAddContainer}>
        <Searchbar
          placeholder="Search clients..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={[styles.searchBar, { backgroundColor: themed.soft }]}
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
          
          <ImportExportButtons onExport={handleExport} onImport={handleImport} />
        </View>
      </View>
      
      
          <LabelPillRow style={{ marginTop: 16 }}>
            <LabelPill label="All" selected={selectedTags.length === 0} onPress={() => setSelectedTags([])} />
            {CLIENT_TAGS.map(tag => (
              <LabelPill
                key={tag.value}
                label={tag.label}
                color={tag.color}
                textColor={tag.textColor}
                selected={selectedTags.includes(tag.value)}
                onPress={() => toggleTagFilter(tag.value)}
              />
            ))}
          </LabelPillRow>
          
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
              backgroundColor: themed.panel, 
              borderWidth: 0,
              borderColor: 'transparent',
              margin: 0,
              padding: 0,
              shadowOpacity: 0,
              elevation: 0
            }}>
              <DataTable.Header style={{ backgroundColor: themed.soft, borderBottomWidth: 1, borderBottomColor: themed.line }}>
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
            <DataTable.Row style={{ backgroundColor: themed.panel }}>
              <DataTable.Cell>Loading clients...</DataTable.Cell>
            </DataTable.Row>
          ) : visibleClients.length === 0 ? (
            <DataTable.Row style={{ backgroundColor: themed.panel }}>
              <DataTable.Cell>No clients found</DataTable.Cell>
            </DataTable.Row>
          ) : (
            visibleClients.map(client => (
                  <DataTable.Row 
                    key={client.uid} 
                    style={{ backgroundColor: themed.panel }}
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
                      borderColor: themed.line,
                      backgroundColor: themed.panel,
                      color: themed.text,
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
      
      <ClientDialog
        visible={showAddForm}
        title={editingClient ? 'Edit client' : 'Add client'}
        subtitle={editingClient ? editingClient.name : 'A customer you do work for'}
        client={editingClient}
        submitLabel={editingClient ? 'Save changes' : 'Add client'}
        submitting={loading}
        onDismiss={() => {
          setShowAddForm(false);
          setEditingClient(null);
        }}
        onSubmit={(draft) => {
          if (editingClient) {
            handleUpdateClient(editingClient.uid, draft);
          } else {
            handleAddClient(draft);
          }
        }}
      />
      
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
                          <LabelPill
                            size="sm"
                            label={labelText(jobStatuses, job.status)}
                            color={labelColor(jobStatuses, job.status)}
                            textColor={labelTextColor(jobStatuses, job.status)}
                          />
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
                          <LabelPill
                            size="sm"
                            label={labelText(invoiceStatuses, invoice.status)}
                            color={labelColor(invoiceStatuses, invoice.status)}
                            textColor={labelTextColor(invoiceStatuses, invoice.status)}
                          />
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
        <View style={{ flex: 1, backgroundColor: themed.panel }}>
          <View style={{ flexDirection: 'row', padding: 16, backgroundColor: themed.soft, alignItems: 'center' }}>
            <Text style={{ fontSize: 14, fontWeight: 'normal' }}>Client Details</Text>
          </View>
          
          <View style={{ flexDirection: 'row', flex: 1 }}>
            {/* Left sidebar with icons */}
            <View style={{ width: 60, backgroundColor: themed.soft, borderRightWidth: 1, borderRightColor: themed.line }}>
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
            <View style={{ width: 200, backgroundColor: themed.soft, borderRightWidth: 1, borderRightColor: themed.line }}>
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
                <Text style={{ color: themed.text }}>Info</Text>
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
                <Text style={{ color: themed.text }}>Invoices</Text>
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
                <Text style={{ color: themed.text }}>Costs</Text>
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
                <Text style={{ color: themed.text }}>Calendar</Text>
              </TouchableOpacity>
              
              {/* Documentation header */}
              <View style={{ padding: 16, paddingBottom: 8 }}>
                <Text style={{ color: themed.muted, fontWeight: 'bold', fontSize: 12 }}>DOCUMENTATION</Text>
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
                <Text style={{ color: themed.text }}>Attachments</Text>
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
                <Text style={{ color: themed.text }}>Logs</Text>
              </TouchableOpacity>
            </View>
            
            {/* Content area */}
            <ScrollView style={{ flex: 1, padding: 16, backgroundColor: themed.panel }}>
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
                            <LabelPill
                              size="sm"
                              label={labelText(jobStatuses, job.status)}
                              color={labelColor(jobStatuses, job.status)}
                              textColor={labelTextColor(jobStatuses, job.status)}
                            />
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
                            <LabelPill
                              size="sm"
                              label={labelText(invoiceStatuses, invoice.status)}
                              color={labelColor(invoiceStatuses, invoice.status)}
                              textColor={labelTextColor(invoiceStatuses, invoice.status)}
                            />
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
    backgroundColor: themed.panel,
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
    backgroundColor: themed.panel,
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
    color: themed.muted,
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