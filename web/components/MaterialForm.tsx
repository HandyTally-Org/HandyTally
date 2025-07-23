import { useState, useEffect } from 'react';
import { View } from 'react-native';
import { TextInput, Button, Card, Text } from 'react-native-paper';
import { styles } from '../styles';
import { Material } from '../app/(app)/materials';

type MaterialFormProps = {
  material?: Material | null;
  onSubmit: (material: Omit<Material, 'uid'>) => void;
  onCancel: () => void;
  submitting: boolean;
};

export function MaterialForm({ material, onSubmit, onCancel, submitting }: MaterialFormProps) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    cost: '',
    unit: '',
    quantity: '0',
    category: '',
    supplier: '',
    supplier_id: '',
    is_active: true
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (material) {
      setFormData({
        name: material.name || '',
        description: material.description || '',
        cost: material.cost?.toString() || '',
        unit: material.unit || '',
        quantity: material.quantity?.toString() || '0',
        category: material.category || '',
        supplier: material.supplier || '',
        supplier_id: material.supplier_id || '',
        is_active: material.is_active !== false
      });
    }
  }, [material]);

  const handleChange = (field: keyof typeof formData, value: string) => {
    setFormData({ ...formData, [field]: value });
    // Clear error when field is edited
    if (errors[field]) {
      setErrors({ ...errors, [field]: '' });
    }
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.name || (typeof formData.name === 'string' && !formData.name.trim())) {
      newErrors.name = 'Name is required';
    }
    
    if (!formData.cost) {
      newErrors.cost = 'Cost is required';
    }
    
    if (!formData.unit || (typeof formData.unit === 'string' && !formData.unit.trim())) {
      newErrors.unit = 'Unit is required';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    console.log('Save button clicked');
    console.log('Current form data:', formData);
    
    // Basic validation with better logging
    if (!formData.name || typeof formData.name !== 'string' || !formData.name.trim()) {
      console.log('Name validation failed:', formData.name);
      alert('Name is required');
      return;
    }
    
    if (!formData.cost) {
      console.log('Cost validation failed:', formData.cost);
      alert('Unit price is required');
      return;
    }
    
    // Check if unit exists and is not empty, with better logging
    console.log('Unit value:', formData.unit, 'Type:', typeof formData.unit);
    if (!formData.unit) {
      console.log('Unit is empty or null');
      alert('Unit is required');
      return;
    }
    
    // Prepare data with only the essential fields
    const submissionData = {
      name: typeof formData.name === 'string' ? formData.name.trim() : String(formData.name),
      description: formData.description ? String(formData.description) : '',
      cost: parseFloat(String(formData.cost || '0')),
      unit: String(formData.unit || ''),
      quantity: formData.quantity ? parseFloat(String(formData.quantity)) : 0,
      category: String(formData.category || ''),
      supplier: String(formData.supplier || ''),
      ...(formData.supplier_id ? { supplier_id: String(formData.supplier_id) } : {}),
      is_active: true
    };
    
    console.log('Submitting material:', submissionData);
    
    // Call the onSubmit prop
    onSubmit(submissionData);
  };

  return (
    <Card style={styles.card}>
      <Card.Title title={material ? "Edit Material" : "Add New Material"} />
      <Card.Content>
        <TextInput
          label="Material Name *"
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
              label="Unit Price *"
              value={formData.cost}
              onChangeText={(value) => handleChange('cost', value)}
              keyboardType="numeric"
              style={styles.input}
              error={!!errors.cost}
              left={<TextInput.Affix text="$" />}
            />
            {errors.cost && <Text style={styles.error}>{errors.cost}</Text>}
          </View>
          
          <View style={{ flex: 1 }}>
            <TextInput
              label="Unit *"
              value={formData.unit}
              onChangeText={(value) => handleChange('unit', value)}
              placeholder="each, hour, etc."
              style={styles.input}
              error={!!errors.unit}
            />
            {errors.unit && <Text style={styles.error}>{errors.unit}</Text>}
          </View>
        </View>
        
        <TextInput
          label="Quantity"
          value={formData.quantity}
          onChangeText={(value) => handleChange('quantity', value)}
          keyboardType="numeric"
          style={styles.input}
          placeholder="0"
        />
        
        <TextInput
          label="Category"
          value={formData.category}
          onChangeText={(value) => handleChange('category', value)}
          placeholder="e.g., Lumber, Hardware"
          style={styles.input}
        />
        
        <TextInput
          label="Supplier"
          value={formData.supplier}
          onChangeText={(value) => handleChange('supplier', value)}
          style={styles.input}
        />
        
        <View style={[styles.row, { justifyContent: 'flex-end', gap: 8, marginTop: 16 }]}>
          <Button 
            mode="outlined" 
            onPress={onCancel}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button 
            mode="contained" 
            onPress={handleSubmit}
            disabled={submitting}
          >
            Save
          </Button>
        </View>
      </Card.Content>
    </Card>
  );
} 