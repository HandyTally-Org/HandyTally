import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, Button, Card, Tabs, Tab, TextInput, ActivityIndicator, IconButton, DataTable, Portal, Dialog, Snackbar } from 'react-native-paper';
import { useLocalSearchParams, useRouter, Link } from 'expo-router';
import { supabase } from '../../../lib/api';
import { styles as globalStyles } from '../../../styles';
import { formatDate, formatCurrency } from '../../../utils/formatting';

type Client = {
  uid: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  tag: string;
  notes: string;
  created_at: string;
};

type Job = {
  uid: string;
  title: string;
  description: string;
  status: string;
  start_date: string;
  end_date: string;
  created_at: string;
};

type Invoice = {
  uid: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  total: number;
  status: string;
  created_at: string;
};

export default function ClientDetailScreen() {
  const params = useLocalSearchParams();
  const id = params.id as string;
  const router = useRouter();
  const [activeTab, setActiveTab] = useState(0);
  const [client, setClient] = useState<Client | null>(null);
  const [editedClient, setEditedClient] = useState<Client | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState(null);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  console.log('Client details page loaded with params:', params);
  console.log('Client ID:', id);

  useEffect(() => {
    if (id) {
      fetchClientDetails();
    }
  }, [id]);

  const fetchClientDetails = async () => {
    try {
      setLoading(true);
      console.log('Fetching client details for ID:', id);
      
      // Fetch client details
      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('*')
        .eq('uid', id)
        .single();
      
      if (clientError) {
        console.error('Error fetching client:', clientError);
        throw clientError;
      }
      
      console.log('Client data:', clientData);
      setClient(clientData);
      setEditedClient(clientData);
      
      // Fetch related jobs
      const { data: jobsData, error: jobsError } = await supabase
        .from('jobs')
        .select('*')
        .eq('client_id', id)
        .order('created_at', { ascending: false });
      
      if (jobsError) {
        console.error('Error fetching jobs:', jobsError);
        throw jobsError;
      }
      
      console.log('Jobs data:', jobsData?.length || 0, 'jobs found');
      setJobs(jobsData || []);
      
      // Fetch related invoices
      const { data: invoicesData, error: invoicesError } = await supabase
        .from('invoices')
        .select('*')
        .eq('client_id', id)
        .order('created_at', { ascending: false });
      
      if (invoicesError) {
        console.error('Error fetching invoices:', invoicesError);
        throw invoicesError;
      }
      
      console.log('Invoices data:', invoicesData?.length || 0, 'invoices found');
      setInvoices(invoicesData || []);
      
      // Fetch logs (placeholder for now)
      setLogs([]);
      
    } catch (error) {
      console.error('Error fetching client details:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveClient = async () => {
    if (!editedClient) return;
    
    try {
      setSaving(true);
      
      const { error } = await supabase
        .from('clients')
        .update({
          name: editedClient.name,
          email: editedClient.email,
          phone: editedClient.phone,
          address: editedClient.address,
          city: editedClient.city,
          state: editedClient.state,
          zip: editedClient.zip,
          tag: editedClient.tag,
          notes: editedClient.notes
        })
        .eq('uid', id);
      
      if (error) throw error;
      
      setClient(editedClient);
      alert('Client updated successfully');
      
    } catch (error) {
      console.error('Error updating client:', error);
      alert('Error updating client');
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const confirmDeleteInvoice = (invoiceId) => {
    setInvoiceToDelete(invoiceId);
    setDeleteConfirmVisible(true);
  };

  const handleDeleteInvoice = async () => {
    if (!invoiceToDelete) return;
    
    try {
      setLoading(true);
      
      // First delete the invoice items
      const { error: itemsError } = await supabase
        .from('invoice_items')
        .delete()
        .eq('invoice_id', invoiceToDelete);
      
      if (itemsError) throw itemsError;
      
      // Then delete the invoice
      const { error: invoiceError } = await supabase
        .from('invoices')
        .delete()
        .eq('uid', invoiceToDelete);
      
      if (invoiceError) throw invoiceError;
      
      // Refresh the invoices list
      fetchClientDetails();
      
      // Show success message
      setSnackbarMessage('Invoice deleted successfully');
      setSnackbarVisible(true);
      
    } catch (error) {
      console.error('Error deleting invoice:', error);
      setSnackbarMessage(`Error deleting invoice: ${error.message}`);
      setSnackbarVisible(true);
    } finally {
      setLoading(false);
      setDeleteConfirmVisible(false);
      setInvoiceToDelete(null);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 16 }}>Loading client details...</Text>
      </View>
    );
  }

  if (!client) {
    return (
      <View style={{ flex: 1, padding: 16, alignItems: 'center' }}>
        <Text style={{ fontSize: 18, marginBottom: 16 }}>Client not found</Text>
        <Button mode="contained" onPress={() => router.push('/clients')}>
          Back to Clients
        </Button>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', padding: 16, backgroundColor: '#ffffff', alignItems: 'center' }}>
        <IconButton icon="arrow-left" onPress={() => router.push('/clients')} />
        <Text style={{ fontSize: 24, fontWeight: 'bold' }}>{client.name}</Text>
      </View>
      
      <View style={{ flexDirection: 'row', height: '100%' }}>
        {/* Side Navigation */}
        <View style={{ width: 200, backgroundColor: '#ffffff', padding: 16 }}>
          <Button 
            mode={activeTab === 0 ? 'contained' : 'outlined'} 
            onPress={() => setActiveTab(0)}
            style={{ marginBottom: 8 }}
          >
            Client Info
          </Button>
          <Button 
            mode={activeTab === 1 ? 'contained' : 'outlined'} 
            onPress={() => setActiveTab(1)}
            style={{ marginBottom: 8 }}
          >
            Jobs
          </Button>
          <Button 
            mode={activeTab === 2 ? 'contained' : 'outlined'} 
            onPress={() => setActiveTab(2)}
            style={{ marginBottom: 8 }}
          >
            Invoices
          </Button>
          <Button 
            mode={activeTab === 3 ? 'contained' : 'outlined'} 
            onPress={() => setActiveTab(3)}
          >
            Logs
          </Button>
        </View>
        
        {/* Content Area */}
        <ScrollView style={{ flex: 1, padding: 16 }}>
          {/* Client Info Tab */}
          {activeTab === 0 && (
            <View>
              <Card style={{ marginBottom: 16 }}>
                <Card.Content>
                  <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 16 }}>Client Information</Text>
                  
                  <Text style={{ fontWeight: 'bold', marginBottom: 4 }}>Name</Text>
                  <TextInput
                    value={editedClient?.name || ''}
                    onChangeText={(text) => setEditedClient({ ...editedClient!, name: text })}
                    style={{ marginBottom: 16 }}
                    mode="outlined"
                  />
                  
                  <Text style={{ fontWeight: 'bold', marginBottom: 4 }}>Email</Text>
                  <TextInput
                    value={editedClient?.email || ''}
                    onChangeText={(text) => setEditedClient({ ...editedClient!, email: text })}
                    style={{ marginBottom: 16 }}
                    mode="outlined"
                  />
                  
                  <Text style={{ fontWeight: 'bold', marginBottom: 4 }}>Phone</Text>
                  <TextInput
                    value={editedClient?.phone || ''}
                    onChangeText={(text) => setEditedClient({ ...editedClient!, phone: text })}
                    style={{ marginBottom: 16 }}
                    mode="outlined"
                  />
                  
                  <Text style={{ fontWeight: 'bold', marginBottom: 4 }}>Address</Text>
                  <TextInput
                    value={editedClient?.address || ''}
                    onChangeText={(text) => setEditedClient({ ...editedClient!, address: text })}
                    style={{ marginBottom: 16 }}
                    mode="outlined"
                  />
                  
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <View style={{ flex: 2 }}>
                      <Text style={{ fontWeight: 'bold', marginBottom: 4 }}>City</Text>
                      <TextInput
                        value={editedClient?.city || ''}
                        onChangeText={(text) => setEditedClient({ ...editedClient!, city: text })}
                        style={{ marginBottom: 16 }}
                        mode="outlined"
                      />
                    </View>
                    
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: 'bold', marginBottom: 4 }}>State</Text>
                      <TextInput
                        value={editedClient?.state || ''}
                        onChangeText={(text) => setEditedClient({ ...editedClient!, state: text })}
                        style={{ marginBottom: 16 }}
                        mode="outlined"
                      />
                    </View>
                    
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: 'bold', marginBottom: 4 }}>ZIP</Text>
                      <TextInput
                        value={editedClient?.zip || ''}
                        onChangeText={(text) => setEditedClient({ ...editedClient!, zip: text })}
                        style={{ marginBottom: 16 }}
                        mode="outlined"
                      />
                    </View>
                  </View>
                  
                  <Text style={{ fontWeight: 'bold', marginBottom: 4 }}>Tag</Text>
                  <TextInput
                    value={editedClient?.tag || ''}
                    onChangeText={(text) => setEditedClient({ ...editedClient!, tag: text })}
                    style={{ marginBottom: 16 }}
                    mode="outlined"
                  />
                  
                  <Text style={{ fontWeight: 'bold', marginBottom: 4 }}>Notes</Text>
                  <TextInput
                    value={editedClient?.notes || ''}
                    onChangeText={(text) => setEditedClient({ ...editedClient!, notes: text })}
                    style={{ marginBottom: 16 }}
                    mode="outlined"
                    multiline
                    numberOfLines={4}
                  />
                  
                  <Button 
                    mode="contained" 
                    onPress={handleSaveClient}
                    loading={saving}
                    disabled={saving}
                  >
                    Save Changes
                  </Button>
                </Card.Content>
              </Card>
            </View>
          )}
          
          {/* Jobs Tab */}
          {activeTab === 1 && (
            <View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
                <Text style={{ fontSize: 18, fontWeight: 'bold' }}>Jobs</Text>
                <Button 
                  mode="contained" 
                  onPress={() => router.push({ pathname: '/jobs/form', params: { client_id: id } })}
                >
                  Add New Job
                </Button>
              </View>
              
              <DataTable>
                <DataTable.Header>
                  <DataTable.Title>Title</DataTable.Title>
                  <DataTable.Title>Status</DataTable.Title>
                  <DataTable.Title>Start Date</DataTable.Title>
                  <DataTable.Title>End Date</DataTable.Title>
                  <DataTable.Title>Actions</DataTable.Title>
                </DataTable.Header>
                
                {jobs.length === 0 ? (
                  <DataTable.Row>
                    <DataTable.Cell>No jobs found for this client</DataTable.Cell>
                  </DataTable.Row>
                ) : (
                  jobs.map(job => (
                    <DataTable.Row key={job.uid}>
                      <DataTable.Cell>{job.title}</DataTable.Cell>
                      <DataTable.Cell>{job.status}</DataTable.Cell>
                      <DataTable.Cell>{formatDate(job.start_date)}</DataTable.Cell>
                      <DataTable.Cell>{formatDate(job.end_date)}</DataTable.Cell>
                      <DataTable.Cell>
                        <View style={{ flexDirection: 'row' }}>
                          <IconButton 
                            icon="eye" 
                            onPress={() => router.push(`/jobs/${job.uid}`)} 
                          />
                          <IconButton 
                            icon="pencil" 
                            onPress={() => router.push(`/jobs/${job.uid}`)} 
                          />
                        </View>
                      </DataTable.Cell>
                    </DataTable.Row>
                  ))
                )}
              </DataTable>
            </View>
          )}
          
          {/* Invoices Tab */}
          {activeTab === 2 && (
            <View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
                <Text style={{ fontSize: 18, fontWeight: 'bold' }}>Invoices</Text>
                <Button 
                  mode="contained" 
                  onPress={() => router.push({ pathname: '/invoices/form', params: { client_id: id } })}
                >
                  Create New Invoice
                </Button>
              </View>
              
              <DataTable>
                <DataTable.Header>
                  <DataTable.Title>Invoice #</DataTable.Title>
                  <DataTable.Title>Issue Date</DataTable.Title>
                  <DataTable.Title>Due Date</DataTable.Title>
                  <DataTable.Title>Total</DataTable.Title>
                  <DataTable.Title>Status</DataTable.Title>
                  <DataTable.Title>Actions</DataTable.Title>
                </DataTable.Header>
                
                {invoices.length === 0 ? (
                  <DataTable.Row>
                    <DataTable.Cell>No invoices found for this client</DataTable.Cell>
                  </DataTable.Row>
                ) : (
                  invoices.map(invoice => (
                    <DataTable.Row key={invoice.uid}>
                      <DataTable.Cell>{invoice.invoice_number}</DataTable.Cell>
                      <DataTable.Cell>{formatDate(invoice.issue_date)}</DataTable.Cell>
                      <DataTable.Cell>{formatDate(invoice.due_date)}</DataTable.Cell>
                      <DataTable.Cell>{formatCurrency(invoice.total)}</DataTable.Cell>
                      <DataTable.Cell>{invoice.status}</DataTable.Cell>
                      <DataTable.Cell style={{ justifyContent: 'flex-end' }}>
                        <View style={{ flexDirection: 'row' }}>
                          <IconButton 
                            icon="pencil" 
                            size={20}
                            onPress={() => router.push(`/invoices/${invoice.uid}/edit`)} 
                          />
                          <IconButton 
                            icon="delete" 
                            size={20}
                            iconColor="#FF3B30"
                            onPress={() => confirmDeleteInvoice(invoice.uid)}
                          />
                        </View>
                      </DataTable.Cell>
                    </DataTable.Row>
                  ))
                )}
              </DataTable>
            </View>
          )}
          
          {/* Logs Tab */}
          {activeTab === 3 && (
            <View>
              <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 16 }}>Activity Logs</Text>
              <Card>
                <Card.Content>
                  <Text>No activity logs available yet.</Text>
                </Card.Content>
              </Card>
            </View>
          )}
        </ScrollView>
      </View>
      <Portal>
        <Dialog
          visible={deleteConfirmVisible}
          onDismiss={() => setDeleteConfirmVisible(false)}
        >
          <Dialog.Title>Delete Invoice</Dialog.Title>
          <Dialog.Content>
            <Text>Are you sure you want to delete this invoice? This action cannot be undone.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDeleteConfirmVisible(false)}>Cancel</Button>
            <Button onPress={handleDeleteInvoice} textColor="#FF3B30">Delete</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={3000}
        action={{
          label: 'OK',
          onPress: () => setSnackbarVisible(false),
        }}
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
}); 