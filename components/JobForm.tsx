import { useState, useEffect, useRef } from 'react';
import { View, ScrollView, Dimensions, StyleSheet, TouchableOpacity, Pressable } from 'react-native';
import { TextInput, Button, Card, Text, ActivityIndicator, HelperText, Menu, Portal } from 'react-native-paper';
import { styles } from '../styles';
import { supabase } from '../lib/supabase';
import { Client } from '../app/(app)/clients';
import { JobStatusSelector } from './JobStatusSelector';
import { formatDateInput, isValidDate } from '../utils/date';
import { MaterialIcons } from '@expo/vector-icons';

type Job = {
  uid: string;
  client_id: string;
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
  onSubmit: (job: Omit<Job, 'uid' | 'client'>) => void;
  onCancel: () => void;
  submitting?: boolean;
  onChange?: () => void;
};

export function JobForm({ job, onSubmit, onCancel, submitting = false, onChange }: JobFormProps) {
  const [formData, setFormData] = useState<Omit<Job, 'uid' | 'client'>>({
    client_id: '',
    title: '',
    description: '',
    status: 'pending',
    start_date: null,
    end_date: null,
    start_time: null,
    end_time: null,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [clients, setClients] = useState<Client[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [showClientMenu, setShowClientMenu] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [clientButtonLayout, setClientButtonLayout] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const clientButtonRef = useRef(null);
  const scrollViewRef = useRef(null);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [statusOptions, setStatusOptions] = useState([
    { value: 'pending', label: 'Pending' },
    { value: 'completed', label: 'Completed' },
    { value: 'in_progress', label: 'In Progress' },
  ]);
  const statusButtonRef = useRef(null);
  const [statusButtonLayout, setStatusButtonLayout] = useState({ x: 0, y: 0, width: 0, height: 0 });

  // Calculate screen dimensions
  const screenHeight = Dimensions.get('window').height;
  const formMaxHeight = screenHeight * 0.8; // 80% of screen height

  useEffect(() => {
    fetchClients();
  }, []);

  useEffect(() => {
    if (job) {
      console.log('Job data received:', job);
      console.log('Start date:', job.start_date, 'type:', typeof job.start_date);
      console.log('End date:', job.end_date, 'type:', typeof job.end_date);
      
      setFormData({
        client_id: job.client_id || '',
        title: job.title || '',
        description: job.description || '',
        status: job.status || 'pending',
        start_date: job.start_date || null,
        end_date: job.end_date || null,
        start_time: job.start_time || null,
        end_time: job.end_time || null,
      });
      
      console.log('Form data after set:', formData);
      
      // Find the selected client
      if (job.client_id && clients.length > 0) {
        const client = clients.find(c => c.uid === job.client_id);
        if (client) {
          setSelectedClient(client);
        }
      }
    }
  }, [job, clients]);

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

  const handleSubmit = () => {
    console.log('Submitting job data:', formData);
    
    // Make sure the job has a name
    if (!formData.title) {
      alert('Job title is required');
      return;
    }
    
    // Call the onSubmit prop
    onSubmit(formData);
  };

  const handleSelectClient = (client: Client) => {
    if (!client) return;
    
    setSelectedClient(client);
    handleChange('client_id', client.uid);
    setShowClientMenu(false);
  };

  const handleDateInput = (field: 'start_date' | 'end_date', value: string) => {
    // Remove any non-numeric characters first
    const numericValue = value.replace(/\D/g, '');
    
    // Format the date with dashes
    let formattedDate = numericValue;
    if (numericValue.length > 2) {
      formattedDate = numericValue.slice(0, 2) + '-' + numericValue.slice(2);
    }
    if (numericValue.length > 4) {
      formattedDate = formattedDate.slice(0, 5) + '-' + numericValue.slice(4);
    }

    // Update the form data
    handleChange(field, formattedDate || null);
  };

  const formatTime12Hour = (value: string) => {
    // Remove any non-numeric characters
    const numbers = value.replace(/\D/g, '');
    
    // Format as user types
    if (numbers.length <= 2) {
      return numbers;
    }
    if (numbers.length <= 4) {
      return `${numbers.slice(0, 2)}:${numbers.slice(2)}`;
    }
    
    // Get hours and minutes
    let hours = parseInt(numbers.slice(0, 2));
    const minutes = numbers.slice(2, 4);
    
    // Convert to 12-hour format
    const isPM = hours >= 12;
    if (hours > 12) hours -= 12;
    if (hours === 0) hours = 12;
    
    return `${String(hours).padStart(2, '0')}:${minutes} ${isPM ? 'PM' : 'AM'}`;
  };

  const handleTimeInput = (field: 'start_time' | 'end_time', value: string) => {
    // Allow direct editing of the formatted time
    if (value.includes(':') || value.includes('AM') || value.includes('PM')) {
      handleChange(field, value);
      return;
    }
    
    // Format new numeric input
    const formatted = formatTime12Hour(value);
    handleChange(field, formatted);
  };

  const measureClientButton = () => {
    if (clientButtonRef.current) {
      clientButtonRef.current.measure((x, y, width, height, pageX, pageY) => {
        setClientButtonLayout({ x: pageX, y: pageY + height, width, height });
      });
    }
  };

  const measureStatusButton = () => {
    if (statusButtonRef.current) {
      statusButtonRef.current.measure((x, y, width, height, pageX, pageY) => {
        setStatusButtonLayout({ x: pageX, y: pageY, width, height });
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
                clientButtonRef.current.measure((x, y, width, height, pageX, pageY) => {
                  setClientButtonLayout({ x: pageX, y: pageY, width, height });
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
          backgroundColor="#ffffff"
            />
            {errors.title && <HelperText type="error">{errors.title}</HelperText>}
          </View>
          
          <View style={styles.formField}>
            <Text style={styles.label}>Description</Text>
            <TextInput
          label="Job Description"
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
          backgroundColor="#ffffff"
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
                statusButtonRef.current.measure((x, y, width, height, pageX, pageY) => {
                  setStatusButtonLayout({ x: pageX, y: pageY, width, height });
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
            <TextInput
              value={formData.start_date || ''}
              onChangeText={(value) => handleDateInput('start_date', value)}
            placeholder="MM-DD-YYYY"
            style={[styles.input, { flex: 2, marginRight: 16, backgroundColor: '#ffffff' }]}
            maxLength={10}
            keyboardType="numeric"
            disabled={submitting}
            mode="outlined"
            outlineColor="#e0e0e0"
            activeOutlineColor="#000000"
          />
          <TextInput
            value={formData.start_time || ''}
            onChangeText={(value) => handleTimeInput('start_time', value)}
            placeholder="HH:MM AM/PM"
            style={[styles.input, { flex: 1, marginLeft: 8, marginRight: 16, backgroundColor: '#ffffff' }]}
            maxLength={8}
            keyboardType="numeric"
              disabled={submitting}
            mode="outlined"
            outlineColor="#e0e0e0"
            activeOutlineColor="#000000"
            />
        </View>
          </View>
          
          <View style={styles.formField}>
        <Text style={styles.label}>End Date & Time</Text>
        <View style={styles.dateTimeContainer}>
            <TextInput
              value={formData.end_date || ''}
              onChangeText={(value) => handleDateInput('end_date', value)}
            placeholder="MM-DD-YYYY"
            style={[styles.input, { flex: 2, marginRight: 16, backgroundColor: '#ffffff' }]}
            maxLength={10}
            keyboardType="numeric"
            disabled={submitting}
            mode="outlined"
            outlineColor="#e0e0e0"
            activeOutlineColor="#000000"
          />
          <TextInput
            value={formData.end_time || ''}
            onChangeText={(value) => handleTimeInput('end_time', value)}
            placeholder="HH:MM AM/PM"
            style={[styles.input, { flex: 1, marginLeft: 8, marginRight: 16, backgroundColor: '#ffffff' }]}
            maxLength={8}
            keyboardType="numeric"
              disabled={submitting}
            mode="outlined"
            outlineColor="#e0e0e0"
            activeOutlineColor="#000000"
            />
        </View>
          </View>
          
          <View style={[styles.row, { justifyContent: 'flex-end', gap: 8, marginTop: 24, marginBottom: 24 }]}>
            <Button mode="outlined" onPress={onCancel} disabled={submitting}>
              Cancel
            </Button>
            <Button 
              mode="contained" 
              onPress={handleSubmit} 
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