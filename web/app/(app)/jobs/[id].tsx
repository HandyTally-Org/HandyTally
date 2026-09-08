import { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, ScrollView, Platform, Pressable, TouchableOpacity, Dimensions, Modal } from 'react-native';
import { Text, Button, Card, SegmentedButtons, FAB, TextInput, Dialog, Portal, Divider, Chip, DataTable, ActivityIndicator, RadioButton, List, IconButton, Menu, Snackbar, Surface } from 'react-native-paper';
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
import { InvoiceForm } from '../../../components/InvoiceForm';

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
  uid: number;  // Changed from string to number to match bigint8 in database
  title: string;
  description?: string;
  status: string;
  client_id: number;  // Changed from string to number to match bigint8 in database
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

// Add this new DateTimePicker component after the SimpleCalendar component
interface DateTimePickerProps {
  visible: boolean;
  onDismiss: () => void;
  onConfirm: (dateTime: string) => void;
  initialDate?: string;
  mode?: 'start' | 'end';
  position?: { top: number; right: number };
}

const DateTimePicker: React.FC<DateTimePickerProps> = ({ 
  visible, 
  onDismiss, 
  onConfirm, 
  initialDate,
  mode = 'start',
  position = { top: 0, right: 0 }
}) => {
  if (!visible) return null;
  
  // Parse the initial date or use current date
  const now = new Date();
  const initialDateTime = initialDate ? new Date(initialDate) : now;
  
  const [year, setYear] = useState(initialDateTime.getFullYear());
  const [month, setMonth] = useState(initialDateTime.getMonth());
  const [selectedDate, setSelectedDate] = useState(initialDateTime.getDate());
  const [selectedHour, setSelectedHour] = useState(initialDateTime.getHours() > 12 ? 
    (initialDateTime.getHours() - 12).toString().padStart(2, '0') : 
    initialDateTime.getHours().toString().padStart(2, '0'));
  const [selectedMinute, setSelectedMinute] = useState(initialDateTime.getMinutes().toString().padStart(2, '0'));
  const [selectedAmPm, setSelectedAmPm] = useState(initialDateTime.getHours() >= 12 ? 'PM' : 'AM');

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const monthName = monthNames[month];
  
  // Navigation functions
  const goToPrevMonth = () => {
    if (month === 0) {
      setMonth(11);
      setYear(year - 1);
    } else {
      setMonth(month - 1);
    }
  };
  
  const goToNextMonth = () => {
    if (month === 11) {
      setMonth(0);
      setYear(year + 1);
    } else {
      setMonth(month + 1);
    }
  };
  
  // Calendar helper functions
  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };
  
  const getDayOfWeek = (year: number, month: number, day: number) => {
    return new Date(year, month, day).getDay();
  };
  
  const generateCalendarDays = () => {
    const daysInMonth = getDaysInMonth(year, month);
    const firstDayOfMonth = getDayOfWeek(year, month, 1);
    
    // Create array for all days in the month
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    
    // Add empty slots for days before the first day of the month
    const emptyStartSlots = Array.from({ length: firstDayOfMonth }, () => null);
    const allDays = [...emptyStartSlots, ...days];
    
    // Create rows (weeks)
    const weeks: (number | null)[][] = [];
    let week: (number | null)[] = [];
    
    allDays.forEach((day, index) => {
      week.push(day);
      
      // When we reach the end of a week or the end of all days
      if ((index + 1) % 7 === 0 || index === allDays.length - 1) {
        // If it's the last week and not complete, add empty slots
        if (week.length < 7) {
          const emptyEndSlots = Array.from({ length: 7 - week.length }, () => null);
          week = [...week, ...emptyEndSlots];
        }
        weeks.push([...week]);
        week = [];
      }
    });
    
    return weeks;
  };
  
  const isToday = (day: number) => {
    const today = new Date();
    return day === today.getDate() && 
           month === today.getMonth() && 
           year === today.getFullYear();
  };
  
  const isSelectedDate = (day: number) => {
    return day === selectedDate;
  };
  
  const handleDateSelect = (day: number) => {
    setSelectedDate(day);
  };
  
  // Time selection helpers
  const generateHourOptions = () => {
    return Array.from({ length: 12 }, (_, i) => `${i === 0 ? 12 : i}`.padStart(2, '0'));
  };
  
  const generateMinuteOptions = () => {
    return Array.from({ length: 60/5 }, (_, i) => `${i * 5}`.padStart(2, '0'));
  };
  
  // Final confirmation function
  const applyDateTime = () => {
    try {
      // Format the date components
      const formattedMonth = String(month + 1).padStart(2, '0');
      const formattedDay = String(selectedDate).padStart(2, '0');
      
      // Convert 12-hour format to 24-hour format
      let hours = parseInt(selectedHour);
      if (selectedAmPm === 'PM' && hours < 12) {
        hours += 12;
      } else if (selectedAmPm === 'AM' && hours === 12) {
        hours = 0;
      }
      
      const formattedHours = String(hours).padStart(2, '0');
      const formattedMinutes = String(selectedMinute).padStart(2, '0');
      
      // Create the ISO date string
      const formattedDateTime = `${year}-${formattedMonth}-${formattedDay}T${formattedHours}:${formattedMinutes}:00`;
      
      console.log('Formatted date time:', formattedDateTime);
      onConfirm(formattedDateTime);
    } catch (error) {
      console.error('Error formatting date:', error);
      // Fallback to current date/time if there's an error
      onConfirm(new Date().toISOString());
    }
  };
  
  // Inline styles for positioning
  const pickerStyle = {
    position: 'absolute' as 'absolute',
    top: position.top,
    right: position.right,
    backgroundColor: 'white',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    zIndex: 9999,
    width: 320
  };
  
  // Render the date picker
  return (
    <View style={pickerStyle}>
      <View style={styles.datePickerContainer}>
        <View style={styles.calendarHeader}>
          <View style={styles.monthYearContainer}>
            <Text style={styles.monthYearText}>{`${monthName} ${year}`}</Text>
          </View>
          <View style={styles.navigationButtons}>
            <IconButton icon="chevron-left" size={24} onPress={goToPrevMonth} />
            <IconButton icon="chevron-right" size={24} onPress={goToNextMonth} />
          </View>
        </View>
        
        <View style={styles.calendarContainer}>
          <View style={styles.weekdayHeader}>
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
              <Text key={index} style={styles.weekdayText}>{day}</Text>
            ))}
          </View>
          
          <View style={styles.daysContainer}>
            {generateCalendarDays().map((week, weekIndex) => (
              <View key={weekIndex} style={styles.weekRow}>
                {week.map((day, dayIndex) => (
                  <TouchableOpacity
                    key={dayIndex}
                    style={[
                      styles.dayCell,
                      day === null ? styles.emptyDay : {},
                      isSelectedDate(day as number) ? styles.selectedDay : {},
                      isToday(day as number) ? styles.todayDay : {}
                    ]}
                    onPress={() => day !== null ? handleDateSelect(day as number) : null}
                    disabled={day === null}
                  >
                    {day !== null && (
                      <Text style={[
                        styles.dayText,
                        isSelectedDate(day as number) ? styles.selectedDayText : {},
                        isToday(day as number) ? styles.todayDayText : {}
                      ]}>
                        {day}
                      </Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </View>
        </View>
        
        {/* These are the time input fields with "HH:MM AM/PM" placeholders */}
        <View style={styles.timePickerContainer}>
          <View style={styles.timePickerColumn}>
            <ScrollView style={styles.timeScrollView} showsVerticalScrollIndicator={true}>
              {generateHourOptions().map((hour) => (
                <TouchableOpacity
                  key={hour}
                  style={[
                    styles.timeOption,
                    selectedHour === hour ? styles.selectedTimeOption : {}
                  ]}
                  onPress={() => setSelectedHour(hour)}
                >
                  <Text style={[
                    styles.timeOptionText,
                    selectedHour === hour ? styles.selectedTimeOptionText : {}
                  ]}>
                    {hour}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
          
          <View style={styles.timePickerColumn}>
            <ScrollView style={styles.timeScrollView} showsVerticalScrollIndicator={true}>
              {generateMinuteOptions().map((minute) => (
                <TouchableOpacity
                  key={minute}
                  style={[
                    styles.timeOption,
                    selectedMinute === minute ? styles.selectedTimeOption : {}
                  ]}
                  onPress={() => setSelectedMinute(minute)}
                >
                  <Text style={[
                    styles.timeOptionText,
                    selectedMinute === minute ? styles.selectedTimeOptionText : {}
                  ]}>
                    {minute}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
          
          <View style={styles.timePickerColumn}>
            <TouchableOpacity
              style={[
                styles.timeOption,
                selectedAmPm === 'AM' ? styles.selectedTimeOption : {}
              ]}
              onPress={() => setSelectedAmPm('AM')}
            >
              <Text style={[
                styles.timeOptionText,
                selectedAmPm === 'AM' ? { color: '#2196F3' } : {}
              ]}>
                AM
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.timeOption,
                selectedAmPm === 'PM' ? styles.selectedTimeOption : {}
              ]}
              onPress={() => setSelectedAmPm('PM')}
            >
              <Text style={[
                styles.timeOptionText,
                selectedAmPm === 'PM' ? { color: '#2196F3' } : {}
              ]}>
                PM
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        
        <View style={styles.dateTimePickerActions}>
          <Button onPress={onDismiss}>Cancel</Button>
          <Button onPress={applyDateTime}>OK</Button>
        </View>
      </View>
    </View>
  );
};

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
  const [newCost, setNewCost] = useState({ 
    description: '', 
    quantity: '1', 
    price: '0', 
    type: 'labor' 
  });
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
  const [editingInvoiceId, setEditingInvoiceId] = useState(null);
  const [editingInvoiceData, setEditingInvoiceData] = useState(null);
  const [showInvoiceEditModal, setShowInvoiceEditModal] = useState(false);
  const [clients, setClients] = useState([]);
  const [allJobs, setAllJobs] = useState([]);
  // Add a state variable to track if we're in invoice edit mode
  const [isInvoiceEditMode, setIsInvoiceEditMode] = useState(false);
  const [servicesMenuVisible, setServicesMenuVisible] = useState(false);
  const [materialsMenuVisible, setMaterialsMenuVisible] = useState(false);
  // Add these new state variables at the top of your component
  const [selectedServices, setSelectedServices] = useState([]);
  const [selectedMaterials, setSelectedMaterials] = useState([]);
  const [customItems, setCustomItems] = useState([]);
  const [customItemInput, setCustomItemInput] = useState({ description: '', price: '0' });
  // Add these refs near your state variables
  const addServiceButtonRef = useRef(null);
  const addMaterialButtonRef = useRef(null);
  // First, add these state variables to track menu positions
  const [serviceMenuPosition, setServiceMenuPosition] = useState({ x: 0, y: 0 });
  const [materialMenuPosition, setMaterialMenuPosition] = useState({ x: 0, y: 0 });
  // Add this state variable to control the visibility of the costs input section
  const [showCostsInputSection, setShowCostsInputSection] = useState(false);
  // Add these state variables at the top of your component
  const [editingCostId, setEditingCostId] = useState<string | null>(null);
  const [isEditingCost, setIsEditingCost] = useState(false);
  // First, update your state variables
  const [showServiceDialog, setShowServiceDialog] = useState(false);
  const [showMaterialDialog, setShowMaterialDialog] = useState(false);
  // Add these state variables in the JobDetailsScreen component
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  // Add these state variables to track the position of the date picker
  const [startDatePickerPosition, setStartDatePickerPosition] = useState({ top: 220, right: 20 });
  const [endDatePickerPosition, setEndDatePickerPosition] = useState({ top: 300, right: 20 });
  const [hasChanges, setHasChanges] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [startDatePickerVisible, setStartDatePickerVisible] = useState(false);
  const [endDatePickerVisible, setEndDatePickerVisible] = useState(false);

  useEffect(() => {
    if (id) {
      fetchJobDetails();
      fetchServices();
      fetchMaterials();
      fetchInvoices();
      fetchClientsAndJobs();
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
      // Validate inputs
      if (!newCost.description.trim()) {
        alert('Please enter a description');
        return;
      }
      
      if (isNaN(parseFloat(newCost.price)) || parseFloat(newCost.price) < 0) {
        alert('Please enter a valid price');
        return;
      }
      
      if (isNaN(parseFloat(newCost.quantity)) || parseFloat(newCost.quantity) <= 0) {
        alert('Please enter a valid quantity');
        return;
      }
      
      const amount = parseFloat(newCost.price) * parseFloat(newCost.quantity);
      
      // Insert the new cost
      const { data, error } = await supabase
        .from('job_costs')
        .insert([{
          job_id: id,
          description: newCost.description,
          quantity: parseFloat(newCost.quantity),
          price: parseFloat(newCost.price),
          amount: amount,
          type: newCost.type,
          service_id: selectedService?.id || null,
          material_id: selectedMaterial?.id || null,
          created_at: new Date().toISOString()
        }])
        .select();
      
      if (error) throw error;
      
      // Update the job costs state
      setJobCosts([...jobCosts, data[0]]);
      
      // Reset form fields
      setShowAddCostDialog(false);
      setNewCost({ description: '', quantity: '1', price: '0', type: 'labor' });
      setSelectedService(null);
      setSelectedMaterial(null);
      
    } catch (error) {
      console.error('Error adding job cost:', error);
      alert(`Error adding cost: ${error.message}`);
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
      
      console.log('Received job data for update:', updatedJobData);
      
      // Ensure uid and client_id are proper numbers (bigint8)
      let jobId = 0;
      let clientId = 0;
      
      if (updatedJobData.uid !== undefined && updatedJobData.uid !== null) {
        jobId = typeof updatedJobData.uid === 'number' ? 
          updatedJobData.uid : Number(updatedJobData.uid);
          
        if (isNaN(jobId)) {
          throw new Error(`Invalid job ID format: "${updatedJobData.uid}"`);
        }
      } else {
        throw new Error('Job ID is required');
      }
      
      if (updatedJobData.client_id !== undefined && updatedJobData.client_id !== null) {
        clientId = typeof updatedJobData.client_id === 'number' ? 
          updatedJobData.client_id : Number(updatedJobData.client_id);
          
        if (isNaN(clientId)) {
          throw new Error(`Invalid client ID format: "${updatedJobData.client_id}"`);
        }
      } else {
        throw new Error('Client ID is required');
      }
      
      // Extract just the data needed for the database update
      const dbUpdateData = {
        title: updatedJobData.title,
        description: updatedJobData.description || '',
        status: updatedJobData.status,
        client_id: clientId, // Use the validated number
        start_date: updatedJobData.start_date,
        end_date: updatedJobData.end_date
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
        alert(`Error updating job: ${error.message}`);
        return false;
      }
      
      // Make sure to update the job in state with the correct types
      const updatedJob = {
        ...updatedJobData,
        uid: jobId,         // Ensure it's stored as a number
        client_id: clientId  // Ensure it's stored as a number
      };
      
      setJob(updatedJob);
      setShowEditForm(false);
      setHasUnsavedChanges(false);
      return true;
    } catch (err) {
      console.error('Error in handleUpdateJob:', err);
      alert(`Error: ${err.message || 'Failed to update job'}`);
      return false;
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
    setHasChanges(true);
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

  // Add this function to handle saving the invoice
  const handleSaveInvoice = async (updatedInvoice, updatedItems) => {
    try {
      setLoading(true);
      
      console.log('Saving invoice with data:', updatedInvoice);
      console.log('Invoice items:', updatedItems);
      
      // First, update the invoice record
      const { error: invoiceError } = await supabase
        .from('invoices')
        .update({
          job_id: updatedInvoice.job_id,
          client_id: updatedInvoice.client_id,
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
          updated_at: new Date().toISOString()
        })
        .eq('uid', updatedInvoice.uid);
      
      if (invoiceError) throw invoiceError;
      
      // Delete existing invoice items
      const { error: deleteError } = await supabase
        .from('invoice_items')
        .delete()
        .eq('invoice_id', updatedInvoice.uid);
      
      if (deleteError) throw deleteError;
      
      // Insert updated items
      if (updatedItems && updatedItems.length > 0) {
        const itemsToInsert = updatedItems.map(item => ({
          invoice_id: updatedInvoice.uid,
          description: item.description,
          notes: item.notes || null,
          photos: item.photos || [],
          quantity: item.quantity,
          unit_price: item.unit_price,
          amount: item.amount,
          service_id: item.service_id,
          material_id: item.material_id,
          type: item.type
        }));
        
        const { error: insertError } = await supabase
          .from('invoice_items')
          .insert(itemsToInsert);
        
        if (insertError) throw insertError;
      }
      
      // Refresh the invoices list
      await fetchInvoices();
      
      // Show success message
      alert('Invoice updated successfully');
      
    } catch (error) {
      console.error('Error updating invoice:', error);
      alert(`Error updating invoice: ${error.message}`);
    } finally {
      setLoading(false);
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

  // Add this function to fetch the invoice data directly when needed
  const fetchInvoiceForEditing = async (invoiceId) => {
    try {
      setLoading(true);
      
      // Fetch complete invoice with job data
      const { data: invoiceData, error: invoiceError } = await supabase
        .from('invoices')
        .select('*, jobs(*)')
        .eq('uid', invoiceId)
        .single();
        
      if (invoiceError) throw invoiceError;
      
      // Fetch invoice items
      const { data: itemsData, error: itemsError } = await supabase
        .from('invoice_items')
        .select('*')
        .eq('invoice_id', invoiceId);
        
      if (itemsError) throw itemsError;
      
      // Combine the data
      const fullInvoice = {
        ...invoiceData,
        invoice_items: itemsData || []
      };
      
      console.log("Successfully fetched invoice:", fullInvoice.invoice_number);
      
      // Set the editing invoice data and switch to edit mode
      setEditingInvoiceData(fullInvoice);
      setIsInvoiceEditMode(true);
      
    } catch (error) {
      console.error('Error fetching invoice for editing:', error);
      alert('Error loading invoice: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchClientsAndJobs = async () => {
    try {
      // Fetch clients
      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('*')
        .order('name');
      
      if (clientError) throw clientError;
      setClients(clientData || []);
      
      // Fetch all jobs
      const { data: jobsData, error: jobsError } = await supabase
        .from('jobs')
        .select('*, clients(name)')
        .order('created_at', { ascending: false });
      
      if (jobsError) throw jobsError;
      setAllJobs(jobsData || []);
      
    } catch (error) {
      console.error('Error fetching clients and jobs:', error);
    }
  };

  // Add this function to handle editing a job cost
  const handleEditCost = (cost) => {
    setEditingCostId(cost.uid);
    setIsEditingCost(true);
    
    // Initialize the form with the selected cost data
    if (cost.service_id) {
      // It's a service
      const serviceItem = {
        service: { id: cost.service_id, name: cost.description },
        rate: cost.price.toString(),
        quantity: cost.quantity.toString()
      };
      setSelectedServices([serviceItem]);
    } else if (cost.material_id) {
      // It's a material
      const materialItem = {
        material: { id: cost.material_id, name: cost.description },
        cost: cost.price.toString(),
        quantity: cost.quantity.toString()
      };
      setSelectedMaterials([materialItem]);
    } else {
      // It's a custom item
      setCustomItems([{
        description: cost.description,
        price: cost.price.toString()
      }]);
    }
    
    setShowCostsInputSection(true);
  };

  // Modify the handleSaveCosts function to handle updates
  const handleSaveCosts = async () => {
    try {
      setLoading(true);
      
      // If we're editing an existing cost
      if (isEditingCost && editingCostId) {
        // Delete the old record
        const { error: deleteError } = await supabase
          .from('job_costs')
          .delete()
          .eq('uid', editingCostId);
        
        if (deleteError) throw deleteError;
      }
      
      const costsToAdd = [
        // Process services
        ...selectedServices.map(item => ({
          job_id: id,
          description: item.service.name,
          quantity: parseFloat(item.quantity),
          price: parseFloat(item.rate),
          amount: parseFloat(item.quantity) * parseFloat(item.rate),
          type: 'labor',
          service_id: item.service.id,
          material_id: null,
          created_at: new Date().toISOString()
        })),
        
        // Rest of the function remains unchanged
      ];
      
      // After adding the costs
      // Reset form and editing state
      setSelectedServices([]);
      setSelectedMaterials([]);
      setCustomItems([]);
      setShowCostsInputSection(false);
      setIsEditingCost(false);
      setEditingCostId(null);
      
      // Show success message
      setSnackbarMessage('Job costs updated successfully');
      setSnackbarVisible(true);
      
    } catch (error) {
      console.error('Error adding job costs:', error);
      setSnackbarMessage(`Error: ${error.message}`);
      setSnackbarVisible(true);
    } finally {
      setLoading(false);
    }
  };

  // Then update the DataTable part in the renderCostsTab function
  // Replace the existing DataTable section with this:
  <DataTable>
    <DataTable.Header>
      <DataTable.Title>Description</DataTable.Title>
      <DataTable.Title>Quantity</DataTable.Title>
      <DataTable.Title>Total</DataTable.Title>
      <DataTable.Title>Type</DataTable.Title>
      <DataTable.Title>Actions</DataTable.Title>
    </DataTable.Header>
    
    {jobCosts.map((cost, index) => (
      <DataTable.Row key={index}>
        <DataTable.Cell>{cost.description}</DataTable.Cell>
        <DataTable.Cell>{cost.quantity}</DataTable.Cell>
        <DataTable.Cell>${parseFloat(cost.amount || cost.price * cost.quantity).toFixed(2)}</DataTable.Cell>
        <DataTable.Cell> {cost.type}</DataTable.Cell>
        <DataTable.Cell>
          <View style={{ flexDirection: 'row' }}>
            <IconButton icon="pencil" size={20} onPress={() => handleEditCost(cost)} />
            <IconButton icon="delete" size={20} iconColor="red" onPress={() => handleDeleteCostItem(cost.uid)} />
          </View>
        </DataTable.Cell>
      </DataTable.Row>
    ))}
    
    <DataTable.Row style={{ backgroundColor: '#f5f5f5' }}>
      <DataTable.Cell style={{ fontWeight: 'bold' }}>Total</DataTable.Cell>
      <DataTable.Cell></DataTable.Cell>
      <DataTable.Cell style={{ fontWeight: 'bold' }}>
        ${jobCosts.reduce((sum, cost) => sum + parseFloat(cost.amount || cost.price * cost.quantity), 0).toFixed(2)}
      </DataTable.Cell>
      <DataTable.Cell></DataTable.Cell>
      <DataTable.Cell></DataTable.Cell>
    </DataTable.Row>
  </DataTable>

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

      case 'attachments':
        return renderAttachmentsTab();
      case 'logs':
        return renderLogsTab();
      default:
        return renderInfoTab();
    }
  };

  const renderInfoTab = () => {
    return (
      <View style={styles.infoContainer}>
        {/* Add Edit Job button at the top right */}
        <View style={styles.headerButtonContainer}>
          <Button 
            mode="contained" 
            icon="pencil" 
            onPress={() => setEditMode(true)}
            style={styles.editButton}
          >
            Edit Job
          </Button>
        </View>
        
        {/* DataTable with border styling removed */}
        <DataTable style={styles.detailsTable}>
          <DataTable.Header>
            <DataTable.Title>Title</DataTable.Title>
            <DataTable.Title>Description</DataTable.Title>
            <DataTable.Title>Client</DataTable.Title>
            <DataTable.Title>Status</DataTable.Title>
            <DataTable.Title>Start</DataTable.Title>
            <DataTable.Title>Finish</DataTable.Title>
          </DataTable.Header>

          <DataTable.Row>
            <DataTable.Cell>{job?.title || 'N/A'}</DataTable.Cell>
            <DataTable.Cell>{job?.description || 'No description'}</DataTable.Cell>
            <DataTable.Cell>{job?.client?.name || 'No client'}</DataTable.Cell>
            <DataTable.Cell>
              <Chip 
                style={{backgroundColor: getStatusColor(job?.status)}}
                textStyle={{color: job?.status === 'Completed' ? '#000' : '#fff'}}
              >
                {job?.status || 'Unknown'}
              </Chip>
            </DataTable.Cell>
            <DataTable.Cell>{job?.start_date ? formatDate(job.start_date) : 'Not set'}</DataTable.Cell>
            <DataTable.Cell>{job?.end_date ? formatDate(job.end_date) : 'Not set'}</DataTable.Cell>
          </DataTable.Row>
        </DataTable>
      </View>
    );
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return '#FFF9C4';
      case 'in_progress': return '#BBDEFB';
      case 'completed': return '#C8E6C9';
      case 'cancelled': return '#FFCDD2';
      default: return '#F5F5F5';
    }
  };

  const renderInvoicesTab = () => {
    // If in invoice edit mode, show the edit form
    if (isInvoiceEditMode && editingInvoiceData) {
      return (
        <View style={{ flex: 1 }}>
          <View style={{ padding: 16, backgroundColor: '#eef', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: 'bold' }}>
              Editing Invoice #{editingInvoiceData.invoice_number}
            </Text>
            <Button 
              mode="outlined"
              icon="arrow-left"
              onPress={() => {
                setIsInvoiceEditMode(false);
                setEditingInvoiceData(null);
                setEditingInvoiceId(null);
              }}
            >
              Back to Invoices
            </Button>
          </View>
          
          {/* Add ScrollView here to enable scrolling */}
          <ScrollView style={{ flex: 1 }}>
            <InvoiceForm
              key={editingInvoiceData.uid}
              initialInvoice={editingInvoiceData}
              initialItems={editingInvoiceData.invoice_items}
              jobs={allJobs}
              clients={clients}
              forceInvoiceNumber={editingInvoiceData.invoice_number}
              lastInvoiceNumber={null}
              isEditing={true}
              onSubmit={(updatedInvoice, updatedItems) => {
                handleSaveInvoice({
                  ...updatedInvoice,
                  uid: editingInvoiceData.uid,
                  invoice_number: editingInvoiceData.invoice_number
                }, updatedItems);
                setIsInvoiceEditMode(false);
                setEditingInvoiceData(null);
                setEditingInvoiceId(null);
              }}
              onCancel={() => {
                setIsInvoiceEditMode(false);
                setEditingInvoiceData(null);
                setEditingInvoiceId(null);
              }}
            />
          </ScrollView>
        </View>
      );
    }

    // Otherwise, show the regular invoices list
    return (
      <View>
        <View style={styles.tabHeader}>
          <Text variant="titleLarge">Invoices</Text>
          <Button 
            mode="contained" 
            onPress={() => router.push(`/invoices?job=${id}`)}
            icon="plus"
          >
            Create New Invoice
          </Button>
        </View>
        
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
                      onPress={() => {
                        console.log("Edit clicked for invoice:", invoice.invoice_number);
                        setEditingInvoiceId(invoice.uid);
                        fetchInvoiceForEditing(invoice.uid);
                      }} 
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
    );
  };

  const renderCostsTab = () => {
    return (
      <View style={{ flex: 1 }}>
        <View style={styles.tabHeader}>
          <Text variant="titleLarge" style={styles.tabTitle}>Job Costs</Text>
          {!showCostsInputSection && (
            <Button 
              mode="contained" 
              onPress={() => setShowCostsInputSection(true)}
              icon="plus"
            >
              Add Costs
            </Button>
          )}
        </View>

        {showCostsInputSection ? (
          <ScrollView 
            style={{ 
              flex: 1, 
              marginBottom: 20,
              borderWidth: 0,
              borderColor: 'transparent',
              elevation: 0,
              shadowOpacity: 0
            }}
          >
            {/* Main card with content */}
            <Card 
              style={{ 
                marginBottom: 0, // Reduce bottom margin to avoid visual separation
                backgroundColor: '#ffffff',
                elevation: 0,
                shadowOpacity: 0,
                borderWidth: 0,
                borderRadius: 0,
                borderColor: 'transparent'
              }}
            >
              <Card.Content style={{ 
                padding: 0, 
                borderWidth: 0,
                borderColor: 'transparent'
              }}>
                {/* SERVICES SECTION */}
                <View style={{ marginBottom: 20 }}>
                  <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 10 }}>Services</Text>
                  
                  {selectedServices.map((item, index) => (
                    <View key={`service-${index}`} style={{ marginBottom: 12, borderWidth: 1, borderColor: '#eee', padding: 12, borderRadius: 4 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <Text style={{ fontWeight: 'bold' }}>{item.service.name}</Text>
                        <IconButton icon="close" size={20} onPress={() => removeServiceItem(index)} />
                      </View>
                      
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TextInput
                          label="Rate ($)"
                          value={item.rate}
                          onChangeText={(text) => updateServiceItem(index, 'rate', text)}
                          keyboardType="numeric"
                          style={{ flex: 1 }}
                        />
                        <TextInput
                          label="Quantity"
                          value={item.quantity}
                          onChangeText={(text) => updateServiceItem(index, 'quantity', text)}
                          keyboardType="numeric"
                          style={{ flex: 1 }}
                        />
                        <TextInput
                          label="Total ($)"
                          value={(parseFloat(item.rate || '0') * parseFloat(item.quantity || '0')).toFixed(2)}
                          disabled
                          style={{ flex: 1, backgroundColor: '#f5f5f5' }}
                        />
                      </View>
                    </View>
                  ))}
                  
                  {selectedServices.length > 0 && (
                    <View style={{ marginTop: 8, marginBottom: 16, padding: 12, backgroundColor: '#f9f9f9', borderRadius: 4 }}>
                      <Text style={{ fontSize: 16, fontWeight: 'bold', textAlign: 'right' }}>
                        Total Labor Cost: ${calculateTotals().serviceTotal.toFixed(2)}
                      </Text>
                    </View>
                  )}
                  
                  <Button 
                    ref={addServiceButtonRef}
                    mode="outlined" 
                    icon="plus"
                    onPress={handleServiceMenuOpen}
                    style={{ 
                      borderWidth: 1, 
                      borderColor: '#ccc', 
                      borderRadius: 25, 
                      marginTop: 8
                    }}
                    contentStyle={{ 
                      height: 50
                    }}
                    labelStyle={{
                      fontSize: 16
                    }}
                  >
                    Add Service
                  </Button>
                </View>
                
                {/* MATERIALS SECTION */}
                <View style={{ marginBottom: 20 }}>
                  <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 10 }}>Materials</Text>
                  
                  {selectedMaterials.map((item, index) => (
                    <View key={`material-${index}`} style={{ marginBottom: 12, borderWidth: 1, borderColor: '#eee', padding: 12, borderRadius: 4 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <Text style={{ fontWeight: 'bold' }}>{item.material.name}</Text>
                        <IconButton icon="close" size={20} onPress={() => removeMaterialItem(index)} />
                      </View>
                      
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TextInput
                          label="Cost ($)"
                          value={item.cost}
                          onChangeText={(text) => updateMaterialItem(index, 'cost', text)}
                          keyboardType="numeric"
                          style={{ flex: 1 }}
                        />
                        <TextInput
                          label="Quantity"
                          value={item.quantity}
                          onChangeText={(text) => updateMaterialItem(index, 'quantity', text)}
                          keyboardType="numeric"
                          style={{ flex: 1 }}
                        />
                        <TextInput
                          label="Total ($)"
                          value={(parseFloat(item.cost || '0') * parseFloat(item.quantity || '0')).toFixed(2)}
                          disabled
                          style={{ flex: 1, backgroundColor: '#f5f5f5' }}
                        />
                      </View>
                    </View>
                  ))}
                  
                  {selectedMaterials.length > 0 && (
                    <View style={{ marginTop: 8, marginBottom: 16, padding: 12, backgroundColor: '#f9f9f9', borderRadius: 4 }}>
                      <Text style={{ fontSize: 16, fontWeight: 'bold', textAlign: 'right' }}>
                        Total Material Cost: ${calculateTotals().materialTotal.toFixed(2)}
                      </Text>
                    </View>
                  )}
                  
                  <Button 
                    ref={addMaterialButtonRef}
                    mode="outlined" 
                    icon="plus"
                    onPress={handleMaterialMenuOpen}
                    style={{ 
                      borderWidth: 1, 
                      borderColor: '#ccc', 
                      borderRadius: 25, 
                      marginTop: 8
                    }}
                    contentStyle={{ 
                      height: 50
                    }}
                    labelStyle={{
                      fontSize: 16
                    }}
                  >
                    Add Material
                  </Button>
                </View>
                
                {/* CUSTOM ITEMS SECTION */}
                <View style={{ marginBottom: 20 }}>
                  <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 10 }}>Custom Items</Text>
                  
                  {customItems.map((item, index) => (
                    <View key={`custom-${index}`} style={{ marginBottom: 12, borderWidth: 1, borderColor: '#eee', padding: 12, borderRadius: 4 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontWeight: 'bold' }}>{item.description}</Text>
                        <IconButton icon="close" size={20} onPress={() => removeCustomItem(index)} />
                      </View>
                      <Text style={{ alignSelf: 'flex-end' }}>
                        Price: ${parseFloat(item.price).toFixed(2)}
                      </Text>
                    </View>
                  ))}
                  
                  <TextInput
                    label="Description"
                    value={customItemInput.description}
                    onChangeText={(text) => setCustomItemInput({ ...customItemInput, description: text })}
                    style={{ marginBottom: 12 }}
                    placeholder="Description"
                  />
                  
                  <TextInput
                    label="Price ($)"
                    value={customItemInput.price}
                    onChangeText={(text) => setCustomItemInput({ ...customItemInput, price: text })}
                    keyboardType="numeric"
                    style={{ marginBottom: 12 }}
                    placeholder="0"
                  />
                  
                  <Button 
                    mode="outlined" 
                    icon="plus"
                    onPress={addCustomItem}
                    style={{ 
                      borderWidth: 1, 
                      borderColor: '#ccc', 
                      borderRadius: 25, 
                      marginTop: 8
                    }}
                    contentStyle={{ 
                      height: 50
                    }}
                    labelStyle={{
                      fontSize: 16
                    }}
                  >
                    Add Custom Item
                  </Button>
                </View>
                
                {/* Grand total section */}
                {(selectedServices.length > 0 || selectedMaterials.length > 0 || customItems.length > 0) && (
                  <View style={{ padding: 16, backgroundColor: '#f5f5f5', borderRadius: 4, marginTop: 10 }}>
                    <Text style={{ fontSize: 18, fontWeight: 'bold', textAlign: 'right' }}>
                      Grand Total: ${calculateTotals().grandTotal.toFixed(2)}
                    </Text>
                  </View>
                )}
              </Card.Content>
            </Card>
            
            {/* Action buttons directly in the ScrollView without separation */}
            <View style={{ 
              flexDirection: 'row', 
              justifyContent: 'flex-end', 
              marginTop: 0, // Remove top margin
              padding: 16,
              backgroundColor: '#ffffff',
              borderTopWidth: 0,
              borderColor: 'transparent',
              elevation: 0,
              shadowOpacity: 0
            }}>
              <Button 
                onPress={() => {
                  setShowCostsInputSection(false);
                  setSelectedServices([]);
                  setSelectedMaterials([]);
                  setCustomItems([]);
                }} 
                style={{ marginRight: 10 }}
              >
                Cancel
              </Button>
              <Button 
                mode="contained" 
                onPress={handleSaveCosts}
                style={{ backgroundColor: '#333' }}
              >
                Save All Costs
              </Button>
            </View>
          </ScrollView>
        ) : (
          // The regular job costs list when not adding new ones
          <View>
            {jobCosts.length > 0 ? (
              <DataTable>
                <DataTable.Header>
                  <DataTable.Title>Description</DataTable.Title>
                  <DataTable.Title>Quantity</DataTable.Title>
                  <DataTable.Title>Total</DataTable.Title>
                  <DataTable.Title>Type</DataTable.Title>
                  <DataTable.Title>Actions</DataTable.Title>
                </DataTable.Header>
                
                {jobCosts.map((cost, index) => (
                  <DataTable.Row key={index}>
                    <DataTable.Cell>{cost.description}</DataTable.Cell>
                    <DataTable.Cell>{cost.quantity}</DataTable.Cell>
                    <DataTable.Cell>${parseFloat(cost.amount || cost.price * cost.quantity).toFixed(2)}</DataTable.Cell>
                    <DataTable.Cell> {cost.type}</DataTable.Cell>
                    <DataTable.Cell>
                      <View style={{ flexDirection: 'row' }}>
                        <IconButton icon="pencil" size={20} onPress={() => handleEditCost(cost)} />
                        <IconButton icon="delete" size={20} iconColor="red" onPress={() => handleDeleteCostItem(cost.uid)} />
                      </View>
                    </DataTable.Cell>
                  </DataTable.Row>
                ))}
                
                <DataTable.Row style={{ backgroundColor: '#f5f5f5' }}>
                  <DataTable.Cell style={{ fontWeight: 'bold' }}>Total</DataTable.Cell>
                  <DataTable.Cell></DataTable.Cell>
                  <DataTable.Cell style={{ fontWeight: 'bold' }}>
                    ${jobCosts.reduce((sum, cost) => sum + parseFloat(cost.amount || cost.price * cost.quantity), 0).toFixed(2)}
                  </DataTable.Cell>
                  <DataTable.Cell></DataTable.Cell>
                  <DataTable.Cell></DataTable.Cell>
                </DataTable.Row>
              </DataTable>
            ) : (
              <Text style={styles.emptyMessage}>No costs added yet.</Text>
            )}
          </View>
        )}
      </View>
    );
  };

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

  // Add these helper functions after your handleSaveCosts function

  // Add this function to calculate totals for each section
  const calculateTotals = () => {
    const serviceTotal = selectedServices.reduce((sum, item) => {
      return sum + parseFloat(item.rate || '0') * parseFloat(item.quantity || '0');
    }, 0);
    
    const materialTotal = selectedMaterials.reduce((sum, item) => {
      return sum + parseFloat(item.cost || '0') * parseFloat(item.quantity || '0');
    }, 0);
    
    const customTotal = customItems.reduce((sum, item) => {
      return sum + parseFloat(item.price || '0');
    }, 0);
    
    return { 
      serviceTotal, 
      materialTotal, 
      customTotal, 
      grandTotal: serviceTotal + materialTotal + customTotal 
    };
  };

  // Service item functions
  const addServiceItem = () => {
    setServicesMenuVisible(true);
  };

  const removeServiceItem = (index) => {
    const newItems = [...selectedServices];
    newItems.splice(index, 1);
    setSelectedServices(newItems);
  };

  const updateServiceItem = (index, field, value) => {
    const newItems = [...selectedServices];
    newItems[index] = { ...newItems[index], [field]: value };
    setSelectedServices(newItems);
  };

  // Material item functions
  const addMaterialItem = () => {
    setMaterialsMenuVisible(true);
  };

  const removeMaterialItem = (index) => {
    const newItems = [...selectedMaterials];
    newItems.splice(index, 1);
    setSelectedMaterials(newItems);
  };

  const updateMaterialItem = (index, field, value) => {
    const newItems = [...selectedMaterials];
    newItems[index] = { ...newItems[index], [field]: value };
    setSelectedMaterials(newItems);
  };

  // Custom item functions
  const addCustomItem = () => {
    if (!customItemInput.description.trim() || parseFloat(customItemInput.price) <= 0) {
      setSnackbarMessage('Please enter a description and a valid price');
      setSnackbarVisible(true);
      return;
    }
    
    setCustomItems([...customItems, { ...customItemInput }]);
    setCustomItemInput({ description: '', price: '0' });
  };

  const removeCustomItem = (index) => {
    const newItems = [...customItems];
    newItems.splice(index, 1);
    setCustomItems(newItems);
  };

  // Menu position handling
  const handleServiceMenuOpen = () => {
    setShowServiceDialog(true);
  };

  const handleMaterialMenuOpen = () => {
    setShowMaterialDialog(true);
  };

  // Add this function to open the date picker
  const openDatePicker = (mode: 'start' | 'end') => {
    console.log(`Opening ${mode} date picker`);
    if (mode === 'start') {
      setStartDatePickerVisible(true);
    } else {
      setEndDatePickerVisible(true);
    }
  };

  // Add this function to handle date selection
  const handleDateTimeConfirm = (dateTime: string, mode: 'start' | 'end') => {
    console.log(`Selected ${mode} date:`, dateTime);
    if (!job) return;
    
    const updatedJob = { ...job };
    
    if (mode === 'start') {
      updatedJob.start_date = dateTime;
      setStartDatePickerVisible(false);
    } else {
      updatedJob.end_date = dateTime;
      setEndDatePickerVisible(false);
    }
    
    setJob(updatedJob);
    setHasChanges(true);
  };

  const applyDateTime = () => {
    // Format the datetime
    const hour12 = selectedHour === '12' ? 12 : parseInt(selectedHour);
    const hour24 = selectedAmPm === 'PM' && hour12 < 12 ? hour12 + 12 : (selectedAmPm === 'AM' && hour12 === 12 ? 0 : hour12);
    
    const formattedDateTime = `${year}-${String(month + 1).padStart(2, '0')}-${String(selectedDate).padStart(2, '0')}T${String(hour24).padStart(2, '0')}:${selectedMinute}:00.000Z`;
    
    onConfirm(formattedDateTime);
  };

  return (
    <View style={styles.container}>
      <View style={[styles.navigationPane, { display: 'flex', flexDirection: 'column', height: '100%' }]}>
        <View style={[styles.navigationSection, { flex: 1, display: 'flex', flexDirection: 'column' }]}>
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
         
          
          {/* Spacer that takes up all available space */}
          <View style={{ flex: 1 }} />
        </View>
        
        {/* Back to Jobs button outside the navigationSection but inside the navigationPane */}
        <TouchableOpacity 
          style={{ 
            padding: 16,
            flexDirection: 'row',
            alignItems: 'center',
            borderTopWidth: 1,
            borderTopColor: '#e0e0e0',
          }}
          onPress={() => router.push('/jobs')}
        >
          <View style={{ width: 24, marginRight: 12 }}>
            <MaterialIcons name="arrow-back" size={20} color="#666666" />
          </View>
          <Text style={{ color: '#666666' }}>Back to Jobs</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.contentPane}>
        <View style={styles.contentHeader}>
          <View style={{ flex: 1 }}>
            <Text variant="headlineMedium">Job Details</Text>
          </View>

        </View>
        
        {renderContent()}
      </View>

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={3000}
        style={{ backgroundColor: '#333' }}
        action={{
          label: 'Dismiss',
          onPress: () => setSnackbarVisible(false),
        }}
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

      {/* Add Cost Dialog - Simplified to match the image */}
      <Portal>
        <Dialog visible={showAddCostDialog} onDismiss={() => setShowAddCostDialog(false)} style={{ maxWidth: 500, alignSelf: 'center', width: '100%' }}>
          <Dialog.Title>Add Job Costs</Dialog.Title>
          <Dialog.ScrollArea style={{ maxHeight: 500 }}>
            <ScrollView>
              <View style={{ padding: 16 }}>
                {/* SERVICES SECTION */}
                <View style={{ marginBottom: 20 }}>
                  <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 10 }}>Services</Text>
                  
                  {selectedServices.map((item, index) => (
                    <View key={`service-${index}`} style={{ marginBottom: 12, borderWidth: 1, borderColor: '#eee', padding: 12, borderRadius: 4 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <Text style={{ fontWeight: 'bold' }}>{item.service.name}</Text>
                        <IconButton icon="close" size={20} onPress={() => removeServiceItem(index)} />
                      </View>
                      
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TextInput
                          label="Rate ($)"
                          value={item.rate}
                          onChangeText={(text) => updateServiceItem(index, 'rate', text)}
                          keyboardType="numeric"
                          style={{ flex: 1 }}
                        />
                        <TextInput
                          label="Quantity"
                          value={item.quantity}
                          onChangeText={(text) => updateServiceItem(index, 'quantity', text)}
                          keyboardType="numeric"
                          style={{ flex: 1 }}
                        />
                        <TextInput
                          label="Total ($)"
                          value={(parseFloat(item.rate || '0') * parseFloat(item.quantity || '0')).toFixed(2)}
                          disabled
                          style={{ flex: 1, backgroundColor: '#f5f5f5' }}
                        />
                      </View>
                    </View>
                  ))}
                  
                  {/* Add total services cost calculation */}
                  {selectedServices.length > 0 && (
                    <View style={{ marginTop: 8, marginBottom: 16, padding: 12, backgroundColor: '#f9f9f9', borderRadius: 4 }}>
                      <Text style={{ fontSize: 16, fontWeight: 'bold', textAlign: 'right' }}>
                        Total Labor Cost: ${calculateTotals().serviceTotal.toFixed(2)}
                      </Text>
                    </View>
                  )}
                  
                  {/* "Add Service" button styled to match the image */}
                  <Button 
                    ref={addServiceButtonRef}
                    mode="outlined" 
                    icon="plus"
                    onPress={handleServiceMenuOpen}
                    style={{ 
                      borderWidth: 1, 
                      borderColor: '#ccc', 
                      borderRadius: 25, 
                      marginTop: 8
                    }}
                    contentStyle={{ 
                      height: 50
                    }}
                    labelStyle={{
                      fontSize: 16
                    }}
                  >
                    Add Service
                  </Button>
                </View>
                
                {/* MATERIALS SECTION */}
                <View style={{ marginBottom: 20 }}>
                  <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 10 }}>Materials</Text>
                  
                  {selectedMaterials.map((item, index) => (
                    <View key={`material-${index}`} style={{ marginBottom: 12, borderWidth: 1, borderColor: '#eee', padding: 12, borderRadius: 4 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <Text style={{ fontWeight: 'bold' }}>{item.material.name}</Text>
                        <IconButton icon="close" size={20} onPress={() => removeMaterialItem(index)} />
                      </View>
                      
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TextInput
                          label="Cost ($)"
                          value={item.cost}
                          onChangeText={(text) => updateMaterialItem(index, 'cost', text)}
                          keyboardType="numeric"
                          style={{ flex: 1 }}
                        />
                        <TextInput
                          label="Quantity"
                          value={item.quantity}
                          onChangeText={(text) => updateMaterialItem(index, 'quantity', text)}
                          keyboardType="numeric"
                          style={{ flex: 1 }}
                        />
                        <TextInput
                          label="Total ($)"
                          value={(parseFloat(item.cost || '0') * parseFloat(item.quantity || '0')).toFixed(2)}
                          disabled
                          style={{ flex: 1, backgroundColor: '#f5f5f5' }}
                        />
                      </View>
                    </View>
                  ))}
                  
                  {/* Add total materials cost calculation */}
                  {selectedMaterials.length > 0 && (
                    <View style={{ marginTop: 8, marginBottom: 16, padding: 12, backgroundColor: '#f9f9f9', borderRadius: 4 }}>
                      <Text style={{ fontSize: 16, fontWeight: 'bold', textAlign: 'right' }}>
                        Total Material Cost: ${calculateTotals().materialTotal.toFixed(2)}
                      </Text>
                    </View>
                  )}
                  
                  {/* "Add Material" button styled to match the image */}
                  <Button 
                    ref={addMaterialButtonRef}
                    mode="outlined" 
                    icon="plus"
                    onPress={handleMaterialMenuOpen}
                    style={{ 
                      borderWidth: 1, 
                      borderColor: '#ccc', 
                      borderRadius: 25, 
                      marginTop: 8
                    }}
                    contentStyle={{ 
                      height: 50
                    }}
                    labelStyle={{
                      fontSize: 16
                    }}
                  >
                    Add Material
                  </Button>
                </View>
                
                {/* CUSTOM ITEMS SECTION */}
                <View style={{ marginBottom: 20 }}>
                  <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 10 }}>Custom Items</Text>
                  
                  {customItems.map((item, index) => (
                    <View key={`custom-${index}`} style={{ marginBottom: 12, borderWidth: 1, borderColor: '#eee', padding: 12, borderRadius: 4 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontWeight: 'bold' }}>{item.description}</Text>
                        <IconButton icon="close" size={20} onPress={() => removeCustomItem(index)} />
                      </View>
                      <Text style={{ alignSelf: 'flex-end' }}>
                        Price: ${parseFloat(item.price).toFixed(2)}
                      </Text>
                    </View>
                  ))}
                  
                  <TextInput
                    label="Description"
                    value={customItemInput.description}
                    onChangeText={(text) => setCustomItemInput({ ...customItemInput, description: text })}
                    style={{ marginBottom: 12 }}
                    placeholder="Description"
                  />
                  
                  <TextInput
                    label="Price ($)"
                    value={customItemInput.price}
                    onChangeText={(text) => setCustomItemInput({ ...customItemInput, price: text })}
                    keyboardType="numeric"
                    style={{ marginBottom: 12 }}
                    placeholder="0"
                  />
                  
                  <Button 
                    mode="outlined" 
                    icon="plus"
                    onPress={addCustomItem}
                    style={{ 
                      borderWidth: 1, 
                      borderColor: '#ccc', 
                      borderRadius: 25, 
                      marginTop: 8
                    }}
                    contentStyle={{ 
                      height: 50
                    }}
                    labelStyle={{
                      fontSize: 16
                    }}
                  >
                    Add Custom Item
                  </Button>
                </View>
              </View>
            </ScrollView>
          </Dialog.ScrollArea>
          
          <Dialog.Actions>
            <Button onPress={() => setShowAddCostDialog(false)}>Cancel</Button>
            <Button 
              mode="contained" 
              onPress={handleSaveCosts}
              style={{ backgroundColor: '#333' }}
            >
              Save All Costs
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* Service Selection Dialog */}
      <Portal>
        <Dialog
          visible={showServiceDialog}
          onDismiss={() => setShowServiceDialog(false)}
          style={{ 
            maxWidth: 600, 
            alignSelf: 'center', 
            backgroundColor: '#ffffff',
            borderWidth: 0,
            elevation: 0,
            shadowOpacity: 0,
            borderRadius: 0
          }}
        >
          <Dialog.Title style={{ 
            backgroundColor: '#ffffff',
            borderBottomWidth: 0 
          }}>
            Select a Service
          </Dialog.Title>
          <Dialog.ScrollArea style={{ 
            maxHeight: 400, 
            backgroundColor: '#ffffff',
            borderTopWidth: 0,
            borderBottomWidth: 0
          }}>
            <ScrollView style={{ backgroundColor: '#ffffff' }}>
              <RadioButton.Group>
                {services.map(service => (
                  <TouchableOpacity 
                    key={service.id}
                    onPress={() => {
                      setSelectedServices([
                        ...selectedServices,
                        { 
                          service: service, 
                          rate: service.rate?.toString() || service.price?.toString() || '0',
                          quantity: '1'
                        }
                      ]);
                      setShowServiceDialog(false);
                    }}
                    style={{ 
                      paddingVertical: 8, 
                      borderBottomWidth: 1, 
                      borderBottomColor: '#f0f0f0', // Lighter border for list items
                      backgroundColor: '#ffffff'
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, backgroundColor: '#ffffff' }}>
                      <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
                        <Text>{service.name}</Text>
                        <Text style={{ color: '#666', fontSize: 12 }}>
                          ${service.rate ? service.rate.toFixed(2) : (service.price ? service.price.toFixed(2) : '0.00')}
                        </Text>
                      </View>
                      <IconButton icon="plus-circle" size={24} />
                    </View>
                  </TouchableOpacity>
                ))}
              </RadioButton.Group>
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions style={{ 
            backgroundColor: '#ffffff',
            borderTopWidth: 0
          }}>
            <Button onPress={() => setShowServiceDialog(false)}>Cancel</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* Material Selection Dialog */}
      <Portal>
        <Dialog
          visible={showMaterialDialog}
          onDismiss={() => setShowMaterialDialog(false)}
          style={{ 
            maxWidth: 600, 
            alignSelf: 'center', 
            backgroundColor: '#ffffff',
            borderWidth: 0,
            elevation: 0,
            shadowOpacity: 0,
            borderRadius: 0
          }}
        >
          <Dialog.Title style={{ 
            backgroundColor: '#ffffff',
            borderBottomWidth: 0
          }}>
            Select a Material
          </Dialog.Title>
          <Dialog.ScrollArea style={{ 
            maxHeight: 400, 
            backgroundColor: '#ffffff',
            borderTopWidth: 0,
            borderBottomWidth: 0
          }}>
            <ScrollView style={{ backgroundColor: '#ffffff' }}>
              <RadioButton.Group>
                {materials.map(material => (
                  <TouchableOpacity 
                    key={material.id}
                    onPress={() => {
                      setSelectedMaterials([
                        ...selectedMaterials,
                        { 
                          material: material, 
                          cost: material.cost?.toString() || material.price?.toString() || '0',
                          quantity: '1'
                        }
                      ]);
                      setShowMaterialDialog(false);
                    }}
                    style={{ 
                      paddingVertical: 8, 
                      borderBottomWidth: 1, 
                      borderBottomColor: '#f0f0f0', // Lighter border for list items
                      backgroundColor: '#ffffff'
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, backgroundColor: '#ffffff' }}>
                      <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
                        <Text>{material.name}</Text>
                        <Text style={{ color: '#666', fontSize: 12 }}>
                          ${material.cost ? material.cost.toFixed(2) : (material.price ? material.price.toFixed(2) : '0.00')}
                        </Text>
                      </View>
                      <IconButton icon="plus-circle" size={24} />
                    </View>
                  </TouchableOpacity>
                ))}
              </RadioButton.Group>
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions style={{ 
            backgroundColor: '#ffffff',
            borderTopWidth: 0
          }}>
            <Button onPress={() => setShowMaterialDialog(false)}>Cancel</Button>
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
  // Date Picker Styles
  datePickerWrapper: {
    position: 'relative',
    width: '100%',
  },
  datePickerContainer: {
    padding: 16,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  monthYearContainer: {
    flex: 1,
  },
  monthYearText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  navigationButtons: {
    flexDirection: 'row',
  },
  calendarContainer: {
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    paddingBottom: 16,
  },
  weekdayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 8,
  },
  weekdayText: {
    width: 32,
    textAlign: 'center',
    fontWeight: '500',
  },
  daysContainer: {
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginVertical: 4,
  },
  dayCell: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
  },
  emptyDay: {
    backgroundColor: 'transparent',
  },
  selectedDay: {
    backgroundColor: '#2196F3',
    borderRadius: 16,
  },
  todayDay: {
    borderWidth: 1,
    borderColor: '#2196F3',
  },
  dayText: {
    textAlign: 'center',
  },
  selectedDayText: {
    color: 'white',
  },
  todayDayText: {
    fontWeight: 'bold',
  },
  timePickerContainer: {
    flexDirection: 'row',
    paddingTop: 16,
  },
  timePickerColumn: {
    flex: 1,
    alignItems: 'center',
  },
  timeScrollView: {
    maxHeight: 150,
    width: '100%',
  },
  timeOption: {
    padding: 8,
    width: '100%',
    alignItems: 'center',
  },
  selectedTimeOption: {
    backgroundColor: '#f0f0f0',
  },
  timeOptionText: {
    fontSize: 16,
  },
  selectedTimeOptionText: {
    fontWeight: 'bold',
    color: '#2196F3',
  },
  dateTimePickerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 16,
  },
  saveButtonContainer: {
    marginTop: 20,
    marginBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
  },
  saveButton: {
    flex: 1,
    marginRight: 10,
    paddingVertical: 8,
  },
  cancelButton: {
    flex: 1,
    marginLeft: 10,
    paddingVertical: 8,
  },
  editButton: {
    margin: 20,
    paddingVertical: 8,
  },
  dateInput: {
    flex: 1,
    padding: 10,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  disabledInput: {
    backgroundColor: '#f0f0f0',
    borderColor: '#ddd',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  datePickerModal: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    width: '90%',
    maxWidth: 400,
  },
  datePickerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  modalContainer: {
    backgroundColor: 'white',
    padding: 20,
    margin: 20,
    borderRadius: 10,
    maxHeight: '80%',
  },
  detailsTable: {
    marginBottom: 20,
    backgroundColor: 'transparent', // Make background transparent
    borderWidth: 0, // Remove border
  },
  headerButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    width: '100%',
    marginBottom: 15,
  },
  editButton: {
    alignSelf: 'flex-end',
  },
}); 