import { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, Button, Searchbar, Snackbar, Card, List, Chip } from 'react-native-paper';
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
  const [statusFilters, setStatusFilters] = useState<string[]>([]);

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
      
      console.log('Fetching invoices...');
      
      // Use a simpler query that doesn't specify column names
      const { data, error } = await supabase
        .from('invoices')
        .select(`
          *,
          jobs (*),
          clients (*)
        `)
        .order('issue_date', { ascending: false });

      console.log('Invoices query result:', data);
      
      if (error) {
        throw error;
      }

      if (data) {
        // Transform the data to match our expected structure
        const transformedData = data.map(invoice => ({
          ...invoice,
          job: invoice.jobs,
          client: invoice.clients
        }));
        
        console.log(`Found ${transformedData.length} invoices`);
        setInvoices(transformedData);
      } else {
        console.log('No invoice data returned');
        setInvoices([]);
      }
    } catch (error) {
      console.error('Error fetching invoices:', error);
      showSnackbar(`Error loading invoices: ${error.message || 'Unknown error'}`);
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
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!userData.user) throw new Error('User not authenticated');
      
      // Convert UUID to a numeric value for user_id
      const userId = parseInt(userData.user.id.replace(/-/g, '').substring(0, 15), 16);
      
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

  const handleDeleteInvoice = async (invoiceId: string | number) => {
    try {
      console.log('Attempting to delete invoice with ID:', invoiceId);
      console.log('ID type:', typeof invoiceId);
      
      if (!invoiceId) {
        console.error('Invalid invoice ID for deletion:', invoiceId);
        showSnackbar('Failed to delete invoice: Invalid invoice ID');
        return;
      }
      
      // First, try to delete invoice items
      console.log('Deleting invoice items first...');
      const { error: itemsError } = await supabase
        .from('invoice_items')
        .delete()
        .eq('invoice_id', invoiceId);
      
      if (itemsError) {
        console.log('Note: Could not delete invoice items:', itemsError.message);
        // Continue anyway, as the items might be stored differently
      }
      
      // Now delete the invoice
      console.log('Deleting invoice with ID:', invoiceId);
      const { error: invoiceError } = await supabase
        .from('invoices')
        .delete()
        .eq('uid', invoiceId);
      
      if (invoiceError) {
        console.error('Error deleting invoice with uid:', invoiceError);
        
        // Try with a different column name
        console.log('Trying to delete with id column instead...');
        const { error: secondAttemptError } = await supabase
          .from('invoices')
          .delete()
          .eq('id', invoiceId);
        
        if (secondAttemptError) {
          console.error('Error deleting invoice with id:', secondAttemptError);
          throw new Error(`Could not delete invoice: ${invoiceError.message}`);
        }
      }
      
      // If we got here, deletion was successful
      console.log('Successfully deleted invoice');
      
      // Update the UI
      setInvoices(invoices.filter(invoice => invoice.uid !== invoiceId && invoice.id !== invoiceId));
      setSelectedInvoice(null);
      
      showSnackbar('Invoice deleted successfully');
      
      // Refresh the invoices list to be sure
      await fetchInvoices();
      
    } catch (error) {
      console.error('Error deleting invoice:', error);
      showSnackbar(`Failed to delete invoice: ${error.message}`);
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

  const getFilteredInvoices = () => {
    return invoices.filter(invoice => {
      // If no status filters are selected, show all
      const statusMatch = statusFilters.length === 0 || statusFilters.includes(invoice.status);
      
      // Filter by search query if present
      const searchMatch = !searchQuery || 
        invoice.invoice_number.toString().includes(searchQuery) ||
        (invoice.client?.name || '').toLowerCase().includes(searchQuery.toLowerCase());
      
      return statusMatch && searchMatch;
    });
  };

  // Get the last invoice number
  const getLastInvoiceNumber = () => {
    if (invoices.length === 0) {
      return '';
    }
    
    try {
      // Sort invoices by invoice number (assuming they're numeric or can be compared as strings)
      const sortedInvoices = [...invoices].sort((a, b) => {
        const aNum = a.invoice_number?.toString() || '';
        const bNum = b.invoice_number?.toString() || '';
        return aNum.localeCompare(bNum, undefined, { numeric: true });
      });
      
      // Return the highest invoice number
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
      
      // 1. Check if invoices table exists
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
      
      // 2. If table doesn't exist, create it
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
      
      // 3. Try a direct SQL insert
      console.log('Attempting direct SQL insert...');
      
      // Get the current user ID
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('No authenticated user');
        return;
      }
      
      // Get a client ID
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
        // Refresh the invoices list
        await fetchInvoices();
      }
      
    } catch (error) {
      console.error('Error in checkAndFixDatabase:', error);
    }
  }

  async function checkDatabaseSchema() {
    try {
      console.log('Checking database schema...');
      
      // Check invoices table
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
      
      // Check invoice_items table
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

  // Add this helper function to check if an invoice is editable
  const isInvoiceEditable = (invoice: Invoice): boolean => {
    return invoice.status === 'draft';
  };

  // Update the handleEditInvoice function
  const handleEditInvoice = async (invoice: Invoice) => {
    console.log('Editing invoice:', invoice);
    
    try {
      // Fetch items for this invoice
      const items = await fetchInvoiceItems(invoice.uid);
      
      // Make sure we have the complete invoice with job and client info
      setEditingInvoice({
        ...invoice,
        // Ensure job_id and client_id are set correctly for the form
        job_id: invoice.job?.id || invoice.job_id,
        client_id: invoice.client?.id || invoice.client_id
      });
      
      // Set the items for the form
      setInvoiceItems(items);
    } catch (error) {
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
    if (statusFilters.includes(status)) {
      setStatusFilters(statusFilters.filter(s => s !== status));
    } else {
      setStatusFilters([...statusFilters, status]);
    }
  };
  
  // Clear all filters
  const clearFilters = () => {
    setStatusFilters([]);
  };

  return (
    <View style={styles.container}>
      <PageHeader title="Invoices" />
      
      <Searchbar
        placeholder="Search invoices..."
        value={searchQuery}
        onChangeText={setSearchQuery}
        style={styles.searchBar}
      />
      
      <View style={styles.actionsContainer}>
        <Button 
          mode="contained" 
          onPress={() => setShowAddForm(true)}
          style={styles.createButton}
        >
          Create New Invoice
        </Button>
        
        <View style={styles.filtersContainer}>
          <Chip 
            selected={statusFilters.length === 0}
            onPress={clearFilters}
            style={styles.filterChip}
          >
            All
          </Chip>
          
          {allStatuses.map(status => (
            <Chip
              key={status}
              selected={statusFilters.includes(status)}
              onPress={() => toggleStatusFilter(status)}
              style={[
                styles.filterChip,
                statusFilters.includes(status) ? { backgroundColor: getStatusChipColor(status) } : null
              ]}
              textStyle={statusFilters.includes(status) ? { color: 'white' } : null}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </Chip>
          ))}
        </View>
      </View>

      {selectedInvoice && !editingInvoice && !showAddForm ? (
        <InvoiceDetails
          invoice={selectedInvoice}
          items={invoiceItems}
          onClose={() => setSelectedInvoice(null)}
          onEdit={handleEditInvoice}
          onDelete={handleDeleteInvoice}
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
      ) : (
        <Button
          mode="contained"
          onPress={() => setShowAddForm(true)}
          style={styles.addButton}
        >
          Create New Invoice
        </Button>
      )}

      {!selectedInvoice && !showAddForm && !editingInvoice && (
        <Card style={styles.listCard}>
          <ScrollView>
            {loading ? (
              <Text style={styles.emptyText}>Loading invoices...</Text>
            ) : getFilteredInvoices().length === 0 ? (
              <Text style={styles.emptyText}>No invoices found</Text>
            ) : (
              getFilteredInvoices().map((invoice) => (
                <List.Item
                  key={invoice.uid}
                  title={`Invoice #${invoice.invoice_number}`}
                  description={`${invoice.client?.name || 'Unknown Client'} - ${formatDate(invoice.issue_date)}`}
                  onPress={() => handleSelectInvoice(invoice)}
                  right={props => (
                    <View style={styles.invoiceItemRight}>
                      <Text style={styles.invoiceAmount}>{formatCurrency(invoice.total)}</Text>
                      <Chip 
                        mode="outlined" 
                        style={{ backgroundColor: getStatusChipColor(invoice.status) }}
                      >
                        {invoice.status.toUpperCase()}
                      </Chip>
                      {isInvoiceEditable(invoice) && (
                        <View style={{ flexDirection: 'row', gap: 8, marginLeft: 8 }}>
                          <Button 
                            mode="text" 
                            compact 
                            onPress={() => setSelectedInvoice(invoice)}
                            textColor="blue"
                            style={{ marginVertical: 0, paddingVertical: 0 }}
                          >
                            EDIT
                          </Button>
                          <Button 
                            mode="text" 
                            compact 
                            onPress={() => {
                              // Log the entire invoice object to see what we're working with
                              console.log('Invoice object for deletion:', JSON.stringify(invoice, null, 2));
                              
                              // Check if we have a valid ID
                              if (confirm(`Delete invoice #${invoice.invoice_number}?`)) {
                                // Try different ID properties
                                const idToUse = invoice.uid || invoice.id || invoice.invoice_id;
                                console.log('ID to use for deletion:', idToUse);
                                
                                if (!idToUse) {
                                  console.error('Missing invoice ID in list item:', invoice);
                                  showSnackbar('Cannot delete: Invalid invoice ID');
                                  return;
                                }
                                
                                handleDeleteInvoice(idToUse);
                              }
                            }}
                            textColor="red"
                            style={{ marginVertical: 0, paddingVertical: 0 }}
                          >
                            DELETE
                          </Button>
                        </View>
                      )}
                    </View>
                  )}
                  style={styles.listItem}
                />
              ))
            )}
          </ScrollView>
        </Card>
      )}

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
  },
  searchBar: {
    marginBottom: 16,
  },
  addButton: {
    marginBottom: 16,
  },
  listCard: {
    flex: 1,
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
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  createButton: {
    marginBottom: 8,
  },
  filtersContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  filterChip: {
    marginRight: 8,
  },
});