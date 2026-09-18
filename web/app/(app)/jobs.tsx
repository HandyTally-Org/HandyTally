import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Text, Button, Searchbar, Card, DataTable, IconButton, Dialog, Portal, Snackbar, TextInput, RadioButton, ActivityIndicator, Tooltip } from 'react-native-paper';
import { LabelPill, LabelPillRow } from '../../components/LabelPill';
import { supabase } from '../../lib/api';
import { styles as globalStyles } from '../../styles';
import { JobDialog } from '../../components/JobDialog';
import { sendJobInvite } from '../../utils/sendJobInvite';
import { useRouter } from 'expo-router';
import { exportWorkbook, pickWorkbook, sheetRows, confirmAction } from '../../utils/excel';
import { ImportExportButtons } from '../../components/ImportExportButtons';
import { useOrganizationMembers } from '../../hooks/useOrganizationMembers';
import { assigneeLabel } from '../../utils/inviteUser';
import { useLabels } from '../../hooks/useLabels';
import { useRefreshOnFocus } from '../../hooks/useRefreshOnFocus';
import { formatClientAddress, formatDateTime } from '../../utils/formatting';
import { themed } from '../../constants/Colors';

type Job = {
  uid: number;
  title: string;
  description: string;
  client_id: number;
  client_name: string;
  // HT-56: read-only lookups from the selected client, shown as list columns.
  client_address: string;
  client_phone: string;
  start_date: string;
  end_date: string;
  status: string;
  created_at: string;
  /** HT-53: values of the organisation's custom fields, keyed by field key. */
  custom_fields?: Record<string, unknown>;
  // HT-35: user id of the organisation member the job is assigned to.
  assigned_to: string | null;
};

type Client = {
  uid: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: number | string;
};

export default function JobsScreen() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  // The job the Delete dialog is asking about. Kept separate from any "open
  // job" state so pressing the trash icon never navigates away from the list.
  const [jobToDelete, setJobToDelete] = useState<Job | null>(null);
  // uid of the job whose calendar invite is being sent, for the row spinner
  const [sendingInviteFor, setSendingInviteFor] = useState<number | null>(null);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [sortColumn, setSortColumn] = useState<string>('name');
  const [sortDirection, setSortDirection] = useState<'ascending' | 'descending'>('ascending');
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const router = useRouter();
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedHour, setSelectedHour] = useState<string>("12");
  const [selectedMinute, setSelectedMinute] = useState<string>("00");
  const [selectedAmPm, setSelectedAmPm] = useState<"AM" | "PM">("AM");
  const [datePickerMode, setDatePickerMode] = useState<'start' | 'end'>('start');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  // HT-35: resolves jobs.assigned_to to a name for the column, sort and export.
  const { members, loading: membersLoading } = useOrganizationMembers();
  const assigneeName = (job: Pick<Job, 'assigned_to'>) =>
    membersLoading && job.assigned_to ? '…' : assigneeLabel(job.assigned_to, members);

  useRefreshOnFocus(() => {
    fetchJobs();
    fetchClients();
  });

  async function fetchJobs() {
    try {
      setLoading(true);
      
      // Fetch jobs with the client's name and, for HT-56, address and phone
      const { data, error } = await supabase
        .from('jobs')
        .select(`
          *,
          clients:client_id (name, address, city, state, zip, phone)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      if (data) {
        // Transform the data to include client_name, client_address, client_phone
        const transformedData = data.map(job => ({
          ...job,
          client_name: job.clients?.name || 'Unknown Client',
          client_address: formatClientAddress(job.clients),
          client_phone: job.clients?.phone || ''
        }));
        
        setJobs(transformedData);
      }
    } catch (error) {
      console.error('Error fetching jobs:', error);
      showSnackbar('Error loading jobs');
    } finally {
      setLoading(false);
    }
  }

  async function fetchClients() {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('name');
      
      if (error) throw error;
      
      if (data) {
        setClients(data);
      }
    } catch (error) {
      console.error('Error fetching clients:', error);
      showSnackbar('Error loading clients');
    }
  }

  const showSnackbar = (message: string) => {
    setSnackbarMessage(message);
    setSnackbarVisible(true);
  };

  // HT-1: email the .ics for this job to the client, its creator and me.
  const handleSendInvite = async (job: Job) => {
    if (!job.start_date) {
      showSnackbar('Set a start date before sending a calendar invite');
      return;
    }
    setSendingInviteFor(job.uid);
    try {
      const { to } = await sendJobInvite(job.uid);
      showSnackbar(`Calendar invite sent to ${to.join(', ')}`);
    } catch (error: any) {
      showSnackbar(`Could not send the invite: ${error.message}`);
    } finally {
      setSendingInviteFor(null);
    }
  };

  const handleDeleteJob = async () => {
    if (!jobToDelete) return;

    try {
      const { error } = await supabase
        .from('jobs')
        .delete()
        .eq('uid', jobToDelete.uid);

      if (error) {
        // 23503 = foreign_key_violation. job_costs and jobs_attachments cascade
        // since migration 20260914120000, so this only fires if it has not been
        // applied yet, or a new table starts referencing jobs without a delete rule.
        if (error.code === '23503') {
          throw new Error(`"${jobToDelete.title}" still has linked cost lines or attachments and cannot be deleted`);
        }
        throw new Error(error.message);
      }

      setJobs(jobs.filter(job => job.uid !== jobToDelete.uid));
      showSnackbar('Job deleted successfully');
    } catch (error: any) {
      console.error('Error deleting job:', error);
      showSnackbar(`Failed to delete job: ${error.message}`);
    } finally {
      setShowDeleteDialog(false);
      setJobToDelete(null);
    }
  };

  const handleEditJob = (job) => {
    router.push(`/jobs/${job.uid.toString()}`);
  };

  const handleUpdateJob = async () => {
    if (!editingJob) return;
    
    try {
      setLoading(true);
      
      // Ensure uid and client_id are proper numbers (bigint8)
      let jobId = 0;
      let clientId = 0;
      
      if (editingJob.uid !== undefined && editingJob.uid !== null) {
        jobId = typeof editingJob.uid === 'number' ? 
          editingJob.uid : Number(editingJob.uid);
          
        if (isNaN(jobId)) {
          throw new Error(`Invalid job ID format: "${editingJob.uid}"`);
        }
      } else {
        throw new Error('Job ID is required');
      }
      
      if (editingJob.client_id !== undefined && editingJob.client_id !== null) {
        clientId = typeof editingJob.client_id === 'number' ? 
          editingJob.client_id : Number(editingJob.client_id);
          
        if (isNaN(clientId)) {
          throw new Error(`Invalid client ID format: "${editingJob.client_id}"`);
        }
      } else {
        throw new Error('Client ID is required');
      }
      
      // Create a database-safe object with just the needed fields
      const dbUpdateData = {
        title: editingJob.title,
        description: editingJob.description || '',
        status: editingJob.status,
        client_id: clientId, // Use the validated number
        start_date: editingJob.start_date,
        end_date: editingJob.end_date
      };
      
      // Remove any undefined values
      Object.keys(dbUpdateData).forEach(key => {
        if (dbUpdateData[key] === undefined) {
          delete dbUpdateData[key];
        }
      });
      
      console.log('Updating job with data:', JSON.stringify(dbUpdateData, null, 2));
      
      const { error } = await supabase
        .from('jobs')
        .update(dbUpdateData)
        .eq('uid', jobId);  // Use the converted number for comparison
      
      if (error) {
        console.error('Error updating job:', error);
        alert(`Error: ${error.message}`);
        return;
      }
      
      // Find the client name for display purposes
      const client = clients.find(c => c.uid === clientId.toString());
      const updatedJobWithClientName = {
        ...editingJob,
        uid: jobId,           // Ensure uid is a number
        client_id: clientId,  // Ensure client_id is a number
        client_name: client ? client.name : 'Unknown Client',
        client_address: formatClientAddress(client),
        client_phone: client?.phone || ''
      };
      
      // Update the jobs list with the edited job
      setJobs(jobs.map(job => 
        job.uid === jobId ? updatedJobWithClientName : job
      ));
      
      setEditingJob(null);
      setShowEditDialog(false);
      showSnackbar('Job updated successfully');
    } catch (error) {
      console.error('Error in handleUpdateJob:', error);
      alert(`Error: ${error.message || 'Failed to update job'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleAddJob = async (jobData) => {
    try {
      setLoading(true);
      
      console.log('Received job data for adding:', jobData);
      
      // Ensure client_id is a proper number (bigint8)
      let clientId = 0;
      
      if (jobData.client_id !== undefined && jobData.client_id !== null) {
        clientId = typeof jobData.client_id === 'number' ? 
          jobData.client_id : Number(jobData.client_id);
          
        if (isNaN(clientId)) {
          throw new Error(`Invalid client ID format: "${jobData.client_id}"`);
        }
      } else {
        throw new Error('Client ID is required');
      }
      
      // Create a clean object with only the needed fields
      const dbJobData = {
        title: jobData.title,
        description: jobData.description || '',
        client_id: clientId, // Use the validated number
        status: jobData.status || 'pending',
        start_date: jobData.start_date,
        end_date: jobData.end_date,
        assigned_to: jobData.assigned_to ?? null,
        custom_fields: jobData.custom_fields ?? {},
      };
      
      // Remove any undefined values
      Object.keys(dbJobData).forEach(key => {
        if (dbJobData[key] === undefined) {
          delete dbJobData[key];
        }
      });
      
      console.log('Adding job with data:', JSON.stringify(dbJobData, null, 2));
      
      const { data, error } = await supabase
        .from('jobs')
        .insert(dbJobData)
        .select();
      
      if (error) {
        console.error('Error adding job:', error);
        alert(`Error: ${error.message}`);
        return;
      }
      
      // Find the client name from clients list for display purposes
      const client = clients.find(c => c.uid === clientId.toString());
      
      // Make sure the newly created job has numeric uid and client_id
      const newJob = {
        ...data[0],
        uid: Number(data[0].uid),      // Ensure uid is a number
        client_id: clientId,           // Ensure client_id is a number
        client_name: client ? client.name : 'Unknown Client',
        client_address: formatClientAddress(client),
        client_phone: client?.phone || ''
      };
      
      setJobs([newJob, ...jobs]);
      setShowAddForm(false);
      showSnackbar('Job added successfully');
    } catch (error) {
      console.error('Error in handleAddJob:', error);
      alert(`Error: ${error.message || 'Failed to add job'}`);
    } finally {
      setLoading(false);
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

  const getFilteredJobs = () => {
    let filtered = [...jobs];
    
    if (searchQuery) {
      filtered = filtered.filter(job => 
        job.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        job.client_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        job.client_address?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        job.client_phone?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        job.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        assigneeName(job).toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    // Apply status filter
    if (selectedStatuses.length > 0) {
      filtered = filtered.filter(job => selectedStatuses.includes(job.status));
    }
    
    // Apply sorting
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (sortColumn) {
        case 'title':
          comparison = a.title.localeCompare(b.title);
          break;
        case 'client_name':
          comparison = (a.client_name || '').localeCompare(b.client_name || '');
          break;
        case 'client_address':
          comparison = (a.client_address || '').localeCompare(b.client_address || '');
          break;
        case 'client_phone':
          comparison = (a.client_phone || '').localeCompare(b.client_phone || '');
          break;
        case 'assigned_to':
          comparison = assigneeName(a).localeCompare(assigneeName(b));
          break;
        case 'start_date':
          comparison = new Date(a.start_date || 0).getTime() - new Date(b.start_date || 0).getTime();
          break;
        case 'end_date':
          comparison = new Date(a.end_date || 0).getTime() - new Date(b.end_date || 0).getTime();
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
        case 'created_at':
          comparison = new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
          break;
        default:
          comparison = 0;
      }
      
      return sortDirection === 'ascending' ? comparison : -comparison;
    });
    
    return filtered;
  };

  // HT-49: statuses, names and chip colours come from the label module.
  const statusOptions = useLabels('job_status');

  const toggleStatusFilter = (status: string) => {
    if (selectedStatuses.includes(status)) {
      // If already selected, remove it
      setSelectedStatuses(selectedStatuses.filter(s => s !== status));
    } else {
      // If not selected, add it
      setSelectedStatuses([...selectedStatuses, status]);
    }
  };

  // Also update formatDateForDB to ensure consistency with form submission
  const formatDateForDB = (dateString: string | undefined) => {
    if (!dateString) return null;
    
    try {
      // Create a date object from the string
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return null;
      
      // Adjust for timezone to maintain the correct date
      const timezoneOffset = date.getTimezoneOffset() * 60000; // offset in milliseconds
      const localDate = new Date(date.getTime() - timezoneOffset);
      
      // Format as ISO string but chop off time info if we only need date
      return localDate.toISOString().split('T')[0];
    } catch (error) {
      console.error('Error formatting date for DB:', error);
      return null;
    }
  };

  // Add this new function to format date input
  const formatDateInput = (text: string): string => {
    // Remove any non-digit characters
    const digitsOnly = text.replace(/\D/g, '');
    
    // If it's 8 digits (MMDDYYYY), format as MM/DD/YYYY
    if (digitsOnly.length === 8) {
      const month = digitsOnly.substring(0, 2);
      const day = digitsOnly.substring(2, 4);
      const year = digitsOnly.substring(4, 8);
      return `${month}/${day}/${year}`;
    }
    
    // If it's less than 8 digits, just return what they typed
    return text;
  };

  // Export functionality
  const handleExport = async () => {
    try {
      setLoading(true);
      
      // Fetch jobs data
      const { data: jobsData, error: jobsError } = await supabase
        .from('jobs')
        .select(`
          *,
          clients:client_id (name)
        `);
      
      if (jobsError) throw jobsError;
      
      // Fetch job_costs data
      const { data: jobCostsData, error: jobCostsError } = await supabase
        .from('job_costs')
        .select('*');
      
      if (jobCostsError) throw jobCostsError;
      
      // Fetch job_attachments data
      const { data: jobAttachmentsData, error: jobAttachmentsError } = await supabase
        .from('job_attachments')
        .select('*');
      
      if (jobAttachmentsError) throw jobAttachmentsError;
      
      // Transform jobs data for export
      const jobsForExport = jobsData.map(job => ({
        uid: job.uid,
        title: job.title,
        description: job.description || '',
        client_id: job.client_id,
        client_name: job.clients?.name || '',
        assigned_to: job.assigned_to || '',
        assigned_to_name: job.assigned_to ? assigneeName(job) : '',
        start_date: job.start_date || '',
        end_date: job.end_date || '',
        status: job.status || '',
        created_at: job.created_at || '',
        delete: 'n'  // Default to 'n' (don't delete)
      }));
      
      await exportWorkbook('jobs.xlsx', [
        { name: 'Jobs', rows: jobsForExport, columnWidths: [36, 30, 40, 36, 30, 36, 30, 15, 15, 15, 25, 10] },
        { name: 'Job Costs', rows: jobCostsData || [], columnWidths: [36, 36, 25, 15, 15, 20, 25] },
        { name: 'Job Attachments', rows: jobAttachmentsData || [], columnWidths: [36, 36, 40, 50, 20, 15, 25] },
      ]);
      
      showSnackbar('Jobs data exported successfully');
    } catch (error) {
      console.error('Error exporting jobs data:', error);
      showSnackbar('Error exporting jobs data');
    } finally {
      setLoading(false);
    }
  };
  
  // Import functionality
  const handleImport = async () => {
    try {
      const workbook = await pickWorkbook();
      if (!workbook) return;

      const jobsData = sheetRows<any>(workbook, 'Jobs', 'Job');
      if (!jobsData) {
        showSnackbar('Error: Jobs sheet not found in the Excel file');
        return;
      }
      if (jobsData.length === 0) {
        showSnackbar('No job data found in the Excel file');
        return;
      }
      const proceed = await confirmAction(
        `Are you sure you want to import ${jobsData.length} jobs? This will update existing jobs and may delete jobs marked for deletion.`,
        'Import'
      );
      if (proceed) {
        await importJobs(jobsData);
      }
    } catch (error) {
      console.error('Error processing Excel file:', error);
      showSnackbar('Error processing Excel file');
    }
  };
  
  const importJobs = async (data: any[]) => {
    try {
      setLoading(true);
      
      let addedCount = 0;
      let updatedCount = 0;
      let deletedCount = 0;
      let errorCount = 0;
      
      // Process each job
      for (const job of data) {
        try {
          // Check if job should be deleted
          if (job.delete && (job.delete.toString().toLowerCase() === 'y' || job.delete.toString().toLowerCase() === 'yes')) {
            if (job.uid) {
      const { error } = await supabase
        .from('jobs')
        .delete()
                .eq('uid', job.uid);
      
      if (error) {
                console.error('Error deleting job:', error);
                errorCount++;
              } else {
                deletedCount++;
              }
            }
            continue;
          }
          
          // HT-35: assigned_to must be an active member of this organisation;
          // anything else (a name typed by hand, a user who left) imports as
          // unassigned. assigned_to_name is display-only, like client_name.
          const assignedTo = String(job.assigned_to ?? '').trim();
          const assignedToValid = assignedTo !== '' &&
            members.some(m => m.user_id === assignedTo && m.is_active);
          if (assignedTo !== '' && !assignedToValid) {
            console.warn(`Row for "${job.title}": assigned_to "${assignedTo}" is not an active user; importing as unassigned`);
          }

          // Prepare job data
          const jobData = {
            title: job.title || '',
            description: job.description || '',
            client_id: job.client_id || null,
            start_date: job.start_date || null,
            end_date: job.end_date || null,
            status: job.status || 'pending',
            assigned_to: assignedToValid ? assignedTo : null,
          };
          
          if (job.uid) {
            // Update existing job
            const { error } = await supabase
              .from('jobs')
              .update(jobData)
              .eq('uid', job.uid);
            
            if (error) {
              console.error('Error updating job:', error);
              errorCount++;
            } else {
              updatedCount++;
            }
          } else {
            // Add new job
            const { error } = await supabase
              .from('jobs')
              .insert([jobData]);
            
            if (error) {
              console.error('Error adding job:', error);
              errorCount++;
            } else {
              addedCount++;
            }
          }
        } catch (jobError) {
          console.error('Error processing job:', jobError);
          errorCount++;
        }
      }
      
      // Refresh jobs list
      await fetchJobs();
      
      // Show results
      showSnackbar(`Import complete: ${addedCount} added, ${updatedCount} updated, ${deletedCount} deleted, ${errorCount} errors`);
    } catch (error) {
      console.error('Error importing jobs:', error);
      showSnackbar('Error importing jobs');
    } finally {
      setLoading(false);
    }
  };

  // Add a function to update the job status
  const updateJobStatus = async (jobId: number, newStatus: string) => {
    try {
      console.log(`Updating job ${jobId} status to: ${newStatus}`);
      
      const { error } = await supabase
        .from('jobs')
        .update({ status: newStatus })
        .eq('uid', jobId);
      
      if (error) {
        console.error('Error updating job status:', error);
        showSnackbar(`Error: ${error.message}`);
        return false;
      }
      
      // Update the local state
      setJobs(prevJobs => 
        prevJobs.map(job => 
          job.uid === jobId ? { ...job, status: newStatus } : job
        )
      );
      
      showSnackbar('Job status updated successfully');
      return true;
    } catch (error) {
      console.error('Error in updateJobStatus:', error);
      showSnackbar(`Error: ${error.message}`);
      return false;
    }
  };

  // Function to get days in month
  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  // Function to get day of week (0 = Sunday, 6 = Saturday)
  const getDayOfWeek = (year: number, month: number, day: number) => {
    return new Date(year, month, day).getDay();
  };

  // Generate calendar days for current month view
  const generateCalendarDays = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    
    const daysInMonth = getDaysInMonth(year, month);
    const firstDayOfMonth = getDayOfWeek(year, month, 1);
    
    // Previous month days to show
    const daysFromPrevMonth = firstDayOfMonth;
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevMonthYear = month === 0 ? year - 1 : year;
    const daysInPrevMonth = getDaysInMonth(prevMonthYear, prevMonth);
    
    const days = [];
    
    // Add days from previous month
    for (let i = daysInPrevMonth - daysFromPrevMonth + 1; i <= daysInPrevMonth; i++) {
      days.push({
        day: i,
        month: prevMonth,
        year: prevMonthYear,
        isCurrentMonth: false
      });
    }
    
    // Add days from current month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({
        day: i,
        month: month,
        year: year,
        isCurrentMonth: true
      });
    }
    
    // Add days from next month
    const totalDaysToShow = 42; // 6 rows of 7 days
    const daysFromNextMonth = totalDaysToShow - days.length;
    const nextMonth = month === 11 ? 0 : month + 1;
    const nextMonthYear = month === 11 ? year + 1 : year;
    
    for (let i = 1; i <= daysFromNextMonth; i++) {
      days.push({
        day: i,
        month: nextMonth,
        year: nextMonthYear,
        isCurrentMonth: false
      });
    }
    
    return days;
  };

  // Navigate to previous month
  const goToPrevMonth = () => {
    setCurrentMonth(prevMonth => {
      const newMonth = new Date(prevMonth);
      newMonth.setMonth(newMonth.getMonth() - 1);
      return newMonth;
    });
  };

  // Navigate to next month
  const goToNextMonth = () => {
    setCurrentMonth(prevMonth => {
      const newMonth = new Date(prevMonth);
      newMonth.setMonth(newMonth.getMonth() + 1);
      return newMonth;
    });
  };

  // Check if a date is today
  const isToday = (day: number, month: number, year: number) => {
    const today = new Date();
    return day === today.getDate() && 
           month === today.getMonth() && 
           year === today.getFullYear();
  };

  // Check if a date is selected
  const isSelectedDate = (day: number, month: number, year: number) => {
    if (!selectedDate) return false;
    return day === selectedDate.getDate() && 
           month === selectedDate.getMonth() && 
           year === selectedDate.getFullYear();
  };

  // Handle date selection
  const handleDateSelect = (day: number, month: number, year: number) => {
    const newDate = new Date(year, month, day);
    setSelectedDate(newDate);
  };

  // Apply the selected date and time
  const applyDateTime = () => {
    if (!selectedDate) return;
    
    // Convert hour to 24-hour format if PM
    let hour = parseInt(selectedHour);
    if (selectedAmPm === "PM" && hour !== 12) {
      hour += 12;
    } else if (selectedAmPm === "AM" && hour === 12) {
      hour = 0;
    }
    
    // Create a formatted date string
    const formattedDate = `${selectedDate.getMonth() + 1}/${selectedDate.getDate()}/${selectedDate.getFullYear()}`;
    const formattedTime = `${hour.toString().padStart(2, '0')}:${selectedMinute}`;
    const formattedDateTime = `${formattedDate} ${formattedTime} ${selectedAmPm}`;
    
    if (datePickerMode === 'start') {
      setEditingJob({...editingJob, start_date: formattedDateTime});
      setShowStartDatePicker(false);
    } else {
      setEditingJob({...editingJob, end_date: formattedDateTime});
      setShowEndDatePicker(false);
    }
  };

  // Open the date picker
  const openDatePicker = (mode: 'start' | 'end') => {
    setDatePickerMode(mode);
    
    // Set initial values based on current job dates
    let initialDate: Date;
    let initialHour = "12";
    let initialMinute = "00";
    let initialAmPm: "AM" | "PM" = "AM";
    
    const dateToUse = mode === 'start' ? editingJob?.start_date : editingJob?.end_date;
    
    if (dateToUse) {
      try {
        const date = new Date(dateToUse);
        if (!isNaN(date.getTime())) {
          initialDate = date;
          
          // Extract hour, minute, and AM/PM
          let hours = date.getHours();
          const minutes = date.getMinutes();
          
          // Convert to 12-hour format
          if (hours >= 12) {
            initialAmPm = "PM";
            hours = hours === 12 ? 12 : hours - 12;
          } else {
            initialAmPm = "AM";
            hours = hours === 0 ? 12 : hours;
          }
          
          initialHour = hours.toString();
          initialMinute = minutes.toString().padStart(2, '0');
        } else {
          initialDate = new Date();
        }
      } catch (e) {
        initialDate = new Date();
      }
    } else {
      initialDate = new Date();
    }
    
    setSelectedDate(initialDate);
    setCurrentMonth(initialDate);
    setSelectedHour(initialHour);
    setSelectedMinute(initialMinute);
    setSelectedAmPm(initialAmPm);
    
    if (mode === 'start') {
      setShowStartDatePicker(true);
    } else {
      setShowEndDatePicker(true);
    }
  };

  // Generate time options
  const generateHourOptions = () => {
    const hours = [];
    for (let i = 1; i <= 12; i++) {
      hours.push(i.toString());
    }
    return hours;
  };

  const generateMinuteOptions = () => {
    const minutes = [];
    for (let i = 0; i < 60; i += 5) {
      minutes.push(i.toString().padStart(2, '0'));
    }
    return minutes;
  };

  return (
    <View style={{
      flex: 1,
      padding: 16,
      backgroundColor: themed.panel,
    }}>
      <Text style={{
        fontFamily: 'System',
        fontSize: 26,
        fontWeight: '600',
        marginBottom: 16,
        color: themed.text,
      }}>Jobs</Text>
      
      <View style={styles.searchAndAddContainer}>
      <Searchbar
        placeholder="Search jobs..."
        onChangeText={setSearchQuery}
        value={searchQuery}
          style={[styles.searchBar, { backgroundColor: themed.soft }]}
      />
      
        <View style={{ 
          flexDirection: 'row', 
          alignItems: 'center',
          height: 40 // Set a fixed height to ensure vertical alignment
        }}>
      <Button 
        mode="contained" 
            onPress={() => setShowAddForm(true)}
            style={[styles.addButton, { marginLeft: 16 }]}
      >
        Add New Job
      </Button>
      
          <ImportExportButtons onExport={handleExport} onImport={handleImport} />
        </View>
      </View>
      
      
      <LabelPillRow>
        <LabelPill label="All" selected={selectedStatuses.length === 0} onPress={() => setSelectedStatuses([])} />
        {statusOptions.map(option => (
          <LabelPill
            key={option.value}
            label={option.label}
            color={option.color}
            textColor={option.textColor}
            selected={selectedStatuses.includes(option.value)}
            onPress={() => toggleStatusFilter(option.value)}
          />
        ))}
      </LabelPillRow>
      
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>
      <Card style={styles.tableCard}>
        <DataTable style={{ backgroundColor: themed.panel }}>
          <DataTable.Header style={{ backgroundColor: themed.panel }}>
            <DataTable.Title 
              onPress={() => handleSort('title')}
              sortDirection={sortColumn === 'title' ? sortDirection : undefined}
            >
              Job Name
            </DataTable.Title>
            <DataTable.Title 
              onPress={() => handleSort('client_name')}
              sortDirection={sortColumn === 'client_name' ? sortDirection : undefined}
            >
              Client
            </DataTable.Title>
            <DataTable.Title
              style={{ flex: 2 }}
              onPress={() => handleSort('client_address')}
              sortDirection={sortColumn === 'client_address' ? sortDirection : undefined}
            >
              Address
            </DataTable.Title>
            <DataTable.Title
              style={{ flex: 1.2 }}
              onPress={() => handleSort('client_phone')}
              sortDirection={sortColumn === 'client_phone' ? sortDirection : undefined}
            >
              Phone
            </DataTable.Title>
            <DataTable.Title
              onPress={() => handleSort('assigned_to')}
              sortDirection={sortColumn === 'assigned_to' ? sortDirection : undefined}
            >
              Assigned to
            </DataTable.Title>
            <DataTable.Title
              onPress={() => handleSort('status')}
              sortDirection={sortColumn === 'status' ? sortDirection : undefined}
            >
              Status
            </DataTable.Title>
            <DataTable.Title
              style={{ flex: 1.5 }}
              onPress={() => handleSort('start_date')}
              sortDirection={sortColumn === 'start_date' ? sortDirection : undefined}
            >
              Start Date
            </DataTable.Title>
            <DataTable.Title
              style={{ flex: 1.5 }}
              onPress={() => handleSort('end_date')}
              sortDirection={sortColumn === 'end_date' ? sortDirection : undefined}
            >
              End Date
            </DataTable.Title>
            <DataTable.Title style={{ flex: 1.3 }}>Actions</DataTable.Title>
          </DataTable.Header>
          
          {loading ? (
            <DataTable.Row style={{ backgroundColor: themed.panel }}>
              <DataTable.Cell style={{ flex: 8 }}>
                <ActivityIndicator size="small" style={{ marginRight: 8 }} />
                Loading jobs...
              </DataTable.Cell>
            </DataTable.Row>
          ) : getFilteredJobs().length === 0 ? (
            <DataTable.Row style={{ backgroundColor: themed.panel }}>
              <DataTable.Cell style={{ flex: 8 }}>No jobs found</DataTable.Cell>
            </DataTable.Row>
          ) : (
            getFilteredJobs().map(job => (
              <DataTable.Row key={job.uid} style={{ backgroundColor: themed.panel }}>
                <DataTable.Cell style={{ backgroundColor: themed.panel }}>{job.title}</DataTable.Cell>
                <DataTable.Cell style={{ backgroundColor: themed.panel }}>{job.client_name}</DataTable.Cell>
                <DataTable.Cell style={{ backgroundColor: themed.panel, flex: 2 }}>{job.client_address}</DataTable.Cell>
                <DataTable.Cell style={{ backgroundColor: themed.panel, flex: 1.2 }}>{job.client_phone}</DataTable.Cell>
                <DataTable.Cell style={{ backgroundColor: themed.panel }}>{assigneeName(job)}</DataTable.Cell>
                <DataTable.Cell style={{ backgroundColor: themed.panel }}>
                  <select
                    value={job.status}
                    onChange={(e) => updateJobStatus(job.uid, e.target.value)}
                    style={{
                      padding: 8,
                      borderRadius: 4,
                      borderColor: themed.line,
                      backgroundColor: themed.panel,
                      color: themed.text,
                      fontWeight: 'bold'
                    }}
                  >
                    {statusOptions.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </DataTable.Cell>
                <DataTable.Cell style={{ backgroundColor: themed.panel, flex: 1.5 }}>{formatDateTime(job.start_date)}</DataTable.Cell>
                <DataTable.Cell style={{ backgroundColor: themed.panel, flex: 1.5 }}>{formatDateTime(job.end_date)}</DataTable.Cell>
                <DataTable.Cell style={{ backgroundColor: themed.panel, flex: 1.3 }}>
                  <View style={styles.actionButtons}>
                    <IconButton
                      icon="pencil"
                      size={20}
                      onPress={() => handleEditJob(job)}
                    />
                    <Tooltip title="Send calendar invite">
                      <IconButton
                        icon="calendar-export"
                        size={20}
                        loading={sendingInviteFor === job.uid}
                        disabled={sendingInviteFor !== null}
                        onPress={() => handleSendInvite(job)}
                      />
                    </Tooltip>
                    <IconButton
                      icon="delete"
                      size={20}
                      onPress={() => {
                        setJobToDelete(job);
                        setShowDeleteDialog(true);
                      }}
                      iconColor="red"
                    />
                  </View>
                </DataTable.Cell>
              </DataTable.Row>
            ))
          )}
        </DataTable>
      </Card>
      </ScrollView>

      {/* Delete Job Dialog */}
      <Portal>
        <Dialog visible={showDeleteDialog} onDismiss={() => setShowDeleteDialog(false)}>
          <Dialog.Title>Delete Job</Dialog.Title>
          <Dialog.Content>
            <Text>Are you sure you want to delete the job "{jobToDelete?.title}"?</Text>
            <Text>This action cannot be undone.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setShowDeleteDialog(false)}>Cancel</Button>
            <Button onPress={handleDeleteJob} textColor="red">Delete</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
      
      {/* Edit Job Dialog */}
      <Portal>
        <Dialog visible={showEditDialog} onDismiss={() => setShowEditDialog(false)} style={styles.editDialog}>
          <Dialog.Title>Edit Job</Dialog.Title>
          <Dialog.Content style={styles.dialogContent}>
            {editingJob && (
              <View style={styles.formContainer}>
                <Text style={styles.inputLabel}>Title</Text>
                <TextInput
                  value={editingJob.title}
                  onChangeText={(text) => setEditingJob({...editingJob, title: text})}
                  style={styles.input}
                  mode="outlined"
                />
                
                <Text style={styles.inputLabel}>Client</Text>
                <View style={styles.dropdownContainer}>
                  <TextInput
                    value={clients.find(client => client.uid === editingJob.client_id)?.name || 'Select Client'}
                    style={[styles.input, { cursor: 'pointer' }]}
                    mode="outlined"
                    right={
                      <TextInput.Icon 
                        icon="menu-down" 
                        onPress={() => setShowClientDropdown(!showClientDropdown)} 
                      />
                    }
                    onTouchStart={() => setShowClientDropdown(!showClientDropdown)}
                    onClick={() => setShowClientDropdown(!showClientDropdown)}
                    editable={false}
                    pointerEvents="auto"
                  />
                  {showClientDropdown && (
                    <View style={styles.dropdown}>
                      {clients.map(client => (
                        <TouchableOpacity
                          key={client.uid}
                          style={{
                            padding: 12,
                            borderBottomWidth: 1,
                            borderBottomColor: themed.line,
                            backgroundColor: client.uid === editingJob.client_id 
                              ? '#f0f0f0' 
                              : 'white',
                            width: '100%',
                            display: 'flex',
                            flexDirection: 'row',
                            alignItems: 'center'
                          }}
                          onPress={() => {
                            setEditingJob({
                              ...editingJob, 
                              client_id: client.uid,
                              client_name: client.name // Also update the client_name in the local state
                            });
                            setShowClientDropdown(false);
                          }}
                          onMouseEnter={(e) => {
                            // @ts-ignore - Add hover effect
                            e.currentTarget.style.backgroundColor = themed.soft;
                          }}
                          onMouseLeave={(e) => {
                            // @ts-ignore - Remove hover effect
                            e.currentTarget.style.backgroundColor = 
                              client.uid === editingJob.client_id 
                                ? '#f0f0f0' 
                                : 'white';
                          }}
                        >
                          <Text style={{ flex: 1, fontSize: 16, fontWeight: '500', marginLeft: 8 }}>{client.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
                
                <Text style={styles.inputLabel}>Description</Text>
                <TextInput
                  value={editingJob.description}
                  onChangeText={(text) => setEditingJob({...editingJob, description: text})}
                  style={styles.input}
                  multiline
                  numberOfLines={3}
                      mode="outlined" 
                />
                
                <Text style={styles.inputLabel}>Start Date & Time</Text>
                <TouchableOpacity onPress={() => openDatePicker('start')}>
                  <TextInput
                    value={editingJob.start_date === null ? '' : editingJob.start_date}
                    style={[styles.input, { pointerEvents: 'none' }]}
                    mode="outlined"
                    editable={false}
                    right={<TextInput.Icon icon="calendar" />}
                  />
                </TouchableOpacity>
                
                <Text style={styles.inputLabel}>End Date & Time</Text>
                <TouchableOpacity onPress={() => openDatePicker('end')}>
                  <TextInput
                    value={editingJob.end_date === null ? '' : editingJob.end_date}
                    style={[styles.input, { pointerEvents: 'none' }]}
                    mode="outlined"
                    editable={false}
                    right={<TextInput.Icon icon="calendar" />}
                  />
                </TouchableOpacity>
                
                <Text style={styles.inputLabel}>Status</Text>
                <select
                  value={editingJob.status}
                  onChange={(e) => setEditingJob({...editingJob, status: e.target.value as Job['status']})}
                  style={{
                    padding: 8,
                    borderRadius: 4,
                    borderColor: themed.line,
                    backgroundColor: themed.panel,
                    color: themed.text,
                    fontWeight: 'bold'
                  }}
                >
                  {statusOptions.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </View>
            )}
          </Dialog.Content>
          <Dialog.Actions style={styles.dialogActions}>
            <Button onPress={() => setShowEditDialog(false)}>Cancel</Button>
            <Button 
              onPress={handleUpdateJob} 
              mode="contained"
              loading={loading}
              disabled={loading}
            >
              Save Changes
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
      
      <JobDialog
        visible={showAddForm}
        subtitle="Schedule work for a client"
        submitting={loading}
        onDismiss={() => setShowAddForm(false)}
        onSubmit={handleAddJob}
      />

      {/* Date & Time Picker Dropdown for Start Date */}
      <Portal>
        <Dialog visible={showStartDatePicker} onDismiss={() => setShowStartDatePicker(false)} style={styles.datePickerDialog}>
          <Dialog.Title>Select Start Date & Time</Dialog.Title>
          <Dialog.Content>
            <View style={styles.datePickerContainer}>
              {/* Month Navigation */}
              <View style={styles.monthNavigation}>
                <TouchableOpacity onPress={goToPrevMonth}>
                  <Text style={styles.navButton}>{'<'}</Text>
                </TouchableOpacity>
                <Text style={styles.monthYearText}>
                  {currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
                </Text>
                <TouchableOpacity onPress={goToNextMonth}>
                  <Text style={styles.navButton}>{'>'}</Text>
                </TouchableOpacity>
              </View>
              
              {/* Calendar */}
              <View style={styles.calendar}>
                {/* Weekday Headers */}
                <View style={styles.weekdayHeader}>
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
                    <Text key={index} style={styles.weekdayText}>{day}</Text>
                  ))}
                </View>
                
                {/* Calendar Days */}
                <View style={styles.calendarDays}>
                  {generateCalendarDays().map((dateObj, index) => (
                    <TouchableOpacity
                      key={index}
                      style={[
                        styles.calendarDay,
                        !dateObj.isCurrentMonth && styles.notCurrentMonth,
                        isToday(dateObj.day, dateObj.month, dateObj.year) && styles.today,
                        isSelectedDate(dateObj.day, dateObj.month, dateObj.year) && styles.selectedDay,
                      ]}
                      onPress={() => handleDateSelect(dateObj.day, dateObj.month, dateObj.year)}
                    >
                      <Text style={[
                        styles.calendarDayText,
                        !dateObj.isCurrentMonth && styles.notCurrentMonthText,
                        isToday(dateObj.day, dateObj.month, dateObj.year) && styles.todayText,
                        isSelectedDate(dateObj.day, dateObj.month, dateObj.year) && styles.selectedDayText,
                      ]}>
                        {dateObj.day}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setShowStartDatePicker(false)}>Cancel</Button>
            <Button onPress={applyDateTime} mode="contained">OK</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* Date & Time Picker Dropdown for End Date */}
      <Portal>
        <Dialog visible={showEndDatePicker} onDismiss={() => setShowEndDatePicker(false)} style={styles.datePickerDialog}>
          <Dialog.Title>Select End Date & Time</Dialog.Title>
          <Dialog.Content>
            <View style={styles.datePickerContainer}>
              {/* Month Navigation */}
              <View style={styles.monthNavigation}>
                <TouchableOpacity onPress={goToPrevMonth}>
                  <Text style={styles.navButton}>{'<'}</Text>
                </TouchableOpacity>
                <Text style={styles.monthYearText}>
                  {currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
                </Text>
                <TouchableOpacity onPress={goToNextMonth}>
                  <Text style={styles.navButton}>{'>'}</Text>
                </TouchableOpacity>
              </View>
              
              {/* Calendar */}
              <View style={styles.calendar}>
                {/* Weekday Headers */}
                <View style={styles.weekdayHeader}>
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
                    <Text key={index} style={styles.weekdayText}>{day}</Text>
                  ))}
                </View>
                
                {/* Calendar Days */}
                <View style={styles.calendarDays}>
                  {generateCalendarDays().map((dateObj, index) => (
                    <TouchableOpacity
                      key={index}
                      style={[
                        styles.calendarDay,
                        !dateObj.isCurrentMonth && styles.notCurrentMonth,
                        isToday(dateObj.day, dateObj.month, dateObj.year) && styles.today,
                        isSelectedDate(dateObj.day, dateObj.month, dateObj.year) && styles.selectedDay,
                      ]}
                      onPress={() => handleDateSelect(dateObj.day, dateObj.month, dateObj.year)}
                    >
                      <Text style={[
                        styles.calendarDayText,
                        !dateObj.isCurrentMonth && styles.notCurrentMonthText,
                        isToday(dateObj.day, dateObj.month, dateObj.year) && styles.todayText,
                        isSelectedDate(dateObj.day, dateObj.month, dateObj.year) && styles.selectedDayText,
                      ]}>
                        {dateObj.day}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setShowEndDatePicker(false)}>Cancel</Button>
            <Button onPress={applyDateTime} mode="contained">OK</Button>
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
    backgroundColor: themed.panel,
  },
  searchAndAddContainer: {
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'center',
  },
  searchBar: {
    flex: 1,
    marginRight: 16,
    backgroundColor: themed.panel,
  },
  addButton: {
    marginLeft: 8,
  },
  tableCard: {
    backgroundColor: themed.panel,
    borderRadius: 8,
    elevation: 2,
    shadowColor: 'rgba(0,0,0,0.1)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.8,
    shadowRadius: 1,
  },
  actionButtons: {
    flexDirection: 'row',
  },
  editDialog: {
    width: '90%',
    maxWidth: 600,
    alignSelf: 'center',
    borderRadius: 10,
    backgroundColor: themed.soft,
    zIndex: 100,
  },
  dialogContent: {
    paddingHorizontal: 20,
    paddingBottom: 10,
    backgroundColor: themed.soft,
    zIndex: 100,
  },
  formContainer: {
    backgroundColor: themed.soft,
    zIndex: 100,
  },
  dialogActions: {
    padding: 15,
    justifyContent: 'space-between',
    backgroundColor: themed.soft,
  },
  input: {
    marginBottom: 20,
    backgroundColor: themed.panel,
  },
  statusInput: {
    marginBottom: 20,
    backgroundColor: themed.panel,
    cursor: 'pointer',
  },
  inputLabel: {
    fontSize: 16,
    marginBottom: 8,
    fontWeight: '500',
  },
  label: {
    fontSize: 16,
    marginBottom: 8,
  },
  dropdownContainer: {
    position: 'relative',
    marginBottom: 20,
    zIndex: 1000,
  },
  dropdown: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    backgroundColor: themed.panel,
    borderWidth: 1,
    borderColor: themed.line,
    borderRadius: 4,
    zIndex: 1001,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    overflow: 'hidden',
    width: '100%'
  },
  dropdownItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: themed.line,
    flexDirection: 'row',
    alignItems: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    width: '100%',
    display: 'flex',
    justifyContent: 'flex-start'
  },
  dropdownItemText: {
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 8,
  },
  jobName: {
    color: themed.text,
  },
  datePickerDialog: {
    width: '90%',
    maxWidth: 400,
    alignSelf: 'center',
    borderRadius: 10,
    backgroundColor: themed.panel,
  },
  datePickerContainer: {
    marginTop: 10,
  },
  monthNavigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  navButton: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2196F3',
    padding: 5,
  },
  monthYearText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: themed.text,
  },
  calendar: {
    marginBottom: 20,
  },
  weekdayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 10,
  },
  weekdayText: {
    width: 30,
    textAlign: 'center',
    fontWeight: 'bold',
    color: themed.muted,
  },
  calendarDays: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  calendarDay: {
    width: '14.28%',
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  calendarDayText: {
    fontSize: 14,
    color: themed.text,
  },
  notCurrentMonth: {
    opacity: 0.3,
  },
  notCurrentMonthText: {
    color: themed.faint,
  },
  today: {
    backgroundColor: '#E3F2FD',
    borderRadius: 20,
  },
  todayText: {
    color: '#2196F3',
    fontWeight: 'bold',
  },
  selectedDay: {
    backgroundColor: '#2196F3',
    borderRadius: 20,
  },
  selectedDayText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  timeSelector: {
    marginTop: 15,
    borderTopWidth: 1,
    borderTopColor: themed.line,
    paddingTop: 15,
  },
  timeInputRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeInputContainer: {
    flex: 1,
    marginHorizontal: 5,
  },
  timeLabel: {
    fontSize: 14,
    color: themed.muted,
    marginBottom: 5,
  },
  timeSelect: {
    width: '100%',
    height: 40,
    borderWidth: 1,
    borderColor: themed.line,
    borderRadius: 4,
    paddingHorizontal: 10,
    backgroundColor: themed.panel,
  },
}); 