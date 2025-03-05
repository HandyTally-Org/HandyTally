import { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Platform, Pressable, TouchableOpacity } from 'react-native';
import { Text, Button, Card, SegmentedButtons, FAB, TextInput, Dialog, Portal, Divider, Chip, DataTable, ActivityIndicator, RadioButton, List, IconButton, Menu, Snackbar, Surface, Modal } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { formatCurrency, formatDate } from '../../../utils/formatting';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from 'date-fns';
import { JobForm } from '../../../components/JobForm';
import { InvoiceDetails } from '../../../components/InvoiceDetails';

// Let's create a simple calendar component using the existing libraries
interface SimpleCalendarProps {
  currentMonth: Date;
  onDateSelect: (date: string) => void;
  markedDates: Record<string, { marked: boolean; dotColor?: string }>;
  selectedDate: string;
}

const SimpleCalendar: React.FC<SimpleCalendarProps> = ({ currentMonth, onDateSelect, markedDates, selectedDate }) => {
  // Get days in month
  const getDaysInMonth = (year: number, month: number): number => {
    return new Date(year, month + 1, 0).getDate();
  };
  
  // Get day of week (0 = Sunday, 6 = Saturday)
  const getFirstDayOfMonth = (year: number, month: number): number => {
    return new Date(year, month, 1).getDay();
  };
  
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDayOfMonth = getFirstDayOfMonth(year, month);
  
  // Create array of day numbers
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  
  // Create empty slots for days before the first day of month
  const emptySlots = Array.from({ length: firstDayOfMonth }, (_, i) => null);
  
  // Combine empty slots and days
  const allSlots = [...emptySlots, ...days];
  
  // Create rows (weeks)
  const weeks = [];
  let week = [];
  
  allSlots.forEach((day, index) => {
    week.push(day);
    if ((index + 1) % 7 === 0 || index === allSlots.length - 1) {
      // Fill the last week with empty slots if needed
      if (week.length < 7) {
        const emptyEndSlots = Array.from({ length: 7 - week.length }, (_, i) => null);
        week = [...week, ...emptyEndSlots];
      }
      weeks.push([...week]);
      week = [];
    }
  });
  
  // Format date as YYYY-MM-DD
  const formatDateString = (day) => {
    const d = new Date(year, month, day);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };
  
  // Check if a date is today
  const isToday = (day) => {
    const today = new Date();
    return day === today.getDate() && 
           month === today.getMonth() && 
           year === today.getFullYear();
  };
  
  // Check if a date is selected
  const isSelected = (day) => {
    if (!day) return false;
    const dateStr = formatDateString(day);
    return dateStr === selectedDate;
  };
  
  // Check if a date is marked
  const isMarked = (day) => {
    if (!day) return false;
    const dateStr = formatDateString(day);
    return markedDates[dateStr]?.marked;
  };
  
  return (
    <View style={styles.calendar}>
      {/* Day headers */}
      <View style={styles.calendarHeader}>
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((dayName, index) => (
          <Text key={index} style={styles.dayHeader}>{dayName}</Text>
        ))}
      </View>
      
      {/* Calendar grid */}
      <View style={styles.calendarGrid}>
        {weeks.map((week, weekIndex) => (
          <View key={weekIndex} style={styles.calendarRow}>
            {week.map((day, dayIndex) => (
              <View 
                key={dayIndex} 
                style={[
                  styles.calendarDay,
                  day ? {} : styles.emptyDay,
                  isSelected(day) ? styles.selectedDay : {},
                  isToday(day) ? styles.todayDay : {}
                ]}
              >
                {day && (
                  <Pressable
                    onPress={() => onDateSelect(formatDateString(day))}
                    style={styles.dayButton}
                  >
                    <Text style={[
                      styles.dayText,
                      isSelected(day) ? styles.selectedDayText : {},
                      isToday(day) ? styles.todayDayText : {}
                    ]}>
                      {day}
                    </Text>
                    {isMarked(day) && (
                      <View style={styles.markerDot} />
                    )}
                  </Pressable>
                )}
              </View>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
};

type JobCostItem = {
  uid?: string;
  job_id: string;
  description: string;
  quantity: number;
  price: number;
  type: 'labor' | 'material' | 'other';
  created_at?: string;
};

interface Job {
  uid: string;
  title: string;
  description?: string;
  status: string;
  client_id: string;
  created_at: string;
  updated_at: string;
  start_date?: string;
  end_date?: string;
  client?: {
    name: string;
    email: string;
  };
}

interface Service {
  id: string;
  name: string;
  rate: number;
}

interface Material {
  id: string;
  name: string;
  price: number;
}

export default function JobDetailsScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [selectedTab, setSelectedTab] = useState('info');
  const [job, setJob] = useState<Job | null>(null);
  const [invoices, setInvoices] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [jobCosts, setJobCosts] = useState([]);
  const [events, setEvents] = useState([]);
  const [logs, setLogs] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddLogDialog, setShowAddLogDialog] = useState(false);
  const [newLogText, setNewLogText] = useState('');
  const [showAddCostDialog, setShowAddCostDialog] = useState(false);
  const [newCost, setNewCost] = useState({ description: '', quantity: '1', price: '0', type: 'labor' });
  const [showAddEventDialog, setShowAddEventDialog] = useState(false);
  const [newEvent, setNewEvent] = useState({ title: '', date: '', notes: '' });
  const [markedDates, setMarkedDates] = useState({});
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [localAttachments, setLocalAttachments] = useState([]);
  const [services, setServices] = useState<Service[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [showServiceMenu, setShowServiceMenu] = useState(false);
  const [showMaterialMenu, setShowMaterialMenu] = useState(false);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [calendarView, setCalendarView] = useState('month'); // 'month' or 'agenda'
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [editMode, setEditMode] = useState(false);
  const [costItems, setCostItems] = useState<JobCostItem[]>([]);
  const [totalLaborCost, setTotalLaborCost] = useState(0);
  const [totalMaterialCost, setTotalMaterialCost] = useState(0);
  const [totalOtherCost, setTotalOtherCost] = useState(0);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [showEditForm, setShowEditForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showExitConfirmation, setShowExitConfirmation] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState(null);
  const [viewingInvoiceId, setViewingInvoiceId] = useState(null);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [editingInvoice, setEditingInvoice] = useState(false);

  useEffect(() => {
    if (id) {
      fetchJobDetails();
      fetchServices();
      fetchMaterials();
      fetchInvoices();
    }
  }, [id]);

  useEffect(() => {
    const loadLocalAttachments = async () => {
      try {
        const storedAttachments = await AsyncStorage.getItem(`job_attachments_${id}`);
        if (storedAttachments) {
          setLocalAttachments(JSON.parse(storedAttachments));
        }
      } catch (error) {
        console.error('Error loading local attachments:', error);
      }
    };
    
    loadLocalAttachments();
  }, [id]);

  const fetchServices = async () => {
    try {
      const { data, error } = await supabase
        .from('services')
        .select('*')
        .order('name');
      
      if (error) {
        console.error('Error fetching services:', error);
        throw error;
      }
      
      if (data) {
        console.log('Fetched services:', data); // Debug log
        setServices(data);
      }
    } catch (error) {
      console.error('Error in fetchServices:', error);
    }
  };

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      
      // Fetch invoices related to this job with client information
      const { data, error } = await supabase
        .from('invoices')
        .select(`
          *,
          clients:client_id (name, uid)
        `)
        .eq('job_id', id);
      
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
      setSnackbarMessage('Error loading invoices');
      setSnackbarVisible(true);
    } finally {
      setLoading(false);
    }
  };

  async function fetchJobDetails() {
    try {
      if (!id) {
        console.error('No job ID provided');
        return;
      }

      setLoading(true);
      
      // Fetch job details
      const { data: jobData, error: jobError } = await supabase
        .from('jobs')
        .select(`
          *,
          client:clients(*)
        `)
        .eq('uid', id)
        .single();
      
      if (jobError) {
        console.error('Error fetching job:', jobError);
        alert('Error loading job details');
        return;
      }

      if (jobData) {
      setJob(jobData);
      }
      
      // Fetch job costs
      const { data: costData, error: costError } = await supabase
        .from('job_costs')
        .select('*')
        .eq('job_id', id);
      
      if (!costError && costData) {
        setJobCosts(costData);
      }

      // Fetch services and materials
      const [servicesResult, materialsResult] = await Promise.all([
        supabase.from('services').select('*'),
        supabase.from('materials').select('*')
      ]);

      if (servicesResult.data) {
        setServices(servicesResult.data);
      }

      if (materialsResult.data) {
        setMaterials(materialsResult.data);
      }
      
    } catch (error) {
      console.error('Error in fetchJobDetails:', error);
      alert('Error loading job details');
    } finally {
      setLoading(false);
    }
  }

  const handleAddLog = async () => {
    if (!newLogText.trim()) return;
    
    try {
      const { data, error } = await supabase
        .from('job_logs')
        .insert([{
          job_id: id,
          content: newLogText,
          created_by: 'current_user', // Replace with actual user ID
        }])
        .select();
      
      if (error) throw error;
      
      // Add to history
      await supabase
        .from('job_history')
        .insert([{
          job_id: id,
          action: 'Added log',
          details: newLogText.substring(0, 50) + (newLogText.length > 50 ? '...' : ''),
          created_by: 'current_user', // Replace with actual user ID
        }]);
      
      setLogs([data[0], ...logs]);
      setNewLogText('');
      setShowAddLogDialog(false);
      
    } catch (error) {
      console.error('Error adding log:', error);
    }
  };

  const handleAddCost = async () => {
    try {
      if (!id) return;

      let description = '';
      let price = 0;
      let quantity = parseFloat(newCost.quantity || '1');
      
      if (newCost.type === 'labor') {
        if (!selectedService) {
          alert('Please select a service');
          return;
        }
        description = selectedService.name;
        price = selectedService.rate;
      } else if (newCost.type === 'material') {
        if (!selectedMaterial) {
          alert('Please select a material');
          return;
        }
        description = selectedMaterial.name;
        price = selectedMaterial.price;
      } else {
        if (!newCost.description.trim()) {
          alert('Please enter a description');
          return;
        }
        description = newCost.description;
        price = parseFloat(newCost.price || '0');
      }
      
      const { data, error } = await supabase
        .from('job_costs')
        .insert([{
          job_id: id,
          description,
          quantity,
          price,
          type: newCost.type,
          created_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) throw error;

      setJobCosts([...jobCosts, data]);
      setShowAddCostDialog(false);
      setNewCost({ description: '', quantity: '1', price: '0', type: 'labor' });
      setSelectedService(null);
      setSelectedMaterial(null);
      
    } catch (error) {
      console.error('Error adding cost:', error);
      alert('Error adding cost');
    }
  };

  const handleAddEvent = async () => {
    if (!newEvent.title.trim() || !newEvent.date.trim()) {
      alert('Please enter a title and date');
      return;
    }
    
    try {
      if (newEvent.id) {
        // Update existing event
        const { error } = await supabase
          .from('job_events')
          .update({
            title: newEvent.title,
            date: newEvent.date,
            notes: newEvent.notes,
            updated_at: new Date().toISOString()
          })
          .eq('id', newEvent.id);
        
        if (error) throw error;
        
        // Add to history
        await supabase
          .from('job_history')
          .insert([{
            job_id: id,
            action: 'Updated event',
            details: `Updated "${newEvent.title}" on ${formatDate(newEvent.date)}`,
            created_by: 'current_user', // Replace with actual user ID
          }]);
        
        // Update events list
        setEvents(events.map(event => 
          event.id === newEvent.id ? { ...event, ...newEvent } : event
        ));
        
      } else {
        // Create new event
        const { data, error } = await supabase
          .from('job_events')
          .insert([{
            job_id: id,
            title: newEvent.title,
            date: newEvent.date,
            notes: newEvent.notes,
            created_by: 'current_user', // Replace with actual user ID
          }])
          .select();
        
        if (error) throw error;
        
        // Add to history
        await supabase
          .from('job_history')
          .insert([{
            job_id: id,
            action: 'Added event',
            details: `Scheduled "${newEvent.title}" for ${formatDate(newEvent.date)}`,
            created_by: 'current_user', // Replace with actual user ID
          }]);
        
        // Update events list
        setEvents([...events, data[0]]);
        
        // Update marked dates
        setMarkedDates({
          ...markedDates,
          [newEvent.date]: { marked: true, dotColor: '#2196f3' }
        });
      }
      
      // Reset form and close dialog
      setNewEvent({ title: '', date: '', notes: '' });
      setShowAddEventDialog(false);
      
    } catch (error) {
      console.error('Error saving event:', error);
    }
  };

  const ensureAttachmentsTable = async () => {
    try {
      console.log('Checking job_attachments table...');
      
      // First, check if the table exists by trying to select from it
      const { error: checkError } = await supabase
        .from('job_attachments')
        .select('count')
        .limit(1);
      
      if (checkError && checkError.code === '42P01') { // Table doesn't exist error code
        console.log('job_attachments table does not exist, creating it...');
        
        // Create the table using SQL
        const { error: createError } = await supabase.rpc('create_job_attachments_table', {});
        
        if (createError) {
          console.error('Error creating job_attachments table:', createError);
          
          // Alternative approach: create a function to create the table
          await supabase.rpc('execute_sql', {
            sql_query: `
              CREATE TABLE IF NOT EXISTS job_attachments (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                job_id UUID REFERENCES jobs(uid) ON DELETE CASCADE,
                name TEXT NOT NULL,
                url TEXT NOT NULL,
                type TEXT,
                size BIGINT,
                uploaded_by TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
              );
            `
          });
        }
        
        console.log('job_attachments table created successfully');
      } else {
        console.log('job_attachments table exists');
      }
    } catch (error) {
      console.error('Error checking/creating job_attachments table:', error);
    }
  };

  useEffect(() => {
    ensureAttachmentsTable();
  }, []);

  const handleFileUpload = async () => {
    try {
      console.log('Starting file upload process...');
      
      // Pick a document
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true
      });
      
      if (result.canceled) {
        console.log('File selection canceled');
        return;
      }
      
      setUploading(true);
      
      const file = result.assets[0];
      console.log('Selected file:', file);
      
      // Create a local attachment object
      const newAttachment = {
        id: Date.now().toString(),
        job_id: id,
        name: file.name,
        url: file.uri,
        type: file.mimeType || 'application/octet-stream',
        size: file.size || 0,
        uploaded_by: 'current_user',
        created_at: new Date().toISOString()
      };
      
      // Update local state
      const updatedAttachments = [...localAttachments, newAttachment];
      setLocalAttachments(updatedAttachments);
      
      // Save to AsyncStorage
      await AsyncStorage.setItem(`job_attachments_${id}`, JSON.stringify(updatedAttachments));
      
      console.log('Attachment saved locally:', newAttachment);
      
      setUploading(false);
      
    } catch (error) {
      console.error('Error uploading file:', error);
      setUploading(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleDeleteLocalAttachment = async (attachmentId) => {
    try {
      const updatedAttachments = localAttachments.filter(a => a.id !== attachmentId);
      setLocalAttachments(updatedAttachments);
      await AsyncStorage.setItem(`job_attachments_${id}`, JSON.stringify(updatedAttachments));
    } catch (error) {
      console.error('Error deleting local attachment:', error);
    }
  };

  const debugDatabase = async () => {
    try {
      console.log('Debugging database for job ID:', id);
      
      // Check if the job exists
      const { data: jobData, error: jobError } = await supabase
        .from('jobs')
        .select('*')
        .eq('uid', id)
        .single();
      
      console.log('Job data:', jobData);
      if (jobError) console.error('Job error:', jobError);
      
      // Check if the job_attachments table exists
      const { data: tableInfo, error: tableError } = await supabase
        .rpc('get_table_info', { table_name: 'job_attachments' });
      
      console.log('Table info:', tableInfo);
      if (tableError) console.error('Table error:', tableError);
      
      // Try to select from job_attachments
      const { data: attachmentsData, error: attachmentsError } = await supabase
        .from('job_attachments')
        .select('*');
      
      console.log('All attachments:', attachmentsData);
      if (attachmentsError) console.error('Attachments error:', attachmentsError);
      
      // Try to select attachments for this job
      const { data: jobAttachments, error: jobAttachmentsError } = await supabase
        .from('job_attachments')
        .select('*')
        .eq('job_id', id);
      
      console.log('Job attachments:', jobAttachments);
      if (jobAttachmentsError) console.error('Job attachments error:', jobAttachmentsError);
      
    } catch (error) {
      console.error('Error in debugDatabase:', error);
    }
  };

  // Add this function to determine the icon based on file type
  const getFileIcon = (fileName) => {
    if (!fileName) return 'file-outline';
    
    const extension = fileName.split('.').pop().toLowerCase();
    
    switch (extension) {
      case 'pdf':
        return 'file-pdf-box';
      case 'doc':
      case 'docx':
        return 'file-word-box';
      case 'xls':
      case 'xlsx':
      case 'csv':
        return 'file-excel-box';
      case 'ppt':
      case 'pptx':
        return 'file-powerpoint-box';
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
      case 'bmp':
      case 'tiff':
        return 'file-image-box';
      case 'txt':
        return 'file-document-box';
      case 'zip':
      case 'rar':
      case '7z':
        return 'zip-box';
      case 'mp3':
      case 'wav':
      case 'ogg':
        return 'file-music-box';
      case 'mp4':
      case 'avi':
      case 'mov':
      case 'wmv':
        return 'file-video-box';
      default:
        return 'file-outline';
    }
  };

  // Add this function to fetch materials from the database
  const fetchMaterials = async () => {
    try {
      const { data, error } = await supabase
        .from('materials')
        .select('*')
        .order('name');
      
      if (error) throw error;
      setMaterials(data || []);
    } catch (error) {
      console.error('Error fetching materials:', error);
    }
  };

  const fetchJobCosts = async () => {
    try {
      console.log('Fetching job costs for job:', id); // Debug log
      const { data, error } = await supabase
        .from('job_costs')
        .select('*')
        .eq('job_id', id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      console.log('Fetched job costs:', data); // Debug log
      setJobCosts(data || []);

      // Calculate totals
      const laborCosts = data?.filter(cost => cost.type === 'labor')
        .reduce((sum, cost) => sum + (cost.quantity * cost.price), 0) || 0;
      const materialCosts = data?.filter(cost => cost.type === 'material')
        .reduce((sum, cost) => sum + (cost.quantity * cost.price), 0) || 0;
      const otherCosts = data?.filter(cost => cost.type === 'other')
        .reduce((sum, cost) => sum + (cost.quantity * cost.price), 0) || 0;

      console.log('Calculated totals:', { laborCosts, materialCosts, otherCosts }); // Debug log

      setTotalLaborCost(laborCosts);
      setTotalMaterialCost(materialCosts);
      setTotalOtherCost(otherCosts);
    } catch (error) {
      console.error('Error fetching job costs:', error);
      alert('Error loading job costs');
    }
  };

  const handleAddCostItem = async (type: 'labor' | 'material' | 'other') => {
    try {
      const newItem: JobCostItem = {
        job_id: id,
        description: '',
        quantity: 1,
        price: 0,
        type
      };

      const { data, error } = await supabase
        .from('job_costs')
        .insert([newItem])
        .select()
        .single();

      if (error) throw error;
      setCostItems([...costItems, data]);
    } catch (error) {
      console.error('Error adding cost item:', error);
      showSnackbar('Error adding cost item');
    }
  };

  const handleUpdateCostItem = async (item: JobCostItem) => {
    try {
      const { error } = await supabase
        .from('job_costs')
        .update({
          description: item.description,
          quantity: item.quantity,
          price: item.price
        })
        .eq('uid', item.uid);

      if (error) throw error;
      setCostItems(costItems.map(i => i.uid === item.uid ? item : i));
    } catch (error) {
      console.error('Error updating cost item:', error);
      showSnackbar('Error updating cost item');
    }
  };

  const handleDeleteCostItem = async (uid: string) => {
    try {
      const { error } = await supabase
        .from('job_costs')
        .delete()
        .eq('uid', uid);

      if (error) throw error;
      
      setJobCosts(jobCosts.filter(item => item.uid !== uid));
      setSnackbarMessage('Cost item deleted');
      setSnackbarVisible(true);
    } catch (error) {
      console.error('Error deleting cost item:', error);
      setSnackbarMessage('Error deleting cost item');
      setSnackbarVisible(true);
    }
  };

  const calculateAmount = (quantity: number, price: number) => {
    return quantity * price;
  };

  const handleUpdateJob = async (updatedJobData) => {
    try {
      setSubmitting(true);
      
      const { error } = await supabase
        .from('jobs')
        .update(updatedJobData)
        .eq('uid', id);
        
      if (error) throw error;
      
      // Refresh job data
      fetchJobDetails();
      setShowEditForm(false);
      setSnackbarMessage('Job updated successfully');
      setSnackbarVisible(true);
    } catch (error) {
      console.error('Error updating job:', error);
      setSnackbarMessage('Error updating job');
      setSnackbarVisible(true);
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (newStatus) => {
    try {
      const { error } = await supabase
        .from('jobs')
        .update({ status: newStatus })
        .eq('uid', id);
        
      if (error) throw error;
      
      // Update local state
      setJob({ ...job, status: newStatus });
      setShowStatusDropdown(false);
      setSnackbarMessage('Job status updated');
      setSnackbarVisible(true);
    } catch (error) {
      console.error('Error updating job status:', error);
      setSnackbarMessage('Error updating status');
      setSnackbarVisible(true);
    }
  };

  const renderStatusDropdown = () => {
    if (!showStatusDropdown) return null;
    
    const statuses = ['pending', 'in_progress', 'completed', 'cancelled'];
    
    return (
      <View style={{
        position: 'absolute',
        top: 40,
        left: 0,
        width: 200,
        backgroundColor: '#ffffff',
        borderWidth: 1,
        borderColor: '#e0e0e0',
        borderRadius: 4,
        zIndex: 9999,
        elevation: 9,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
      }}>
        {statuses.map((status) => (
          <Pressable
            key={status}
            style={({ hovered }) => ({
              padding: 12,
              backgroundColor: hovered ? '#f5f5f5' : '#ffffff',
              borderBottomWidth: 1,
              borderBottomColor: '#f0f0f0',
            })}
            onPress={() => {
              handleStatusChange(status);
              setShowStatusDropdown(false);
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ 
                width: 16, 
                height: 16, 
                borderRadius: 8, 
                backgroundColor: getStatusColor(status),
                marginRight: 8 
              }} />
              <Text style={{ textTransform: 'capitalize' }}>
                {status.replace('_', ' ')}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>
    );
  };

  const WebStatusDropdown = () => {
    if (!showStatusDropdown) return null;
    
    const statuses = ['pending', 'in_progress', 'completed', 'cancelled'];
    
    return (
      <div style={{
        position: 'absolute',
        top: '40px',
        left: 0,
        width: '200px',
        backgroundColor: '#ffffff',
        border: '1px solid #e0e0e0',
        borderRadius: '4px',
        zIndex: 9999,
        boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
        overflow: 'hidden'
      }}>
        {statuses.map((status) => (
          <div
            key={status}
            onClick={() => {
              handleStatusChange(status);
              setShowStatusDropdown(false);
            }}
            style={{
              width: '100%',
              backgroundColor: '#ffffff',
              borderBottom: '1px solid #f0f0f0',
              padding: '12px',
              cursor: 'pointer'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#ffffff'}
          >
            <div style={{ 
              display: 'flex', 
              flexDirection: 'row', 
              alignItems: 'center',
              width: '100%'
            }}>
              <div style={{ 
                width: '16px', 
                height: '16px', 
                borderRadius: '8px', 
                backgroundColor: getStatusColor(status),
                marginRight: '8px' 
              }} />
              <span style={{ textTransform: 'capitalize' }}>
                {status.replace('_', ' ')}
              </span>
            </div>
          </div>
        ))}
      </div>
    );
  };

  // Replace the problematic useEffect with this approach using React's useEffect for cleanup
  useEffect(() => {
    // Function to handle before unload event (for web)
    const handleBeforeUnload = (e) => {
      if (editMode && hasUnsavedChanges) {
        // Standard way to show a confirmation dialog when leaving a page
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };

    // Add event listener for web
    if (Platform.OS === 'web') {
      window.addEventListener('beforeunload', handleBeforeUnload);
    }

    // Cleanup function
    return () => {
      if (Platform.OS === 'web') {
        window.removeEventListener('beforeunload', handleBeforeUnload);
      }
    };
  }, [editMode, hasUnsavedChanges]);

  // Add a function to handle navigation item clicks
  const handleNavigationItemClick = (tab) => {
    if (editMode && hasUnsavedChanges) {
      // Show confirmation dialog
      setShowExitConfirmation(true);
      // Store the tab they were trying to navigate to
      setPendingNavigation(tab);
    } else {
      // If not in edit mode or no unsaved changes, just switch tabs
      setSelectedTab(tab);
    }
  };

  // Add a function to handle job form changes
  const handleJobFormChange = () => {
    setHasUnsavedChanges(true);
  };

  // Add a function to handle form submission
  const handleUpdateJobWithConfirmation = async (updatedJobData) => {
    await handleUpdateJob(updatedJobData);
    setHasUnsavedChanges(false);
    setEditMode(false);
  };

  // Add a function to handle cancellation
  const handleCancelEdit = () => {
    if (hasUnsavedChanges) {
      setShowExitConfirmation(true);
    } else {
      setEditMode(false);
    }
  };

  // Add a function to handle confirmed navigation
  const handleConfirmExit = () => {
    setHasUnsavedChanges(false);
    setShowExitConfirmation(false);
    setEditMode(false);
    
    // If there was a pending navigation, execute it
    if (pendingNavigation) {
      handleNavigationItemClick(pendingNavigation);
      setPendingNavigation(null);
    }
  };

  // Add this function near the other utility functions
  const getInvoiceStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'paid':
        return '#e8f5e9'; // Light green
      case 'sent':
        return '#fff3e0'; // Light orange
      case 'overdue':
        return '#ffebee'; // Light red
      case 'draft':
      default:
        return '#f5f5f5'; // Light gray
    }
  };

  const fetchInvoiceDetails = async (invoiceId) => {
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('*, invoice_items(*), client:clients(*)')
        .eq('id', invoiceId)
        .single();
      
      if (error) throw error;
      
      setSelectedInvoice(data);
    } catch (error) {
      console.error('Error fetching invoice details:', error);
      setSnackbarMessage('Error loading invoice details');
      setSnackbarVisible(true);
    }
  };

  // Add function to save invoice changes
  const handleSaveInvoice = async (updatedInvoice) => {
    try {
      // Update the invoice
      const { error: invoiceError } = await supabase
        .from('invoices')
        .update({
          invoice_number: updatedInvoice.invoice_number,
          date: updatedInvoice.date,
          status: updatedInvoice.status,
          amount: updatedInvoice.amount
        })
        .eq('id', updatedInvoice.id);
      
      if (invoiceError) throw invoiceError;
      
      // Handle invoice items
      if (updatedInvoice.invoice_items) {
        for (const item of updatedInvoice.invoice_items) {
          if (item.id) {
            // Update existing item
            await supabase
              .from('invoice_items')
              .update({
                description: item.description,
                quantity: item.quantity,
                price: item.price
              })
              .eq('id', item.id);
          } else {
            // Insert new item
            await supabase
              .from('invoice_items')
              .insert({
                invoice_id: updatedInvoice.id,
                description: item.description,
                quantity: item.quantity,
                price: item.price
              });
          }
        }
      }
      
      // Refresh the invoices list
      fetchInvoices();
      
      // Close the modal
      setViewingInvoiceId(null);
      setSelectedInvoice(null);
      setEditingInvoice(false);
      
      // Show success message
      setSnackbarMessage('Invoice updated successfully');
      setSnackbarVisible(true);
      
    } catch (error) {
      console.error('Error updating invoice:', error);
      setSnackbarMessage('Error updating invoice');
      setSnackbarVisible(true);
    }
  };

  // Add these handler functions for invoice actions

  const handleViewInvoice = (invoice) => {
    // Navigate to the invoice details page
    router.push(`/invoices?view=${invoice.uid}`);
  };

  const handleEditInvoice = (invoice) => {
    // Navigate to edit the invoice
    localStorage.setItem('editInvoiceData', JSON.stringify(invoice));
    router.push('/invoices');
  };

  const handleDeleteInvoice = (invoice) => {
    // Show a confirmation dialog before deleting
    if (confirm(`Are you sure you want to delete invoice #${invoice.invoice_number}?`)) {
      // Navigate to invoices page with delete parameter
      router.push(`/invoices?delete=${invoice.uid}`);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text>Loading job details...</Text>
      </View>
    );
  }

  if (!job) {
    return (
      <View style={styles.container}>
        <Text>Job not found</Text>
        <Button 
          mode="contained-tonal"
          icon="arrow-left"
          onPress={() => router.push('/jobs')}
          style={styles.backButton}
        >
          Back to Jobs
        </Button>
      </View>
    );
  }

  const renderContent = () => {
    // If in edit mode, show the JobForm instead of the regular content
    if (editMode) {
      return (
        <View style={styles.editFormContainer}>
          <JobForm 
            job={job}
            onSubmit={handleUpdateJobWithConfirmation}
            onCancel={handleCancelEdit}
            submitting={submitting}
            onChange={handleJobFormChange}
          />
        </View>
      );
    }

    // Otherwise, show the regular content based on selected tab
    switch (selectedTab) {
      case 'info':
        return renderInfoTab();
      case 'invoices':
        return renderInvoicesTab();
      case 'costs':
        return renderCostsTab();
      case 'calendar':
        return renderCalendarTab();
      case 'attachments':
        return renderAttachmentsTab();
      case 'logs':
        return renderLogsTab();
      default:
        return renderInfoTab();
    }
  };

  const renderInfoTab = () => (
    <View>
      <View style={styles.infoContainer}>
        <View style={styles.infoHeader}>
          <Text variant="titleLarge">Job Information</Text>
          <Button
            mode="contained"
            icon="pencil"
            onPress={() => setEditMode(true)}
            style={styles.editButton}
          >
            Edit Job
          </Button>
        </View>
        
        {/* Table with field names as column headers */}
        <View style={styles.table}>
          {/* Header row with field names */}
          <View style={[styles.tableRow, { backgroundColor: '#f5f5f5' }]}>
            <View style={[styles.tableHeaderCell, { width: '20%' }]}>
              <Text style={styles.tableHeaderText}>Job Title</Text>
            </View>
            <View style={[styles.tableHeaderCell, { width: '20%' }]}>
              <Text style={styles.tableHeaderText}>Client</Text>
            </View>
            <View style={[styles.tableHeaderCell, { width: '20%' }]}>
              <Text style={styles.tableHeaderText}>Status</Text>
            </View>
            <View style={[styles.tableHeaderCell, { width: '20%' }]}>
              <Text style={styles.tableHeaderText}>Start Date</Text>
            </View>
            <View style={[styles.tableHeaderCell, { width: '20%', borderRightWidth: 0 }]}>
              <Text style={styles.tableHeaderText}>End Date</Text>
            </View>
          </View>
          
          {/* Data row with values */}
          <View style={styles.tableRow}>
            <View style={[styles.tableCell, { width: '20%' }]}>
              <Text>{job?.title || 'N/A'}</Text>
            </View>
            <View style={[styles.tableCell, { width: '20%' }]}>
              <Text>{job?.client?.name || 'N/A'}</Text>
            </View>
            <View style={[styles.tableCell, { width: '20%' }]}>
              <Pressable onPress={() => setShowStatusDropdown(true)}>
                <Chip style={{ backgroundColor: getStatusColor(job?.status) }}>
                  {job?.status?.replace('_', ' ') || 'Not specified'}
                </Chip>
              </Pressable>
            </View>
            <View style={[styles.tableCell, { width: '20%' }]}>
              <Text>{job?.start_date ? formatDate(job.start_date) : 'N/A'}</Text>
            </View>
            <View style={[styles.tableCell, { width: '20%', borderRightWidth: 0 }]}>
              <Text>{job?.end_date ? formatDate(job.end_date) : 'N/A'}</Text>
            </View>
          </View>
          
          {/* Description row (if available) - as a separate row spanning all columns */}
          {job?.description && (
            <View style={styles.tableRow}>
              <View style={[styles.tableCell, { width: '20%', backgroundColor: '#ffffff' }]}>
                <Text style={styles.tableCellLabel}>Description</Text>
              </View>
              <View style={[styles.tableCell, { width: '80%', borderRightWidth: 0 }]}>
                <Text>{job.description}</Text>
              </View>
            </View>
          )}
        </View>
      </View>
    </View>
  );

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return '#FFF9C4';
      case 'in_progress': return '#BBDEFB';
      case 'completed': return '#C8E6C9';
      case 'cancelled': return '#FFCDD2';
      default: return '#F5F5F5';
    }
  };

  const renderInvoicesTab = () => (
    <View>
      <View style={{ 
        backgroundColor: '#ffffff', 
        padding: 0,
        margin: 0,
        borderWidth: 0,
        borderRadius: 0,
        shadowOpacity: 0,
        elevation: 0
      }}>
        <View style={styles.contentHeader}>
          <Text variant="titleLarge">Invoices</Text>
          <Button 
            mode="contained" 
            onPress={() => {
              // Store the job ID to use in the invoice form
              localStorage.setItem('newInvoiceData', JSON.stringify({
                job_id: job.uid,
                client_id: job.client_id || '',
                status: 'estimate'
              }));
              
              // Navigate to the invoices page
              router.push('/invoices');
            }}
            style={{ 
              position: 'absolute',
              top: 10,
              right: 10,
              backgroundColor: '#333333'
            }}
          >
            Create New Invoice
          </Button>
        </View>
        
        {/* Add space between button and table */}
        <View style={{ height: 20 }} />
        
        {/* Invoice table with white background, no borders, and left-aligned content */}
        <View style={{ 
          backgroundColor: '#ffffff',
          borderWidth: 0,
          overflow: 'hidden',
        }}>
          <DataTable>
            <DataTable.Header>
              <DataTable.Title>Invoice #</DataTable.Title>
              <DataTable.Title>Client</DataTable.Title>
              <DataTable.Title>Start Date</DataTable.Title>
              <DataTable.Title>End Date</DataTable.Title>
              <DataTable.Title>Total</DataTable.Title>
              <DataTable.Title>Status</DataTable.Title>
              <DataTable.Title>Actions</DataTable.Title>
            </DataTable.Header>
            
            {invoices.length === 0 ? (
              <DataTable.Row>
                <DataTable.Cell>No invoices found</DataTable.Cell>
              </DataTable.Row>
            ) : (
              invoices.map(invoice => (
                <DataTable.Row key={invoice.uid}>
                  <DataTable.Cell>{invoice.invoice_number}</DataTable.Cell>
                  <DataTable.Cell>{invoice.client_name || 'Unknown Client'}</DataTable.Cell>
                  <DataTable.Cell>{formatDate(invoice.issue_date)}</DataTable.Cell>
                  <DataTable.Cell>{formatDate(invoice.due_date)}</DataTable.Cell>
                  <DataTable.Cell>${invoice.total.toFixed(2)}</DataTable.Cell>
                  <DataTable.Cell>{invoice.status}</DataTable.Cell>
                  <DataTable.Cell>
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
                        onPress={() => handleDeleteInvoice(invoice)} 
                      />
                    </View>
                  </DataTable.Cell>
                </DataTable.Row>
              ))
            )}
          </DataTable>
        </View>
      </View>
      {viewingInvoiceId && (
        <Portal>
          <Modal
            visible={viewingInvoiceId !== null}
            onDismiss={() => {
              setViewingInvoiceId(null);
              setSelectedInvoice(null);
              setEditingInvoice(false);
            }}
            contentContainerStyle={{ 
              backgroundColor: 'white', 
              padding: 20, 
              margin: 20,
              maxWidth: 1000,
              alignSelf: 'center',
              width: '90%',
              borderRadius: 8
            }}
          >
            {selectedInvoice ? (
              <InvoiceDetails 
                invoice={selectedInvoice}
                isEditing={editingInvoice}
                onSave={(updatedInvoice) => {
                  handleSaveInvoice(updatedInvoice);
                  setEditingInvoice(false);
                }}
                onCancel={() => setEditingInvoice(false)}
                onClose={() => {
                  setViewingInvoiceId(null);
                  setSelectedInvoice(null);
                  setEditingInvoice(false);
                }}
              />
            ) : (
              <ActivityIndicator />
            )}
          </Modal>
        </Portal>
      )}
    </View>
  );

  const renderCostsTab = () => (
    <View>
      <View style={styles.tabHeader}>
        <Text variant="titleLarge">Job Costs</Text>
        <Button 
          mode="contained" 
          onPress={() => setShowAddCostDialog(true)}
          icon="plus"
        >
          Add Cost
        </Button>
      </View>
      
      <Card style={styles.summaryCard}>
        <Card.Content>
          <View style={styles.summaryRow}>
            <Text variant="titleMedium">Total Labor:</Text>
            <Text variant="titleMedium">
              {formatCurrency(totalLaborCost)}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text variant="titleMedium">Total Materials:</Text>
            <Text variant="titleMedium">
              {formatCurrency(totalMaterialCost)}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text variant="titleMedium">Total Other:</Text>
            <Text variant="titleMedium">
              {formatCurrency(totalOtherCost)}
            </Text>
          </View>
          <Divider style={styles.divider} />
          <View style={styles.summaryRow}>
            <Text variant="titleLarge">Total Job Cost:</Text>
            <Text variant="titleLarge">
              {formatCurrency(totalLaborCost + totalMaterialCost + totalOtherCost)}
            </Text>
          </View>
        </Card.Content>
      </Card>
      
      {jobCosts.length === 0 ? (
        <Card>
          <Card.Content>
            <Text>No costs recorded for this job</Text>
          </Card.Content>
        </Card>
      ) : (
        <Card>
          <Card.Content>
            <DataTable>
              <DataTable.Header>
                <DataTable.Title>Type</DataTable.Title>
                <DataTable.Title>Description</DataTable.Title>
                <DataTable.Title>Quantity</DataTable.Title>
                <DataTable.Title>Price</DataTable.Title>
                <DataTable.Title>Amount</DataTable.Title>
                <DataTable.Title>Date</DataTable.Title>
                <DataTable.Title>Actions</DataTable.Title>
              </DataTable.Header>
              
              {jobCosts.map(cost => (
                <DataTable.Row key={cost.uid}>
                  <DataTable.Cell>
                    <Chip>{cost.type}</Chip>
                  </DataTable.Cell>
                  <DataTable.Cell>{cost.description}</DataTable.Cell>
                  <DataTable.Cell>{cost.quantity}</DataTable.Cell>
                  <DataTable.Cell>{formatCurrency(cost.price)}</DataTable.Cell>
                  <DataTable.Cell>{formatCurrency(cost.quantity * cost.price)}</DataTable.Cell>
                  <DataTable.Cell>{formatDate(cost.created_at)}</DataTable.Cell>
                  <DataTable.Cell>
                    <Button 
                      icon="delete"
                      mode="text" 
                      textColor="red"
                      onPress={() => handleDeleteCostItem(cost.uid)}
                    >
                      Delete
                    </Button>
                  </DataTable.Cell>
                </DataTable.Row>
              ))}

              <DataTable.Row style={styles.totalRow}>
                <DataTable.Cell>Total Labor:</DataTable.Cell>
                <DataTable.Cell> </DataTable.Cell>
                <DataTable.Cell> </DataTable.Cell>
                <DataTable.Cell> </DataTable.Cell>
                <DataTable.Cell>{formatCurrency(totalLaborCost)}</DataTable.Cell>
                <DataTable.Cell> </DataTable.Cell>
                <DataTable.Cell> </DataTable.Cell>
              </DataTable.Row>
              <DataTable.Row style={styles.totalRow}>
                <DataTable.Cell>Total Materials:</DataTable.Cell>
                <DataTable.Cell> </DataTable.Cell>
                <DataTable.Cell> </DataTable.Cell>
                <DataTable.Cell> </DataTable.Cell>
                <DataTable.Cell>{formatCurrency(totalMaterialCost)}</DataTable.Cell>
                <DataTable.Cell> </DataTable.Cell>
                <DataTable.Cell> </DataTable.Cell>
              </DataTable.Row>
              <DataTable.Row style={styles.grandTotalRow}>
                <DataTable.Cell>Total Job Cost:</DataTable.Cell>
                <DataTable.Cell> </DataTable.Cell>
                <DataTable.Cell> </DataTable.Cell>
                <DataTable.Cell> </DataTable.Cell>
                <DataTable.Cell>{formatCurrency(totalLaborCost + totalMaterialCost)}</DataTable.Cell>
                <DataTable.Cell> </DataTable.Cell>
                <DataTable.Cell> </DataTable.Cell>
              </DataTable.Row>
            </DataTable>
          </Card.Content>
        </Card>
      )}
    </View>
  );

  const renderCalendarTab = () => (
    <View>
      <View style={styles.tabHeader}>
        <Text variant="titleLarge">Schedule</Text>
        <Button 
          mode="contained" 
          onPress={() => setShowAddEventDialog(true)}
          icon="plus"
        >
          New Event
        </Button>
      </View>
      
      <Card style={styles.calendarCard}>
        <Card.Content>
          <View style={styles.calendarHeader}>
            <View style={styles.monthSelector}>
              <Button 
                icon="chevron-left" 
                onPress={() => {
                  const prevMonth = new Date(currentMonth);
                  prevMonth.setMonth(prevMonth.getMonth() - 1);
                  setCurrentMonth(prevMonth);
                }}
                compact
              />
              <Text variant="titleMedium">
                {currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
              </Text>
              <Button 
                icon="chevron-right" 
                onPress={() => {
                  const nextMonth = new Date(currentMonth);
                  nextMonth.setMonth(nextMonth.getMonth() + 1);
                  setCurrentMonth(nextMonth);
                }}
                compact
              />
            </View>
            <SegmentedButtons
              value={calendarView}
              onValueChange={setCalendarView}
              buttons={[
                { value: 'month', label: 'Month' },
                { value: 'agenda', label: 'List' }
              ]}
              style={styles.viewToggle}
            />
          </View>
          
          {calendarView === 'month' ? (
            <SimpleCalendar
              currentMonth={currentMonth}
              onDateSelect={setSelectedDate}
              markedDates={markedDates}
              selectedDate={selectedDate}
            />
          ) : (
            <View style={styles.agendaView}>
              {events === null ? (
                <Text style={styles.emptyMessage}>Events feature is not yet available</Text>
              ) : events.length === 0 ? (
                <Text style={styles.emptyMessage}>No events scheduled</Text>
              ) : (
                events
                  .sort((a, b) => new Date(a.date) - new Date(b.date))
                  .map(event => (
                    <Card key={event.id} style={styles.eventCard}>
                      <Card.Content>
                        <Text variant="titleMedium">{event.title}</Text>
                        <Text>{formatDate(event.date)}</Text>
                        {event.notes && <Text style={styles.eventNotes}>{event.notes}</Text>}
                      </Card.Content>
                      <Card.Actions>
                        <Button 
                          icon="pencil" 
                          onPress={() => handleEditEvent(event)}
                          compact
                        >
                          Edit
                        </Button>
                        <Button 
                          icon="delete" 
                          onPress={() => handleDeleteEvent(event.id)}
                          textColor="red"
                          compact
                        >
                          Delete
                        </Button>
                      </Card.Actions>
                    </Card>
                  ))
              )}
            </View>
          )}
        </Card.Content>
      </Card>
      
      {calendarView === 'month' && (
        <Card style={styles.eventsForDayCard}>
          <Card.Title title={`Events for ${formatDate(selectedDate)}`} />
          <Card.Content>
            {events === null ? (
              <Text style={styles.emptyMessage}>Events feature is not yet available</Text>
            ) : events.filter(event => event.date === selectedDate).length === 0 ? (
              <Text style={styles.emptyMessage}>No events for this day</Text>
            ) : (
              events
                .filter(event => event.date === selectedDate)
                .map(event => (
                  <Card key={event.id} style={styles.eventCard}>
                    <Card.Content>
                      <Text variant="titleMedium">{event.title}</Text>
                      {event.notes && <Text style={styles.eventNotes}>{event.notes}</Text>}
                    </Card.Content>
                    <Card.Actions>
                      <Button 
                        icon="pencil" 
                        onPress={() => handleEditEvent(event)}
                        compact
                      >
                        Edit
                      </Button>
                      <Button 
                        icon="delete" 
                        onPress={() => handleDeleteEvent(event.id)}
                        textColor="red"
                        compact
                      >
                        Delete
                      </Button>
                    </Card.Actions>
                  </Card>
                ))
            )}
          </Card.Content>
        </Card>
      )}
    </View>
  );

  const renderAttachmentsTab = () => (
    <View>
      <View style={styles.tabHeader}>
        <Text variant="titleLarge">Attachments</Text>
        <Button 
          mode="contained" 
          onPress={handleFileUpload}
          icon="upload"
          loading={uploading}
          disabled={uploading}
        >
          Upload File
        </Button>
      </View>
      
      {uploading && (
        <Card style={styles.uploadingCard}>
          <Card.Content>
            <Text>Uploading file...</Text>
            <ActivityIndicator style={styles.progressBar} />
          </Card.Content>
        </Card>
      )}
      
      {localAttachments.length === 0 ? (
        <Text style={styles.emptyMessage}>No attachments for this job</Text>
      ) : (
        <View>
          {localAttachments.map(attachment => (
            <Card key={attachment.id} style={styles.attachmentCard}>
              <Card.Content>
                <View style={styles.attachmentRow}>
                  <View style={styles.attachmentIcon}>
                    <MaterialCommunityIcons 
                      name={getFileIcon(attachment.name)} 
                      size={24} 
                      color="#666"
                    />
                  </View>
                  <View style={styles.attachmentInfo}>
                    <Text variant="titleMedium">{attachment.name}</Text>
                    <Text variant="bodySmall">
                      Type: {attachment.type || 'Unknown'} • 
                      Size: {formatFileSize(attachment.size || 0)}
                    </Text>
                    <Text variant="bodySmall">
                      Uploaded: {formatDate(attachment.created_at)}
                    </Text>
                  </View>
                  <View style={styles.attachmentActions}>
                    <Button 
                      mode="outlined"
                      icon="eye"
                      onPress={() => {
                        if (Platform.OS === 'web') {
                          window.open(attachment.url, '_blank');
                        }
                      }}
                    >
                      View
                    </Button>
                    <Button 
                      mode="outlined"
                      icon="delete"
                      textColor="red"
                      onPress={() => handleDeleteLocalAttachment(attachment.id)}
                    >
                      Delete
                    </Button>
                  </View>
                </View>
              </Card.Content>
            </Card>
          ))}
        </View>
      )}
    </View>
  );

  const renderLogsTab = () => (
    <View>
      <View style={styles.tabHeader}>
        <Text variant="titleLarge">Logs</Text>
        <Button 
          mode="contained" 
          onPress={() => setShowAddLogDialog(true)}
          icon="plus"
        >
          Add Log
        </Button>
      </View>
      
      {logs === null ? (
        <Text style={styles.emptyMessage}>Logs feature is not yet available</Text>
      ) : logs.length === 0 ? (
        <Text style={styles.emptyMessage}>No logs recorded</Text>
      ) : (
        <View>
          {logs.map(log => (
            <Card key={log.id} style={styles.logCard}>
              <Card.Content>
                <Text variant="bodyMedium">{log.content}</Text>
                <View style={styles.logMeta}>
                  <Text variant="bodySmall">
                    {new Date(log.created_at).toLocaleString()}
                  </Text>
                  <Text variant="bodySmall">By: {log.created_by}</Text>
                </View>
              </Card.Content>
            </Card>
          ))}
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.navigationPane}>
        <View style={styles.navigationSection}>
          <Text style={styles.sectionTitle}>JOB DETAILS</Text>
          <TouchableOpacity
            style={[
              styles.navigationItem,
              selectedTab === 'info' && styles.selectedItem
            ]}
            onPress={() => handleNavigationItemClick('info')}
            disabled={editMode && hasUnsavedChanges}
          >
            <MaterialIcons name="dashboard" size={24} color="#666666" />
            <Text style={[
              styles.navigationText,
              selectedTab === 'info' && styles.selectedText,
              (editMode && hasUnsavedChanges) ? { color: '#cccccc' } : {}
            ]}>Info</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.navigationItem,
              selectedTab === 'invoices' && styles.selectedItem
            ]}
            onPress={() => handleNavigationItemClick('invoices')}
            disabled={editMode && hasUnsavedChanges}
          >
            <MaterialCommunityIcons
              name="file-document-outline"
              size={24}
              color={selectedTab === 'invoices' ? '#000000' : '#666666'}
            />
            <Text style={[
              styles.navigationText,
              selectedTab === 'invoices' && styles.selectedText,
              (editMode && hasUnsavedChanges) ? { color: '#cccccc' } : {}
            ]}>Invoices</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.navigationItem,
              selectedTab === 'costs' && styles.selectedItem
            ]}
            onPress={() => handleNavigationItemClick('costs')}
            disabled={editMode && hasUnsavedChanges}
          >
            <MaterialCommunityIcons
              name="currency-usd"
              size={24}
              color={selectedTab === 'costs' ? '#000000' : '#666666'}
            />
            <Text style={[
              styles.navigationText,
              selectedTab === 'costs' && styles.selectedText,
              (editMode && hasUnsavedChanges) ? { color: '#cccccc' } : {}
            ]}>Costs</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.navigationItem,
              selectedTab === 'calendar' && styles.selectedItem
            ]}
            onPress={() => handleNavigationItemClick('calendar')}
            disabled={editMode && hasUnsavedChanges}
          >
            <MaterialCommunityIcons
              name="calendar"
              size={24}
              color={selectedTab === 'calendar' ? '#000000' : '#666666'}
            />
            <Text style={[
              styles.navigationText,
              selectedTab === 'calendar' && styles.selectedText,
              (editMode && hasUnsavedChanges) ? { color: '#cccccc' } : {}
            ]}>Calendar</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.navigationSection}>
          <Text style={styles.sectionTitle}>DOCUMENTATION</Text>
          <TouchableOpacity
            style={[
              styles.navigationItem,
              selectedTab === 'attachments' && styles.selectedItem
            ]}
            onPress={() => handleNavigationItemClick('attachments')}
            disabled={editMode && hasUnsavedChanges}
          >
            <MaterialCommunityIcons
              name="attachment"
              size={24}
              color={selectedTab === 'attachments' ? '#000000' : '#666666'}
            />
            <Text style={[
              styles.navigationText,
              selectedTab === 'attachments' && styles.selectedText,
              (editMode && hasUnsavedChanges) ? { color: '#cccccc' } : {}
            ]}>Attachments</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.navigationItem,
              selectedTab === 'logs' && styles.selectedItem
            ]}
            onPress={() => handleNavigationItemClick('logs')}
            disabled={editMode && hasUnsavedChanges}
          >
            <MaterialCommunityIcons
              name="text-box-outline"
              size={24}
              color={selectedTab === 'logs' ? '#000000' : '#666666'}
            />
            <Text style={[
              styles.navigationText,
              selectedTab === 'logs' && styles.selectedText,
              (editMode && hasUnsavedChanges) ? { color: '#cccccc' } : {}
            ]}>Logs</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.contentPane}>
        <View style={styles.contentHeader}>
          <View style={{ flex: 1 }}>
            <Text variant="headlineMedium">Job Details</Text>
          </View>
          <View style={styles.headerButtons}>
            <Button
              mode="outlined" 
              onPress={() => handleNavigationItemClick('/jobs')}
              style={{ marginRight: 8 }}
            >
              Back to Jobs
            </Button>
          </View>
        </View>
        
        {renderContent()}
      </View>

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={3000}
      >
        {snackbarMessage}
      </Snackbar>

      <Portal>
        <Modal
          visible={showStatusDropdown}
          onDismiss={() => setShowStatusDropdown(false)}
          contentContainerStyle={{
            backgroundColor: 'white',
            padding: 0,
            margin: 20,
            maxWidth: 300,
            alignSelf: 'center',
            borderRadius: 4
          }}
        >
          <View>
            {['pending', 'in_progress', 'completed', 'cancelled'].map((status) => (
              <Pressable
                key={status}
                style={({ hovered }) => ({
                  padding: 16,
                  backgroundColor: hovered ? '#f5f5f5' : '#ffffff',
                  borderBottomWidth: 1,
                  borderBottomColor: '#f0f0f0',
                })}
                onPress={() => {
                  handleStatusChange(status);
                  setShowStatusDropdown(false);
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ 
                    width: 16, 
                    height: 16, 
                    borderRadius: 8, 
                    backgroundColor: getStatusColor(status),
                    marginRight: 8 
                  }} />
                  <Text style={{ textTransform: 'capitalize' }}>
                    {status.replace('_', ' ')}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        </Modal>
      </Portal>

      <Portal>
        <Dialog
          visible={showExitConfirmation}
          onDismiss={() => setShowExitConfirmation(false)}
        >
          <Dialog.Title>Unsaved Changes</Dialog.Title>
          <Dialog.Content>
            <Text>You have unsaved changes. Save changes before leaving?</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => {
              // Discard changes
              setHasUnsavedChanges(false);
              setEditMode(false);
              // Navigate to the pending tab if there is one
              if (pendingNavigation) {
                setSelectedTab(pendingNavigation);
                setPendingNavigation(null);
              }
              setShowExitConfirmation(false);
            }}>Discard</Button>
            
            <Button onPress={() => setShowExitConfirmation(false)}>Cancel</Button>
            
            <Button mode="contained" onPress={() => {
              // Trigger save function
              // This would need to call your form's submit handler
              // After saving, it would navigate to the pending tab
              // For now, just close the dialog
              setShowExitConfirmation(false);
            }}>Save</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    paddingTop: 40,
    backgroundColor: '#ffffff',
  },
  navigationPane: {
    width: 240,
    borderRightWidth: 1,
    borderRightColor: '#e0e0e0',
    height: '100%',
    backgroundColor: '#ffffff',
  },
  contentPane: {
    flex: 1,
    padding: 16,
    backgroundColor: '#ffffff',
  },
  navigationSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666666',
    marginBottom: 12,
    paddingLeft: 16,
  },
  navigationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    paddingLeft: 16,
    marginBottom: 4,
  },
  selectedItem: {
    backgroundColor: '#f5f5f5',
  },
  navigationText: {
    marginLeft: 12,
    fontSize: 14,
    color: '#666666',
  },
  selectedText: {
    color: '#000000',
    fontWeight: '500',
  },
  headerCard: {
    backgroundColor: '#ffffff',
    marginBottom: 16,
    elevation: 0,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusChip: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  tabs: {
    marginBottom: 16,
  },
  tabContent: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  tabHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  tabTitle: {
    marginBottom: 16,
  },
  emptyMessage: {
    textAlign: 'center',
    marginTop: 24,
    marginBottom: 24,
    fontStyle: 'italic',
  },
  rowActions: {
    flexDirection: 'row',
  },
  summaryCard: {
    backgroundColor: '#ffffff',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  divider: {
    marginVertical: 8,
  },
  calendarCard: {
    backgroundColor: '#ffffff',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  monthSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  viewToggle: {
    maxWidth: 200,
  },
  agendaView: {
    marginTop: 16,
  },
  eventsForDayCard: {
    backgroundColor: '#ffffff',
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  eventNotes: {
    marginTop: 8,
    fontStyle: 'italic',
  },
  dialogInput: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    marginBottom: 8,
  },
  radioGroup: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  radioButton: {
    marginRight: 8,
  },
  uploadingCard: {
    marginBottom: 16,
  },
  progressBar: {
    marginTop: 8,
  },
  attachmentCard: {
    backgroundColor: '#ffffff',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  attachmentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  attachmentInfo: {
    flex: 1,
  },
  attachmentActions: {
    flexDirection: 'row',
    gap: 8,
  },
  selectorButton: {
    marginBottom: 16,
  },
  selectedItemInfo: {
    marginBottom: 16,
    fontStyle: 'italic',
  },
  selectorScrollView: {
    maxHeight: 300,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  attachmentIcon: {
    marginRight: 12,
    justifyContent: 'center',
  },
  calendar: {
    marginTop: 8,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  dayHeader: {
    flex: 1,
    textAlign: 'center',
    fontWeight: 'bold',
    padding: 8,
  },
  calendarGrid: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    overflow: 'hidden',
  },
  calendarRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  calendarDay: {
    flex: 1,
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  emptyDay: {
    backgroundColor: '#ffffff',
  },
  dayButton: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    padding: 4,
  },
  dayText: {
    textAlign: 'right',
    fontSize: 14,
  },
  selectedDay: {
    borderColor: '#6200ee',
    borderWidth: 2,
  },
  selectedDayText: {
    fontWeight: 'bold',
    color: '#2196f3',
  },
  todayDay: {
    backgroundColor: '#ffffff',
  },
  todayDayText: {
    fontWeight: 'bold',
  },
  markerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2196f3',
    marginTop: 2,
  },
  jobInfoSection: {
    marginBottom: 16,
  },
  jobInfoRow: {
    flexDirection: 'row',
    marginTop: 8,
  },
  jobInfoLabel: {
    fontWeight: 'bold',
    marginRight: 8,
    width: 100,
  },
  descriptionRow: {
    marginTop: 8,
  },
  todayDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#6200ee',
    position: 'absolute',
    bottom: 4,
  },
  contentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerButton: {
    marginLeft: 8,
  },
  editButton: {
    backgroundColor: '#444444',
  },
  editDialog: {
    width: '80%',
    maxWidth: 800,
    alignSelf: 'center',
  },
  formContainer: {
    padding: 0,
  },
  editFormContainer: {
    width: '100%',
    backgroundColor: '#ffffff',
    padding: 16,
    marginTop: 16,
    height: '100%',
    overflow: 'auto',
  },
  infoContainer: {
    marginBottom: 16,
  },
  infoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  table: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  tableHeaderRow: {
    backgroundColor: '#f5f5f5',
  },
  tableHeaderCell: {
    padding: 12,
    borderRightWidth: 1,
    borderRightColor: '#e0e0e0',
    justifyContent: 'center',
  },
  tableHeaderText: {
    fontWeight: 'bold',
    textAlign: 'left',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  tableCell: {
    padding: 12,
    borderRightWidth: 1,
    borderRightColor: '#e0e0e0',
    justifyContent: 'center',
  },
  tableCellLabel: {
    fontWeight: 'bold',
    textAlign: 'left',
  },
  totalRow: {
    backgroundColor: '#f5f5f5',
  },
  grandTotalRow: {
    backgroundColor: '#e0e0e0',
    fontWeight: 'bold',
  },
  dialog: {
    width: '20%',
    alignSelf: 'center',
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 8,
    elevation: 5,
  },
  dialogTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  dialogContent: {
    marginBottom: 16,
  },
  dialogActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  jobInfoCard: {
    backgroundColor: '#ffffff',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  backButton: {
    marginTop: 8,
  },
  costButtons: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  addButton: {
    flex: 1,
  },
  costCard: {
    marginBottom: 16,
  },
  descriptionInput: {
    flex: 1,
    height: 40,
    backgroundColor: 'transparent',
  },
  numberInput: {
    width: 80,
    height: 40,
    textAlign: 'right',
    backgroundColor: 'transparent',
  },
  dropdownItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    backgroundColor: '#ffffff',
    width: '100%',
    cursor: 'pointer',
  },
  dropdownItemHover: {
    backgroundColor: '#f5f5f5',
  },
  statusDropdown: {
    position: 'absolute',
    top: 40,
    left: 0,
    right: 0,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 4,
    zIndex: 9999,
    elevation: 9,
  },
  statusDropdownItem: {
    width: '100%',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
}); 