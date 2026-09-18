import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Text, Button, Card, DataTable, TextInput, ActivityIndicator, IconButton, Snackbar } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/api';
import { styles as globalStyles } from '../../styles';
import { formatDate, formatPhone } from '../../utils/formatting';
import { MaterialIcons } from '@expo/vector-icons';
import { NotesSection } from '../../components/NotesSection';
import { useRefreshOnFocus } from '../../hooks/useRefreshOnFocus';
import { useCustomFields } from '../../hooks/useCustomFields';
import { CustomFieldInputs } from '../../components/CustomFields';
import { normalizeCustomValues, validateCustomValues } from '../../constants/customFields';
import { useLabels } from '../../hooks/useLabels';
import { findLabel, labelText } from '../../constants/labels';
import { FormField, FormRow } from '../../components/FormDialog';
import { FormActions, FormPanel, FormSection, useOutlinedInputProps } from '../../components/FormLayout';
import { themed } from '../../constants/Colors';
import { useFeedback } from '../../contexts/FeedbackContext';

export default function ClientDetailsScreen() {
  const router = useRouter();
  const { notify, confirm } = useFeedback();
  const outlinedInputProps = useOutlinedInputProps();
  const { id } = useLocalSearchParams();
  const [client, setClient] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [activeSection, setActiveSection] = useState('info');
  const [loading, setLoading] = useState(true);
  const [editedClient, setEditedClient] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  // HT-52: the organisation's custom fields, edited alongside the built-in ones.
  const customDefs = useCustomFields('clients');
  // HT-80: the same label-backed tag values the Clients list dropdown uses.
  const clientTags = useLabels('client_tag');
  const [customErrors, setCustomErrors] = useState<Record<string, string>>({});
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  useRefreshOnFocus(() => {
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
    
    const customValues = editedClient.custom_fields ?? {};
    const nextCustomErrors = validateCustomValues(customDefs, customValues);
    setCustomErrors(nextCustomErrors);
    if (Object.keys(nextCustomErrors).length > 0) return;

    // HT-66: clients.zip is numeric, so a cleared field must go up as null and
    // anything that is not a number is rejected here instead of by Postgres.
    const zipText = String(editedClient.zip ?? '').trim();
    if (zipText && !/^\d+$/.test(zipText)) {
      notify('ZIP must contain digits only', 'error');
      return;
    }
    const zip = zipText ? Number(zipText) : null;

    try {
      setSaving(true);
      
      const { error } = await supabase
        .from('clients')
        .update({
          custom_fields: normalizeCustomValues(customDefs, customValues),
          name: editedClient.name,
          email: editedClient.email,
          phone: editedClient.phone,
          address: editedClient.address,
          city: editedClient.city,
          state: editedClient.state,
          zip,
          tag: editedClient.tag,
          notes: editedClient.notes
        })
        .eq('uid', id);
      
      if (error) throw error;
      
      setClient(editedClient);
      notify('Client updated successfully', 'success');
      
    } catch (error) {
      console.error('Error updating client:', error);
      notify('Error updating client', 'error');
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

  // HT-89: both tabs ask through the shared confirm dialog (HT-84) and then
  // run the same deletes as before.
  const confirmDeleteJob = async (job: { uid: string; title: string }) => {
    const ok = await confirm({
      title: 'Delete job',
      message: `Delete "${job.title}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (ok) await handleDeleteItem('job', job.uid);
  };

  const confirmDeleteInvoice = async (invoice: { uid: string; invoice_number: string | number }) => {
    const ok = await confirm({
      title: 'Delete invoice',
      message: `Delete invoice #${invoice.invoice_number}? This cannot be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (ok) await handleDeleteItem('invoice', invoice.uid);
  };

  const handleDeleteItem = async (deleteType: 'job' | 'invoice', uid: string) => {
    try {
      setLoading(true);

      if (deleteType === 'job') {
        // Delete job
        const { error } = await supabase
          .from('jobs')
          .delete()
          .eq('uid', uid);

        if (error) throw error;

        // Refresh jobs
        fetchClientDetails();
        setSnackbarMessage('Job deleted successfully');
      }
      else {
        // First delete invoice items
        const { error: itemsError } = await supabase
          .from('invoice_items')
          .delete()
          .eq('invoice_id', uid);

        if (itemsError) throw itemsError;

        // Then delete the invoice
        const { error } = await supabase
          .from('invoices')
          .delete()
          .eq('uid', uid);

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
    <View style={{ flex: 1 , backgroundColor: themed.panel}}>
      <Text style={{ fontSize: 12, fontWeight: '600', marginTop: 40, marginBottom: 12, paddingLeft: 16, color: themed.muted }}>CLIENT DETAILS</Text>
      
      <View style={{ flexDirection: 'row', flex: 1 }}>
        {/* Side Navigation with icons */}
        <View style={{ width: 200, backgroundColor: themed.panel, borderRightWidth: 1, borderRightColor: themed.line, display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Info section */}
          <TouchableOpacity 
            style={{ 
              padding: 16,
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: activeSection === 'info' ? themed.active : 'transparent'
            }}
            onPress={() => setActiveSection('info')}
          >
            <View style={{ width: 24, marginRight: 12 }}>
              <MaterialIcons name="dashboard" size={20} color={themed.navDashboard} />
            </View>
            <Text style={{ color: activeSection === 'info' ? themed.text : themed.muted }}>Info</Text>
          </TouchableOpacity>
          
          {/* Invoices section */}
          <TouchableOpacity 
            style={{ 
              padding: 16,
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: activeSection === 'invoices' ? themed.active : 'transparent'
            }}
            onPress={() => setActiveSection('invoices')}
          >
            <View style={{ width: 24, marginRight: 12 }}>
              <MaterialIcons name="description" size={20} color={themed.navInvoices} />
            </View>
            <Text style={{ color: activeSection === 'invoices' ? themed.text : themed.muted }}>Invoices</Text>
          </TouchableOpacity>
          
          {/* Jobs section */}
          <TouchableOpacity 
            style={{ 
              padding: 16,
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: activeSection === 'jobs' ? themed.active : 'transparent'
            }}
            onPress={() => setActiveSection('jobs')}
          >
            <View style={{ width: 24, marginRight: 12 }}>
              <MaterialIcons name="work" size={20} color={themed.navJobs} />
            </View>
            <Text style={{ color: activeSection === 'jobs' ? themed.text : themed.muted }}>Jobs</Text>
          </TouchableOpacity>
          
          {/* Documentation header */}
          <View style={{ padding: 16, paddingBottom: 8 }}>
            <Text style={{ color: themed.muted, fontWeight: 'bold', fontSize: 12 }}>DOCUMENTATION</Text>
          </View>
          
          {/* Notes section */}
          <TouchableOpacity 
            style={{ 
              padding: 16,
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: activeSection === 'notes' ? themed.active : 'transparent'
            }}
            onPress={() => setActiveSection('notes')}
          >
            <View style={{ width: 24, marginRight: 12 }}>
              <MaterialIcons name="sticky-note-2" size={20} color={themed.railNotes} />
            </View>
            <Text style={{ color: activeSection === 'notes' ? themed.text : themed.muted }}>Notes</Text>
          </TouchableOpacity>
          
          {/* Logs section */}
          <TouchableOpacity 
            style={{ 
              padding: 16,
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: activeSection === 'logs' ? themed.active : 'transparent'
            }}
            onPress={() => setActiveSection('logs')}
          >
            <View style={{ width: 24, marginRight: 12 }}>
              <MaterialIcons name="list-alt" size={20} color={themed.railLogs} />
            </View>
            <Text style={{ color: activeSection === 'logs' ? themed.text : themed.muted }}>Logs</Text>
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
              borderTopColor: themed.line,
              marginTop: 'auto'
            }}
            onPress={() => router.push('/clients')}
          >
            <View style={{ width: 24, marginRight: 12 }}>
              <MaterialIcons name="arrow-back" size={20} color={themed.muted} />
            </View>
            <Text style={{ color: themed.muted }}>Back to Clients</Text>
          </TouchableOpacity>
        </View>
        
        {/* Main Content */}
        <ScrollView style={{ flex: 1, padding: 16, borderWidth: 0, borderColor: themed.line }}>
          {activeSection === 'info' && (
            <FormPanel title="Client Information" subtitle="Contact details, address and notes for this client.">
              <FormSection title="Contact">
                <FormField label="Name">
                  <TextInput
                    value={editedClient?.name || ''}
                    onChangeText={(text) => setEditedClient({ ...editedClient, name: text })}
                    {...outlinedInputProps}
                  />
                </FormField>
                <FormRow>
                  <FormField label="Email">
                    <TextInput
                      value={editedClient?.email || ''}
                      onChangeText={(text) => setEditedClient({ ...editedClient, email: text })}
                      {...outlinedInputProps}
                    />
                  </FormField>
                  <FormField label="Phone">
                    <TextInput
                      value={formatPhone(editedClient?.phone)}
                      onChangeText={(text) => setEditedClient({ ...editedClient, phone: formatPhone(text) })}
                      keyboardType="phone-pad"
                      maxLength={17}
                      placeholder="+1 (555) 555-0100"
                      {...outlinedInputProps}
                    />
                  </FormField>
                </FormRow>
              </FormSection>

              <FormSection title="Address">
                <FormField label="Address">
                  <TextInput
                    value={editedClient?.address || ''}
                    onChangeText={(text) => setEditedClient({ ...editedClient, address: text })}
                    {...outlinedInputProps}
                  />
                </FormField>
                <FormRow weights={[2, 1, 1]}>
                  <FormField label="City">
                    <TextInput
                      value={editedClient?.city || ''}
                      onChangeText={(text) => setEditedClient({ ...editedClient, city: text })}
                      {...outlinedInputProps}
                    />
                  </FormField>
                  <FormField label="State">
                    <TextInput
                      value={editedClient?.state || ''}
                      onChangeText={(text) => setEditedClient({ ...editedClient, state: text })}
                      {...outlinedInputProps}
                    />
                  </FormField>
                  <FormField label="ZIP">
                    <TextInput
                      value={editedClient?.zip || ''}
                      onChangeText={(text) => setEditedClient({ ...editedClient, zip: text })}
                      {...outlinedInputProps}
                    />
                  </FormField>
                </FormRow>
              </FormSection>

              <FormSection title="Details">
                <FormField label="Tag">
                  {/* HT-80: label-backed dropdown, matching the Clients list. A legacy
                      free-text value not in the label list stays selectable so saving
                      the form doesn't silently discard it. */}
                  <select
                    value={editedClient?.tag || ''}
                    onChange={(e) => setEditedClient({ ...editedClient, tag: e.target.value })}
                    style={{
                      padding: 8,
                      borderRadius: 4,
                      borderColor: themed.line,
                      backgroundColor: themed.panel,
                      color: themed.text,
                      fontWeight: 'bold',
                      width: '100%',
                    }}
                  >
                    <option value="">No Tag</option>
                    {editedClient?.tag && !findLabel(clientTags, editedClient.tag) && (
                      <option value={editedClient.tag}>{labelText(clientTags, editedClient.tag)}</option>
                    )}
                    {clientTags.map(tag => (
                      <option key={tag.value} value={tag.value}>{tag.label}</option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Notes">
                  <TextInput
                    value={editedClient?.notes || ''}
                    onChangeText={(text) => setEditedClient({ ...editedClient, notes: text })}
                    {...outlinedInputProps}
                    multiline
                    numberOfLines={4}
                  />
                </FormField>
              </FormSection>

              <CustomFieldInputs
                defs={customDefs}
                values={editedClient?.custom_fields ?? {}}
                errors={customErrors}
                onChange={(key, value) => {
                  setEditedClient({ ...editedClient, custom_fields: { ...(editedClient?.custom_fields ?? {}), [key]: value } });
                  if (customErrors[key]) setCustomErrors(current => ({ ...current, [key]: '' }));
                }}
              />

              <FormActions onSubmit={handleSaveClient} submitLabel="Save Changes" submitting={saving} />
            </FormPanel>
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
                            onPress={() => router.push(`/clients/editjobsclient?id=${job.uid}&client_id=${id}`)}
                          />
                          <IconButton 
                            icon="delete" 
                            size={20}
                            iconColor="#FF3B30"
                            onPress={() => confirmDeleteJob(job)}
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
                            onPress={() => router.push(`/clients/editinvoiceclients?id=${invoice.uid}&client_id=${id}`)} 
                          />
                          <IconButton 
                            icon="delete" 
                            size={20}
                            iconColor="#FF3B30"
                            onPress={() => confirmDeleteInvoice(invoice)}
                          />
                        </View>
                      </DataTable.Cell>
                    </DataTable.Row>
                  ))
                )}
              </DataTable>
            </View>
          )}
          
          {activeSection === 'notes' && <NotesSection clientId={String(id)} />}
          
          {activeSection === 'logs' && (
            <View>
              <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 16 }}>Activity Logs</Text>
              <Card 
                style={{ 
                  marginBottom: 16, 
                  backgroundColor: themed.panel,
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
                  backgroundColor: themed.panel,
                  padding: 0
                }}>
                  <Text>No activity logs available yet.</Text>
                </Card.Content>
              </Card>
            </View>
          )}
        </ScrollView>
      </View>
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