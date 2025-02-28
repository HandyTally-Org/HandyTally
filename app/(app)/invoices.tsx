import { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Text, Button, Searchbar, Snackbar, Card, List, Chip, IconButton, Dialog, Portal, TextInput, DataTable } from 'react-native-paper';
import { supabase } from '../../lib/supabase';
import { InvoiceForm } from '../../components/InvoiceForm';
import { InvoiceDetails } from '../../components/InvoiceDetails';
import { styles as globalStyles } from '../../styles';
import { Job } from './jobs';
import { Client } from './clients';
import { PageHeader } from '../../components/PageHeader';

export type Invoice = {
  uid: string;
  user_id: number;
  job_id: number | null;
  client_id: number;
  invoice_number: number;
  issue_date: string;
  due_date: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  notes: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  created_at: string;
  updated_at: string;
  job?: Job;
  client?: Client;
};

export type InvoiceItem = {
  uid: string;
  invoice_id: number;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  type: 'service' | 'material' | 'other';
  service_id?: number;
  material_id?: number;
  created_at: string;
  updated_at: string;
};

// Add this debugging function at the top of your file
function safeStringify(obj: any): string {
  try {
    return JSON.stringify(obj, (key, value) => {
      if (value === undefined) return 'undefined';
      if (value === null) return 'null';
      return value;
    }, 2);
  } catch (e) {
    return `[Error stringifying object: ${e}]`;
  }
}

const originalToString = Object.prototype.toString;
Object.prototype.toString = function() {
  try {
    return originalToString.call(this);
  } catch (error) {
    console.error('Error in toString call:', error);
    console.error('Object that caused error:', this);
    return '[Object caused error in toString]';
  }
};

export default function InvoicesScreen() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [sortColumn, setSortColumn] = useState<string>('invoice_number');
  const [sortDirection, setSortDirection] = useState<'ascending' | 'descending'>('descending');

  useEffect(() => {
    fetchInvoices();
    fetchJobs();
    fetchClients();
    checkJobsTable();
    checkInvoicesTables();
    checkDatabaseSchema();
    checkAndCreateInvoiceItemsTable();
  }, []);

  useEffect(() => {
    const handleError = (error: ErrorEvent) => {
      console.error('Global error caught:', error.error);
      // You could also show a snackbar or other UI indication
      showSnackbar('An error occurred. Please check the console for details.');
    };

    window.addEventListener('error', handleError);
    
    return () => {
      window.removeEventListener('error', handleError);
    };
  }, []);

  useEffect(() => {
    return () => {
      Object.prototype.toString = originalToString;
    };
  }, []);

  async function fetchInvoices() {
    try {
      setLoading(true);
      
      // Fetch invoices with client names
      const { data, error } = await supabase
        .from('invoices')
        .select(`
          *,
          clients:client_id (name)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      if (data) {
        // Transform the data to include client_name
        const transformedData = data.map(invoice => ({
          ...invoice,
          client_name: invoice.clients?.name || 'Unknown Client'
        }));
        
        setInvoices(transformedData);
      }
    } catch (error) {
      console.error('Error fetching invoices:', error);
      showSnackbar('Error loading invoices');
    } finally {
      setLoading(false);
    }
  }

  async function fetchJobs() {
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('*');

      if (error) {
        console.error('Error fetching jobs:', error);
        throw error;
      }

      console.log('Raw jobs data:', data);
      
      if (data) {
        setJobs(data);
      }
    } catch (error) {
      console.error('Error in fetchJobs:', error);
    }
  }

  async function fetchClients() {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('name');

      if (error) {
        throw error;
      }

      if (data) {
        setClients(data);
      }
    } catch (error) {
      console.error('Error fetching clients:', error);
    }
  }

  async function checkJobsTable() {
    try {
      console.log('Checking jobs table...');
      const { data, error } = await supabase.rpc('execute_sql', {
        sql_query: `
          SELECT column_name, data_type 
          FROM information_schema.columns 
          WHERE table_name = 'jobs' AND table_schema = 'public'
          ORDER BY ordinal_position;
        `
      });
      
      console.log('Jobs table structure:', data);
      
      if (error) {
        console.error('Error checking jobs table structure:', error);
      }
      
      // Also check if there are any rows in the jobs table
      const { data: jobsCount, error: countError } = await supabase
        .from('jobs')
        .select('id', { count: 'exact' });
        
      console.log('Jobs count:', jobsCount?.length);
      
      if (countError) {
        console.error('Error counting jobs:', countError);
      }
    } catch (error) {
      console.error('Error checking jobs table:', error);
    }
  }

  async function checkInvoicesTables() {
    try {
      console.log('Checking invoices table structure...');
      const { data: columns, error: columnsError } = await supabase.rpc('execute_sql', {
        sql_query: `
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'invoices' AND table_schema = 'public'
        `
      });
      
      console.log('Invoice table columns:', columns);
      
      if (columnsError) {
        console.error('Error checking invoices table structure:', columnsError);
      }
      
      console.log('Checking invoice_items table structure...');
      const { data: itemsColumns, error: itemsError } = await supabase.rpc('execute_sql', {
        sql_query: `
          SELECT column_name, data_type, is_nullable
          FROM information_schema.columns 
          WHERE table_name = 'invoice_items' AND table_schema = 'public'
          ORDER BY ordinal_position;
        `
      });
      
      console.log('Invoice items table structure:', itemsColumns);
      
      if (itemsError) {
        console.error('Error checking invoice_items table structure:', itemsError);
      }
      
      // Check RLS policies
      console.log('Checking RLS policies...');
      const { data: policies, error: policiesError } = await supabase.rpc('execute_sql', {
        sql_query: `
          SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
          FROM pg_policies
          WHERE tablename IN ('invoices', 'invoice_items');
        `
      });
      
      console.log('RLS policies:', policies);
      
      if (policiesError) {
        console.error('Error checking RLS policies:', policiesError);
      }
    } catch (error) {
      console.error('Error checking tables:', error);
    }
  }

  async function createInvoice(invoice: Omit<Invoice, 'uid'>, items: Omit<InvoiceItem, 'uid' | 'invoice_id'>[]) {
    try {
      console.log('Creating new invoice...');
      
      // Get the current user ID
      const {
        data: { user },
      } = await supabase.auth.getUser()
      let metadata = user.user_metadata
      
      // Convert UUID to a numeric value for user_id
      const userId = parseInt(user.id.replace(/-/g, '').substring(0, 15), 16);
      
      // Similarly convert client_id and job_id
      let clientId = invoice.client_id;
      if (typeof clientId === 'string') {
        clientId = parseInt(clientId.replace(/-/g, '').substring(0, 15), 16);
      }
      
      let jobId = invoice.job_id;
      if (jobId && typeof jobId === 'string') {
        jobId = parseInt(jobId.replace(/-/g, '').substring(0, 15), 16);
      }
      
      console.log('Converted IDs:', { userId, clientId, jobId });
      
      // Create the invoice without items
      const { data, error } = await supabase
        .from('invoices')
        .insert({
          user_id: userId,
          client_id: clientId,
          job_id: jobId,
          invoice_number: invoice.invoice_number,
          issue_date: invoice.issue_date,
          due_date: invoice.due_date,
          subtotal: Number(invoice.subtotal),
          tax_rate: Number(invoice.tax_rate),
          tax_amount: Number(invoice.tax_amount),
          total: Number(invoice.total),
          notes: invoice.notes || '',
          status: invoice.status || 'draft'
        })
        .select(`
          *,
          jobs!invoices_job_id_fkey (*),
          clients!invoices_client_id_fkey (*)
        `);
      
      if (error) throw error;
      
      console.log('Invoice created successfully, now adding items');
      
      // Now add the items separately if we have any
      if (items && items.length > 0 && data && data[0]) {
        const invoiceId = data[0].uid;
        
        // Convert invoice_id to bigint if needed
        let numericInvoiceId = invoiceId;
        if (typeof invoiceId === 'string') {
          numericInvoiceId = parseInt(invoiceId.replace(/-/g, '').substring(0, 15), 16);
        }
        
        // Prepare items with the invoice_id
        const itemsToInsert = items.map(item => ({
          invoice_id: numericInvoiceId,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          amount: item.amount
        }));
        
        // Insert the items
        const { error: itemsError } = await supabase
          .from('invoice_items')
          .insert(itemsToInsert);
        
        if (itemsError) {
          console.error('Error adding invoice items:', itemsError);
        }
      }
      
      // Transform the data to match our expected structure
      const transformedData = {
        ...data[0],
        job: data[0].jobs,
        client: data[0].clients
      };
      
      // Refresh the invoices list
      await fetchInvoices();
      
      return transformedData;
    } catch (error) {
      console.error('Error creating invoice:', error);
      throw error;
    }
  }

  const handleAddInvoice = async (invoice: Omit<Invoice, 'uid'>, items: Omit<InvoiceItem, 'uid' | 'invoice_id'>[]) => {
    try {
      console.log('handleAddInvoice called with:', { invoice, items });
      
      // Add additional logging to track the process
      console.log('Starting invoice creation process...');
      
      // Create the invoice and get the result
      const newInvoice = await createInvoice(invoice, items);
      
      console.log('Invoice created successfully:', newInvoice);
      
      // Refresh the invoices list
      await fetchInvoices();
      
      // Close the form and show success message
      setShowAddForm(false);
      showSnackbar('Invoice created successfully');
    } catch (error: any) { // Explicitly type as any to access properties
      console.error('Error adding invoice:', error);
      
      // Log the full error details
      console.error('Error type:', typeof error);
      console.error('Error toString:', String(error));
      
      let errorMessage = 'Unknown error';
      
      // Try to extract a meaningful error message
      if (error instanceof Error) {
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        errorMessage = error.message || errorMessage;
      } else if (error && typeof error === 'object') {
        // Handle Supabase errors or other object errors
        if ('message' in error) errorMessage = error.message;
        if ('code' in error) console.error('Error code:', error.code);
        if ('details' in error) console.error('Error details:', error.details);
        
        // Log all properties of the error object
        console.error('All error properties:', Object.keys(error).map(key => `${key}: ${error[key]}`));
      }
      
      // Show a more detailed error message
      showSnackbar(`Failed to create invoice: ${errorMessage}`);
    }
  };

  const handleUpdateInvoiceStatus = async (uid: string, status: Invoice['status']) => {
    try {
      const { error } = await supabase
        .from('invoices')
        .update({ status })
        .eq('uid', uid);

      if (error) {
        throw error;
      }

      setInvoices(
        invoices.map((invoice) => 
          invoice.uid === uid ? { ...invoice, status } : invoice
        )
      );
      showSnackbar(`Invoice marked as ${status}`);
    } catch (error) {
      console.error('Error updating invoice status:', error);
      showSnackbar('Failed to update invoice status');
    }
  };

  const handleDeleteInvoice = async () => {
    if (!selectedInvoice) return;
    
    try {
      const { error } = await supabase
        .from('invoices')
        .delete()
        .eq('uid', selectedInvoice.uid);
      
      if (error) throw error;
      
      setInvoices(invoices.filter(invoice => invoice.uid !== selectedInvoice.uid));
      showSnackbar('Invoice deleted successfully');
      setShowDeleteDialog(false);
      setSelectedInvoice(null);
    } catch (error) {
      console.error('Error deleting invoice:', error);
      showSnackbar('Error deleting invoice');
    }
  };

  const showSnackbar = (message: string) => {
    setSnackbarMessage(message);
    setSnackbarVisible(true);
  };

  const getStatusChipColor = (status: Invoice['status']) => {
    switch (status) {
      case 'draft': return '#9e9e9e';
      case 'sent': return '#2196f3';
      case 'paid': return '#4caf50';
      case 'overdue': return '#f44336';
      case 'cancelled': return '#ff9800';
      default: return '#9e9e9e';
    }
  };

  const formatCurrency = (value: any): string => {
    if (value === undefined || value === null || isNaN(Number(value))) {
      return '$0.00';
    }
    try {
      return `$${Number(value).toFixed(2)}`;
    } catch (error) {
      console.error('Error formatting currency:', error);
      return '$0.00';
    }
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'No date';
    
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'Invalid date';
    }
  };

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'ascending' ? 'descending' : 'ascending');
    } else {
      setSortColumn(column);
      setSortDirection('ascending');
    }
  };

  const getFilteredInvoices = () => {
    let filtered = [...invoices];
    
    // Apply existing filters
    if (searchQuery) {
      filtered = filtered.filter(invoice => 
        invoice.invoice_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (invoice.client_name || '').toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    if (selectedStatuses.length > 0) {
      filtered = filtered.filter(invoice => selectedStatuses.includes(invoice.status));
    }
    
    // Apply sorting based on current sort column and direction
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (sortColumn) {
        case 'invoice_number':
          comparison = a.invoice_number.localeCompare(b.invoice_number);
          break;
        case 'client_name':
          comparison = (a.client_name || '').localeCompare(b.client_name || '');
          break;
        case 'issue_date':
          comparison = new Date(a.issue_date).getTime() - new Date(b.issue_date).getTime();
          break;
        case 'due_date':
          comparison = new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
          break;
        case 'total':
          comparison = a.total - b.total;
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
        default:
          comparison = 0;
      }
      
      return sortDirection === 'ascending' ? comparison : -comparison;
    });
    
    return filtered;
  };

  const getLastInvoiceNumber = () => {
    if (invoices.length === 0) {
      return '';
    }
    
    try {
      const sortedInvoices = [...invoices].sort((a, b) => {
        const aNum = a.invoice_number?.toString() || '';
        const bNum = b.invoice_number?.toString() || '';
        return aNum.localeCompare(bNum, undefined, { numeric: true });
      });
      
      const lastInvoice = sortedInvoices[sortedInvoices.length - 1];
      return lastInvoice?.invoice_number?.toString() || '';
    } catch (error) {
      console.error('Error in getLastInvoiceNumber:', error);
      return '';
    }
  };

  console.log('Jobs being passed to InvoiceForm:', jobs);

  async function checkAndFixDatabase() {
    try {
      console.log('Checking database structure...');
      
      const { data: tableExists, error: tableError } = await supabase.rpc('execute_sql', {
        sql_query: `
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public'
            AND table_name = 'invoices'
          ) as exists;
        `
      });
      
      console.log('Invoices table exists:', tableExists);
      
      if (tableError) {
        console.error('Error checking if table exists:', tableError);
        return;
      }
      
      if (!tableExists[0].exists) {
        console.log('Creating invoices table...');
        
        const { error: createError } = await supabase.rpc('execute_sql', {
          sql_query: `
            CREATE TABLE invoices (
              uid UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
              user_id UUID NOT NULL,
              job_id UUID REFERENCES jobs(uid),
              client_id UUID NOT NULL REFERENCES clients(uid),
              invoice_number VARCHAR NOT NULL,
              issue_date DATE NOT NULL,
              due_date DATE NOT NULL,
              subtotal DECIMAL(10, 2) NOT NULL DEFAULT 0,
              tax_rate DECIMAL(5, 2) NOT NULL DEFAULT 0,
              tax_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
              total DECIMAL(10, 2) NOT NULL DEFAULT 0,
              notes TEXT,
              status VARCHAR NOT NULL DEFAULT 'draft',
              created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
              updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
            
            ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
            
            CREATE POLICY "Users can view their own invoices" ON invoices
              FOR SELECT USING (auth.uid() = user_id);
            
            CREATE POLICY "Users can create their own invoices" ON invoices
              FOR INSERT WITH CHECK (auth.uid() = user_id);
            
            CREATE POLICY "Users can update their own invoices" ON invoices
              FOR UPDATE USING (auth.uid() = user_id);
            
            CREATE POLICY "Users can delete their own invoices" ON invoices
              FOR DELETE USING (auth.uid() = user_id);
          `
        });
        
        if (createError) {
          console.error('Error creating invoices table:', createError);
          return;
        }
        
        console.log('Invoices table created successfully');
      }
      
      console.log('Attempting direct SQL insert...');
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('No authenticated user');
        return;
      }
      
      const { data: clients } = await supabase.from('clients').select('uid').limit(1);
      if (!clients || clients.length === 0) {
        console.error('No clients found');
        return;
      }
      
      const { error: insertError } = await supabase.rpc('execute_sql', {
        sql_query: `
          INSERT INTO invoices (
            user_id,
            client_id,
            invoice_number,
            issue_date,
            due_date,
            subtotal,
            tax_rate,
            tax_amount,
            total,
            status
          )
          VALUES (
            '${parseInt(user.id.replace(/-/g, '').substring(0, 15), 16)}',
            '${parseInt(clients[0].uid.replace(/-/g, '').substring(0, 15), 16)}',
            'SQL-TEST-${parseInt(Date.now().toString().substring(0, 15))}',
            CURRENT_DATE,
            CURRENT_DATE + INTERVAL '30 days',
            0,
            0,
            0,
            0,
            'draft'
          )
          RETURNING *;
        `
      });
      
      if (insertError) {
        console.error('Direct SQL insert failed:', insertError);
      } else {
        console.log('Direct SQL insert succeeded');
        await fetchInvoices();
      }
      
    } catch (error) {
      console.error('Error in checkAndFixDatabase:', error);
    }
  }

  async function checkDatabaseSchema() {
    try {
      console.log('Checking database schema...');
      
      const { data: invoicesSchema, error: invoicesError } = await supabase.rpc('execute_sql', {
        sql_query: `
          SELECT column_name, data_type 
          FROM information_schema.columns 
          WHERE table_name = 'invoices' AND table_schema = 'public'
          ORDER BY ordinal_position;
        `
      });
      
      if (invoicesError) {
        console.error('Error checking invoices schema:', invoicesError);
      } else {
        console.log('Invoices table schema:', invoicesSchema);
      }
      
      const { data: itemsSchema, error: itemsError } = await supabase.rpc('execute_sql', {
        sql_query: `
          SELECT column_name, data_type 
          FROM information_schema.columns 
          WHERE table_name = 'invoice_items' AND table_schema = 'public'
          ORDER BY ordinal_position;
        `
      });
      
      if (itemsError) {
        console.error('Error checking invoice_items schema:', itemsError);
      } else {
        console.log('Invoice_items table schema:', itemsSchema);
      }
    } catch (error) {
      console.error('Error checking database schema:', error);
    }
  }

  const isInvoiceEditable = (invoice: Invoice): boolean => {
    return invoice.status === 'draft';
  };

  const handleEditInvoice = async (invoice: Invoice) => {
    console.log('Editing invoice:', invoice);
    
    try {
      const items = await fetchInvoiceItems(invoice.uid);
      
      setEditingInvoice({
        ...invoice,
        job_id: invoice.job?.id || invoice.job_id,
        client_id: invoice.client?.id || invoice.client_id
      });
      
      // Set the items for the form
      setInvoiceItems(items);
    } catch (error: any) {
      console.error('Error preparing invoice for editing:', error);
      showSnackbar(`Error: ${error.message}`);
    }
  };
  
  // Update the handleSubmitInvoice function to properly save invoice items
  const handleSubmitInvoice = async (invoiceData: Omit<Invoice, 'id'>, items: Omit<InvoiceItem, 'id' | 'invoice_id'>[]) => {
    try {
      setLoading(true);
      console.log('Submitting invoice with data:', invoiceData);
      console.log('Invoice items:', items);
      
      // Check if we're editing an existing invoice
      const isEditing = !!editingInvoice;
      
      if (isEditing) {
        // Update the existing invoice
        const { data: updatedInvoice, error: updateError } = await supabase
          .from('invoices')
          .update({
            ...invoiceData,
            updated_at: new Date().toISOString()
          })
          .eq('uid', editingInvoice.uid)
          .select()
          .single();
        
        if (updateError) throw updateError;
        
        console.log('Updated invoice:', updatedInvoice);
        
        // Now handle the invoice items
        if (items && items.length > 0) {
          // First, delete any existing items for this invoice
          const { error: deleteError } = await supabase
            .from('invoice_items')
            .delete()
            .eq('invoice_id', editingInvoice.uid);
          
          if (deleteError) {
            console.error('Error deleting existing invoice items:', deleteError);
            // Continue anyway, as we want to add the new items
          }
          
          // Now insert the new items
          const itemsWithInvoiceId = items.map(item => {
            // Only include fields we know exist in the schema
            return {
              invoice_id: editingInvoice.uid,
              description: item.description || '',
              quantity: Number(item.quantity) || 0,
              unit_price: Number(item.unit_price) || 0,
              amount: Number(item.amount) || 0,
              // Exclude material_id, service_id, and type if they're causing issues
            };
          });
          
          const { data: insertedItems, error: insertError } = await supabase
            .from('invoice_items')
            .insert(itemsWithInvoiceId)
            .select();
          
          if (insertError) {
            console.error('Error inserting invoice items:', insertError);
            throw insertError;
          }
          
          console.log('Inserted invoice items:', insertedItems);
        }
        
        showSnackbar('Invoice updated successfully');
      } else {
        // Create a new invoice
        const { data: newInvoice, error: createError } = await supabase
          .from('invoices')
          .insert({
            ...invoiceData,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select()
          .single();
        
        if (createError) throw createError;
        
        console.log('Created new invoice:', newInvoice);
        
        // Now handle the invoice items
        if (items && items.length > 0 && newInvoice) {
          const itemsWithInvoiceId = items.map(item => {
            // Only include fields we know exist in the schema
            return {
              invoice_id: newInvoice.uid,
              description: item.description || '',
              quantity: Number(item.quantity) || 0,
              unit_price: Number(item.unit_price) || 0,
              amount: Number(item.amount) || 0,
              // Exclude material_id, service_id, and type if they're causing issues
            };
          });
          
          const { data: insertedItems, error: insertError } = await supabase
            .from('invoice_items')
            .insert(itemsWithInvoiceId)
            .select();
          
          if (insertError) {
            console.error('Error inserting invoice items:', insertError);
            throw insertError;
          }
          
          console.log('Inserted invoice items:', insertedItems);
        }
        
        showSnackbar('Invoice created successfully');
      }
      
      // Refresh the invoices list
      await fetchInvoices();
      
      // Reset the form
      setEditingInvoice(null);
      setShowAddForm(false);
      
    } catch (error) {
      console.error('Error submitting invoice:', error);
      showSnackbar(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };
  
  // Update the updateInvoice function
  async function updateInvoice(
    invoiceId: string, 
    invoice: Omit<Invoice, 'uid'>, 
    items: Omit<InvoiceItem, 'uid' | 'invoice_id'>[]
  ) {
    try {
      console.log('Updating invoice:', invoiceId);
      
      // First update the invoice record
      const { error: invoiceError } = await supabase
        .from('invoices')
        .update({
          invoice_number: invoice.invoice_number,
          client_id: invoice.client_id,
          job_id: invoice.job_id,
          issue_date: invoice.issue_date,
          due_date: invoice.due_date,
          subtotal: invoice.subtotal,
          tax_rate: invoice.tax_rate,
          tax_amount: invoice.tax_amount,
          total: invoice.total,
          notes: invoice.notes,
          status: invoice.status,
          // Don't include items here
        })
        .eq('uid', invoiceId);

      if (invoiceError) throw invoiceError;

      // Then handle the items separately
      // First delete existing items
      const { error: deleteError } = await supabase
        .from('invoice_items')
        .delete()
        .eq('invoice_id', invoiceId);

      if (deleteError) throw deleteError;

      // Then insert new items
      if (items && items.length > 0) {
        const itemsToInsert = items.map(item => ({
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

      // Refresh the invoices list
      await fetchInvoices();
      
      // Close the edit modal
      setEditingInvoice(null);
      
      showSnackbar('Invoice updated successfully');
    } catch (error) {
      console.error('Error updating invoice:', error);
      showSnackbar(`Failed to update invoice: ${error.message}`);
    }
  };

  // Replace the checkAndCreateInvoiceItemsTable function with this simpler version
  async function checkAndCreateInvoiceItemsTable() {
    try {
      console.log('Checking invoice_items table...');
      
      // First, try a simple query to see if the table exists and is accessible
      const { data, error } = await supabase
        .from('invoice_items')
        .select('*')
        .limit(1);
      
      if (error) {
        console.log('Error accessing invoice_items table:', error.message);
        
        // Instead of trying to create the table, let's just use a different approach
        console.log('Using items JSON field in invoices table instead');
        
        // Check if we can access the invoices table
        const { data: invoicesData, error: invoicesError } = await supabase
          .from('invoices')
          .select('uid')
          .limit(1);
        
        if (invoicesError) {
          console.error('Error accessing invoices table:', invoicesError);
          showSnackbar('Database access issue. Please try again later.');
          return;
        }
        
        // We'll use the items field in the invoices table
        // No need to check if it exists, we'll just use it in our code
        console.log('Will store invoice items directly in the invoice record');
      } else {
        console.log('invoice_items table exists and is accessible');
      }
    } catch (error) {
      console.error('Error in checkAndCreateInvoiceItemsTable:', error);
      // Don't show an error message, just log it
    }
  }

  // Update the fetchInvoiceItems function to better handle different storage formats
  const fetchInvoiceItems = async (invoiceId: string) => {
    try {
      console.log('Fetching items for invoice:', invoiceId);
      
      // First try to get items from the invoice_items table
      const { data: itemsFromTable, error: tableError } = await supabase
        .from('invoice_items')
        .select('*')
        .eq('invoice_id', invoiceId);
      
      if (!tableError && itemsFromTable && itemsFromTable.length > 0) {
        console.log('Found items in invoice_items table:', itemsFromTable);
        setInvoiceItems(itemsFromTable);
        return itemsFromTable;
      } 
      
      console.log('No items found in table or error occurred:', tableError);
      
      // Try to get items from the JSON column in the invoices table
      const { data: invoiceWithItems, error: jsonError } = await supabase
        .from('invoices')
        .select('items')
        .eq('uid', invoiceId)
        .single();
      
      if (!jsonError && invoiceWithItems && invoiceWithItems.items) {
        console.log('Found items in JSON column:', invoiceWithItems.items);
        setInvoiceItems(invoiceWithItems.items);
        return invoiceWithItems.items;
      }
      
      console.log('No items found in JSON column or error occurred:', jsonError);
      setInvoiceItems([]);
      return [];
    } catch (error) {
      console.error('Error fetching invoice items:', error);
      setInvoiceItems([]);
      return [];
    }
  };

  // Update the setSelectedInvoice function to fetch items when an invoice is selected
  const handleSelectInvoice = (invoice: Invoice) => {
    console.log('Selected invoice structure:', JSON.stringify(invoice, null, 2));
    console.log('Invoice ID (uid):', invoice.uid);
    console.log('Invoice ID (id):', invoice.id);
    
    setSelectedInvoice(invoice);
    fetchInvoiceItems(invoice.uid);
  };

  // Define all possible statuses
  const allStatuses = ['draft', 'sent', 'paid', 'overdue', 'cancelled'];
  
  // Toggle a status filter
  const toggleStatusFilter = (status: string) => {
    if (selectedStatuses.includes(status)) {
      setSelectedStatuses(selectedStatuses.filter(s => s !== status));
    } else {
      setSelectedStatuses([...selectedStatuses, status]);
    }
  };
  
  // Clear all filters
  const clearFilters = () => {
    setSelectedStatuses([]);
  };

  return (
    <View style={styles.container}>
      <Text style={{
        fontFamily: 'System',
        fontSize: 26,
        fontWeight: '600',
        marginBottom: 16,
        color: '#333333',
      }}>Invoices</Text>
      
      <View style={styles.searchContainer}>
        <Searchbar
          placeholder="Search invoices..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={styles.searchBar}
        />
        <Button 
          mode="contained" 
          onPress={() => setShowAddForm(true)}
          style={styles.createButton}
        >
          Create New Invoice
        </Button>
      </View>
      
      <View style={styles.filtersContainer}>
        <Chip 
          selected={selectedStatuses.length === 0}
          onPress={clearFilters}
          style={styles.filterChip}
        >
          All
        </Chip>
        
        {allStatuses.map(status => (
          <Chip
            key={status}
            selected={selectedStatuses.includes(status)}
            onPress={() => toggleStatusFilter(status)}
            style={[
              styles.filterChip,
              selectedStatuses.includes(status) ? { backgroundColor: getStatusChipColor(status) } : null
            ]}
            textStyle={selectedStatuses.includes(status) ? { color: 'white' } : null}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </Chip>
        ))}
      </View>

      {selectedInvoice && !editingInvoice && !showAddForm ? (
        <InvoiceDetails
          invoice={selectedInvoice}
          items={invoiceItems}
          onClose={() => setSelectedInvoice(null)}
          onEdit={handleEditInvoice}
          onDelete={() => {
            setSelectedInvoice(selectedInvoice);
            setShowDeleteDialog(true);
          }}
          onStatusChange={(status) => handleUpdateInvoiceStatus(selectedInvoice.uid, status)}
          isEditable={isInvoiceEditable(selectedInvoice)}
          isEditing={false}
        />
      ) : editingInvoice ? (
        <InvoiceForm
          jobs={jobs}
          clients={clients}
          lastInvoiceNumber={getLastInvoiceNumber()}
          onSubmit={handleSubmitInvoice}
          onCancel={() => setEditingInvoice(null)}
          initialInvoice={editingInvoice}
          initialItems={invoiceItems}
          isEditing={true}
        />
      ) : showAddForm ? (
        <InvoiceForm
          jobs={jobs}
          clients={clients}
          lastInvoiceNumber={getLastInvoiceNumber()}
          onSubmit={handleSubmitInvoice}
          onCancel={() => setShowAddForm(false)}
        />
      ) : null}

      {!selectedInvoice && !showAddForm && !editingInvoice && (
        <Card style={{flex: 1, width: '100%', maxWidth: '100%'}}>
          <View style={{width: '100%', flex: 1}}>
            <DataTable style={{width: '100%', flex: 1}}>
              <DataTable.Header style={styles.tableHeader}>
                <DataTable.Title 
                  style={styles.columnInvoice}
                  onPress={() => handleSort('invoice_number')}
                  sortDirection={sortColumn === 'invoice_number' ? sortDirection : undefined}
                >
                  Invoice #
                </DataTable.Title>
                <DataTable.Title 
                  style={styles.columnClient}
                  onPress={() => handleSort('client')}
                  sortDirection={sortColumn === 'client' ? sortDirection : undefined}
                >
                  Client
                </DataTable.Title>
                <DataTable.Title 
                  style={styles.columnDate}
                  onPress={() => handleSort('issue_date')}
                  sortDirection={sortColumn === 'issue_date' ? sortDirection : undefined}
                >
                  Issue Date
                </DataTable.Title>
                <DataTable.Title 
                  style={styles.columnDate}
                  onPress={() => handleSort('due_date')}
                  sortDirection={sortColumn === 'due_date' ? sortDirection : undefined}
                >
                  Due Date
                </DataTable.Title>
                <DataTable.Title 
                  style={styles.columnTotal}
                  onPress={() => handleSort('total')}
                  sortDirection={sortColumn === 'total' ? sortDirection : undefined}
                >
                  Total
                </DataTable.Title>
                <DataTable.Title 
                  style={styles.columnStatus}
                  onPress={() => handleSort('status')}
                  sortDirection={sortColumn === 'status' ? sortDirection : undefined}
                >
                  Status
                </DataTable.Title>
                <DataTable.Title style={styles.columnActions}>
                  Actions
                </DataTable.Title>
              </DataTable.Header>

              <ScrollView horizontal={false} style={{width: '100%'}}>
                {loading ? (
                  <DataTable.Row style={{width: '100%'}}>
                    <DataTable.Cell style={{flex: 10, justifyContent: 'center', alignItems: 'center', paddingVertical: 20}}>
                      <Text style={{padding: 16, textAlign: 'center'}}>Loading invoices...</Text>
                    </DataTable.Cell>
                  </DataTable.Row>
                ) : getFilteredInvoices().length === 0 ? (
                  <DataTable.Row style={{width: '100%'}}>
                    <DataTable.Cell style={{flex: 10, justifyContent: 'center', alignItems: 'center', paddingVertical: 20}}>
                      <Text style={{padding: 16, textAlign: 'center'}}>No invoices found</Text>
                    </DataTable.Cell>
                  </DataTable.Row>
                ) : (
                  getFilteredInvoices().map((invoice) => (
                    <DataTable.Row 
                      key={invoice.uid} 
                      onPress={() => handleSelectInvoice(invoice)}
                      style={{width: '100%', borderBottomWidth: 1, borderBottomColor: '#e0e0e0', minHeight: 48}}
                    >
                      <DataTable.Cell style={{flex: 1, minWidth: 100, paddingHorizontal: 8}}>{invoice.invoice_number}</DataTable.Cell>
                      <DataTable.Cell style={{flex: 2, minWidth: 180, paddingHorizontal: 8}}>{invoice.client_name || 'Unknown Client'}</DataTable.Cell>
                      <DataTable.Cell style={{flex: 1.5, minWidth: 120, paddingHorizontal: 8}}>{formatDate(invoice.issue_date)}</DataTable.Cell>
                      <DataTable.Cell style={{flex: 1.5, minWidth: 120, paddingHorizontal: 8}}>{formatDate(invoice.due_date)}</DataTable.Cell>
                      <DataTable.Cell style={{flex: 1, minWidth: 120, paddingHorizontal: 8}}>{formatCurrency(invoice.total)}</DataTable.Cell>
                      <DataTable.Cell style={styles.columnStatus}>
                        <Chip 
                          mode="outlined" 
                          style={{ backgroundColor: getStatusChipColor(invoice.status) }}
                          textStyle={{ color: 'white', fontSize: 12 }}
                        >
                          {invoice.status.toUpperCase()}
                        </Chip>
                      </DataTable.Cell>
                      <DataTable.Cell style={styles.columnActions}>
                        <View style={styles.actionButtons}>
                          <IconButton
                            icon="pencil"
                            size={20}
                            onPress={() => handleEditInvoice(invoice)}
                          />
                          <IconButton
                            icon="delete"
                            size={20}
                            onPress={() => {
                              setSelectedInvoice(invoice);
                              setShowDeleteDialog(true);
                            }}
                            iconColor="red"
                          />
                        </View>
                      </DataTable.Cell>
                    </DataTable.Row>
                  ))
                )}
              </ScrollView>
            </DataTable>
          </View>
        </Card>
      )}

      {/* Delete Invoice Dialog */}
      <Portal>
        <Dialog visible={showDeleteDialog} onDismiss={() => setShowDeleteDialog(false)}>
          <Dialog.Title>Delete Invoice</Dialog.Title>
          <Dialog.Content>
            <Text>Are you sure you want to delete invoice #{selectedInvoice?.invoice_number}?</Text>
            <Text>This action cannot be undone.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setShowDeleteDialog(false)}>Cancel</Button>
            <Button onPress={handleDeleteInvoice} textColor="red">Delete</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
      
      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={3000}
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
    width: '100%',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 10,
    width: '100%',
  },
  searchBar: {
    flex: 1,
  },
  createButton: {
    marginLeft: 8,
  },
  addButton: {
    marginBottom: 16,
  },
  listCard: {
    flex: 1,
    width: '100%',
  },
  table: {
    width: '100%',
    minWidth: '100%',
  },
  tableHeader: {
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 8,
    width: '100%',
  },
  tableRow: {
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    minHeight: 48,
    width: '100%',
  },
  columnInvoice: {
    flex: 1,
    minWidth: 100,
    paddingHorizontal: 8,
  },
  columnClient: {
    flex: 2,
    minWidth: 180,
    paddingHorizontal: 8,
  },
  columnDate: {
    flex: 1.5,
    minWidth: 120,
    paddingHorizontal: 8,
  },
  columnTotal: {
    flex: 1,
    minWidth: 100,
    paddingHorizontal: 8,
  },
  columnStatus: {
    flex: 1.5,
    minWidth: 120,
    paddingHorizontal: 8,
  },
  columnActions: {
    flex: 2,
    minWidth: 180,
    paddingHorizontal: 8,
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    gap: 8,
  },
  actionButton: {
    marginVertical: 0,
    paddingVertical: 0,
  },
  loadingCell: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
  },
  listItem: {
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  invoiceItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    minWidth: 200, // Ensure enough space for buttons
  },
  invoiceAmount: {
    fontWeight: 'bold',
  },
  emptyText: {
    padding: 16,
    textAlign: 'center',
  },
  filtersContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  filterChip: {
    marginRight: 8,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    gap: 8,
  },
});