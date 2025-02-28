import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, Button, Searchbar, Card, DataTable, IconButton, Dialog, Portal, Snackbar, List } from 'react-native-paper';
import { supabase } from '../../lib/api';
import { styles as globalStyles } from '../../styles';
import { ClientForm } from '../../components/ClientForm';

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

  useEffect(() => {
    fetchClients();
  }, []);

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

  return (
    <View style={styles.container}>
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
          style={styles.searchBar}
        />
        
        <Button
          mode="contained"
          onPress={() => setShowAddForm(true)}
          icon="plus"
          style={styles.addButton}
        >
          Add New Client
        </Button>
      </View>
      
      <Card style={styles.tableCard}>
        <DataTable>
          <DataTable.Header>
            <DataTable.Title 
              onPress={() => handleSort('name')}
              sortDirection={sortColumn === 'name' ? sortDirection : undefined}
            >
              Name
            </DataTable.Title>
            <DataTable.Title 
              onPress={() => handleSort('email')}
              sortDirection={sortColumn === 'email' ? sortDirection : undefined}
            >
              Email
            </DataTable.Title>
            <DataTable.Title 
              onPress={() => handleSort('phone')}
              sortDirection={sortColumn === 'phone' ? sortDirection : undefined}
            >
              Phone
            </DataTable.Title>
            <DataTable.Title 
              onPress={() => handleSort('address')}
              sortDirection={sortColumn === 'address' ? sortDirection : undefined}
            >
              Address
            </DataTable.Title>
            <DataTable.Title>Actions</DataTable.Title>
          </DataTable.Header>
          
          {loading ? (
            <DataTable.Row>
              <DataTable.Cell>Loading clients...</DataTable.Cell>
            </DataTable.Row>
          ) : getFilteredClients().length === 0 ? (
            <DataTable.Row>
              <DataTable.Cell>No clients found</DataTable.Cell>
            </DataTable.Row>
          ) : (
            getFilteredClients().map(client => (
              <DataTable.Row key={client.uid}>
                <DataTable.Cell>{client.name}</DataTable.Cell>
                <DataTable.Cell>{client.email || 'N/A'}</DataTable.Cell>
                <DataTable.Cell>{client.phone || 'N/A'}</DataTable.Cell>
                <DataTable.Cell>
                  {client.address ? 
                    (client.address.length > 30 ? client.address.substring(0, 30) + '...' : client.address) 
                    : 'N/A'}
                </DataTable.Cell>
                <DataTable.Cell>
                  <View style={styles.actionButtons}>
                    <IconButton
                      icon="pencil"
                      size={20}
                      onPress={() => handleEditClient(client)}
                    />
                    <IconButton
                      icon="delete"
                      size={20}
                      onPress={() => {
                        setSelectedClient(client);
                        setShowDeleteDialog(true);
                      }}
                      iconColor="red"
                    />
                  </View>
                </DataTable.Cell>
              </DataTable.Row>
            ))
          )}
        </DataTable>
      </Card>
      
      {showAddForm && (
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
        />
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
}); 