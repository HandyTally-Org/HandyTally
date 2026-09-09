import { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Platform, Image } from 'react-native';
import { Text, Button, Card, Divider, Chip, DataTable, Dialog, Portal, Menu } from 'react-native-paper';
import { styles as globalStyles } from '../styles';
import { Invoice, InvoiceItem } from '../app/(app)/invoices';
import { supabase } from '../lib/supabase';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { formatCurrency, formatDate } from '../utils/formatting';
import { generateInvoiceHTML } from '../utils/invoiceHtml';


export interface InvoiceDetailsProps {
  invoice: Invoice;
  items: InvoiceItem[];
  onClose: () => void;
  onEdit?: (invoice: Invoice) => void;
  onDelete?: (invoiceId: string) => void;
  onStatusChange?: (status: Invoice['status']) => void;
  isEditable?: boolean;
  isEditing?: boolean;
  companyLogo?: string | null;
}

export function InvoiceDetails({ 
  invoice, 
  items, 
  onClose, 
  onEdit, 
  onDelete, 
  onStatusChange,
  isEditable = true,
  isEditing = false,
  companyLogo
}: InvoiceDetailsProps) {
  const [loading, setLoading] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [statusMenuVisible, setStatusMenuVisible] = useState(false);
  const [companyInfo, setCompanyInfo] = useState(null);
  const [printLoading, setPrintLoading] = useState(false);
  
  // Ensure invoice_items exists with a default empty array
  const safeInvoice = {
    ...invoice,
    invoice_items: invoice?.invoice_items || []
  };
  
  useEffect(() => {
    console.log('Invoice object in component:', safeInvoice);
    console.log('Job information:', safeInvoice.job);
    fetchCompanyInfo();
  }, [safeInvoice.id]);

  async function fetchCompanyInfo() {
    try {
      const { data, error } = await supabase
        .from('company')
        .select('*')
        .single();
      
      if (!error && data) {
        setCompanyInfo(data);
      }
    } catch (error) {
      console.error('Error fetching company info:', error);
    }
  }

  const getStatusChipColor = (status: Invoice['status']) => {
    switch (status) {
      case 'draft': return '#9e9e9e';
      case 'sent': return '#2196F3';
      case 'paid': return '#4CAF50';
      case 'overdue': return '#F44336';
      case 'cancelled': return '#FF9800';
      default: return '#9e9e9e';
    }
  };

  const handleStatusChange = (status: Invoice['status']) => {
    onStatusChange(status);
  };

  const handleDelete = () => {
    if (onDelete) {
      console.log('Deleting invoice with ID:', safeInvoice.uid);
      onDelete(safeInvoice.uid);
    }
    setShowDeleteDialog(false);
  };

  const handlePrint = async () => {
    try {
      setPrintLoading(true);
      
      // Generate HTML for the invoice
      const html = generateInvoiceHTML(safeInvoice, items, companyInfo);
      
      // For web, create a new window with just the invoice HTML
      if (Platform.OS === 'web') {
        // Open a new window with only the invoice content
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.write(html);
          printWindow.document.close();
          
          // Wait for resources to load then print
          setTimeout(() => {
            printWindow.print();
          }, 500);
        }
      } 
      // For mobile, generate PDF and share
      else {
        const { uri } = await Print.printToFileAsync({ html });
        await Sharing.shareAsync(uri, {
          UTI: '.pdf',
          mimeType: 'application/pdf',
        });
      }
    } catch (error) {
      console.error('Error printing invoice:', error);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setPrintLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.contentWrapper}>
        <View style={styles.headerContainer}>
          {companyLogo ? (
            <Image 
              source={{ uri: `data:image/png;base64,${companyLogo}` }} 
              style={styles.logo} 
              resizeMode="contain"
            />
          ) : (
            <View style={styles.logoPlaceholder} />
          )}
          
          <View style={styles.invoiceNumberContainer}>
            <Text style={styles.invoiceNumberLabel}>
              {invoice.status === 'estimate' ? 'ESTIMATE' : 'INVOICE'} #
            </Text>
            <Text style={styles.invoiceNumber}>{invoice.invoice_number}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text>{safeInvoice.client ? safeInvoice.client.name : 'No client'}</Text>
          <Text>Status: {safeInvoice.status}</Text>
          <Text>Amount: {formatCurrency(safeInvoice.total)}</Text>
        </View>

        <View style={styles.section}>
          <Text>Job: {safeInvoice.job ? safeInvoice.job.name : 'No job'}</Text>
          <Text>Issue Date: {formatDate(safeInvoice.issue_date)}</Text>
          <Text>Due Date: {formatDate(safeInvoice.due_date)}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Items</Text>
          <DataTable>
            <DataTable.Header>
              <DataTable.Title>Description</DataTable.Title>
              <DataTable.Title numeric>Qty</DataTable.Title>
              <DataTable.Title numeric>Price</DataTable.Title>
              <DataTable.Title numeric>Amount</DataTable.Title>
            </DataTable.Header>
            
            {loading ? (
              <DataTable.Row>
                <DataTable.Cell>Loading items...</DataTable.Cell>
              </DataTable.Row>
            ) : safeInvoice.invoice_items.length === 0 ? (
              <DataTable.Row>
                <DataTable.Cell>No items found</DataTable.Cell>
              </DataTable.Row>
            ) : (
              safeInvoice.invoice_items.map((item) => (
                <DataTable.Row key={item.id}>
                  <DataTable.Cell>{item.description}</DataTable.Cell>
                  <DataTable.Cell numeric>{item.quantity}</DataTable.Cell>
                  <DataTable.Cell numeric>{formatCurrency(item.unit_price)}</DataTable.Cell>
                  <DataTable.Cell numeric>{formatCurrency(item.amount)}</DataTable.Cell>
                </DataTable.Row>
              ))
            )}
          </DataTable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Totals</Text>
          <View style={styles.totals}>
            <View style={styles.totalRow}>
              <Text>Subtotal:</Text>
              <Text>{formatCurrency(safeInvoice.subtotal)}</Text>
            </View>
            
            <View style={styles.totalRow}>
              <Text>Tax ({safeInvoice.tax_rate}%):</Text>
              <Text>{formatCurrency(safeInvoice.tax_amount)}</Text>
            </View>
            
            <Divider style={{ marginVertical: 8 }} />
            
            <View style={styles.totalRow}>
              <Text variant="titleMedium">Total:</Text>
              <Text variant="titleMedium">{formatCurrency(safeInvoice.total)}</Text>
            </View>
          </View>
        </View>

        {safeInvoice.notes && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notes</Text>
            <Text>{safeInvoice.notes}</Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Actions</Text>
          <View style={styles.actionButtons}>
            <Button 
              mode="outlined" 
              onPress={onClose}
              style={styles.actionButton}
              icon="arrow-left"
            >
              Back to Invoices
            </Button>
            
            {isEditable && onEdit && (
              <Button 
                mode="contained" 
                onPress={() => onEdit(safeInvoice)}
                style={styles.actionButton}
                icon="pencil"
              >
                Edit Invoice
              </Button>
            )}
            
            {/* Print Button */}
            <Button 
              mode="contained" 
              onPress={handlePrint}
              style={styles.actionButton}
              icon="printer"
              loading={printLoading}
            >
              Print Invoice
            </Button>
            
            <View style={styles.statusButtons}>
              <Button 
                mode={safeInvoice.status === 'draft' ? 'contained' : 'outlined'} 
                onPress={() => handleStatusChange('draft')}
                style={styles.statusButton}
              >
                Draft
              </Button>
              <Button 
                mode={safeInvoice.status === 'sent' ? 'contained' : 'outlined'} 
                onPress={() => handleStatusChange('sent')}
                style={styles.statusButton}
              >
                Sent
              </Button>
              <Button 
                mode={safeInvoice.status === 'paid' ? 'contained' : 'outlined'} 
                onPress={() => handleStatusChange('paid')}
                style={styles.statusButton}
              >
                Paid
              </Button>
              <Button 
                mode={safeInvoice.status === 'overdue' ? 'contained' : 'outlined'} 
                onPress={() => handleStatusChange('overdue')}
                style={styles.statusButton}
              >
                Overdue
              </Button>
              <Button 
                mode={safeInvoice.status === 'cancelled' ? 'contained' : 'outlined'} 
                onPress={() => handleStatusChange('cancelled')}
                style={styles.statusButton}
              >
                Cancelled
              </Button>
            </View>
            
            {/* Only show Delete button if the invoice is editable and not in edit mode */}
            {onDelete && isEditable && !isEditing && (
              <Button 
                mode="outlined" 
                onPress={() => {
                  if (confirm('Are you sure you want to delete this invoice?')) {
                    handleDelete();
                  }
                }}
                style={styles.actionButton}
                textColor="red"
                icon="delete"
              >
                Delete Invoice
              </Button>
            )}
          </View>
        </View>
      </View>
      
      <Portal>
        <Dialog visible={showDeleteDialog} onDismiss={() => setShowDeleteDialog(false)}>
          <Dialog.Title>Delete Invoice</Dialog.Title>
          <Dialog.Content>
            <Text>Are you sure you want to delete Invoice #{safeInvoice.invoice_number}? This action cannot be undone.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setShowDeleteDialog(false)}>Cancel</Button>
            <Button onPress={handleDelete}>Delete</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  contentWrapper: {
    padding: 20,
    minHeight: '100%',
  },
  title: {
    marginBottom: 20,
  },
  section: {
    marginBottom: 24,
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 8,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  totals: {
    alignSelf: 'flex-end',
    width: '50%',
    marginTop: 16,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionButton: {
    marginBottom: 8,
  },
  statusButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusButton: {
    marginBottom: 8,
  },
  printContainer: {
    display: 'none', // Hidden by default
    padding: 20,
    maxWidth: '800px', // Set a maximum width
    margin: '0 auto', // Center the container
    '@media print': {
      display: 'block',
    },
  },
  printOnly: {
    display: 'none',
    alignItems: 'center',
    marginBottom: 20,
    '@media print': {
      display: 'flex',
    },
  },
  logoText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  printHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  printTitle: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  printStatus: {
    fontSize: 14,
    fontWeight: 'bold',
    padding: 5,
    borderRadius: 4,
    backgroundColor: '#ccc',
  },
  printCompanyInfo: {
    marginBottom: 20,
    alignItems: 'flex-end',
  },
  printCompanyName: {
    fontWeight: 'bold',
    fontSize: 16,
  },
  printClientInfo: {
    marginBottom: 20,
  },
  printSectionTitle: {
    fontWeight: 'bold',
    marginBottom: 5,
  },
  printInvoiceDetails: {
    marginBottom: 20,
  },
  printItemsTable: {
    marginBottom: 20,
  },
  printTableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
    paddingBottom: 8,
    marginBottom: 8,
  },
  printDescriptionHeader: {
    flex: 3,
    fontWeight: 'bold',
  },
  printQuantityHeader: {
    flex: 1,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  printPriceHeader: {
    flex: 1,
    textAlign: 'right',
    fontWeight: 'bold',
  },
  printAmountHeader: {
    flex: 1,
    textAlign: 'right',
    fontWeight: 'bold',
  },
  printTableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingVertical: 8,
  },
  printDescriptionCell: {
    flex: 3,
  },
  printQuantityCell: {
    flex: 1,
    textAlign: 'center',
  },
  printPriceCell: {
    flex: 1,
    textAlign: 'right',
  },
  printAmountCell: {
    flex: 1,
    textAlign: 'right',
  },
  printTotals: {
    alignSelf: 'flex-end',
    width: '50%',
    marginBottom: 20,
  },
  printTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  printGrandTotal: {
    fontWeight: 'bold',
  },
  printNotes: {
    marginTop: 20,
    padding: 10,
    backgroundColor: '#f9f9f9',
    borderRadius: 4,
  },
  logo: {
    width: 100,
    height: 100,
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
    paddingHorizontal: 10,
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
}); 