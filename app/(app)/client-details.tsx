import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Text, Button, Card, DataTable, TextInput, ActivityIndicator, IconButton, Portal, Dialog, Snackbar } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/api';
import { styles as globalStyles } from '../../styles';
import { formatDate } from '../../utils/formatting';
import { MaterialIcons } from '@expo/vector-icons';

export default function ClientDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const [client, setClient] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [activeSection, setActiveSection] = useState('info');
  const [loading, setLoading] = useState(true);
  const [editedClient, setEditedClient] = useState(null);
  const [saving, setSaving] = useState(false);
  const [jobToDelete, setJobToDelete] = useState<string | null>(null);
  const [invoiceToDelete, setInvoiceToDelete] = useState<string | null>(null);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [deleteType, setDeleteType] = useState<'job' | 'invoice' | null>(null);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

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

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const confirmDeleteJob = (jobId: string) => {
    setJobToDelete(jobId);
    setDeleteType('job');
    setDeleteConfirmVisible(true);
  };

  const confirmDeleteInvoice = (invoiceId: string) => {
    setInvoiceToDelete(invoiceId);
    setDeleteType('invoice');
    setDeleteConfirmVisible(true);
  };

  const handleDeleteItem = async () => {
    try {
      setLoading(true);
      
      if (deleteType === 'job' && jobToDelete) {
        // Delete job
        const { error } = await supabase
          .from('jobs')
          .delete()
          .eq('uid', jobToDelete);
        
        if (error) throw error;
        
        // Refresh jobs
        fetchClientDetails();
        setSnackbarMessage('Job deleted successfully');
      } 
      else if (deleteType === 'invoice' && invoiceToDelete) {
        // First delete invoice items
        const { error: itemsError } = await supabase
          .from('invoice_items')
          .delete()
          .eq('invoice_id', invoiceToDelete);
        
        if (itemsError) throw itemsError;
        
        // Then delete the invoice
        const { error } = await supabase
          .from('invoices')
          .delete()
          .eq('uid', invoiceToDelete);
        
        if (error) throw error;
        
        // Refresh invoices
        fetchClientDetails();
        setSnackbarMessage('Invoice deleted successfully');
      }
      
      setSnackbarVisible(true);
    } catch (error) {
      console.error('Error deleting item:', error);
      setSnackbarMessage(`Error: ${error.message}`);
      setSnackbarVisible(true);
    } finally {
      setLoading(false);
      setDeleteConfirmVisible(false);
      setJobToDelete(null);
      setInvoiceToDelete(null);
      setDeleteType(null);
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
    <View style={{ flex: 1 , backgroundColor: '#ffffff'}}>
      <Text style={{ fontSize: 12, fontWeight: '600', marginTop: 40, marginBottom: 12, paddingLeft: 16, color: '#666666' }}>CLIENT DETAILS</Text>
      
      <View style={{ flexDirection: 'row', flex: 1 }}>
        {/* Side Navigation with icons */}
        <View style={{ width: 200, backgroundColor: '#ffffff', borderRightWidth: 1, borderRightColor: '#e0e0e0', display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Info section */}
          <TouchableOpacity 
            style={{ 
              padding: 16,
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: activeSection === 'info' ? '#ccc' : 'transparent'
            }}
            onPress={() => setActiveSection('info')}
          >
            <View style={{ width: 24, marginRight: 12 }}>
              <MaterialIcons name="dashboard" size={20} color={activeSection === 'info' ? '#000' : '#666666'} />
            </View>
            <Text style={{ color: activeSection === 'info' ? '#000' : '#666666' }}>Info</Text>
          </TouchableOpacity>
          
          {/* Invoices section */}
          <TouchableOpacity 
            style={{ 
              padding: 16,
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: activeSection === 'invoices' ? '#ccc' : 'transparent'
            }}
            onPress={() => setActiveSection('invoices')}
          >
            <View style={{ width: 24, marginRight: 12 }}>
              <MaterialIcons name="description" size={20} color={activeSection === 'invoices' ? '#000' : '#666666'} />
            </View>
            <Text style={{ color: activeSection === 'invoices' ? '#000' : '#666666' }}>Invoices</Text>
          </TouchableOpacity>
          
          {/* Jobs section */}
          <TouchableOpacity 
            style={{ 
              padding: 16,
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: activeSection === 'jobs' ? '#ccc' : 'transparent'
            }}
            onPress={() => setActiveSection('jobs')}
          >
            <View style={{ width: 24, marginRight: 12 }}>
              <MaterialIcons name="work" size={20} color={activeSection === 'jobs' ? '#000' : '#666666'} />
            </View>
            <Text style={{ color: activeSection === 'jobs' ? '#000' : '#666666' }}>Jobs</Text>
          </TouchableOpacity>
          
          {/* Documentation header */}
          <View style={{ padding: 16, paddingBottom: 8 }}>
            <Text style={{ color: '#666', fontWeight: 'bold', fontSize: 12 }}>DOCUMENTATION</Text>
          </View>
          
          {/* Logs section */}
          <TouchableOpacity 
            style={{ 
              padding: 16,
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: activeSection === 'logs' ? '#ccc' : 'transparent'
            }}
            onPress={() => setActiveSection('logs')}
          >
            <View style={{ width: 24, marginRight: 12 }}>
              <MaterialIcons name="list-alt" size={20} color={activeSection === 'logs' ? '#000' : '#666666'} />
            </View>
            <Text style={{ color: activeSection === 'logs' ? '#000' : '#666666' }}>Logs</Text>
          </TouchableOpacity>
          
          {/* Spacer to push the back button to the bottom */}
          <View style={{ flex: 1 }} />
          
          {/* Back to Clients button */}
          <TouchableOpacity 
            style={{ 
              padding: 16,
              flexDirection: 'row',
              alignItems: 'center',
              borderTopWidth: 1,
              borderTopColor: '#e0e0e0',
              marginTop: 'auto'
            }}
            onPress={() => router.push('/clients')}
          >
            <View style={{ width: 24, marginRight: 12 }}>
              <MaterialIcons name="arrow-back" size={20} color="#666666" />
            </View>
            <Text style={{ color: '#666666' }}>Back to Clients</Text>
          </TouchableOpacity>
        </View>
        
        {/* Main Content */}
        <ScrollView style={{ flex: 1, padding: 16, borderWidth: 0, borderColor: '#e0e0e0' }}>
          {activeSection === 'info' && (
            <View style={{ backgroundColor: '#ffffff' }}>
              <Text style={{ fontSize: 20, fontWeight: 'normal', marginBottom: 16, backgroundColor: '#ffffff' }}>Client Information</Text>
              
              <View style={{ marginBottom: 16, backgroundColor: '#ffffff' }}>
                <Text style={{ fontWeight: 'bold', marginBottom: 4 }}>Name</Text>
                <TextInput
                  value={editedClient?.name || ''}
                  onChangeText={(text) => setEditedClient({ ...editedClient, name: text })}
                  style={{ marginBottom: 16 }}
                  mode="outlined"
                />
                
                <Text style={{ fontWeight: 'bold', marginBottom: 4 }}>Email</Text>
                <TextInput
                  value={editedClient?.email || ''}
                  onChangeText={(text) => setEditedClient({ ...editedClient, email: text })}
                  style={{ marginBottom: 16 }}
                  mode="outlined"
                />
                
                <Text style={{ fontWeight: 'bold', marginBottom: 4 }}>Phone</Text>
                <TextInput
                  value={editedClient?.phone || ''}
                  onChangeText={(text) => setEditedClient({ ...editedClient, phone: text })}
                  style={{ marginBottom: 16 }}
                  mode="outlined"
                />
                
                <Text style={{ fontWeight: 'bold', marginBottom: 4 }}>Address</Text>
                <TextInput
                  value={editedClient?.address || ''}
                  onChangeText={(text) => setEditedClient({ ...editedClient, address: text })}
                  style={{ marginBottom: 16 }}
                  mode="outlined"
                />
                
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 2 }}>
                    <Text style={{ fontWeight: 'bold', marginBottom: 4 }}>City</Text>
                    <TextInput
                      value={editedClient?.city || ''}
                      onChangeText={(text) => setEditedClient({ ...editedClient, city: text })}
                      style={{ marginBottom: 16 }}
                      mode="outlined"
                    />
                  </View>
                  
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: 'bold', marginBottom: 4 }}>State</Text>
                    <TextInput
                      value={editedClient?.state || ''}
                      onChangeText={(text) => setEditedClient({ ...editedClient, state: text })}
                      style={{ marginBottom: 16 }}
                      mode="outlined"
                    />
                  </View>
                  
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: 'bold', marginBottom: 4 }}>ZIP</Text>
                    <TextInput
                      value={editedClient?.zip || ''}
                      onChangeText={(text) => setEditedClient({ ...editedClient, zip: text })}
                      style={{ marginBottom: 16 }}
                      mode="outlined"
                    />
                  </View>
                </View>
                
                <Text style={{ fontWeight: 'bold', marginBottom: 4 }}>Tag</Text>
                <TextInput
                  value={editedClient?.tag || ''}
                  onChangeText={(text) => setEditedClient({ ...editedClient, tag: text })}
                  style={{ marginBottom: 16 }}
                  mode="outlined"
                />
                
                <Text style={{ fontWeight: 'bold', marginBottom: 4 }}>Notes</Text>
                <TextInput
                  value={editedClient?.notes || ''}
                  onChangeText={(text) => setEditedClient({ ...editedClient, notes: text })}
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
              </View>
            </View>
          )}
          
          {activeSection === 'jobs' && (
            <View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
                <Text style={{ fontSize: 20, fontWeight: 'bold' }}>Jobs</Text>
                <Button 
                  mode="contained" 
                  onPress={() => router.push(`/jobs?client_id=${id}`)}
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
                  <DataTable.Title style={{ justifyContent: 'center' }}>Actions</DataTable.Title>
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
                      <DataTable.Cell style={{ justifyContent: 'center' }}>
                        <View style={{ flexDirection: 'row' }}>
                          <IconButton 
                            icon="pencil" 
                            size={20}
                            onPress={() => router.push(`/jobs/${job.uid}/edit`)} 
                          />
                          <IconButton 
                            icon="delete" 
                            size={20}
                            iconColor="#FF3B30"
                            onPress={() => confirmDeleteJob(job.uid)}
                          />
                        </View>
                      </DataTable.Cell>
                    </DataTable.Row>
                  ))
                )}
              </DataTable>
            </View>
          )}
          
          {activeSection === 'invoices' && (
            <View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
                <Text style={{ fontSize: 20, fontWeight: 'bold' }}>Invoices</Text>
                <Button 
                  mode="contained" 
                  onPress={() => router.push(`/invoices?client_id=${id}`)}
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
                  <DataTable.Title style={{ justifyContent: 'center' }}>Actions</DataTable.Title>
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
                      <DataTable.Cell style={{ justifyContent: 'center' }}>
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
          
          {activeSection === 'logs' && (
            <View>
              <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 16 }}>Activity Logs</Text>
              <Card 
                style={{ 
                  marginBottom: 16, 
                  backgroundColor: '#ffffff',
                  elevation: 0,
                  shadowOpacity: 0,
                  borderWidth: 0,
                  borderRadius: 0,
                  shadowColor: 'transparent',
                  shadowRadius: 0,
                  shadowOffset: { width: 0, height: 0 }
                }}
              >
                <Card.Content style={{ 
                  backgroundColor: '#ffffff',
                  padding: 0
                }}>
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
          <Dialog.Title>Delete {deleteType === 'job' ? 'Job' : 'Invoice'}</Dialog.Title>
          <Dialog.Content>
            <Text>Are you sure you want to delete this {deleteType === 'job' ? 'job' : 'invoice'}? This action cannot be undone.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDeleteConfirmVisible(false)}>Cancel</Button>
            <Button onPress={handleDeleteItem} textColor="#FF3B30">Delete</Button>
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