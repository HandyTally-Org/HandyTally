import React, { useState, useEffect } from 'react';
import { View, ScrollView } from 'react-native';
import { Text, ActivityIndicator, Button, Snackbar } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { InvoiceForm } from '../../../components/InvoiceForm';

export default function EditInvoiceJobScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [clients, setClients] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [lastInvoiceNumber, setLastInvoiceNumber] = useState('');
  const [jobId, setJobId] = useState(null);

  useEffect(() => {
    if (invoice) {
      console.log('Invoice state updated:', {
        uid: invoice.uid,
        invoice_number: invoice.invoice_number,
        job_id: invoice.job_id
      });
    }
  }, [invoice]);

  useEffect(() => {
    fetchClients();
    fetchJobs();
    fetchLastInvoiceNumber();
    
    // Check if we have invoice data in localStorage
    if (typeof window !== 'undefined') {
      try {
        const editInvoiceDataString = localStorage.getItem('editInvoiceData');
        console.log('Found invoice data in localStorage:', editInvoiceDataString);
        
        if (editInvoiceDataString) {
          // Parse the invoice data
          const editInvoiceData = JSON.parse(editInvoiceDataString);
          console.log('Parsed invoice data:', editInvoiceData);
          
          // Save jobId for return navigation
          setJobId(editInvoiceData.jobId);
          
          // Clear the localStorage item
          localStorage.removeItem('editInvoiceData');
          
          // Fetch the invoice data from the database
          fetchInvoiceData(editInvoiceData.invoiceId);
        }
      } catch (error) {
        console.error('Error handling edit invoice data:', error);
      }
    }
  }, []);

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
  
  const fetchJobs = async () => {
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('*, clients(name)')
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      
      setJobs(data || []);
    } catch (error) {
      console.error('Error fetching jobs:', error);
    }
  };

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

  const fetchInvoiceData = async (invoiceId) => {
    console.log('Starting to fetch invoice data for ID:', invoiceId);
    try {
      setLoading(true);
      
      // Fetch invoice with more complete job information
      const { data: invoiceData, error: invoiceError } = await supabase
        .from('invoices')
        .select('*, jobs(*)')
        .eq('uid', invoiceId)
        .single();

      console.log('Invoice data retrieved:', invoiceData); // Debug log
      
      if (invoiceError) {
        console.error('Error fetching invoice:', invoiceError);
        throw invoiceError;
      }
      
      if (!invoiceData) {
        throw new Error(`No invoice found with ID: ${invoiceId}`);
      }
      
      // Then fetch invoice items separately
      const { data: itemsData, error: itemsError } = await supabase
        .from('invoice_items')
        .select('*')
        .eq('invoice_id', invoiceId);
        
      console.log('Invoice items retrieved:', itemsData?.length || 0); // Debug log
      
      if (itemsError) {
        console.error('Error fetching invoice items:', itemsError);
      }
      
      // Combine the data, making sure job_id is set correctly
      const fullInvoice = {
        ...invoiceData,
        job_id: invoiceData.job_id, // Ensure job_id is explicitly set
        invoice_items: itemsData || []
      };
      
      console.log('Setting invoice with number:', fullInvoice.invoice_number);
      console.log('Job ID in invoice:', fullInvoice.job_id);
      setInvoice(fullInvoice);
      
      // Make sure to set the jobId for navigation back
      if (invoiceData.job_id) {
        setJobId(invoiceData.job_id);
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
          invoice_number: updatedInvoice.invoice_number,
          job_id: updatedInvoice.job_id,
          client_id: updatedInvoice.client_id,
          issue_date: updatedInvoice.issue_date,
          due_date: updatedInvoice.due_date,
          subtotal: updatedInvoice.subtotal,
          tax_rate: updatedInvoice.tax_rate,
          tax_amount: updatedInvoice.tax_amount,
          total: updatedInvoice.total,
          notes: updatedInvoice.notes,
          status: updatedInvoice.status,
        })
        .eq('uid', invoiceId);

      if (invoiceError) throw invoiceError;
      
      // Handle invoice items: first delete existing items
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
          amount: item.amount,
          type: item.type || 'other',
          service_id: item.service_id || null,
          material_id: item.material_id || null
        }));

        const { error: insertError } = await supabase
          .from('invoice_items')
          .insert(itemsToInsert);

        if (insertError) throw insertError;
      }
      
      showSnackbar('Invoice updated successfully');
      
      // Navigate back to the job details page if jobId exists
      if (jobId) {
        router.push(`/jobs/${jobId}`);
      } else {
        router.push('/invoices');
      }
      
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
            <Text>Job ID: {invoice.job_id}</Text>
            <Text>Last Invoice #: {lastInvoiceNumber}</Text>
          </View>
          
          <ForcedInvoiceForm 
            invoice={invoice}
            jobs={jobs}
            clients={clients}
            onSubmit={handleSaveInvoice}
            onCancel={() => jobId ? router.push(`/jobs/${jobId}`) : router.back()}
          />
        </>
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

function ForcedInvoiceForm({ invoice, jobs, clients, onSubmit, onCancel }) {
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
          job_id: invoice.job_id,
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
      />
    </View>
  );
} 