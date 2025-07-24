import { useState, useEffect, useRef } from 'react';
import { View, ScrollView, Dimensions, StyleSheet, TouchableOpacity, Pressable, TextInput as RNTextInput, ScrollView as RNScrollView } from 'react-native';
import { TextInput, Button, Card, Text, ActivityIndicator, HelperText, Menu, Portal, IconButton } from 'react-native-paper';
import { styles } from '../styles';
import { supabase } from '../lib/supabase';
// Replace the Client import with a local type definition
// import { Client } from '../app/(app)/clients';
// Define Client type locally
type Client = {
  uid: string;  // This is a string in the UI but needs conversion for database
  name: string;
  // other client fields...
};
import { JobStatusSelector } from './JobStatusSelector';
import { formatDateInput, isValidDate } from '../utils/date';
import { MaterialIcons } from '@expo/vector-icons';

type Job = {
  uid: number;  // Changed from string to number to match bigint8 in database
  client_id: number;  // Already correct as number
  title: string;
  description: string;
  status: 'pending' | 'completed' | 'in_progress';
  start_date: string | null;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
};

type JobFormProps = {
  job?: Job | null;
  onSubmit: (job: any) => void;
  onCancel: () => void;
  submitting?: boolean;
  onChange?: () => void;
};

// Add DateTimePicker interface
interface DateTimePickerProps {
  visible: boolean;
  onDismiss: () => void;
  onConfirm: (dateTime: string) => void;
  initialDate?: string;
  mode?: 'start' | 'end';
  position?: { top: number; right: number };
}

// DateTimePicker component from [id].tsx
const DateTimePicker: React.FC<DateTimePickerProps> = ({ 
  visible, 
  onDismiss, 
  onConfirm, 
  initialDate,
  mode = 'start',
  position = { top: 0, right: 0 }
}) => {
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedHour, setSelectedHour] = useState<string>('12');
  const [selectedMinute, setSelectedMinute] = useState<string>('00');
  const [selectedAmPm, setSelectedAmPm] = useState<'AM' | 'PM'>('AM');
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [month, setMonth] = useState<number>(new Date().getMonth());
  
  // Month name for display
  const monthName = new Date(year, month).toLocaleString('default', { month: 'long' });
  
  // Position styling for the picker
  const pickerStyle = {
    position: 'absolute' as 'absolute',
    top: position.top,
    right: position.right,
    backgroundColor: 'white',
    borderRadius: 8,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    padding: 16,
    zIndex: 1000,
    width: 300,
  };

  useEffect(() => {
    // Initialize with initialDate if provided
    if (initialDate) {
      const date = new Date(initialDate);
      if (!isNaN(date.getTime())) {
        // Format date as YYYY-MM-DD
        const dateString = date.toISOString().split('T')[0];
        setSelectedDate(dateString);
        setCurrentMonth(date);
        setYear(date.getFullYear());
        setMonth(date.getMonth());
        
        // Set time if available
        const hours = date.getHours();
        const minutes = date.getMinutes();
        setSelectedHour(hours > 12 ? (hours - 12).toString() : (hours === 0 ? '12' : hours.toString()));
        setSelectedMinute(minutes.toString().padStart(2, '0'));
        setSelectedAmPm(hours >= 12 ? 'PM' : 'AM');
      }
    } else {
      // Default to today
      const now = new Date();
      const dateString = now.toISOString().split('T')[0];
      setSelectedDate(dateString);
    }
  }, [initialDate]);

  const goToPrevMonth = () => {
    const newDate = new Date(year, month - 1);
    setMonth(newDate.getMonth());
    setYear(newDate.getFullYear());
    setCurrentMonth(newDate);
  };

  const goToNextMonth = () => {
    const newDate = new Date(year, month + 1);
    setMonth(newDate.getMonth());
    setYear(newDate.getFullYear());
    setCurrentMonth(newDate);
  };

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getDayOfWeek = (year: number, month: number, day: number) => {
    return new Date(year, month, day).getDay();
  };

  const generateCalendarDays = () => {
    const days = [];
    const daysInMonth = getDaysInMonth(year, month);
    const firstDayOfMonth = getDayOfWeek(year, month, 1);

    // Create week rows
    let currentWeek = [];
    
    // Add empty cells for days before the first day of month
    for (let i = 0; i < firstDayOfMonth; i++) {
      currentWeek.push(null);
    }
    
    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      currentWeek.push(day);
      
      // Start a new week if we reach the end of a week
      if (currentWeek.length === 7) {
        days.push([...currentWeek]);
        currentWeek = [];
      }
    }
    
    // Fill the last week with empty cells if needed
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        currentWeek.push(null);
      }
      days.push([...currentWeek]);
    }
    
    return days;
  };

  const isToday = (day: number) => {
    const today = new Date();
    return day === today.getDate() && 
           month === today.getMonth() && 
           year === today.getFullYear();
  };

  const isSelectedDate = (day: number) => {
    if (!day || !selectedDate) return false;
    
    // Parse the selectedDate string to get year, month, and day
    const [year_str, month_str, day_str] = selectedDate.split('-');
    const selectedYear = parseInt(year_str);
    const selectedMonth = parseInt(month_str) - 1; // Convert from 1-based to 0-based month
    const selectedDay = parseInt(day_str);

    // Compare the individual components directly without timezone issues
    return day === selectedDay && 
           month === selectedMonth && 
           year === selectedYear;
  };

  const handleDateSelect = (day: number) => {
    // Format date as YYYY-MM-DD manually to avoid timezone issues
    const yearStr = year.toString();
    const monthStr = (month + 1).toString().padStart(2, '0'); // +1 because months are 0-indexed
    const dayStr = day.toString().padStart(2, '0');
    
    const dateString = `${yearStr}-${monthStr}-${dayStr}`;
    setSelectedDate(dateString);
  };

  const generateHourOptions = () => {
    return Array.from({ length: 12 }, (_, i) => (i + 1).toString());
  };

  const generateMinuteOptions = () => {
    return ['00', '15', '30', '45'];
  };

  const applyDateTime = () => {
    if (!selectedDate) return;
    
    // Parse the date parts directly
    const [selectedYearStr, selectedMonthStr, selectedDayStr] = selectedDate.split('-');
    
    // Convert 12-hour to 24-hour for consistency
    let hours = parseInt(selectedHour);
    if (selectedAmPm === 'PM' && hours < 12) {
      hours += 12;
    } else if (selectedAmPm === 'AM' && hours === 12) {
      hours = 0;
    }
    
    // Create a date object with the exact components
    // Keep the date exactly as entered - critical for timezone consistency
    const dateObj = new Date(
      parseInt(selectedYearStr),
      parseInt(selectedMonthStr) - 1,
      parseInt(selectedDayStr),
      hours,
      parseInt(selectedMinute),
      0,
      0
    );
    
    // Convert to ISO string for the API
    const formattedDate = dateObj.toISOString();
    
    // Log for debugging
    console.log('Date picker selected date:', selectedDate);
    console.log('Creating date with:', {
      year: parseInt(selectedYearStr),
      month: parseInt(selectedMonthStr) - 1,
      day: parseInt(selectedDayStr),
      hours,
      minutes: parseInt(selectedMinute)
    });
    console.log('Date picker ISO string:', formattedDate);
    
    onConfirm(formattedDate);
  };

  // If not visible, don't render anything
  if (!visible) return null;

  return (
    <View style={dateTimePickerStyles.datePickerContainer}>
      <View style={dateTimePickerStyles.calendarHeader}>
        <View style={dateTimePickerStyles.monthYearContainer}>
          <Text style={dateTimePickerStyles.monthYearText}>{`${monthName} ${year}`}</Text>
        </View>
        <View style={dateTimePickerStyles.navigationButtons}>
          <IconButton icon="chevron-left" size={24} onPress={goToPrevMonth} />
          <IconButton icon="chevron-right" size={24} onPress={goToNextMonth} />
        </View>
      </View>
      
      <View style={dateTimePickerStyles.contentContainer}>
        {/* Calendar section */}
        <View style={dateTimePickerStyles.calendarSection}>
          <View style={dateTimePickerStyles.weekdayHeader}>
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
              <Text key={index} style={dateTimePickerStyles.weekdayText}>{day}</Text>
            ))}
          </View>
          
          <View style={dateTimePickerStyles.daysContainer}>
            {generateCalendarDays().map((week, weekIndex) => (
              <View key={weekIndex} style={dateTimePickerStyles.weekRow}>
                {week.map((day, dayIndex) => (
                  <TouchableOpacity
                    key={dayIndex}
                    style={[
                      dateTimePickerStyles.dayCell,
                      day === null ? dateTimePickerStyles.emptyDay : {},
                      isSelectedDate(day as number) ? dateTimePickerStyles.selectedDay : {},
                      isToday(day as number) ? dateTimePickerStyles.todayDay : {}
                    ]}
                    onPress={() => day !== null ? handleDateSelect(day as number) : null}
                    disabled={day === null}
                  >
                    {day !== null && (
                      <Text style={[
                        dateTimePickerStyles.dayText,
                        isSelectedDate(day as number) ? dateTimePickerStyles.selectedDayText : {},
                        isToday(day as number) ? dateTimePickerStyles.todayDayText : {}
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

        {/* Time picker section */}
        <View style={dateTimePickerStyles.timeSection}>
          <Text style={dateTimePickerStyles.timeHeaderText}>Time</Text>
          <View style={dateTimePickerStyles.timePickerContainer}>
            <View style={dateTimePickerStyles.timePickerColumn}>
              <Text style={dateTimePickerStyles.timeColumnLabel}>Hour</Text>
              <ScrollView style={dateTimePickerStyles.timeScrollView} showsVerticalScrollIndicator={true}>
                {generateHourOptions().map((hour) => (
                  <TouchableOpacity
                    key={hour}
                    style={[
                      dateTimePickerStyles.timeOption,
                      selectedHour === hour ? dateTimePickerStyles.selectedTimeOption : {}
                    ]}
                    onPress={() => setSelectedHour(hour)}
                  >
                    <Text style={[
                      dateTimePickerStyles.timeOptionText,
                      selectedHour === hour ? dateTimePickerStyles.selectedTimeOptionText : {}
                    ]}>
                      {hour}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            
            <View style={dateTimePickerStyles.timePickerColumn}>
              <Text style={dateTimePickerStyles.timeColumnLabel}>Min</Text>
              <ScrollView style={dateTimePickerStyles.timeScrollView} showsVerticalScrollIndicator={true}>
                {generateMinuteOptions().map((minute) => (
                  <TouchableOpacity
                    key={minute}
                    style={[
                      dateTimePickerStyles.timeOption,
                      selectedMinute === minute ? dateTimePickerStyles.selectedTimeOption : {}
                    ]}
                    onPress={() => setSelectedMinute(minute)}
                  >
                    <Text style={[
                      dateTimePickerStyles.timeOptionText,
                      selectedMinute === minute ? dateTimePickerStyles.selectedTimeOptionText : {}
                    ]}>
                      {minute}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            
            <View style={dateTimePickerStyles.timePickerColumn}>
              <Text style={dateTimePickerStyles.timeColumnLabel}>AM/PM</Text>
              <View style={dateTimePickerStyles.amPmContainer}>
                <TouchableOpacity
                  style={[
                    dateTimePickerStyles.timeOption,
                    selectedAmPm === 'AM' ? dateTimePickerStyles.selectedTimeOption : {}
                  ]}
                  onPress={() => setSelectedAmPm('AM')}
                >
                  <Text style={[
                    dateTimePickerStyles.timeOptionText,
                    selectedAmPm === 'AM' ? { color: '#2196F3' } : {}
                  ]}>
                    AM
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[
                    dateTimePickerStyles.timeOption,
                    selectedAmPm === 'PM' ? dateTimePickerStyles.selectedTimeOption : {}
                  ]}
                  onPress={() => setSelectedAmPm('PM')}
                >
                  <Text style={[
                    dateTimePickerStyles.timeOptionText,
                    selectedAmPm === 'PM' ? { color: '#2196F3' } : {}
                  ]}>
                    PM
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </View>
      
      <View style={dateTimePickerStyles.dateTimePickerActions}>
        <Button onPress={onDismiss}>Cancel</Button>
        <Button onPress={applyDateTime}>OK</Button>
      </View>
    </View>
  );
};

export function JobForm({ job, onSubmit, onCancel, submitting = false, onChange }: JobFormProps) {
  const [formData, setFormData] = useState<Omit<Job, 'uid'>>({
    client_id: job?.client_id || 0,  // Always ensure client_id exists
    title: job?.title || '',
    description: job?.description || '',
    status: job?.status || 'pending',
    start_date: job?.start_date || null,
    end_date: job?.end_date || null,
    start_time: job?.start_time || null,
    end_time: job?.end_time || null,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [clients, setClients] = useState<Client[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [showClientMenu, setShowClientMenu] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [clientButtonLayout, setClientButtonLayout] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const clientButtonRef = useRef<TouchableOpacity>(null);
  const scrollViewRef = useRef<RNScrollView>(null);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [statusOptions, setStatusOptions] = useState([
    { value: 'pending', label: 'Pending' },
    { value: 'completed', label: 'Completed' },
    { value: 'in_progress', label: 'In Progress' },
  ]);
  const statusButtonRef = useRef<TouchableOpacity>(null);
  const [statusButtonLayout, setStatusButtonLayout] = useState({ x: 0, y: 0, width: 0, height: 0 });

  // Calculate screen dimensions
  const screenHeight = Dimensions.get('window').height;
  const formMaxHeight = screenHeight * 0.8; // 80% of screen height

  // Initialize these state variables to false to ensure date pickers are hidden by default
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [startButtonLayout, setStartButtonLayout] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [endButtonLayout, setEndButtonLayout] = useState({ x: 0, y: 0, width: 0, height: 0 });
  
  // Add refs for buttons
  const startDateButtonRef = useRef(null);
  const endDateButtonRef = useRef(null);

  useEffect(() => {
    fetchClients();
  }, []);

  useEffect(() => {
    if (job) {
      console.log('Initializing form with job:', job);
      
      // Convert IDs to appropriate types
      const jobId = typeof job.uid === 'number' ? job.uid : Number(job.uid);
      const clientId = typeof job.client_id === 'number' ? job.client_id : Number(job.client_id);
      
      if (isNaN(jobId)) {
        console.warn(`Invalid job uid format: ${job.uid}`);
      }
      
      if (isNaN(clientId)) {
        console.warn(`Invalid client_id format: ${job.client_id}`);
      }
      
      // Set form data with properly typed values
      setFormData({
        uid: jobId,  // Ensure uid is a number
        title: job.title || '',
        description: job.description || '',
        status: job.status || 'pending',
        client_id: clientId, // Ensure client_id is a number
        start_date: job.start_date || null,
        end_date: job.end_date || null,
        start_time: job.start_time || null,
        end_time: job.end_time || null,
      });
    } else {
      // Reset form for new job
      setFormData({
        title: '',
        description: '',
        status: 'pending',
        client_id: 0, // Use 0 instead of empty string or null
        start_date: null,
        end_date: null,
        start_time: null,
        end_time: null,
      });
    }
  }, [job]);

  useEffect(() => {
    if (clients.length > 0 && formData.client_id) {
      console.log('Looking for client with ID:', formData.client_id);
      
      // Convert client_id to string for comparison with client.uid
      const clientIdStr = formData.client_id.toString();
      
      const client = clients.find(c => c.uid === clientIdStr);
        if (client) {
        console.log('Found matching client:', client);
          setSelectedClient(client);
      } else {
        console.warn('NO MATCHING CLIENT FOUND for client_id:', clientIdStr);
        }
      }
  }, [formData.client_id, clients]);

  const fetchClients = async () => {
    try {
      setLoadingClients(true);
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('name');
      
      if (error) {
        console.error('Error fetching clients:', error);
      } else if (data) {
        setClients(data);
        console.log('Fetched clients:', data);
      }
    } catch (error) {
      console.error('Error in fetchClients:', error);
    } finally {
      setLoadingClients(false);
    }
  };

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear error for this field if it exists
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
    
    // Notify parent component of changes
    if (onChange) {
      onChange();
    }
  };

  // Add a completely new and explicit submission handler
  const submitFormToDatabase = () => {
    try {
    if (!formData.title) {
        alert('Please enter a job title');
      return;
    }
    
      if (!formData.client_id) {
        alert('Please select a client');
        return;
      }
      
      console.log('Form data for submission:', formData);
      
      // Ensure client_id is a proper number
      const clientId = typeof formData.client_id === 'number' ? 
        formData.client_id : Number(formData.client_id);
        
      if (isNaN(clientId)) {
        throw new Error(`Invalid client ID format: "${formData.client_id}"`);
      }
      
      // Create a database-safe object with proper types
      const dbObject = {
        title: formData.title,
        description: formData.description,
        status: formData.status,
        client_id: clientId,
        // Use the timezone-adjusted dates directly - they already have the correct date
        start_date: formData.start_date,
        end_date: formData.end_date
      };
      
      // If this is an edit operation and we have a uid, include it
      if (job && job.uid) {
        const jobId = typeof job.uid === 'number' ? job.uid : Number(job.uid);
        if (!isNaN(jobId)) {
          dbObject.uid = jobId;
        }
      }
      
      // Remove any undefined values to avoid "undefined" strings
      Object.keys(dbObject).forEach(key => {
        if (dbObject[key] === undefined) {
          delete dbObject[key];
        }
      });
      
      console.log('Database object for submission:', dbObject);
      
      onSubmit(dbObject);
      return true;
    } catch (error) {
      console.error('Error preparing form data:', error);
      alert(`Error: ${error.message}`);
    }
  };

  const handleSelectClient = (client: Client) => {
    console.log('Selected client:', client);
    setSelectedClient(client);
    
    // Convert client.uid (string) to a number for client_id
    const clientId = Number(client.uid);
    
    if (isNaN(clientId)) {
      console.error('Invalid client ID format:', client.uid);
      alert('Selected client has an invalid ID');
      return;
    }
    
    console.log('Setting client_id to number:', clientId);
    
    setFormData({
      ...formData,
      client_id: clientId // Store as number, not string
    });
    setShowClientMenu(false);
  };

  const handleDateInput = (field: 'start_date' | 'end_date', value: string) => {
    // Basic format validation (MM-DD-YYYY)
    const formattedValue = formatDateInput(value);
    
    setFormData({
      ...formData,
      [field]: formattedValue
    });
    
    // Check for validation errors
    if (formattedValue.length === 10 && !isValidDate(formattedValue)) {
      setErrors({
        ...errors,
        [field]: 'Invalid date format (MM-DD-YYYY)'
      });
    } else {
      // Clear error if it exists
      const updatedErrors = { ...errors };
      delete updatedErrors[field];
      setErrors(updatedErrors);
    }
    
    if (onChange) onChange();
  };

  const handleTimeInput = (field: 'start_time' | 'end_time', value: string) => {
    // Format time as user types
    const formattedValue = formatTime12Hour(value);
    
    setFormData({
      ...formData,
      [field]: formattedValue
    });
    
    if (onChange) onChange();
  };

  const formatTime12Hour = (value: string) => {
    // Remove non-numeric and non-colon characters except A, P, M
    let cleaned = value.replace(/[^0-9:APmapm\s]/g, '');
    
    // Basic time formatting logic
    if (cleaned.length <= 2) {
      // Just hours
      return cleaned;
    } else if (cleaned.length <= 5 && !cleaned.includes(':')) {
      // Format as HH:MM
      const hour = cleaned.substring(0, 2);
      const mins = cleaned.substring(2).padEnd(2, '0');
      cleaned = `${hour}:${mins}`;
    }
    
    // Add AM/PM if not present and we have time
    if (cleaned.length >= 5 && !cleaned.toUpperCase().includes('AM') && !cleaned.toUpperCase().includes('PM')) {
      cleaned += ' AM';
    }
    
    return cleaned;
  };

  const measureClientButton = () => {
    if (clientButtonRef.current) {
      clientButtonRef.current.measure((fx: number, fy: number, width: number, height: number, px: number, py: number) => {
        setClientButtonLayout({ x: px, y: py + height, width, height });
      });
    }
  };

  const measureStatusButton = () => {
    if (statusButtonRef.current) {
      statusButtonRef.current.measure((fx: number, fy: number, width: number, height: number, px: number, py: number) => {
        setStatusButtonLayout({ x: px, y: py, width, height });
      });
    }
  };

  // Scroll to bottom to ensure buttons are visible
  const scrollToBottom = () => {
    if (scrollViewRef.current) {
      scrollViewRef.current.scrollToEnd({ animated: true });
    }
  };

  // Check for any toString() calls on potentially undefined values
  const jobId = job && job.uid ? job.uid.toString() : '';

  const getStatusLabel = (status: string) => {
    const option = statusOptions.find(o => o.value === status);
    return option ? option.label : status;
  };

  // Add new functions to handle date time selection with toggle behavior
  const openStartDatePicker = () => {
    // If already open, close it (toggle behavior)
    if (showStartDatePicker) {
      setShowStartDatePicker(false);
      return;
    }
    
    // Close any other open picker first
    setShowEndDatePicker(false);
    // Then open the start date picker
    setShowStartDatePicker(true);
  };

  const openEndDatePicker = () => {
    // If already open, close it (toggle behavior)
    if (showEndDatePicker) {
      setShowEndDatePicker(false);
      return;
    }
    
    // Close any other open picker first
    setShowStartDatePicker(false);
    // Then open the end date picker
    setShowEndDatePicker(true);
  };

  // Revise the formatDateTimeWithTimezone function to be simpler and more direct
  const formatDateTimeWithTimezone = (dateString: string | null): string => {
    if (!dateString) return '';
    
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return '';
      
      // Get timezone abbreviation (like GMT+05:00)
      const timeZoneOffset = date.getTimezoneOffset();
      const offsetHours = Math.abs(Math.floor(timeZoneOffset / 60));
      const offsetMinutes = Math.abs(timeZoneOffset % 60);
      const timeZoneString = `GMT${timeZoneOffset <= 0 ? '+' : '-'}${offsetHours.toString().padStart(2, '0')}:${offsetMinutes.toString().padStart(2, '0')}`;
      
      // Format date as MM/DD/YYYY
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      const year = date.getFullYear();
      
      // Format time as HH:MM AM/PM
      let hours = date.getHours();
      const minutes = date.getMinutes().toString().padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12; // the hour '0' should be '12'
      const hoursStr = hours.toString().padStart(2, '0');
      
      return `${month}/${day}/${year} ${hoursStr}:${minutes} ${ampm} ${timeZoneString}`;
    } catch (error) {
      console.error('Error formatting date:', error);
      return '';
    }
  };

  // Completely revise the handleDateTimeConfirm function for accurate timezone handling
  const handleDateTimeConfirm = (dateTime: string, mode: 'start' | 'end') => {
    console.log(`Selected ${mode} datetime (ISO):`, dateTime);
    
    // Parse the date string into a Date object
    const selectedDate = new Date(dateTime);
    console.log(`As Date object:`, selectedDate);
    
    // IMPORTANT: Don't adjust for timezone offset when storing
    // Instead, keep the exact date and time the user selected
    
    // Format the date+time for display with timezone info
    const formattedDateTime = formatDateTimeWithTimezone(dateTime);
    console.log(`Formatted for display:`, formattedDateTime);
    
    if (mode === 'start') {
      setFormData({
        ...formData,
        start_date: dateTime, // Store the original ISO string
        start_time: formattedDateTime 
      });
      setShowStartDatePicker(false);
    } else {
      setFormData({
        ...formData,
        end_date: dateTime, // Store the original ISO string
        end_time: formattedDateTime
      });
      setShowEndDatePicker(false);
    }
    
    console.log('Updated form data:', formData);
  };

  return (
        <ScrollView 
      style={{ 
        flex: 1, 
        backgroundColor: '#ffffff',
        height: '100%' // Ensure it takes full height
      }}
      contentContainerStyle={{ paddingBottom: 80 }} // Extra padding at bottom
        >
          <View style={styles.formField}>
            <Text style={styles.label}>Client</Text>
        <View style={{ position: 'relative' }}>
          <TouchableOpacity 
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderWidth: 1,
              borderColor: '#e0e0e0',
              borderRadius: 4,
              padding: 12,
              backgroundColor: '#ffffff',
            }}
                onPress={() => {
              // Get position of the button for positioning the dropdown
              if (clientButtonRef.current) {
                clientButtonRef.current.measure((fx: number, fy: number, width: number, height: number, px: number, py: number) => {
                  setClientButtonLayout({ x: px, y: py, width, height });
                  setShowClientMenu(true);
                });
              } else {
                setShowClientMenu(true);
              }
                }}
            ref={clientButtonRef}
                disabled={submitting || loadingClients}
          >
            <Text>{selectedClient ? selectedClient.name : 'Select Client'}</Text>
            <MaterialIcons name="arrow-drop-down" size={24} color="#000000" />
          </TouchableOpacity>
          
          {showClientMenu && (
            <Portal>
              <View 
                style={{
                  position: 'absolute',
                  top: clientButtonLayout.y + clientButtonLayout.height,
                  left: clientButtonLayout.x,
                  width: clientButtonLayout.width,
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
                  maxHeight: 300,
                }}
              >
                {loadingClients ? (
                  <View style={{ padding: 12, alignItems: 'center' }}>
                    <ActivityIndicator size="small" />
                    <Text style={{ marginTop: 8 }}>Loading clients...</Text>
                  </View>
                ) : clients.length === 0 ? (
                  <View style={{ padding: 12 }}>
                    <Text>No clients found</Text>
                  </View>
                ) : (
                  <ScrollView style={{ maxHeight: 300 }}>
                    {clients.map((client) => (
                      <Pressable
                      key={client.uid}
                        style={({ hovered }) => ({
                          padding: 12,
                          borderBottomWidth: client.uid !== clients[clients.length-1].uid ? 1 : 0,
                          borderBottomColor: '#f0f0f0',
                          backgroundColor: hovered ? '#f5f5f5' : '#ffffff',
                        })}
                        onPress={() => {
                          handleSelectClient(client);
                          setShowClientMenu(false);
                        }}
                      >
                        <Text>{client.name}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                )}
              </View>
              
              {/* Add a transparent overlay to capture touches outside the dropdown */}
              <Pressable
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: 'transparent',
                }}
                onPress={() => setShowClientMenu(false)}
              />
            </Portal>
          )}
            </View>
            {errors.client_id && <HelperText type="error">{errors.client_id}</HelperText>}
          </View>
          
          <View style={styles.formField}>
            <Text style={styles.label}>Title</Text>
            <TextInput
              value={formData.title}
          onChangeText={(text) => handleChange('title', text)}
              style={styles.input}
          mode="outlined"
          outlineColor="#e0e0e0"
          activeOutlineColor="#000000"
            />
            {errors.title && <HelperText type="error">{errors.title}</HelperText>}
          </View>
          
          <View style={styles.formField}>
            <Text style={styles.label}>Description</Text>
            <TextInput
              label=""
              value={formData.description}
              onChangeText={(value) => {
                handleChange('description', value);
                // Scroll to bottom when typing in description to ensure buttons stay visible
                setTimeout(scrollToBottom, 100);
              }}
              multiline
              numberOfLines={5}
              style={[styles.input, { minHeight: 100, textAlignVertical: 'top' }]}
          mode="outlined"
          outlineColor="#e0e0e0"
          activeOutlineColor="#000000"
              disabled={submitting}
            />
          </View>
          
          <View style={styles.formField}>
            <Text style={styles.label}>Status</Text>
        <View style={{ position: 'relative' }}>
          <TouchableOpacity 
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderWidth: 1,
              borderColor: '#e0e0e0',
              borderRadius: 4,
              padding: 12,
              backgroundColor: '#ffffff',
            }}
            onPress={() => {
              // Get position of the button for positioning the dropdown
              if (statusButtonRef.current) {
                statusButtonRef.current.measure((fx: number, fy: number, width: number, height: number, px: number, py: number) => {
                  setStatusButtonLayout({ x: px, y: py, width, height });
                  setShowStatusDropdown(true);
                });
              } else {
                setShowStatusDropdown(true);
              }
            }}
            ref={statusButtonRef}
          >
            <Text>{getStatusLabel(formData.status)}</Text>
            <MaterialIcons name="arrow-drop-down" size={24} color="#000000" />
          </TouchableOpacity>
          
          {showStatusDropdown && (
            <Portal>
              <View 
                style={{
                  position: 'absolute',
                  top: statusButtonLayout.y + statusButtonLayout.height,
                  left: statusButtonLayout.x,
                  width: statusButtonLayout.width,
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
                }}
              >
                {statusOptions.map((option) => (
                  <Pressable
                    key={option.value}
                    style={({ hovered }) => ({
                      padding: 12,
                      borderBottomWidth: option.value !== statusOptions[statusOptions.length-1].value ? 1 : 0,
                      borderBottomColor: '#f0f0f0',
                      backgroundColor: hovered ? '#f5f5f5' : '#ffffff',
                    })}
                    onPress={() => {
                      handleChange('status', option.value);
                      setShowStatusDropdown(false);
                    }}
                  >
                    <Text>{option.label}</Text>
                  </Pressable>
                ))}
              </View>
              
              {/* Add a transparent overlay to capture touches outside the dropdown */}
              <Pressable
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: 'transparent',
                }}
                onPress={() => setShowStatusDropdown(false)}
              />
            </Portal>
          )}
        </View>
          </View>
          
          <View style={styles.formField}>
        <Text style={styles.label}>Start Date & Time</Text>
        <View style={styles.dateTimeContainer}>
                <TouchableOpacity 
                  style={[styles.input, { flex: 2, marginRight: 16, backgroundColor: '#ffffff', justifyContent: 'center', borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 4 }]}
                  onPress={openStartDatePicker}
            disabled={submitting}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 }}>
                    <Text style={{ color: formData.start_date ? '#000000' : '#757575' }}>
                      {formData.start_date ? 
                        formatDateTimeWithTimezone(formData.start_date) : 
                        'MM/DD/YYYY HH:MM AM/PM'}
                    </Text>
                    <MaterialIcons name="calendar-today" size={30} color="#757575" />
                  </View>
                </TouchableOpacity>

        </View>
            
            {/* DateTimePicker for start date (only rendered when showStartDatePicker is true) */}
            {showStartDatePicker ? (
              <View style={dateTimePickerStyles.inlineDatePickerContainer}>
                <DateTimePicker
                  visible={true}
                  onDismiss={() => setShowStartDatePicker(false)}
                  onConfirm={(dateTime) => handleDateTimeConfirm(dateTime, 'start')}
                  initialDate={formData.start_date && formData.start_time ? (() => {
                    try {
                      const dateStr = `${formData.start_date} ${formData.start_time}`;
                      const date = new Date(dateStr);
                      return !isNaN(date.getTime()) ? date.toISOString() : undefined;
                    } catch (e) {
                      console.log('Invalid start date format:', e);
                      return undefined;
                    }
                  })() : undefined}
                  mode="start"
                  position={{ top: 0, right: 0 }}
                />
              </View>
            ) : null}
          </View>
          
          <View style={styles.formField}>
        <Text style={styles.label}>End Date & Time</Text>
        <View style={styles.dateTimeContainer}>
                <TouchableOpacity 
                  style={[styles.input, { flex: 2, marginRight: 16, backgroundColor: '#ffffff', justifyContent: 'center', borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 4 }]}
                  onPress={openEndDatePicker}
            disabled={submitting}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 }}>
                    <Text style={{ color: formData.end_date ? '#000000' : '#757575' }}>
                      {formData.end_date ? 
                        formatDateTimeWithTimezone(formData.end_date) : 
                        'MM/DD/YYYY HH:MM AM/PM'}
                    </Text>
                    <MaterialIcons name="calendar-today" size={30} color="#757575" />
                  </View>
                </TouchableOpacity>

        </View>
            
            {/* DateTimePicker for end date (only rendered when showEndDatePicker is true) */}
            {showEndDatePicker ? (
              <View style={dateTimePickerStyles.inlineDatePickerContainer}>
                <DateTimePicker
                  visible={true}
                  onDismiss={() => setShowEndDatePicker(false)}
                  onConfirm={(dateTime) => handleDateTimeConfirm(dateTime, 'end')}
                  initialDate={formData.end_date && formData.end_time ? (() => {
                    try {
                      const dateStr = `${formData.end_date} ${formData.end_time}`;
                      const date = new Date(dateStr);
                      return !isNaN(date.getTime()) ? date.toISOString() : undefined;
                    } catch (e) {
                      console.log('Invalid end date format:', e);
                      return undefined;
                    }
                  })() : undefined}
                  mode="end"
                  position={{ top: 0, right: 0 }}
                />
              </View>
            ) : null}
          </View>
          
          <View style={[styles.row, { justifyContent: 'flex-end', gap: 8, marginTop: 24, marginBottom: 24 }]}>
            <Button mode="outlined" onPress={onCancel} disabled={submitting}>
              Cancel
            </Button>
            <Button 
              mode="contained" 
              onPress={submitFormToDatabase}
              disabled={submitting}
              loading={submitting}
            >
              Save
            </Button>
          </View>
          
          {submitting && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" />
              <Text style={styles.loadingText}>Saving...</Text>
            </View>
          )}
        </ScrollView>
  );
} 

// Create local styles for the DateTimePicker
const dateTimePickerStyles = StyleSheet.create({
  datePickerContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 16,
    maxHeight: 500,
    width: '100%',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  contentContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  calendarSection: {
    flex: 3,
    marginRight: 12,
  },
  timeSection: {
    flex: 2,
    justifyContent: 'flex-start',
    alignItems: 'stretch',
    borderLeftWidth: 1,
    borderLeftColor: '#e0e0e0',
    paddingLeft: 12,
  },
  timeHeaderText: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  timeColumnLabel: {
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 4,
    color: '#757575',
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
  },
  weekdayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 8,
  },
  weekdayText: {
    width: 32,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  daysContainer: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 4,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    height: 40,
  },
  dayCell: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
  },
  dayText: {
    textAlign: 'center',
  },
  emptyDay: {
    opacity: 0,
  },
  todayDay: {
    backgroundColor: '#e3f2fd',
  },
  todayDayText: {
    fontWeight: 'bold',
    color: '#2196F3',
  },
  selectedDay: {
    backgroundColor: '#2196F3',
  },
  selectedDayText: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
  timePickerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    height: 180,
  },
  timePickerColumn: {
    flex: 1,
    alignItems: 'center',
  },
  timeScrollView: {
    width: '100%',
    height: 120,
  },
  amPmContainer: {
    height: 120,
    justifyContent: 'space-evenly',
  },
  timeOption: {
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    minWidth: 48,
  },
  selectedTimeOption: {
    backgroundColor: '#e3f2fd',
  },
  timeOptionText: {
    fontSize: 16,
  },
  selectedTimeOptionText: {
    color: '#2196F3',
    fontWeight: 'bold',
  },
  dateTimePickerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  dateTimeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 4,
    backgroundColor: '#ffffff',
  },
  dateTimeButtonText: {
    fontSize: 16,
    color: '#333',
  },
  inlineDatePickerContainer: {
    marginTop: 8,
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    overflow: 'hidden',
    zIndex: 999,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  }
}); 