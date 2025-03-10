import React, { useState, useEffect } from 'react';
import { View, ScrollView } from 'react-native';
import { Text, ActivityIndicator, Button, Snackbar } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { InvoiceForm } from '../../../components/InvoiceForm';

export default function EditInvoiceScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  useEffect(() => {
    if (id) {
      fetchInvoiceDetails();
    }
  }, [id]);

  useEffect(() => {
    // Check if we have invoice data in localStorage
    if (typeof window !== 'undefined') {
      try {
        const editInvoiceDataString = localStorage.getItem('editInvoiceData');
        if (editInvoiceDataString) {
          // Parse the invoice data
          const editInvoiceData = JSON.parse(editInvoiceDataString);
          
          // Clear the localStorage item to prevent it from being used again
          localStorage.removeItem('editInvoiceData');
          
          // Fetch the invoice data from the database
          fetchInvoiceData(editInvoiceData.invoiceId);
        }
      } catch (error) {
        console.error('Error handling edit invoice data:', error);
      }
    }
  }, []);

  const fetchInvoiceDetails = async () => {
    try {
      setLoading(true);
      
      // First fetch just the invoice
      const { data: invoiceData, error: invoiceError } = await supabase
        .from('invoices')
        .select('*')
        .eq('uid', id)
        .single();

      if (invoiceError) throw invoiceError;
      
      // Then fetch invoice items separately
      const { data: itemsData, error: itemsError } = await supabase
        .from('invoice_items')
        .select('*')
        .eq('invoice_id', id);
        
      if (itemsError) {
        console.error('Error fetching invoice items:', itemsError);
      }
      
      // Combine the data
      setInvoice({
        ...invoiceData,
        invoice_items: itemsData || []
      });
      
    } catch (err) {
      console.error('Error fetching invoice details:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const showSnackbar = (message) => {
    setSnackbarMessage(message);
    setSnackbarVisible(true);
  };

  async function fetchInvoiceData(invoiceId) {
    try {
      setLoading(true);
      
      console.log('Fetching invoice with ID:', invoiceId);
      
      // Fetch just the invoice without trying to join related tables
      const { data: invoiceData, error: invoiceError } = await supabase
        .from('invoices')
        .select('*')
        .eq('uid', invoiceId)
        .single();
        
      if (invoiceError) {
        console.error('Error fetching invoice:', invoiceError);
        throw invoiceError;
      }
      
      console.log('Fetched invoice data:', invoiceData);
      
      // Set the invoice data
      setInvoice(invoiceData);
      
      // Separately fetch invoice items if needed
      const { data: itemsData, error: itemsError } = await supabase
        .from('invoice_items')
        .select('*')
        .eq('invoice_id', invoiceId);
        
      if (itemsError) {
        console.error('Error fetching invoice items:', itemsError);
      } else {
        console.log('Fetched invoice items:', itemsData);
        
        // Add them to the invoice object
        setInvoice({
          ...invoiceData,
          invoice_items: itemsData || []
        });
      }
      
    } catch (error) {
      console.error('Error fetching invoice data:', error);
      alert('Error loading invoice data: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  const handleSaveInvoice = async (updatedInvoice) => {
    try {
      // Update the invoice
      const { error: invoiceError } = await supabase
        .from('invoices')
        .update({
          invoice_number: updatedInvoice.invoice_number,
          client_id: updatedInvoice.client_id,
          job_id: updatedInvoice.job_id,
          issue_date: updatedInvoice.issue_date,
          due_date: updatedInvoice.due_date,
          subtotal: updatedInvoice.subtotal,
          tax_rate: updatedInvoice.tax_rate,
          tax_amount: updatedInvoice.tax_amount,
          total: updatedInvoice.total,
          notes: updatedInvoice.notes,
          status: updatedInvoice.status,
        })
        .eq('uid', id);
        
      if (invoiceError) throw invoiceError;
      
      // Handle invoice items
      // First delete existing items
      const { error: deleteError } = await supabase
        .from('invoice_items')
        .delete()
        .eq('invoice_id', id);

      if (deleteError) throw deleteError;

      // Then insert new items
      if (updatedInvoice.invoice_items && updatedInvoice.invoice_items.length > 0) {
        const itemsToInsert = updatedInvoice.invoice_items.map(item => ({
          invoice_id: id,
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
      
      // Navigate back to invoices page
      router.push('/invoices');
      
      // Show success message
      alert('Invoice updated successfully');
      
    } catch (error) {
      console.error('Error updating invoice:', error);
      alert('Error updating invoice');
    }
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
        <InvoiceForm 
          invoice={invoice}
          onSave={handleSaveInvoice}
          onCancel={() => router.back()}
        />
      ) : (
        <View style={{ padding: 20 }}>
          <Text>No invoice found with ID: {id}</Text>
          <Button mode="contained" onPress={() => router.back()} style={{ marginTop: 16 }}>
            Go Back
          </Button>
        </View>
      )}
      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={3000}
      >
        {snackbarMessage}
      </Snackbar>
    </ScrollView>
  );
} 