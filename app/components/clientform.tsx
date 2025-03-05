import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { TextInput, Button, Card, Text, ActivityIndicator } from 'react-native-paper';

type Client = {
  uid: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
};

type ClientFormProps = {
  client?: Client | null;
  onSubmit: (client: Omit<Client, 'uid'>) => void;
  onCancel: () => void;
  submitting?: boolean;
};

export function ClientForm({ client, onSubmit, onCancel, submitting = false }: ClientFormProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    notes: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (client) {
      setFormData({
        name: client.name || '',
        email: client.email || '',
        phone: client.phone || '',
        address: client.address || '',
        notes: client.notes || '',
      });
    }
  }, [client]);

  const handleChange = (field: keyof typeof formData, value: string) => {
    setFormData({ ...formData, [field]: value });
    // Clear error when field is edited
    if (errors[field]) {
      setErrors({ ...errors, [field]: '' });
    }
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }
    
    if (formData.email && !/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (validate()) {
      // Ensure all fields are strings (not undefined)
      const safeFormData = {
        name: formData.name || '',
        email: formData.email || '',
        phone: formData.phone || '',
        address: formData.address || '',
        notes: formData.notes || ''
      };
      
      console.log('Form data being submitted:', safeFormData);
      onSubmit(safeFormData);
    }
  };

  return (
    <Card style={{ backgroundColor: '#ffffff' }}>
      <Card.Title title={client ? "Edit Client" : "Add New Client"} />
      <Card.Content style={{ backgroundColor: '#ffffff' }}>
        <TextInput
          label="Name *"
          value={formData.name}
          onChangeText={(value) => handleChange('name', value)}
          style={styles.input}
          error={!!errors.name}
          disabled={submitting}
        />
        {errors.name && <Text style={styles.error}>{errors.name}</Text>}
        
        <TextInput
          label="Email"
          value={formData.email}
          onChangeText={(value) => handleChange('email', value)}
          keyboardType="email-address"
          style={styles.input}
          error={!!errors.email}
          disabled={submitting}
        />
        {errors.email && <Text style={styles.error}>{errors.email}</Text>}
        
        <TextInput
          label="Phone"
          value={formData.phone}
          onChangeText={(value) => handleChange('phone', value)}
          keyboardType="phone-pad"
          style={styles.input}
          disabled={submitting}
        />
        
        <TextInput
          label="Address"
          value={formData.address}
          onChangeText={(value) => handleChange('address', value)}
          multiline
          style={styles.input}
          disabled={submitting}
        />
        
        <TextInput
          label="Notes"
          value={formData.notes}
          onChangeText={(value) => handleChange('notes', value)}
          multiline
          style={styles.input}
          disabled={submitting}
        />
        
        <View style={styles.buttonContainer}>
          <Button 
            mode="outlined" 
            onPress={onCancel} 
            disabled={submitting}
            style={styles.button}
          >
            Cancel
          </Button>
          <Button 
            mode="contained" 
            onPress={handleSubmit} 
            disabled={submitting}
            loading={submitting}
            style={styles.button}
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
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  input: {
    marginBottom: 16,
    backgroundColor: '#ffffff',
  },
  error: {
    color: 'red',
    marginTop: -12,
    marginBottom: 8,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 16,
  },
  button: {
    minWidth: 100,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  loadingText: {
    marginLeft: 8,
  },
  row: {
    flexDirection: 'row',
  }
}); 