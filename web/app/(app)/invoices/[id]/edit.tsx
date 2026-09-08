import React, { useState, useEffect } from 'react';
import { View, ScrollView } from 'react-native';
import { Text, ActivityIndicator, Button } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../../lib/supabase';
import { InvoiceForm } from '../../../../components/InvoiceForm';

export default function EditInvoiceScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (id) {
      fetchInvoiceDetails();
    }
  }, [id]);

  const fetchInvoiceDetails = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('invoices')
        .select('*, invoice_items(*), client(*), job(*)')
        .eq('uid', id)
        .single();

      if (error) throw error;
      
      setInvoice(data);
    } catch (err) {
      console.error('Error fetching invoice details:', err);
      setError(err.message);
    } finally {
      setLoading(false);
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
          onSave={async (updatedInvoice) => {
            // Implement proper save logic
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
                  fee_type: updatedInvoice.fee_type || null,
                  fee_value: updatedInvoice.fee_value || 0,
                  fee_amount: updatedInvoice.fee_amount || 0,
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
                  notes: item.notes || null,
                  photos: item.photos || [],
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
          }}
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
    </ScrollView>
  );
} 