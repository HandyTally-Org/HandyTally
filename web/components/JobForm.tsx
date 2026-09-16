import { forwardRef, useImperativeHandle, useState, useEffect, useRef } from 'react';
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
import { DateTimePickerDialog, formatDateTimeLabel } from './DateTimePickerDialog';
import { useAuth } from '../contexts/AuthContext';
import { useOrganizationMembers } from '../hooks/useOrganizationMembers';
import { memberDisplayName, assigneeLabel } from '../utils/inviteUser';

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
  // HT-35: user id of the organisation member the job is assigned to.
  assigned_to: string | null;
};

export type JobFormDefaults = Partial<Pick<Job, 'start_date' | 'end_date'>>;

/** What a parent can ask of the form through a ref. */
export type JobFormHandle = { submit: () => void };

type JobFormProps = {
  job?: Job | null;
  // Start/end to prefill when creating a job (e.g. from a calendar cell).
  // Ignored while editing an existing job.
  defaults?: JobFormDefaults;
  onSubmit: (job: any) => void;
  onCancel: () => void;
  submitting?: boolean;
  onChange?: () => void;
  /** Inside a FormDialog: no scroll wrapper of its own and no buttons; the dialog footer submits through the ref. */
  embedded?: boolean;
};

export const JobForm = forwardRef<JobFormHandle, JobFormProps>(function JobForm(
  { job, defaults, onSubmit, onCancel, submitting = false, onChange, embedded = false },
  ref
) {
  const [formData, setFormData] = useState<Omit<Job, 'uid'>>({
    client_id: job?.client_id || 0,  // Always ensure client_id exists
    title: job?.title || '',
    description: job?.description || '',
    status: job?.status || 'pending',
    start_date: job?.start_date || defaults?.start_date || null,
    end_date: job?.end_date || defaults?.end_date || null,
    start_time: job?.start_time || null,
    end_time: job?.end_time || null,
    assigned_to: job?.assigned_to || null,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  // HT-35: the Assigned to dropdown lists the active members of the caller's
  // organisation. A user with no organisation sees it disabled.
  const { organization } = useAuth();
  const { members, loading: loadingMembers } = useOrganizationMembers();
  const [showAssigneeDropdown, setShowAssigneeDropdown] = useState(false);
  const assigneeButtonRef = useRef<TouchableOpacity>(null);
  const [assigneeButtonLayout, setAssigneeButtonLayout] = useState({ x: 0, y: 0, width: 0, height: 0 });
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
        assigned_to: job.assigned_to || null,
      });
    } else {
      // Reset form for new job
      setFormData({
        title: '',
        description: '',
        status: 'pending',
        client_id: 0, // Use 0 instead of empty string or null
        start_date: defaults?.start_date || null,
        end_date: defaults?.end_date || null,
        start_time: null,
        end_time: null,
        assigned_to: null,
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
        end_date: formData.end_date,
        assigned_to: formData.assigned_to || null,
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

  // The dialog hands back an ISO string; keep it as-is and cache a readable label.
  const handleDateTimeConfirm = (dateTime: string, mode: 'start' | 'end') => {
    const label = formatDateTimeLabel(dateTime);
    if (mode === 'start') {
      setFormData(prev => ({ ...prev, start_date: dateTime, start_time: label }));
      setShowStartDatePicker(false);
    } else {
      setFormData(prev => ({ ...prev, end_date: dateTime, end_time: label }));
      setShowEndDatePicker(false);
    }
    if (onChange) onChange();
  };

  const clearDateTime = (mode: 'start' | 'end') => {
    if (mode === 'start') {
      setFormData(prev => ({ ...prev, start_date: null, start_time: null }));
    } else {
      setFormData(prev => ({ ...prev, end_date: null, end_time: null }));
    }
    if (onChange) onChange();
  };

  // When the end has not been set yet, open its picker one hour after the start.
  const endPickerFallback = (() => {
    if (!formData.start_date) return null;
    const start = new Date(formData.start_date);
    if (isNaN(start.getTime())) return null;
    return new Date(start.getTime() + 60 * 60 * 1000).toISOString();
  })();

  const endBeforeStart = (() => {
    if (!formData.start_date || !formData.end_date) return false;
    const start = new Date(formData.start_date).getTime();
    const end = new Date(formData.end_date).getTime();
    return !isNaN(start) && !isNaN(end) && end < start;
  })();

  const renderDateTimeField = (mode: 'start' | 'end', value: string | null, onPress: () => void) => (
    <TouchableOpacity
      style={[fieldStyles.field, submitting && fieldStyles.fieldDisabled]}
      onPress={onPress}
      disabled={submitting}
      accessibilityRole="button"
    >
      <MaterialIcons name="event" size={20} color="#6B7280" style={fieldStyles.fieldIcon} />
      <Text style={value ? fieldStyles.fieldText : fieldStyles.fieldPlaceholder}>
        {value
          ? formatDateTimeLabel(value)
          : mode === 'start' ? 'Pick a start date and time' : 'Pick an end date and time'}
      </Text>
      {value ? (
        <IconButton
          icon="close-circle"
          size={18}
          iconColor="#9CA3AF"
          style={fieldStyles.clearButton}
          onPress={() => clearDateTime(mode)}
          disabled={submitting}
          accessibilityLabel="Clear"
        />
      ) : null}
    </TouchableOpacity>
  );

  useImperativeHandle(ref, () => ({ submit: submitFormToDatabase }));

  // Inside a dialog the FormDialog scrolls; on its own the form scrolls itself.
  const Wrapper: any = embedded ? View : ScrollView;
  const wrapperProps = embedded
    ? {}
    : { style: { flex: 1, backgroundColor: '#ffffff', height: '100%' }, contentContainerStyle: { paddingBottom: 80 } };

  return (
    <Wrapper {...wrapperProps}>
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

          {/* HT-35: Assigned to. Same anchored-Portal pattern as Client and Status. */}
          <View style={styles.formField}>
            <Text style={styles.label}>Assigned to</Text>
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
              opacity: !organization || submitting ? 0.6 : 1,
            }}
            onPress={() => {
              if (assigneeButtonRef.current) {
                assigneeButtonRef.current.measure((fx: number, fy: number, width: number, height: number, px: number, py: number) => {
                  setAssigneeButtonLayout({ x: px, y: py, width, height });
                  setShowAssigneeDropdown(true);
                });
              } else {
                setShowAssigneeDropdown(true);
              }
            }}
            ref={assigneeButtonRef}
            disabled={!organization || submitting || loadingMembers}
            accessibilityRole="button"
            accessibilityLabel="Assigned to"
          >
            <Text>
              {!organization
                ? 'Join an organisation to assign jobs'
                : loadingMembers
                  ? 'Loading users...'
                  : assigneeLabel(formData.assigned_to, members)}
            </Text>
            <MaterialIcons name="arrow-drop-down" size={24} color="#000000" />
          </TouchableOpacity>

          {showAssigneeDropdown && (
            <Portal>
              <View
                style={{
                  position: 'absolute',
                  top: assigneeButtonLayout.y + assigneeButtonLayout.height,
                  left: assigneeButtonLayout.x,
                  width: assigneeButtonLayout.width,
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
                <ScrollView style={{ maxHeight: 300 }}>
                  {[{ user_id: null as string | null, label: 'Unassigned' }]
                    .concat(
                      members
                        .filter(m => m.is_active)
                        .map(m => ({ user_id: m.user_id as string | null, label: memberDisplayName(m) })),
                    )
                    .map((option, index, all) => (
                      <Pressable
                        key={option.user_id ?? 'unassigned'}
                        style={({ hovered }) => ({
                          padding: 12,
                          borderBottomWidth: index < all.length - 1 ? 1 : 0,
                          borderBottomColor: '#f0f0f0',
                          backgroundColor: hovered
                            ? '#f5f5f5'
                            : option.user_id === formData.assigned_to ? '#f0f0f0' : '#ffffff',
                        })}
                        onPress={() => {
                          handleChange('assigned_to', option.user_id);
                          setShowAssigneeDropdown(false);
                        }}
                      >
                        <Text style={option.user_id ? undefined : { color: '#6B7280' }}>{option.label}</Text>
                      </Pressable>
                    ))}
                  {members.filter(m => m.is_active).length === 0 ? (
                    <View style={{ padding: 12 }}>
                      <Text style={{ color: '#6B7280' }}>No active users in your organisation</Text>
                    </View>
                  ) : null}
                </ScrollView>
              </View>

              {/* Transparent overlay to close the dropdown on an outside press */}
              <Pressable
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: 'transparent',
                }}
                onPress={() => setShowAssigneeDropdown(false)}
              />
            </Portal>
          )}
        </View>
          </View>

          <View style={styles.formField}>
            <Text style={styles.label}>Start Date & Time</Text>
            {renderDateTimeField('start', formData.start_date, () => setShowStartDatePicker(true))}
          </View>

          <View style={styles.formField}>
            <Text style={styles.label}>End Date & Time</Text>
            {renderDateTimeField('end', formData.end_date, () => setShowEndDatePicker(true))}
            {endBeforeStart ? (
              <HelperText type="error" visible>
                The end is before the start.
              </HelperText>
            ) : null}
          </View>

          <DateTimePickerDialog
            visible={showStartDatePicker}
            title="Start date & time"
            value={formData.start_date}
            onDismiss={() => setShowStartDatePicker(false)}
            onConfirm={(iso) => handleDateTimeConfirm(iso, 'start')}
          />
          <DateTimePickerDialog
            visible={showEndDatePicker}
            title="End date & time"
            value={formData.end_date}
            fallback={endPickerFallback}
            onDismiss={() => setShowEndDatePicker(false)}
            onConfirm={(iso) => handleDateTimeConfirm(iso, 'end')}
          />
          
          {!embedded && (
          <>
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
          </>
          )}
    </Wrapper>
  );
});



// Styles for the date & time trigger fields; the popup itself lives in DateTimePickerDialog.
const fieldStyles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingLeft: 12,
    paddingRight: 4,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    backgroundColor: '#ffffff',
  },
  fieldDisabled: {
    opacity: 0.6,
  },
  fieldIcon: {
    marginRight: 10,
  },
  fieldText: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
  },
  fieldPlaceholder: {
    flex: 1,
    fontSize: 15,
    color: '#9CA3AF',
  },
  clearButton: {
    margin: 0,
  },
});
