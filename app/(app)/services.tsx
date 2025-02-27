import { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, ScrollView, Platform } from 'react-native';
import { Text, Button, Searchbar, Snackbar, Card, DataTable, Chip, IconButton } from 'react-native-paper';
import { supabase } from '../../lib/supabase';
import { ServiceForm } from '../../components/ServiceForm';
import { styles as globalStyles } from '../../styles';
import * as XLSX from 'xlsx';
import { ExactHeader } from '../../components/ExactHeader';

export type Service = {
  id: string;
  name: string;
  description: string;
  rate: number;
  unit: string;
  category: string;
};

export default function ServicesScreen() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Add the file input ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchServices();
  }, []);

  useEffect(() => {
    console.log('XLSX library loaded:', XLSX);
    if (!XLSX) {
      console.error('XLSX library not available');
    }
  }, []);

  async function fetchServices() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('services')
        .select('*')
        .order('name');

      if (error) {
        throw error;
      }

      if (data) {
        // Ensure all services have valid rate values
        const normalizedServices = data.map(service => ({
          ...service,
          rate: service.rate != null ? service.rate : 0
        }));
        setServices(normalizedServices);
      }
    } catch (error) {
      console.error('Error fetching services:', error);
    } finally {
      setLoading(false);
    }
  }

  const handleAddService = async (service: Omit<Service, 'uid'>) => {
    try {
      setSubmitting(true);
      
      console.log('Adding service:', service);
      
      const { data, error } = await supabase
        .from('services')
        .insert([service])
        .select();

      if (error) {
        throw new Error(error.message);
      }

      if (data) {
        setServices([...services, data[0]]);
        setShowAddForm(false);
        showSnackbar('Service added successfully');
      }
    } catch (error: any) {
      console.error('Error adding service:', error);
      showSnackbar(`Failed to add service: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateService = async (uid: string, updates: Partial<Service>) => {
    try {
      setSubmitting(true);
      
      console.log('Updating service:', uid, updates);
      
      const { error } = await supabase
        .from('services')
        .update(updates)
        .eq('uid', uid);
      
      if (error) {
        throw new Error(error.message);
      }
      
      // Update the local state
      setServices(services.map(service => 
        service.uid === uid ? { ...service, ...updates } : service
      ));
      
      // Close the editing form
      setEditingService(null);
      
      showSnackbar('Service updated successfully');
    } catch (error: any) {
      console.error('Error updating service:', error);
      showSnackbar(`Error updating service: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteService = async (uid: string) => {
    try {
      setSubmitting(true);
      
      console.log('Deleting service:', uid);
      
      const { error } = await supabase
        .from('services')
        .delete()
        .eq('uid', uid);

      if (error) {
        throw new Error(error.message);
      }

      setServices(services.filter((service) => service.uid !== uid));
      showSnackbar('Service deleted successfully');
    } catch (error: any) {
      console.error('Error deleting service:', error);
      showSnackbar(`Failed to delete service: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const showSnackbar = (message: string) => {
    setSnackbarMessage(message);
    setSnackbarVisible(true);
  };

  const filteredServices = services.filter((service) =>
    service.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    service.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    service.category?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Add these functions to your component
  const handleExport = async () => {
    try {
      // Prepare data for export - include all important fields
      const exportData = services.map(service => ({
        uid: service.uid,
        name: service.name,
        description: service.description || '',
        rate: service.rate,
        unit: service.unit || '',
        category: service.category || '',
        is_active: service.rate > 0 ? 'Yes' : 'No',
        delete: 'n'  // Default to 'n' (don't delete)
      }));
      
      console.log('Exporting services data:', exportData);
      
      // Create worksheet from the data
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      
      // Set column widths for better readability
      if (!worksheet['!cols']) worksheet['!cols'] = [];
      worksheet['!cols'] = [
        { wch: 36 }, // uid
        { wch: 25 }, // name
        { wch: 30 }, // description
        { wch: 10 }, // rate
        { wch: 10 }, // unit
        { wch: 15 }, // category
        { wch: 10 }, // is_active
        { wch: 10 }  // delete
      ];
      
      // Create workbook and add the worksheet
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Services');
      
      // Generate Excel file
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      
      // For web, create a download link
      const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'services.xlsx';
      a.click();
      URL.revokeObjectURL(url);
      
      alert('Services exported successfully. This file can be used for import.\n\nTo delete a service, change the "delete" column value to "y".');
    } catch (error) {
      console.error('Error exporting services:', error);
      alert('Failed to export services. Please try again.');
    }
  };

  const handleImportClick = () => {
    console.log('Import button clicked');
    
    // For debugging, check if we're on web platform
    if (Platform.OS !== 'web') {
      alert('File import is only available on web platform');
      return;
    }
    
    // Reset the file input value to ensure onChange fires even if selecting the same file
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    
    // Trigger the file input click
    if (fileInputRef.current) {
      console.log('Triggering file input click');
      fileInputRef.current.click();
    } else {
      console.error('File input reference is null');
      alert('Could not open file selector. Please try again.');
    }
  };

  const handleFileSelected = async (event) => {
    console.log('File selected event triggered', event);
    try {
      const file = event.target.files[0];
      console.log('Selected file:', file);
      
      if (!file) {
        console.log('No file selected');
        return;
      }
      
      // Read the Excel file
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        console.log('FileReader onload triggered');
        try {
          console.log('FileReader result:', e.target.result);
          
          // Check if result is valid
          if (!e.target.result) {
            console.error('FileReader result is empty');
            alert('Could not read the file. Please try again.');
            return;
          }
          
          const data = new Uint8Array(e.target.result);
          console.log('Data array created, length:', data.length);
          
          // Try parsing the Excel file
          console.log('Attempting to parse Excel file...');
          const workbook = XLSX.read(data, { type: 'array' });
          console.log('Workbook parsed:', workbook);
          
          // Get the first sheet
          console.log('Sheet names:', workbook.SheetNames);
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          console.log('First sheet:', firstSheet);
          
          // Convert to JSON
          const jsonData = XLSX.utils.sheet_to_json(firstSheet);
          console.log('JSON data extracted:', jsonData);
          
          if (jsonData.length === 0) {
            alert('No data found in the Excel file.');
            return;
          }
          
          // Check if the data has the required fields
          const firstItem = jsonData[0];
          console.log('First item in data:', firstItem);
          
          if (!firstItem.name) {
            alert('The Excel file must have a "name" column.');
            return;
          }
          
          // Confirm import
          if (confirm(`Are you sure you want to import ${jsonData.length} services?`)) {
            await importServices(jsonData);
          }
        } catch (error) {
          console.error('Error processing Excel file:', error);
          alert(`Failed to process Excel file: ${error.message}`);
        }
      };
      
      reader.onerror = (error) => {
        console.error('FileReader error:', error);
        alert('Error reading the file. Please try again.');
      };
      
      console.log('Starting file read as ArrayBuffer');
      reader.readAsArrayBuffer(file);
      console.log('File read initiated');
      
    } catch (error) {
      console.error('Error in handleFileSelected:', error);
      alert(`Failed to import services: ${error.message}`);
    }
  };

  const importServices = async (data) => {
    try {
      console.log('Raw import data:', data);
      
      // First, log a sample row to see the exact field names
      if (data.length > 0) {
        console.log('Sample row from import:', data[0]);
      }
      
      // Track services to delete
      const servicesToDelete = [];
      
      // Normalize field names and identify services to delete
      const servicesToInsert = [];
      
      // First, log the table structure to understand what fields are available
      let columnNames = [];
      try {
        const { data: columns, error: columnsError } = await supabase.rpc('execute_sql', {
          sql_query: `
            SELECT column_name, data_type, is_nullable 
            FROM information_schema.columns 
            WHERE table_name = 'services' AND table_schema = 'public'
            ORDER BY ordinal_position;
          `
        });
        
        if (columnsError) {
          console.error('Error checking table structure:', columnsError);
        } else {
          console.log('Services table structure:', columns);
          // Extract column names for reference
          columnNames = columns.map(col => col.column_name);
          console.log('Available columns:', columnNames);
        }
      } catch (structError) {
        console.error('Error checking table structure:', structError);
      }
      
      // Also fetch a sample service to see the exact field structure
      try {
        const { data: sampleService, error: sampleError } = await supabase
          .from('services')
          .select('*')
          .limit(1)
          .single();
        
        if (sampleError) {
          console.error('Error fetching sample service:', sampleError);
        } else {
          console.log('Sample service from database:', sampleService);
        }
      } catch (sampleError) {
        console.error('Error fetching sample service:', sampleError);
      }
      
      // Process each item in the imported data
      for (const item of data) {
        try {
          // Check if this item should be deleted
          let shouldDelete = false;
          let serviceName = '';
          let serviceUid = null;
          
          // Look for delete indicator, name, and uid fields
          for (const key of Object.keys(item)) {
            const lowerKey = key.toLowerCase();
            
            if (lowerKey === 'name') {
              serviceName = String(item[key] || '');
            } else if (lowerKey === 'uid' || lowerKey === 'id') {
              serviceUid = String(item[key] || '');
            } else if (lowerKey === 'delete' || lowerKey === 'remove') {
              const deleteValue = String(item[key] || '').toLowerCase();
              shouldDelete = deleteValue === 'y' || deleteValue === 'yes' || deleteValue === 'true';
            }
          }
          
          // Skip empty rows
          if (!serviceName && !serviceUid) {
            console.log('Skipping row with no name or uid:', item);
            continue;
          }
          
          if (shouldDelete) {
            // Add to delete list - if we have a UID, use that for more precise deletion
            if (serviceUid) {
              servicesToDelete.push({ name: serviceName, uid: serviceUid });
            } else {
              servicesToDelete.push({ name: serviceName });
            }
          } else {
            // Create a normalized item with only the essential fields
            const normalizedItem: any = {
              name: serviceName
            };
            
            // If we have a UID, include it for matching
            if (serviceUid) {
              normalizedItem.uid = serviceUid;
            }
            
            // Process all fields from the imported data
            for (const key of Object.keys(item)) {
              const value = item[key];
              const lowerKey = key.toLowerCase();
              
              // Skip name, uid, and delete as we've already processed them
              if (lowerKey === 'name' || lowerKey === 'uid' || lowerKey === 'id' || 
                  lowerKey === 'delete' || lowerKey === 'remove') {
                continue;
              }
              
              // Handle rate field
              if ((lowerKey === 'rate' || lowerKey === 'price') && value !== undefined) {
                try {
                  const numValue = typeof value === 'number' 
                    ? value 
                    : parseFloat(String(value).replace(/[^0-9.-]+/g, ''));
                  normalizedItem.rate = isNaN(numValue) ? 0 : numValue;
                } catch (e) {
                  console.error(`Error parsing rate for ${serviceName}:`, e);
                  normalizedItem.rate = 0;
                }
              }
              
              // Handle description field
              else if (lowerKey === 'description' || lowerKey === 'desc') {
                normalizedItem.description = String(value || '');
              }
              
              // Handle unit field
              else if (lowerKey === 'unit') {
                normalizedItem.unit = String(value || '');
              }
              
              // Handle category field
              else if (lowerKey === 'category') {
                normalizedItem.category = String(value || '');
              }
              
              // Handle any other fields that might be in the database
              else if (columnNames.includes(lowerKey)) {
                normalizedItem[lowerKey] = value;
              }
            }
            
            console.log(`Normalized item for ${serviceName}:`, normalizedItem);
            servicesToInsert.push(normalizedItem);
          }
        } catch (itemError) {
          console.error('Error processing item:', item, itemError);
        }
      }
      
      console.log('Services to delete:', servicesToDelete);
      console.log('Normalized services to insert/update:', servicesToInsert);
      
      // Confirm the operation
      const message = [];
      if (servicesToInsert.length > 0) {
        message.push(`Import/update ${servicesToInsert.length} services`);
      }
      if (servicesToDelete.length > 0) {
        message.push(`Delete ${servicesToDelete.length} services`);
      }
      
      if (!confirm(`Are you sure you want to:\n${message.join('\n')}`)) {
        return;
      }
      
      // Process deletions
      let deleteCount = 0;
      let deleteErrorCount = 0;
      
      for (const serviceInfo of servicesToDelete) {
        try {
          console.log(`Attempting to delete service:`, serviceInfo);
          
          let query = supabase.from('services').select('*');
          
          // If we have a UID, use that for more precise matching
          if (serviceInfo.uid) {
            query = query.eq('uid', serviceInfo.uid);
          } else {
            query = query.eq('name', serviceInfo.name);
          }
          
          // Find the service
          const { data: existingService, error: findError } = await query.maybeSingle();
          
          if (findError) {
            console.error(`Error finding service:`, findError);
            throw findError;
          }
          
          console.log(`Find result:`, existingService);
          
          if (existingService) {
            // Determine the ID field (could be 'id' or 'uid')
            const idField = existingService.id ? 'id' : 'uid';
            const idValue = existingService[idField];
            
            console.log(`Using ID field: ${idField}, value: ${idValue}`);
            
            // Delete the service
            const { error: deleteError } = await supabase
              .from('services')
              .delete()
              .eq(idField, idValue);
            
            if (deleteError) {
              console.error(`Error deleting service:`, deleteError);
              throw deleteError;
            }
            
            console.log(`Successfully deleted service`);
            deleteCount++;
          } else {
            console.log(`Service not found for deletion`);
          }
        } catch (error) {
          console.error(`Error deleting service:`, error);
          deleteErrorCount++;
        }
      }
      
      // Process insertions/updates
      let successCount = 0;
      let errorCount = 0;
      let errorDetails = [];
      
      for (const service of servicesToInsert) {
        try {
          console.log(`Processing service:`, service);
          
          // If we have a UID, try to update directly by UID first
          if (service.uid) {
            console.log(`Checking if service with UID ${service.uid} exists`);
            
            const { data: existingService, error: checkError } = await supabase
              .from('services')
              .select('*')
              .eq('uid', service.uid)
              .maybeSingle();
            
            if (checkError) {
              console.error(`Error checking for existing service by UID:`, checkError);
            } else if (existingService) {
              console.log(`Found existing service by UID:`, existingService);
              
              // Update existing service by UID
              console.log(`Updating existing service by UID:`, service);
              
              const { error: updateError } = await supabase
                .from('services')
                .update(service)
                .eq('uid', service.uid);
              
              if (updateError) {
                console.error(`Error updating service:`, updateError);
                errorDetails.push(`${service.name}: ${updateError.message}`);
                throw updateError;
              }
              
              console.log(`Successfully updated service by UID`);
              successCount++;
              continue; // Skip to next service
            }
          }
          
          // If no UID or service with UID not found, check by name
          console.log(`Checking if service with name "${service.name}" exists`);
          
          const { data: existingService, error: checkError } = await supabase
            .from('services')
            .select('*')
            .eq('name', service.name)
            .maybeSingle();
          
          if (checkError) {
            console.error(`Error checking for existing service by name:`, checkError);
            throw checkError;
          }
          
          console.log(`Check result for name "${service.name}":`, existingService);
          
          if (existingService) {
            // Determine the ID field (could be 'id' or 'uid')
            const idField = existingService.id ? 'id' : 'uid';
            const idValue = existingService[idField];
            
            console.log(`Using ID field: ${idField}, value: ${idValue}`);
            
            // Update existing service
            console.log(`Updating existing service by name:`, service);
            
            // Remove the uid field if it doesn't match the existing service
            if (service.uid && service.uid !== existingService.uid) {
              console.log(`UID in import (${service.uid}) doesn't match existing service (${existingService.uid}), removing it`);
              delete service.uid;
            }
            
            const { error: updateError } = await supabase
              .from('services')
              .update(service)
              .eq(idField, idValue);
            
            if (updateError) {
              console.error(`Error updating service:`, updateError);
              errorDetails.push(`${service.name}: ${updateError.message}`);
              throw updateError;
            }
            
            console.log(`Successfully updated service by name`);
          } else {
            // Insert new service
            console.log(`Inserting new service:`, service);
            
            const { error: insertError } = await supabase
              .from('services')
              .insert([service]);
            
            if (insertError) {
              console.error(`Error inserting service:`, insertError);
              errorDetails.push(`${service.name}: ${insertError.message}`);
              throw insertError;
            }
            
            console.log(`Successfully inserted service`);
          }
          
          successCount++;
        } catch (itemError) {
          console.error(`Error processing service:`, itemError);
          errorCount++;
        }
      }
      
      // Build result message
      const resultMessages = [];
      if (successCount > 0) {
        resultMessages.push(`${successCount} services imported/updated successfully`);
      }
      if (errorCount > 0) {
        resultMessages.push(`${errorCount} services failed to import/update`);
        if (errorDetails.length > 0) {
          resultMessages.push(`Error details:\n${errorDetails.join('\n')}`);
        }
      }
      if (deleteCount > 0) {
        resultMessages.push(`${deleteCount} services deleted successfully`);
      }
      if (deleteErrorCount > 0) {
        resultMessages.push(`${deleteErrorCount} services failed to delete`);
      }
      
      alert(resultMessages.join('\n'));
      
      // Refresh the services list
      fetchServices();
    } catch (error) {
      console.error('Error importing services:', error);
      alert(`Failed to import services: ${error.message}`);
    }
  };

  return (
    <View style={styles.container}>
      <ExactHeader title="Services" />
      
      <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
        <Searchbar
          placeholder="Search services..."
          style={{ flex: 1, marginRight: 8 }}
          onChangeText={setSearchQuery}
          value={searchQuery}
        />
        
        <IconButton
          icon="file-export"
          mode="contained"
          onPress={handleExport}
          iconColor="#fff"
          containerColor="#4CAF50"
          size={20}
        />
        
        <IconButton
          icon="file-import"
          mode="contained"
          onPress={handleImportClick}
          iconColor="#fff"
          containerColor="#2196F3"
          size={20}
          style={{ marginLeft: 8 }}
        />
        
        {/* Hidden file input for import */}
        {Platform.OS === 'web' && (
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => {
              console.log('File input change event triggered', e);
              handleFileSelected(e);
            }}
            accept=".xlsx,.xls"
            style={{ display: 'none' }}
            id="service-import-input"
          />
        )}
      </View>

      {showAddForm || editingService ? (
        <ServiceForm
          service={editingService}
          onSubmit={editingService 
            ? (updates) => handleUpdateService(editingService.uid, updates) 
            : handleAddService
          }
          onCancel={() => {
            setShowAddForm(false);
            setEditingService(null);
          }}
          submitting={submitting}
        />
      ) : (
        <Button
          mode="contained"
          onPress={() => setShowAddForm(true)}
          style={styles.addButton}
        >
          Add New Service
        </Button>
      )}

      <Card style={styles.tableCard}>
        <DataTable>
          <DataTable.Header>
            <DataTable.Title style={styles.centeredCell}>Name</DataTable.Title>
            <DataTable.Title style={styles.centeredCell} numeric>Rate</DataTable.Title>
            <DataTable.Title style={styles.centeredCell}>Unit</DataTable.Title>
            <DataTable.Title style={styles.centeredCell}>Actions</DataTable.Title>
          </DataTable.Header>

          {loading ? (
            <DataTable.Row>
              <DataTable.Cell style={styles.centeredCell}>Loading services...</DataTable.Cell>
            </DataTable.Row>
          ) : filteredServices.length === 0 ? (
            <DataTable.Row>
              <DataTable.Cell style={styles.centeredCell}>No services found</DataTable.Cell>
            </DataTable.Row>
          ) : (
            filteredServices.map((service) => (
              <DataTable.Row key={service.uid}>
                <DataTable.Cell style={styles.centeredCell}>{service.name}</DataTable.Cell>
                <DataTable.Cell style={styles.centeredCell} numeric>${service.rate}</DataTable.Cell>
                <DataTable.Cell style={styles.centeredCell}>{service.unit}</DataTable.Cell>
                <DataTable.Cell style={styles.centeredCell}>
                  <View style={styles.actionButtons}>
                    <Button 
                      mode="text" 
                      compact 
                      onPress={() => setEditingService(service)} 
                      disabled={submitting}
                      labelStyle={styles.actionButtonLabel}
                      style={styles.actionButton}
                      contentStyle={styles.actionButtonContent}
                    >
                      Edit
                    </Button>
                    <Text style={styles.actionSeparator}>|</Text>
                    <Button 
                      mode="text" 
                      compact 
                      onPress={() => handleDeleteService(service.uid)} 
                      disabled={submitting}
                      labelStyle={styles.actionButtonLabel}
                      style={styles.actionButton}
                      contentStyle={styles.actionButtonContent}
                    >
                      Delete
                    </Button>
                  </View>
                </DataTable.Cell>
              </DataTable.Row>
            ))
          )}
        </DataTable>
      </Card>

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={3000}
      >
        {snackbarMessage}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...globalStyles.container,
  },
  title: {
    ...globalStyles.title,
    fontFamily: 'System',
    fontWeight: '600',
    fontSize: 24,
    marginBottom: 16,
  },
  searchBar: {
    marginBottom: 16,
  },
  addButton: {
    marginBottom: 16,
  },
  tableCard: {
    flex: 1,
    marginBottom: 16,
    borderRadius: 8,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f5f5f5',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    paddingVertical: 12,
  },
  headerCell: {
    flex: 1,
    fontWeight: '500',
    color: '#757575',
    paddingHorizontal: 12,
    borderRightWidth: 1,
    borderRightColor: '#e0e0e0',
    textAlign: 'left',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    paddingVertical: 10,
  },
  cell: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRightWidth: 1,
    borderRightColor: '#e0e0e0',
    justifyContent: 'center',
  },
  nameColumn: {
    flex: 2,
  },
  rateColumn: {
    flex: 1,
    textAlign: 'left',
  },
  unitColumn: {
    flex: 1,
  },
  categoryColumn: {
    flex: 2,
  },
  actionsColumn: {
    flex: 1,
    borderRightWidth: 0,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  actionButtonLabel: {
    color: '#007bff',
    fontSize: 14,
    fontWeight: '500',
    marginVertical: 0,
  },
  actionSeparator: {
    marginHorizontal: 8,
    color: '#aaaaaa',
  },
  actionButton: {
    margin: 0,
    minWidth: 40,
  },
  actionButtonContent: {
    height: 24,
    paddingHorizontal: 0,
  },
  centeredCell: {
    justifyContent: 'center',
  },
}); 