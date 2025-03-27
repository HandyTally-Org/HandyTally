import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, Button, Card, TextInput, ActivityIndicator, IconButton, Snackbar } from 'react-native-paper';
import { useLocalSearchParams, useRouter, Link } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { styles as globalStyles } from '../../../styles';
import { InvoiceForm } from '../../../components/InvoiceForm';

export default function EditInvoiceClientScreen() {
  const { id: invoiceId, client_id: clientId } = useLocalSearchParams();
  const router = useRouter();
  
  const [loading, setLoading] = useState(true);
  const [invoice, setInvoice] = useState(null);
  const [error, setError] = useState(null);
  const [lastInvoiceNumber, setLastInvoiceNumber] = useState('');
  const [clients, setClients] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  useEffect(() => {
    if (invoiceId) {
      fetchInvoiceData(invoiceId);
    }
    fetchClients();
    if (clientId) {
      fetchClientJobs(clientId);
    }
    fetchLastInvoiceNumber();
  }, [invoiceId, clientId]);

  useEffect(() => {
    if (invoice) {
      console.log('Invoice state updated:', {
        uid: invoice.uid,
        invoice_number: invoice.invoice_number,
        client_id: invoice.client_id
      });
    }
  }, [invoice]);

  const fetchLastInvoiceNumber = async () => {
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('invoice_number')
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) throw error;

      if (data && data.length > 0) {
        setLastInvoiceNumber(data[0].invoice_number);
      }
    } catch (error) {
      console.error('Error fetching last invoice number:', error);
    }
  };

  const fetchClients = async () => {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('name');

      if (error) throw error;
      
      setClients(data || []);
    } catch (error) {
      console.error('Error fetching clients:', error);
    }
  };

  const fetchClientJobs = async (clientId) => {
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      setJobs(data || []);
    } catch (error) {
      console.error('Error fetching jobs:', error);
    }
  };

  const onClientChange = async (selectedClientId) => {
    if (selectedClientId) {
      await fetchClientJobs(selectedClientId);
    } else {
      setJobs([]);
    }
  };

  const fetchInvoiceData = async (invoiceId) => {
    try {
      setLoading(true);
      
      // Fetch invoice details
      const { data: invoiceData, error: invoiceError } = await supabase
        .from('invoices')
        .select('*')
        .eq('uid', invoiceId)
        .single();
      
      if (invoiceError) throw invoiceError;
      
      // Fetch invoice items
      const { data: invoiceItemsData, error: itemsError } = await supabase
        .from('invoice_items')
        .select('*')
        .eq('invoice_id', invoiceId);
      
      if (itemsError) throw itemsError;
      
      // Transform the invoice items to have the expected field names
      const transformedItems = invoiceItemsData?.map(item => ({
        ...item,
        // Map database field names to what the form expects
        price: item.unit_price, // Map unit_price to price
        total: item.amount,     // Map amount to total
        // Keep the original fields too
        unit_price: item.unit_price,
        amount: item.amount
      })) || [];
      
      console.log('Transformed invoice items:', transformedItems);
      
      // Combine the data
      setInvoice({
        ...invoiceData,
        invoice_items: transformedItems
      });
      
      // If invoice has a client_id, fetch jobs for that client
      if (invoiceData.client_id) {
        fetchClientJobs(invoiceData.client_id);
      }
      
    } catch (err) {
      console.error('Error fetching invoice details:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveInvoice = async (updatedInvoice, updatedItems) => {
    try {
      const invoiceId = invoice.uid;
      
      // Update the invoice record
      const { error: invoiceError } = await supabase
        .from('invoices')
        .update({
          client_id: updatedInvoice.client_id,
          job_id: updatedInvoice.job_id,
          issue_date: updatedInvoice.issue_date,
          due_date: updatedInvoice.due_date,
          status: updatedInvoice.status,
          notes: updatedInvoice.notes,
          total: updatedInvoice.total,
          subtotal: updatedInvoice.subtotal,
          tax: updatedInvoice.tax,
          tax_rate: updatedInvoice.tax_rate,
          updated_at: new Date().toISOString()
        })
        .eq('uid', invoiceId);
      
      if (invoiceError) throw invoiceError;
      
      // Delete existing items
      const { error: deleteError } = await supabase
        .from('invoice_items')
        .delete()
        .eq('invoice_id', invoiceId);
      
      if (deleteError) throw deleteError;
      
      // Then insert new items
      if (updatedItems && updatedItems.length > 0) {
        const itemsToInsert = updatedItems.map(item => ({
          invoice_id: invoiceId,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.price,
          amount: item.total
        }));
        
        const { error: insertError } = await supabase
          .from('invoice_items')
          .insert(itemsToInsert);
        
        if (insertError) throw insertError;
      }
      
      showSnackbar('Invoice updated successfully');
      
      // Navigate back to client details page after successful save
      router.push(`/client-details?id=${invoice.client_id}`);
      
    } catch (error) {
      console.error('Error updating invoice:', error);
      showSnackbar(`Error: ${error.message}`);
    }
  };

  const showSnackbar = (message) => {
    setSnackbarMessage(message);
    setSnackbarVisible(true);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#fff' }}>
      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" />
          <Text style={{ marginTop: 16 }}>Loading invoice details...</Text>
        </View>
      ) : error ? (
        <View style={{ padding: 20, alignItems: 'center' }}>
          <Text style={{ color: 'red', marginBottom: 20 }}>{error}</Text>
          <Button mode="contained" onPress={() => router.back()}>
            Go Back
          </Button>
        </View>
      ) : invoice ? (
        <ForcedInvoiceForm
          invoice={invoice}
          jobs={jobs}
          clients={clients}
          onSubmit={handleSaveInvoice}
          onCancel={() => router.push(`/client-details?id=${invoice.client_id}`)}
          onClientChange={fetchClientJobs}
        />
      ) : (
        <View style={{ padding: 20, alignItems: 'center' }}>
          <Text style={{ marginBottom: 20 }}>Invoice not found</Text>
          <Button mode="contained" onPress={() => router.back()}>
            Go Back
          </Button>
        </View>
      )}
      
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
    </ScrollView>
  );
}

function ForcedInvoiceForm({ invoice, jobs, clients, onSubmit, onCancel, onClientChange }) {
  // Create a clean custom submit handler to ensure we preserve the values
  const handleSubmit = (formData, items) => {
    // Ensure the uid and invoice_number are preserved
    const preservedData = {
      ...formData,
      uid: invoice.uid,
      invoice_number: invoice.invoice_number
    };
    onSubmit(preservedData, items);
  };

  return (
    <View style={{ padding: 0 }}>
      {/* Simplify header to show we're editing the invoice */}
      <View style={{ backgroundColor: '#ffffff', padding: 16, marginBottom: 16 }}>
        <Text style={{ fontSize: 18, fontWeight: 'bold' }}>
          Editing Invoice #{invoice.invoice_number}
        </Text>
      </View>
      
      <InvoiceForm
        key={invoice.uid} // Force a complete remount with fresh state
        initialInvoice={{
          ...invoice,
          // Explicitly set these critical values
          uid: invoice.uid,
          invoice_number: invoice.invoice_number,
          client_id: invoice.client_id,
        }}
        initialItems={invoice.invoice_items}
        jobs={jobs}
        clients={clients}
        // Force the invoice number to be the one from our invoice
        forceInvoiceNumber={invoice.invoice_number}
        // Don't pass lastInvoiceNumber
        lastInvoiceNumber={null}
        isEditing={true}
        onSubmit={handleSubmit}
        onCancel={onCancel}
        onClientChange={onClientChange}
      />
    </View>
  );
} 