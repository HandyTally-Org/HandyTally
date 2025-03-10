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
    console.log('Starting to fetch invoice data for ID:', invoiceId);
    try {
      setLoading(true);
      
      // Fetch the invoice with items
      const { data: invoiceData, error: invoiceError } = await supabase
        .from('invoices')
        .select('*')
        .eq('uid', invoiceId)
        .single();
      
      if (invoiceError) throw invoiceError;
      
      if (!invoiceData) {
        throw new Error('Invoice not found');
      }
      
      console.log('Fetched invoice:', invoiceData);
      
      // Fetch invoice items
      const { data: invoiceItemsData, error: itemsError } = await supabase
        .from('invoice_items')
        .select('*')
        .eq('invoice_id', invoiceId);
      
      if (itemsError) throw itemsError;
      
      console.log('Fetched invoice items:', invoiceItemsData);
      
      // Add the items to the invoice object
      const completeInvoice = {
        ...invoiceData,
        invoice_items: invoiceItemsData || []
      };
      
      setInvoice(completeInvoice);
      
      // Fetch jobs for the invoice's client
      if (invoiceData.client_id) {
        await fetchClientJobs(invoiceData.client_id);
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
          job_id: updatedInvoice.job_id,
          client_id: updatedInvoice.client_id,
          invoice_number: updatedInvoice.invoice_number,
          invoice_date: updatedInvoice.invoice_date,
          due_date: updatedInvoice.due_date,
          total_amount: updatedInvoice.total_amount,
          status: updatedInvoice.status,
          notes: updatedInvoice.notes,
          updated_at: new Date().toISOString()
        })
        .eq('uid', invoiceId);
      
      if (invoiceError) throw invoiceError;
      
      // Delete existing invoice items
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
          unit_price: item.unit_price,
          amount: item.amount
        }));
        
        const { error: insertError } = await supabase
          .from('invoice_items')
          .insert(itemsToInsert);
        
        if (insertError) throw insertError;
      }
      
      // Show success message
      showSnackbar('Invoice updated successfully');
      
      // Navigate back to the client detail page
      setTimeout(() => {
        if (clientId) {
          router.push(`/clients/${clientId}`);
        } else {
          router.back();
        }
      }, 1500);
      
    } catch (error) {
      console.error('Error updating invoice:', error);
      showSnackbar(`Error: ${error.message}`);
    }
  };

  const showSnackbar = (message) => {
    setSnackbarMessage(message);
    setSnackbarVisible(true);
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 16 }}>Loading invoice details...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Text style={{ color: 'red' }}>Error: {error}</Text>
        <Button mode="contained" onPress={() => router.back()} style={{ marginTop: 16 }}>
          Go Back
        </Button>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#fff' }}>
      {invoice ? (
        <>
          <View style={{ padding: 10, backgroundColor: '#ffffff', marginBottom: 10 }}>
            <Text style={{ fontWeight: 'bold' }}>Debug Info:</Text>
            <Text>Invoice UID: {invoice.uid}</Text>
            <Text>Invoice #: {invoice.invoice_number}</Text>
            <Text>Client ID: {invoice.client_id}</Text>
            <Text>Last Invoice #: {lastInvoiceNumber}</Text>
          </View>
          
          <ForcedInvoiceForm 
            invoice={invoice}
            jobs={jobs}
            clients={clients}
            onSubmit={handleSaveInvoice}
            onCancel={() => clientId ? router.push(`/clients/${clientId}`) : router.back()}
            onClientChange={onClientChange}
          />
        </>
      ) : (
        <View style={{ padding: 20, alignItems: 'center' }}>
          <Text>No invoice data found</Text>
          <Button 
            mode="contained" 
            onPress={() => router.back()}
            style={{ marginTop: 16 }}
          >
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
  // Enhanced logging when component mounts
  useEffect(() => {
    console.log('DETAILED INVOICE DATA:', JSON.stringify(invoice, null, 2));
  }, []);

  // Create a clean custom submit handler to ensure we preserve the values
  const handleSubmit = (formData, items) => {
    // Ensure the uid and invoice_number are preserved
    const preservedData = {
      ...formData,
      uid: invoice.uid,
      invoice_number: invoice.invoice_number
    };
    console.log('Submitting with preserved data:', preservedData);
    onSubmit(preservedData, items);
  };

  return (
    <View style={{ padding: 0 }}>
      {/* Added header to show we're definitely editing the right invoice */}
      <View style={{ backgroundColor: '#ffffff', padding: 16, marginBottom: 16 }}>
        <Text style={{ fontSize: 18, fontWeight: 'bold' }}>
          Editing Invoice #{invoice.invoice_number}
        </Text>
        <Text>ID: {invoice.uid}</Text>
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