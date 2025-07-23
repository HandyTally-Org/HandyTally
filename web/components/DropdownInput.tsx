import React, { useState, useEffect } from 'react';
import { View, ScrollView, Modal, TouchableOpacity, StyleSheet } from 'react-native';
import { Button, Text, List, Surface } from 'react-native-paper';
import { styles } from '../styles';

type DropdownInputProps = {
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onSelect: (value: string) => void;
  placeholder?: string;
  error?: string;
};

export function DropdownInput({ 
  label, 
  value, 
  options, 
  onSelect, 
  placeholder = 'Select an option',
  error
}: DropdownInputProps) {
  const [visible, setVisible] = useState(false);
  
  // Log the options to see what's available
  useEffect(() => {
    console.log(`DropdownInput ${label} options:`, options);
  }, [options, label]);
  
  const selectedOption = options.find(option => option.value === value);
  console.log(`DropdownInput ${label} selected:`, selectedOption);
  
  return (
    <View style={styles.input}>
      <Text>{label}</Text>
      <Button 
        mode="outlined" 
        onPress={() => setVisible(true)}
        style={{ width: '100%', justifyContent: 'flex-start', marginTop: 4 }}
      >
        {selectedOption ? selectedOption.label : placeholder}
      </Button>
      
      <Modal
        visible={visible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <TouchableOpacity 
          style={dropdownStyles.modalOverlay} 
          activeOpacity={1} 
          onPress={() => setVisible(false)}
        >
          <Surface style={dropdownStyles.modalContent} elevation={4}>
            <Text style={dropdownStyles.modalTitle}>{label}</Text>
            
            <ScrollView style={dropdownStyles.optionsList}>
              {options.length === 0 ? (
                <List.Item 
                  title="No options available" 
                  disabled 
                  style={dropdownStyles.listItem}
                />
              ) : (
                options.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    onPress={() => {
                      console.log(`Selected ${label} option:`, option);
                      onSelect(option.value);
                      setVisible(false);
                    }}
                  >
                    <List.Item 
                      title={option.label}
                      style={dropdownStyles.listItem}
                    />
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
            
            <Button 
              mode="text" 
              onPress={() => setVisible(false)}
              style={dropdownStyles.closeButton}
            >
              Close
            </Button>
          </Surface>
        </TouchableOpacity>
      </Modal>
      
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const dropdownStyles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: 20,
  },
  modalContent: {
    width: '90%',
    maxHeight: '80%',
    borderRadius: 8,
    padding: 16,
    backgroundColor: 'white',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  optionsList: {
    maxHeight: 300,
  },
  listItem: {
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  closeButton: {
    marginTop: 12,
    alignSelf: 'flex-end',
  },
}); 