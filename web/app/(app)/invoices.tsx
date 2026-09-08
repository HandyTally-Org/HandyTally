import { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Modal } from 'react-native';
import { Text, Button, Searchbar, Snackbar, Card, List, Chip, IconButton, Dialog, Portal, TextInput, DataTable, ActivityIndicator } from 'react-native-paper';
import { supabase } from '../../lib/supabase';
import { InvoiceForm } from '../../components/InvoiceForm';
import { InvoiceDetails } from '../../components/InvoiceDetails';
import { styles as globalStyles } from '../../styles';
import { Job } from './jobs';
import { Client } from './clients';
import { PageHeader } from '../../components/PageHeader';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';

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
  const [showInvoiceFormModal, setShowInvoiceFormModal] = useState(false);
  const [invoiceToEdit, setInvoiceToEdit] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showInvoiceList, setShowInvoiceList] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetchInvoices();
    fetchJobs();
    fetchClients();
    checkJobsTable();
    checkInvoicesTables();
    checkDatabaseSchema();
    checkAndCreateInvoiceItemsTable();
    updateDraftToEstimate();
    checkAndFixDatabase();
    checkDatabaseSchema()
      .then(async () => {
        await checkInvoicesTables();
        await checkJobsTable();
        fetchInvoices();
        fetchJobs();
        fetchClients();
        fetchCompanyLogo();
      })
      .catch(error => {
        console.error("Error in database checks:", error);
      });
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

  useEffect(() => {
    // Check URL parameters for createNew and jobId
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const createNew = urlParams.get('createNew');
      const jobId = urlParams.get('jobId');
      
      if (createNew === 'true') {
        // Set up a new invoice with the specified job
        setShowInvoiceList(false);
        
        // Create a default invoice object
        const newInvoice = {
          uid: '',
          invoice_number: getLastInvoiceNumber() ? (parseInt(getLastInvoiceNumber()) + 1).toString() : '1001',
          client_id: '',
          job_id: null,
          issue_date: new Date().toISOString().split('T')[0],
          due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          subtotal: 0,
          tax_rate: 0,
          tax_amount: 0,
          total: 0,
          notes: '',
          status: 'estimate',
          invoice_items: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          user_id: 0
        };
        
        // If a job ID was provided, pre-select that job
        if (jobId) {
          const selectedJob = jobs.find(job => job.uid === jobId);
          if (selectedJob) {
            // Pre-select the job's client as well if available
            const selectedClient = clients.find(client => client.uid === selectedJob.client_id);
            
            newInvoice.job_id = selectedJob.uid;
            newInvoice.client_id = selectedClient?.uid || '';
          }
        }
        
        setInvoiceToEdit(newInvoice);
      }
    }
  }, [jobs, clients]);

  useEffect(() => {
    // Check if we need to create an invoice for a specific job
    if (typeof window !== 'undefined') {
      const jobId = localStorage.getItem('createInvoiceForJob');
      if (jobId) {
        // Clear the localStorage item
        localStorage.removeItem('createInvoiceForJob');
        
        // Create a default invoice object
        const newInvoice = {
          uid: '',
          invoice_number: getLastInvoiceNumber() ? (parseInt(getLastInvoiceNumber()) + 1).toString() : '1001',
          client_id: '',
          job_id: null,
          issue_date: new Date().toISOString().split('T')[0],
          due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          subtotal: 0,
          tax_rate: 0,
          tax_amount: 0,
          total: 0,
          notes: '',
          status: 'estimate',
          invoice_items: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          user_id: 0
        };
        
        // Find the job
        const selectedJob = jobs.find(job => job.uid === jobId);
        if (selectedJob) {
          // Pre-select the job's client as well if available
          const selectedClient = clients.find(client => client.uid === selectedJob.client_id);
          
          newInvoice.job_id = selectedJob.uid;
          newInvoice.client_id = selectedClient?.uid || '';
        }
        
        // Show the invoice form
        setShowInvoiceList(false);
        setInvoiceToEdit(newInvoice);
      }
    }
  }, [jobs, clients]);

  useEffect(() => {
    // Check if we should show the invoice form
    const showForm = localStorage.getItem('showInvoiceForm');
    if (showForm === 'true') {
      // Clear the flag
      localStorage.removeItem('showInvoiceForm');
      
      // Create a default invoice object
      const newInvoice = {
        uid: '',
        invoice_number: getLastInvoiceNumber() ? (parseInt(getLastInvoiceNumber()) + 1).toString() : '1001',
        client_id: '',
        job_id: null,
        issue_date: new Date().toISOString().split('T')[0],
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        subtotal: 0,
        tax_rate: 0,
        tax_amount: 0,
        total: 0,
        notes: '',
        status: 'estimate',
        invoice_items: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_id: 0
      };
      
      // Show the form with the new invoice
      setInvoiceToEdit(newInvoice);
      setShowInvoiceList(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const editInvoiceId = localStorage.getItem('editInvoiceId');
      if (editInvoiceId) {
        // Clear the localStorage item
        localStorage.removeItem('editInvoiceId');
        
        // Find the invoice to edit
        const invoiceToEdit = invoices.find(invoice => invoice.uid === editInvoiceId);
        if (invoiceToEdit) {
          console.log('Found invoice to edit:', invoiceToEdit);
          
          // Show the invoice form with the invoice to edit
          setInvoiceToEdit(invoiceToEdit);
          setShowInvoiceList(false);
        } else {
          console.log('Invoice not found:', editInvoiceId);
        }
      }
    }
  }, [invoices]);

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

  const handleDeleteInvoice = async (invoiceId: string) => {
    try {
      setLoading(true);
      
      // Skip checking for payments since the table doesn't exist
      // Instead, just check for related invoice items
      
      const { data: invoiceItems, error: itemsError } = await supabase
        .from('invoice_items')
        .select('uid')  // Use uid instead of id
        .eq('invoice_id', invoiceId)
        .limit(1);
      
      if (itemsError) {
        console.error('Error checking for related invoice items:', itemsError);
        throw new Error(`Error checking for related invoice items: ${itemsError.message}`);
      }
      
      // For invoice items, we can delete them along with the invoice
      if (invoiceItems && invoiceItems.length > 0) {
        // Delete all related invoice items first
        const { error: deleteItemsError } = await supabase
          .from('invoice_items')
          .delete()
        .eq('invoice_id', invoiceId);
        
        if (deleteItemsError) {
          console.error('Error deleting invoice items:', deleteItemsError);
          throw new Error(`Error deleting invoice items: ${deleteItemsError.message}`);
        }
      }
      
      // Now delete the invoice
      const { error: deleteError } = await supabase
        .from('invoices')
        .delete()
        .eq('uid', invoiceId);  // Use uid instead of id
      
      if (deleteError) {
        console.error('Error deleting invoice:', deleteError);
        
        // Check for specific error types
        if (deleteError.message.includes('foreign key constraint')) {
          throw new Error('This invoice cannot be deleted because it is referenced by other records.');
        } else if (deleteError.message.includes('permission denied')) {
          throw new Error('You do not have permission to delete this invoice.');
        } else {
          throw deleteError;
        }
      }
      
      // Update the invoices list
      setInvoices(invoices.filter(invoice => invoice.uid !== invoiceId));
      
      // Reset selectedInvoice to return to the main invoice list screen
      setSelectedInvoice(null);
      
      // Close the delete dialog
      setShowDeleteDialog(false);
      
      showSnackbar('Invoice deleted successfully');
      
    } catch (error: any) {
      console.error('Error in handleDeleteInvoice:', error);
      showSnackbar(error.message || 'Error deleting invoice');
    } finally {
      setLoading(false);
    }
  };

  const showSnackbar = (message: string) => {
    setSnackbarMessage(message);
    setSnackbarVisible(true);
  };

  const getStatusChipColor = (status: string): string => {
    switch (status) {
      case 'draft':
        return '#9e9e9e'; // Gray
      case 'sent':
        return '#2196f3'; // Blue
      case 'paid':
        return '#4caf50'; // Green
      case 'overdue':
        return '#f44336'; // Red
      case 'cancelled':
        return '#ff9800'; // Orange
      default:
        return '#9e9e9e'; // Default gray
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
    
    // Apply status filters with multi-select support
    if (selectedStatuses.length > 0) {
      filtered = filtered.filter(invoice => 
        // Include this invoice if its status is in the selectedStatuses array
        selectedStatuses.includes(invoice.status) ||
        // Special case for 'estimate' to also match 'draft' for backward compatibility
        (selectedStatuses.includes('estimate') && invoice.status === 'draft')
      );
    }
    
    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter(invoice => 
        invoice.invoice_number.toString().toLowerCase().includes(searchQuery.toLowerCase()) ||
        (invoice.client_name || '').toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    // Apply sorting based on current sort column and direction
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (sortColumn) {
        case 'invoice_number':
          comparison = a.invoice_number.toString().localeCompare(b.invoice_number.toString());
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

  const handleEditInvoice = async (invoice) => {
    try {
      console.log('Editing invoice:', JSON.stringify(invoice, null, 2));
      
      // Fetch invoice items
      const { data: items, error: itemsError } = await supabase
        .from('invoice_items')
        .select('*')
        .eq('invoice_id', invoice.uid);
      
      if (itemsError) throw itemsError;
      console.log('Fetched invoice items:', JSON.stringify(items, null, 2));
      
      // Fetch job details
      let jobData = null;
      if (invoice.job_id) {
        const { data: job, error: jobError } = await supabase
          .from('jobs')
          .select('*')
          .eq('uid', invoice.job_id)
          .single();
        
        if (!jobError && job) {
          jobData = job;
          console.log('Fetched job data:', JSON.stringify(job, null, 2));
        }
      }
      
      // Fetch client details
      let clientData = null;
      if (invoice.client_id) {
        const { data: client, error: clientError } = await supabase
          .from('clients')
          .select('*')
          .eq('uid', invoice.client_id)
          .single();
        
        if (!clientError && client) {
          clientData = client;
          console.log('Fetched client data:', JSON.stringify(client, null, 2));
        }
      }
      
      // Set the complete invoice data with related entities
      const completeInvoice = {
        ...invoice,
        job: jobData,
        client: clientData,
        invoice_items: items || []
      };
      
      console.log('Complete invoice data for editing:', JSON.stringify(completeInvoice, null, 2));
      
      // Set the invoice to edit with all related data
      setInvoiceToEdit(completeInvoice);
      setShowInvoiceList(false);
      
    } catch (error) {
      console.error('Error fetching invoice details:', error);
      showSnackbar('Error loading invoice details');
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
        const { data: newInvoice, error: invoiceError } = await supabase
          .from('invoices')
          .insert({
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
            status: updatedInvoice.status || 'estimate',
          })
          .select()
          .single();
        
        if (invoiceError) throw invoiceError;
        
        console.log('Created new invoice:', newInvoice);
        
        // Now handle the invoice items
        if (items && items.length > 0 && newInvoice) {
          const itemsWithInvoiceId = items.map(item => {
            // Only include fields we know exist in the schema
            return {
              invoice_id: newInvoice.uid,
              description: item.description || '',
              quantity: item.quantity,
              unit_price: item.unit_price,
              amount: item.amount,
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

  // Add a function to toggle status selection
  const toggleStatusFilter = (status: string) => {
    if (status === 'all') {
      // Clear all filters if 'all' is selected
      setSelectedStatuses([]);
      return;
    }
    
    if (selectedStatuses.includes(status)) {
      // Remove the status if already selected
      setSelectedStatuses(selectedStatuses.filter(s => s !== status));
    } else {
      // Add the status if not already selected
      setSelectedStatuses([...selectedStatuses, status]);
    }
  };
  
  // Get the background color for a status button
  const getStatusButtonColor = (status: string): string => {
    if (status === 'all' && selectedStatuses.length === 0) {
      return '#2196F3'; // Blue for "All" when active
    }
    
    if (selectedStatuses.includes(status)) {
      switch (status) {
        case 'estimate':
          return '#9E9E9E'; // Gray
        case 'work_order':
          return '#9C27B0'; // Purple
        case 'sent':
          return '#2196F3'; // Blue
        case 'partial_paid':
          return '#FF9800'; // Orange
        case 'paid':
          return '#4CAF50'; // Green
        case 'overdue':
          return '#F44336'; // Red
        case 'cancelled':
          return '#607D8B'; // Blue gray
        default:
          return '#2196F3'; // Default blue
      }
    }
    
    return 'transparent'; // Transparent background when not selected
  };

  // Add a function to handle viewing invoice details
  const handleViewInvoiceDetails = (invoice) => {
    setSelectedInvoice(invoice);
    setShowDetailsModal(true);
  };

  // Add this right before rendering the InvoiceForm
  console.log('RENDERING INVOICE FORM WITH DATA:', {
    invoiceToEdit: JSON.stringify(invoiceToEdit, null, 2),
    invoiceItems: invoiceToEdit?.invoice_items ? JSON.stringify(invoiceToEdit.invoice_items, null, 2) : 'No items'
  });

  // Add this function to directly update the invoice status
  const updateInvoiceStatus = async (invoiceId, newStatus) => {
    try {
      console.log(`Directly updating invoice ${invoiceId} status to: ${newStatus}`);
      
      const { error } = await supabase
        .from('invoices')
        .update({ status: newStatus })
        .eq('uid', invoiceId);
      
      if (error) {
        console.error('Error updating invoice status:', error);
        showSnackbar(`Failed to update status: ${error.message}`);
        return false;
      }
      
      console.log('Status updated successfully');
      showSnackbar('Invoice status updated successfully');
      fetchInvoices(); // Refresh the list
      return true;
    } catch (error) {
      console.error('Error in updateInvoiceStatus:', error);
      showSnackbar(`Error: ${error.message}`);
      return false;
    }
  };

  // Update the getStatusTextColor function to include the new statuses
  const getStatusTextColor = (status: string): string => {
    switch (status) {
      case 'estimate':
        return '#666666'; // Dark gray
      case 'work_order':
        return '#9c27b0'; // Purple
      case 'sent':
        return '#0066cc'; // Blue
      case 'partial_paid':
        return '#ff9800'; // Orange
      case 'paid':
        return '#008800'; // Green
      case 'overdue':
        return '#cc0000'; // Red
      case 'cancelled':
        return '#888888'; // Gray
      default:
        return '#000000'; // Black
    }
  };

  // Add a function to update all existing "draft" statuses to "estimate"
  const updateDraftToEstimate = async () => {
    try {
      console.log('Updating all draft invoices to estimate status...');
      
      const { error } = await supabase
        .from('invoices')
        .update({ status: 'estimate' })
        .eq('status', 'draft');
      
      if (error) {
        console.error('Error updating draft invoices:', error);
        showSnackbar('Error updating invoice statuses');
        return;
      }
      
      console.log('Successfully updated draft invoices to estimate');
      fetchInvoices(); // Refresh the list
    } catch (error) {
      console.error('Error in updateDraftToEstimate:', error);
      showSnackbar(`Error: ${error.message}`);
    }
  };

  // Add a function to fetch the company logo from company_attachments
  async function fetchCompanyLogo() {
    try {
      console.log('Fetching company logo...');
      const { data, error } = await supabase
        .from('company_attachments')
        .select('file_data, file_type')
        .eq('type', 'logo')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (error) {
        console.error('Error fetching company logo:', error);
        return;
      }
      
      if (data && data.file_data) {
        console.log('Company logo found');
        // Store the base64 image data
        setCompanyLogo(data.file_data);
      } else {
        console.log('No company logo found');
      }
    } catch (error) {
      console.error('Error in fetchCompanyLogo:', error);
    }
  }

  return (
    <View style={styles.container}>
      <PageHeader title="Invoices" />
      
      {showInvoiceList ? (
        <>
          <View style={styles.searchContainer}>
      <Searchbar
        placeholder="Search invoices..."
        onChangeText={setSearchQuery}
        value={searchQuery}
              style={[styles.searchBar, { backgroundColor: '#f5f5f5' }]}
            />
            
        <Button
          mode="contained"
              onPress={() => {
                // Instead of setting invoiceToEdit to null, create a default invoice object
                setInvoiceToEdit({
                  uid: '',
                  invoice_number: getLastInvoiceNumber() ? (parseInt(getLastInvoiceNumber()) + 1).toString() : '1001',
                  client_id: '',
                  job_id: null,
                  issue_date: new Date().toISOString().split('T')[0],
                  due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                  subtotal: 0,
                  tax_rate: 0,
                  tax_amount: 0,
                  total: 0,
                  notes: '',
                  status: 'estimate',
                  invoice_items: [],
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                  user_id: 0
                });
                setShowInvoiceList(false); // Show the form
              }}
          style={styles.addButton}
        >
          Create New Invoice
        </Button>
          </View>
          
          <View style={styles.filtersContainer}>
            <View style={{ flexDirection: 'row', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
              <Button
                mode={selectedStatuses.length === 0 ? 'contained' : 'outlined'}
                onPress={() => toggleStatusFilter('all')}
                style={{ 
                  marginRight: 8,
                  backgroundColor: selectedStatuses.length === 0 ? '#2196F3' : undefined,
                  borderRadius: 4,
                }}
                labelStyle={{
                  color: selectedStatuses.length === 0 ? 'white' : '#000000',
                  fontWeight: '500',
                }}
              >
                All
              </Button>
              <Button 
                mode={selectedStatuses.includes('estimate') ? 'contained' : 'outlined'}
                onPress={() => toggleStatusFilter('estimate')}
                style={{ 
                  marginRight: 8,
                  backgroundColor: selectedStatuses.includes('estimate') ? '#9E9E9E' : undefined,
                  borderRadius: 4,
                }}
                labelStyle={{
                  color: selectedStatuses.includes('estimate') ? 'white' : '#000000',
                  fontWeight: '500',
                }}
              >
                Estimate
              </Button>
              <Button 
                mode={selectedStatuses.includes('work_order') ? 'contained' : 'outlined'}
                onPress={() => toggleStatusFilter('work_order')}
                style={{ 
                  marginRight: 8,
                  backgroundColor: selectedStatuses.includes('work_order') ? '#9C27B0' : undefined,
                  borderRadius: 4,
                }}
                labelStyle={{
                  color: selectedStatuses.includes('work_order') ? 'white' : '#000000',
                  fontWeight: '500',
                }}
              >
                Work Order
              </Button>
              <Button
                mode={selectedStatuses.includes('sent') ? 'contained' : 'outlined'}
                onPress={() => toggleStatusFilter('sent')}
                style={{ 
                  marginRight: 8,
                  backgroundColor: selectedStatuses.includes('sent') ? '#2196F3' : undefined,
                  borderRadius: 4,
                }}
                labelStyle={{
                  color: selectedStatuses.includes('sent') ? 'white' : '#000000',
                  fontWeight: '500',
                }}
              >
                Sent
              </Button>
              <Button
                mode={selectedStatuses.includes('partial_paid') ? 'contained' : 'outlined'}
                onPress={() => toggleStatusFilter('partial_paid')}
                style={{ 
                  marginRight: 8,
                  backgroundColor: selectedStatuses.includes('partial_paid') ? '#FF9800' : undefined,
                  borderRadius: 4,
                }}
                labelStyle={{
                  color: selectedStatuses.includes('partial_paid') ? 'white' : '#000000',
                  fontWeight: '500',
                }}
              >
                Partial Paid
              </Button>
              <Button
                mode={selectedStatuses.includes('paid') ? 'contained' : 'outlined'}
                onPress={() => toggleStatusFilter('paid')}
                style={{ 
                  marginRight: 8,
                  backgroundColor: selectedStatuses.includes('paid') ? '#4CAF50' : undefined,
                  borderRadius: 4,
                }}
                labelStyle={{
                  color: selectedStatuses.includes('paid') ? 'white' : '#000000',
                  fontWeight: '500',
                }}
              >
                Paid
              </Button>
              <Button
                mode={selectedStatuses.includes('overdue') ? 'contained' : 'outlined'}
                onPress={() => toggleStatusFilter('overdue')}
                style={{ 
                  marginRight: 8,
                  backgroundColor: selectedStatuses.includes('overdue') ? '#F44336' : undefined,
                  borderRadius: 4,
                }}
                labelStyle={{
                  color: selectedStatuses.includes('overdue') ? 'white' : '#000000',
                  fontWeight: '500',
                }}
              >
                Overdue
              </Button>
              <Button
                mode={selectedStatuses.includes('cancelled') ? 'contained' : 'outlined'}
                onPress={() => toggleStatusFilter('cancelled')}
                style={{ 
                  backgroundColor: selectedStatuses.includes('cancelled') ? '#607D8B' : undefined,
                  borderRadius: 4,
                }}
                labelStyle={{
                  color: selectedStatuses.includes('cancelled') ? 'white' : '#000000',
                  fontWeight: '500',
                }}
              >
                Cancelled
              </Button>
            </View>
          </View>

          <Card style={{
            flex: 1,
            marginBottom: 16,
            backgroundColor: '#ffffff',
            borderRadius: 8,
            elevation: 2,
            shadowColor: 'rgba(0,0,0,0.1)',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.8,
            shadowRadius: 1,
          }}>
            <DataTable style={{ backgroundColor: '#ffffff' }}>
              <DataTable.Header style={{ backgroundColor: '#ffffff' }}>
                <DataTable.Title 
                  style={{ backgroundColor: '#ffffff' }}
                  sortDirection={sortColumn === 'invoice_number' ? sortDirection : undefined}
                  onPress={() => handleSort('invoice_number')}
                >
                  Invoice #
                </DataTable.Title>
                <DataTable.Title 
                  style={{ backgroundColor: '#ffffff' }}
                  sortDirection={sortColumn === 'client_name' ? sortDirection : undefined}
                  onPress={() => handleSort('client_name')}
                >
                  Client
                </DataTable.Title>
                <DataTable.Title 
                  style={{ backgroundColor: '#ffffff' }}
                  sortDirection={sortColumn === 'issue_date' ? sortDirection : undefined}
                  onPress={() => handleSort('issue_date')}
                >
                  Issue Date
                </DataTable.Title>
                <DataTable.Title 
                  style={{ backgroundColor: '#ffffff' }}
                  sortDirection={sortColumn === 'due_date' ? sortDirection : undefined}
                  onPress={() => handleSort('due_date')}
                >
                  Due Date
                </DataTable.Title>
                <DataTable.Title 
                  style={{ backgroundColor: '#ffffff' }}
                  sortDirection={sortColumn === 'total' ? sortDirection : undefined}
                  onPress={() => handleSort('total')}
                >
                  Total
                </DataTable.Title>
                <DataTable.Title 
                  style={{ backgroundColor: '#ffffff' }}
                  sortDirection={sortColumn === 'status' ? sortDirection : undefined}
                  onPress={() => handleSort('status')}
                >
                  Status
                </DataTable.Title>
                <DataTable.Title style={{ backgroundColor: '#ffffff' }}>Actions</DataTable.Title>
              </DataTable.Header>
              
              {loading ? (
                <DataTable.Row style={{ backgroundColor: '#ffffff' }}>
                  <DataTable.Cell style={{ flex: 7, backgroundColor: '#ffffff' }}>
                    <ActivityIndicator size="small" style={{ marginRight: 8 }} />
                    Loading invoices...
                  </DataTable.Cell>
                </DataTable.Row>
              ) : getFilteredInvoices().length === 0 ? (
                <DataTable.Row style={{ backgroundColor: '#ffffff' }}>
                  <DataTable.Cell style={{ flex: 7, backgroundColor: '#ffffff' }}>No invoices found</DataTable.Cell>
                </DataTable.Row>
              ) : (
                getFilteredInvoices().map(invoice => (
                  <DataTable.Row key={invoice.uid} style={{ backgroundColor: '#ffffff' }}>
                    <DataTable.Cell style={{ backgroundColor: '#ffffff' }}>{invoice.invoice_number}</DataTable.Cell>
                    <DataTable.Cell style={{ backgroundColor: '#ffffff' }}>{invoice.client_name || 'Unknown Client'}</DataTable.Cell>
                    <DataTable.Cell style={{ backgroundColor: '#ffffff' }}>{formatDate(invoice.issue_date)}</DataTable.Cell>
                    <DataTable.Cell style={{ backgroundColor: '#ffffff' }}>{formatDate(invoice.due_date)}</DataTable.Cell>
                    <DataTable.Cell style={{ backgroundColor: '#ffffff' }}>${invoice.total.toFixed(2)}</DataTable.Cell>
                    <DataTable.Cell style={{ backgroundColor: '#ffffff' }}>
                      <select
                        value={invoice.status}
                        onChange={(e) => updateInvoiceStatus(invoice.uid, e.target.value)}
                        style={{
                          padding: 8,
                          borderRadius: 4,
                          borderColor: '#ccc',
                          backgroundColor: '#ffffff',
                          color: '#000000',
                          fontWeight: 'bold'
                        }}
                      >
                        <option value="estimate">Estimate</option>
                        <option value="work_order">Work Order</option>
                        <option value="sent">Sent</option>
                        <option value="partial_paid">Partial Paid</option>
                        <option value="paid">Paid</option>
                        <option value="overdue">Overdue</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </DataTable.Cell>
                    <DataTable.Cell style={{ backgroundColor: '#ffffff' }}>
                      <View style={{ flexDirection: 'row' }}>
                        <IconButton
                          icon="pencil"
                          size={20}
                          onPress={() => handleEditInvoice(invoice)}
                        />
                        <IconButton
                          icon="delete"
                          size={20}
                          iconColor="red"
                          onPress={() => {
                            setSelectedInvoice(invoice);
                            setShowDeleteDialog(true);
                          }}
                        />
                      </View>
                    </DataTable.Cell>
                  </DataTable.Row>
                ))
              )}
            </DataTable>
        </Card>
        </>
      ) : (
        <ScrollView style={{ backgroundColor: '#e9ebee' }}>
          <View style={{ backgroundColor: '#e9ebee' }}>
            <InvoiceForm
              jobs={jobs}
              clients={clients}
              onSubmit={async (updatedInvoice, invoiceItems) => {
                try {
                  console.log('Saving invoice with data:', updatedInvoice);
                  console.log('Invoice items to save:', invoiceItems);
                  console.log('Status to save:', updatedInvoice.status);
                  
                  if (invoiceToEdit) {
                    // Update existing invoice
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
                      .eq('uid', invoiceToEdit.uid);
                      
                      if (invoiceError) {
                        console.error('Error updating invoice:', invoiceError);
                        throw invoiceError;
                      }
                      
                      console.log('Invoice updated successfully with status:', updatedInvoice.status);
                      
                      // Handle invoice items
                      // First delete existing items
                      const { error: deleteError } = await supabase
                        .from('invoice_items')
                        .delete()
                        .eq('invoice_id', invoiceToEdit.uid);

                      if (deleteError) throw deleteError;

                      // Then insert new items
                      if (invoiceItems && invoiceItems.length > 0) {
                        const itemsToInsert = invoiceItems.map(item => ({
                          invoice_id: invoiceToEdit.uid,
                          description: item.description,
                          quantity: item.quantity,
                          unit_price: item.unit_price,
                          amount: item.amount,
                          // Include these if they exist
                          service_id: item.service_id || null,
                          material_id: item.material_id || null,
                          type: item.type || 'custom'
                        }));

                        console.log('Inserting invoice items:', itemsToInsert);

                        const { error: insertError } = await supabase
                          .from('invoice_items')
                          .insert(itemsToInsert);

                        if (insertError) throw insertError;
                      }
                      
                      showSnackbar('Invoice updated successfully');
                    } else {
                      // Create new invoice
                      const { data: newInvoice, error: invoiceError } = await supabase
                        .from('invoices')
                        .insert({
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
                          status: updatedInvoice.status || 'estimate',
                        })
                        .select()
                        .single();
                        
                        if (invoiceError) throw invoiceError;
                        
                        // Insert invoice items if any
                        if (invoiceItems && invoiceItems.length > 0) {
                          const itemsToInsert = invoiceItems.map(item => ({
                            invoice_id: newInvoice.uid,
                            description: item.description,
                            quantity: item.quantity,
                            unit_price: item.unit_price,
                            amount: item.amount,
                            // Include these if they exist
                            service_id: item.service_id || null,
                            material_id: item.material_id || null,
                            type: item.type || 'custom'
                          }));

                          console.log('Inserting invoice items for new invoice:', itemsToInsert);

                          const { error: insertError } = await supabase
                            .from('invoice_items')
                            .insert(itemsToInsert);

                          if (insertError) throw insertError;
                        }
                        
                        showSnackbar('Invoice created successfully');
                      }
                      
                      // Refresh the invoices list
                      fetchInvoices();
                      
                      // Show the list again
                      setShowInvoiceList(true);
                    } catch (error) {
                      console.error('Error saving invoice:', error);
                      showSnackbar(`Failed to save invoice: ${error.message}`);
                    }
                  }}
                  onCancel={() => {
                    // Simply return to the list view
                    setShowInvoiceList(true);
                  }}
                  initialInvoice={invoiceToEdit}
                  initialItems={invoiceToEdit?.invoice_items || []}
                  isEditing={true}
                  lastInvoiceNumber={getLastInvoiceNumber()}
                  hideTitle={true}
                  companyLogo={companyLogo}
                />
          </View>
        </ScrollView>
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
            <Button onPress={() => handleDeleteInvoice(selectedInvoice?.uid || '')} textColor="red">Delete</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {showDetailsModal && selectedInvoice && (
        <Portal>
          <Modal
            visible={showDetailsModal}
            onDismiss={() => {
              setShowDetailsModal(false);
              setSelectedInvoice(null);
            }}
            contentContainerStyle={{
              backgroundColor: 'white',
              padding: 20,
              margin: 20,
              maxHeight: '90%',
              borderRadius: 10
            }}
          >
            <ScrollView>
              <InvoiceDetails
                invoice={selectedInvoice}
                onClose={() => {
                  setShowDetailsModal(false);
                  setSelectedInvoice(null);
                }}
                items={invoiceItems || []}
                companyLogo={companyLogo}
              />
            </ScrollView>
          </Modal>
        </Portal>
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
    backgroundColor: '#ffffff',
  },
  searchContainer: {
    flexDirection: 'row',
    padding: 16,
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  searchBar: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  addButton: {
    marginLeft: 16,
    backgroundColor: '#4CAF50',
  },
  filtersContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: '#ffffff',
  },
  tableHeader: {
    backgroundColor: '#f5f5f5',
  },
  tableHeaderText: {
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  tableRow: {
    backgroundColor: '#ffffff',
  },
  tableCellActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  statusBadge: {
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  formContainer: {
    padding: 16,
    backgroundColor: '#ffffff', 
    borderRadius: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1,
  },
});