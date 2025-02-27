import { useState, useEffect, useRef } from 'react';
import { View, ScrollView, Dimensions } from 'react-native';
import { TextInput, Button, Card, Text, ActivityIndicator, HelperText, Menu } from 'react-native-paper';
import { styles } from '../styles';
import { supabase } from '../lib/supabase';
import { Client } from '../app/(app)/clients';
import { JobStatusSelector } from './JobStatusSelector';
import { formatDateInput, isValidDate } from '../utils/date';

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
};

export function JobForm({ job, onSubmit, onCancel, submitting = false }: JobFormProps) {
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

  // Scroll to bottom to ensure buttons are visible
  const scrollToBottom = () => {
    if (scrollViewRef.current) {
      scrollViewRef.current.scrollToEnd({ animated: true });
    }
  };

  // Check for any toString() calls on potentially undefined values
  const jobId = job && job.uid ? job.uid.toString() : '';

  return (
    <Card style={[styles.card, { maxHeight: formMaxHeight }]}>
      <Card.Content style={{ flex: 1 }}>
        <ScrollView 
          ref={scrollViewRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 20 }}
          showsVerticalScrollIndicator={true}
          persistentScrollbar={true}
        >
          <View style={styles.formField}>
            <Text style={styles.label}>Client</Text>
            <View>
              <Button
                ref={clientButtonRef}
                mode="outlined"
                onPress={() => {
                  measureClientButton();
                  setShowClientMenu(true);
                }}
                disabled={submitting || loadingClients}
                style={styles.input}
                icon="account"
              >
                {selectedClient ? selectedClient.name : 'Select Client'}
              </Button>
              
              <Menu
                visible={showClientMenu}
                onDismiss={() => setShowClientMenu(false)}
                anchor={clientButtonLayout}
                style={{ width: clientButtonLayout.width || 300, maxHeight: 300 }}
              >
                {loadingClients ? (
                  <Menu.Item title="Loading clients..." disabled />
                ) : clients.length === 0 ? (
                  <Menu.Item title="No clients found" disabled />
                ) : (
                  clients.map(client => (
                    <Menu.Item
                      key={client.uid}
                      title={client.name}
                      onPress={() => handleSelectClient(client)}
                    />
                  ))
                )}
              </Menu>
            </View>
            {errors.client_id && <HelperText type="error">{errors.client_id}</HelperText>}
          </View>
          
          <View style={styles.formField}>
            <Text style={styles.label}>Title</Text>
            <TextInput
              value={formData.title}
              onChangeText={(value) => handleChange('title', value)}
              placeholder="Job Title"
              style={styles.input}
              disabled={submitting}
            />
            {errors.title && <HelperText type="error">{errors.title}</HelperText>}
          </View>
          
          <View style={styles.formField}>
            <Text style={styles.label}>Description</Text>
            <TextInput
              value={formData.description}
              onChangeText={(value) => {
                handleChange('description', value);
                // Scroll to bottom when typing in description to ensure buttons stay visible
                setTimeout(scrollToBottom, 100);
              }}
              placeholder="Job Description"
              multiline
              numberOfLines={5}
              style={[styles.input, { minHeight: 100, textAlignVertical: 'top' }]}
              disabled={submitting}
            />
          </View>
          
          <View style={styles.formField}>
            <Text style={styles.label}>Status</Text>
            <JobStatusSelector
              status={formData.status}
              onStatusChange={(status) => handleChange('status', status)}
              disabled={submitting}
            />
          </View>
          
          <View style={styles.formField}>
            <Text style={styles.label}>Start Date & Time</Text>
            <View style={styles.dateTimeContainer}>
              <TextInput
                value={formData.start_date || ''}
                onChangeText={(value) => handleDateInput('start_date', value)}
                placeholder="MM-DD-YYYY"
                style={[styles.input, { flex: 2 }]}
                maxLength={10}
                keyboardType="numeric"
                disabled={submitting}
              />
              <TextInput
                value={formData.start_time || ''}
                onChangeText={(value) => handleTimeInput('start_time', value)}
                placeholder="HH:MM AM/PM"
                style={[styles.input, { flex: 1, marginLeft: 8 }]}
                maxLength={8}
                keyboardType="numeric"
                disabled={submitting}
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
                style={[styles.input, { flex: 2 }]}
                maxLength={10}
                keyboardType="numeric"
                disabled={submitting}
              />
              <TextInput
                value={formData.end_time || ''}
                onChangeText={(value) => handleTimeInput('end_time', value)}
                placeholder="HH:MM AM/PM"
                style={[styles.input, { flex: 1, marginLeft: 8 }]}
                maxLength={8}
                keyboardType="numeric"
                disabled={submitting}
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
      </Card.Content>
    </Card>
  );
} 