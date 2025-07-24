import { useState, useEffect } from 'react';
import { View, TouchableOpacity, FlatList, Platform, StyleSheet, Modal, ScrollView, Image } from 'react-native';
import { TextInput, Button, Card, Text, Divider, Menu, IconButton, DataTable, HelperText, List, Portal, Dialog } from 'react-native-paper';

export interface InvoiceFormProps {
  onSubmit: (invoiceData: any, items: any[]) => void;
  onCancel: () => void;
  initialInvoice?: Invoice;
  initialItems?: InvoiceItem[];
  isEditing?: boolean;
  submitting?: boolean;
  lastInvoiceNumber?: string;
  hideTitle?: boolean;
  companyLogo?: string | null;
}

export function InvoiceForm({ 
  onSubmit, 
  onCancel, 
  initialInvoice, 
  initialItems = [], 
  isEditing = false,
  submitting = false,
  lastInvoiceNumber = '',
  hideTitle = false,
  companyLogo
}: InvoiceFormProps) {
  // ... existing code ...

  return (
    <View style={{ flex: 1 }}>
      <Card style={{ backgroundColor: '#ffffff' }}>
        {!hideTitle && (
          <Card.Title 
            title={isEditing ? "Edit Invoice" : "Create Invoice"} 
            titleStyle={{ fontSize: 20, fontWeight: 'bold' }}
          />
        )}
        <Card.Content>
          {/* Add logo at the top */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
            {companyLogo ? (
              <Image 
                source={{ uri: `data:image/png;base64,${companyLogo}` }} 
                style={{ width: 150, height: 80, resizeMode: 'contain' }}
              />
            ) : (
              <View style={{ width: 150, height: 80 }} />
            )}
            
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#666' }}>
                {initialInvoice?.status === 'estimate' ? 'ESTIMATE' : 'INVOICE'} #
              </Text>
              <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#333' }}>
                {initialInvoice?.invoice_number}
              </Text>
            </View>
          </View>
          
          <View style={{ flexDirection: 'row', gap: 16, marginBottom: 16 }}>
            {/* ... rest of existing code ... */}
          </View>
        </Card.Content>
      </Card>
    </View>
  );
}

// Add the new styles for the logo display
const styles = StyleSheet.create({
  // ... existing styles ...
  
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
    paddingHorizontal: 10,
  },
  logo: {
    width: 150,
    height: 80,
    marginRight: 20,
  },
  logoPlaceholder: {
    width: 150,
    height: 80,
  },
  invoiceNumberContainer: {
    alignItems: 'flex-end',
  },
  invoiceNumberLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#666',
  },
  invoiceNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  // ... remaining styles ...
}); 