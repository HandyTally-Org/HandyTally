import { useState, useEffect } from 'react';
import { View } from 'react-native';
import { TextInput, Button, Card, Text } from 'react-native-paper';
import { styles } from '../styles';
import { Service } from '../app/(app)/services';

type ServiceFormProps = {
  service?: Service | null;
  onSubmit: (service: Omit<Service, 'id'>) => void;
  onCancel: () => void;
};

export function ServiceForm({ service, onSubmit, onCancel }: ServiceFormProps) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    rate: '',
    unit: 'hour',
    category: '',
    is_active: true
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (service) {
      setFormData({
        name: service.name || '',
        description: service.description || '',
        rate: service.rate?.toString() || '',
        unit: service.unit || 'hour',
        category: service.category || '',
        is_active: service.is_active !== false // Default to true if not explicitly false
      });
    }
  }, [service]);

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
      newErrors.name = 'Service name is required';
    }
    
    if (!formData.rate.trim()) {
      newErrors.rate = 'Rate is required';
    } else if (isNaN(parseFloat(formData.rate))) {
      newErrors.rate = 'Rate must be a number';
    }
    
    if (!formData.unit.trim()) {
      newErrors.unit = 'Unit is required';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    // Validate form
    const newErrors: Record<string, string> = {};
    
    if (!formData.name || (typeof formData.name === 'string' && !formData.name.trim())) {
      newErrors.name = 'Name is required';
    }
    
    if (!formData.rate) {
      newErrors.rate = 'Rate is required';
    }
    
    // Check if unit is a string before calling trim()
    if (!formData.unit || (typeof formData.unit === 'string' && !formData.unit.trim())) {
      newErrors.unit = 'Unit is required';
    }
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    
    // Make sure rate is a number
    const submissionData = {
      ...formData,
      rate: typeof formData.rate === 'string' ? parseFloat(formData.rate) : formData.rate
    };
    
    onSubmit(submissionData);
  };

  return (
    <Card style={styles.card}>
      <Card.Title title={service ? "Edit Service" : "Add New Service"} />
      <Card.Content>
        <TextInput
          label="Service Name *"
          value={formData.name}
          onChangeText={(value) => handleChange('name', value)}
          style={styles.input}
          error={!!errors.name}
        />
        {errors.name && <Text style={styles.error}>{errors.name}</Text>}
        
        <TextInput
          label="Description"
          value={formData.description}
          onChangeText={(value) => handleChange('description', value)}
          multiline
          style={styles.input}
        />
        
        <View style={[styles.row, { gap: 8 }]}>
          <View style={{ flex: 1 }}>
            <TextInput
              label="Rate *"
              value={formData.rate}
              onChangeText={(value) => handleChange('rate', value)}
              keyboardType="numeric"
              style={styles.input}
              error={!!errors.rate}
              left={<TextInput.Affix text="$" />}
            />
            {errors.rate && <Text style={styles.error}>{errors.rate}</Text>}
          </View>
          
          <View style={{ flex: 1 }}>
            <TextInput
              label="Unit *"
              value={formData.unit}
              onChangeText={(value) => handleChange('unit', value)}
              placeholder="hour, day, etc."
              style={styles.input}
              error={!!errors.unit}
            />
            {errors.unit && <Text style={styles.error}>{errors.unit}</Text>}
          </View>
        </View>
        
        <TextInput
          label="Category"
          value={formData.category}
          onChangeText={(value) => handleChange('category', value)}
          placeholder="e.g., Plumbing, Electrical"
          style={styles.input}
        />
        
        <View style={[styles.row, { justifyContent: 'flex-end', gap: 8, marginTop: 16 }]}>
          <Button mode="outlined" onPress={onCancel}>
            Cancel
          </Button>
          <Button mode="contained" onPress={handleSubmit}>
            Save
          </Button>
        </View>
      </Card.Content>
    </Card>
  );
} 