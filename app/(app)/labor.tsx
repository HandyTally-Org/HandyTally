import { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, ScrollView, Platform, TouchableOpacity } from 'react-native';
import { Text, Button, Searchbar, Snackbar, Card, Chip, IconButton, DataTable, ActivityIndicator, Dialog, Portal, TextInput } from 'react-native-paper';
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
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [sortColumn, setSortColumn] = useState<string>('name');
  const [sortDirection, setSortDirection] = useState<'ascending' | 'descending'>('ascending');
  const [submitting, setSubmitting] = useState(false);

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
      
      setServices(services.map(service => 
        service.uid === uid ? { ...service, ...updates } : service
      ));
      
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

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'ascending' ? 'descending' : 'ascending');
    } else {
      setSortColumn(column);
      setSortDirection('ascending');
    }
  };

  const getFilteredServices = () => {
    let filtered = [...services];
    
    if (searchQuery) {
      filtered = filtered.filter(service => 
    service.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        service.description?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (sortColumn) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'description':
          comparison = (a.description || '').localeCompare(b.description || '');
          break;
        case 'rate':
          comparison = (a.rate || 0) - (b.rate || 0);
          break;
        case 'unit':
          comparison = (a.unit || '').localeCompare(b.unit || '');
          break;
        default:
          comparison = 0;
      }
      
      return sortDirection === 'ascending' ? comparison : -comparison;
    });
    
    return filtered;
  };

  const handleExport = async () => {
    try {
      const exportData = services.map(service => ({
        uid: service.uid,
        name: service.name,
        description: service.description || '',
        rate: service.rate,
        unit: service.unit || '',
        category: service.category || '',
        is_active: service.rate > 0 ? 'Yes' : 'No',
        delete: 'n'
      }));
      
      console.log('Exporting services data:', exportData);
      
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      
      if (!worksheet['!cols']) worksheet['!cols'] = [];
      worksheet['!cols'] = [
        { wch: 36 },
        { wch: 25 },
        { wch: 30 },
        { wch: 10 },
        { wch: 10 },
        { wch: 15 },
        { wch: 10 },
        { wch: 10 }
      ];
      
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Services');
      
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      
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
    
    if (Platform.OS !== 'web') {
      alert('File import is only available on web platform');
      return;
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    
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
      
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        console.log('FileReader onload triggered');
        try {
          console.log('FileReader result:', e.target.result);
          
          if (!e.target.result) {
            console.error('FileReader result is empty');
            alert('Could not read the file. Please try again.');
            return;
          }
          
          const data = new Uint8Array(e.target.result);
          console.log('Data array created, length:', data.length);
          
          console.log('Attempting to parse Excel file...');
          const workbook = XLSX.read(data, { type: 'array' });
          console.log('Workbook parsed:', workbook);
          
          console.log('Sheet names:', workbook.SheetNames);
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          console.log('First sheet:', firstSheet);
          
          const jsonData = XLSX.utils.sheet_to_json(firstSheet);
          console.log('JSON data extracted:', jsonData);
          
          if (jsonData.length === 0) {
            alert('No data found in the Excel file.');
            return;
          }
          
          const firstItem = jsonData[0];
          console.log('First item in data:', firstItem);
          
          if (!firstItem.name) {
            alert('The Excel file must have a "name" column.');
            return;
          }
          
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
      
      if (data.length > 0) {
        console.log('Sample row from import:', data[0]);
      }
      
      const servicesToDelete = [];
      
      const servicesToInsert = [];
      
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
          columnNames = columns.map(col => col.column_name);
          console.log('Available columns:', columnNames);
        }
      } catch (structError) {
        console.error('Error checking table structure:', structError);
      }
      
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
      
      for (const item of data) {
        try {
          let shouldDelete = false;
          let serviceName = '';
          let serviceUid = null;
          
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
          
          if (!serviceName && !serviceUid) {
            console.log('Skipping row with no name or uid:', item);
            continue;
          }
          
          if (shouldDelete) {
            if (serviceUid) {
              servicesToDelete.push({ name: serviceName, uid: serviceUid });
            } else {
              servicesToDelete.push({ name: serviceName });
            }
          } else {
            const normalizedItem: any = {
              name: serviceName
            };
            
            if (serviceUid) {
              normalizedItem.uid = serviceUid;
            }
            
            for (const key of Object.keys(item)) {
              const value = item[key];
              const lowerKey = key.toLowerCase();
              
              if (lowerKey === 'name' || lowerKey === 'uid' || lowerKey === 'id' || 
                  lowerKey === 'delete' || lowerKey === 'remove') {
                continue;
              }
              
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
              
              else if (lowerKey === 'description' || lowerKey === 'desc') {
                normalizedItem.description = String(value || '');
              }
              
              else if (lowerKey === 'unit') {
                normalizedItem.unit = String(value || '');
              }
              
              else if (lowerKey === 'category') {
                normalizedItem.category = String(value || '');
              }
              
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
      
      let deleteCount = 0;
      let deleteErrorCount = 0;
      
      for (const serviceInfo of servicesToDelete) {
        try {
          console.log(`Attempting to delete service:`, serviceInfo);
          
          let query = supabase.from('services').select('*');
          
          if (serviceInfo.uid) {
            query = query.eq('uid', serviceInfo.uid);
          } else {
            query = query.eq('name', serviceInfo.name);
          }
          
          const { data: existingService, error: findError } = await query.maybeSingle();
          
          if (findError) {
            console.error(`Error finding service:`, findError);
            throw findError;
          }
          
          console.log(`Find result:`, existingService);
          
          if (existingService) {
            const idField = existingService.id ? 'id' : 'uid';
            const idValue = existingService[idField];
            
            console.log(`Using ID field: ${idField}, value: ${idValue}`);
            
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
      
      let successCount = 0;
      let errorCount = 0;
      let errorDetails = [];
      
      for (const service of servicesToInsert) {
        try {
          console.log(`Processing service:`, service);
          
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
              continue;
            }
          }
          
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
            const idField = existingService.id ? 'id' : 'uid';
            const idValue = existingService[idField];
            
            console.log(`Using ID field: ${idField}, value: ${idValue}`);
            
            console.log(`Updating existing service by name:`, service);
            
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
      
      fetchServices();
    } catch (error) {
      console.error('Error importing services:', error);
      alert(`Failed to import services: ${error.message}`);
    }
  };

  return (
    <View style={{
      flex: 1,
      padding: 16,
      backgroundColor: '#ffffff',
    }}>
      <Text style={{
        fontFamily: 'System',
        fontSize: 26,
        fontWeight: '600',
        marginBottom: 16,
        color: '#333333',
      }}>Labor</Text>
      
      <View style={styles.searchAndAddContainer}>
        <Searchbar
          placeholder="Search labor codes..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={[styles.searchBar, { backgroundColor: '#f5f5f5' }]}
        />
        
        <View style={{ 
          flexDirection: 'row', 
          alignItems: 'center',
          height: 40 // Set a fixed height to ensure vertical alignment
        }}>
          <Button
            mode="contained"
            onPress={() => setShowAddForm(true)}
            style={[styles.addButton, { marginLeft: 16 }]}
          >
            Add New Labor Code
          </Button>
          
          <View 
            style={{ marginLeft: 8 }}
            accessibilityLabel="Export"
          >
            <IconButton
              icon="file-export"
              mode="contained"
              onPress={handleExport}
              iconColor="#fff"
              containerColor="#4CAF50"
              size={20}
              aria-label="Export"
            />
            {Platform.OS === 'web' && (
              <div 
                style={{ 
                  position: 'absolute', 
                  bottom: -30, 
                  left: 0, 
                  backgroundColor: '#333', 
                  color: 'white', 
                  padding: '4px 8px', 
                  borderRadius: 4, 
                  fontSize: 12,
                  whiteSpace: 'nowrap',
                  opacity: 0,
                  transition: 'opacity 0.2s',
                  pointerEvents: 'none'
                }}
                className="tooltip"
              >
                Export
              </div>
            )}
          </View>
          
          <View 
            style={{ marginLeft: 8 }}
            accessibilityLabel="Import"
          >
            <IconButton
              icon="file-import"
              mode="contained"
              onPress={handleImportClick}
              iconColor="#fff"
              containerColor="#2196F3"
              size={20}
              aria-label="Import"
            />
            {Platform.OS === 'web' && (
              <div 
                style={{ 
                  position: 'absolute', 
                  bottom: -30, 
                  left: 0, 
                  backgroundColor: '#333', 
                  color: 'white', 
                  padding: '4px 8px', 
                  borderRadius: 4, 
                  fontSize: 12,
                  whiteSpace: 'nowrap',
                  opacity: 0,
                  transition: 'opacity 0.2s',
                  pointerEvents: 'none'
                }}
                className="tooltip"
              >
                Import
              </div>
            )}
          </View>
        </View>
        
        {/* Hidden file input for import */}
        {Platform.OS === 'web' && (
          <>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelected}
              accept=".xlsx,.xls"
              style={{ display: 'none' }}
              id="labor-import-input"
            />
            <style>
              {`
                View:hover .tooltip {
                  opacity: 1;
                }
              `}
            </style>
          </>
        )}
      </View>
      
      <Card style={{
        flex: 1,
        marginBottom: 16,
        backgroundColor: '#ffffff',
        borderRadius: 8,
        elevation: 2,
        shadowColor: 'rgba(0,0,0,0.1)',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.8,
        shadowRadius: 1,
      }}>
        <DataTable style={{ backgroundColor: '#ffffff' }}>
          <DataTable.Header style={{ backgroundColor: '#ffffff' }}>
            <DataTable.Title 
              style={{ backgroundColor: '#ffffff' }}
              sortDirection={sortColumn === 'name' ? sortDirection : undefined}
              onPress={() => handleSort('name')}
            >
              Name
            </DataTable.Title>
            <DataTable.Title 
              style={{ backgroundColor: '#ffffff' }}
              sortDirection={sortColumn === 'description' ? sortDirection : undefined}
              onPress={() => handleSort('description')}
            >
              Description
            </DataTable.Title>
            <DataTable.Title 
              style={{ backgroundColor: '#ffffff' }}
              sortDirection={sortColumn === 'rate' ? sortDirection : undefined}
              onPress={() => handleSort('rate')}
            >
              Rate
            </DataTable.Title>
            <DataTable.Title 
              style={{ backgroundColor: '#ffffff' }}
              sortDirection={sortColumn === 'unit' ? sortDirection : undefined}
              onPress={() => handleSort('unit')}
            >
              Unit
            </DataTable.Title>
            <DataTable.Title style={{ backgroundColor: '#ffffff' }}>Actions</DataTable.Title>
          </DataTable.Header>
          
          {loading ? (
            <DataTable.Row style={{ backgroundColor: '#ffffff' }}>
              <DataTable.Cell style={{ flex: 5, backgroundColor: '#ffffff' }}>
                <ActivityIndicator size="small" style={{ marginRight: 8 }} />
                Loading services...
              </DataTable.Cell>
            </DataTable.Row>
          ) : getFilteredServices().length === 0 ? (
            <DataTable.Row style={{ backgroundColor: '#ffffff' }}>
              <DataTable.Cell style={{ flex: 5, backgroundColor: '#ffffff' }}>No services found</DataTable.Cell>
            </DataTable.Row>
          ) : (
            getFilteredServices().map(service => (
              <DataTable.Row key={service.uid} style={{ backgroundColor: '#ffffff' }}>
                <DataTable.Cell style={{ backgroundColor: '#ffffff' }}>{service.name}</DataTable.Cell>
                <DataTable.Cell style={{ backgroundColor: '#ffffff' }}>{service.description}</DataTable.Cell>
                <DataTable.Cell style={{ backgroundColor: '#ffffff' }}>${service.rate.toFixed(2)}</DataTable.Cell>
                <DataTable.Cell style={{ backgroundColor: '#ffffff' }}>{service.unit || 'hour'}</DataTable.Cell>
                <DataTable.Cell style={{ backgroundColor: '#ffffff' }}>
                  <View style={{ flexDirection: 'row' }}>
                    <IconButton
                      icon="pencil"
                      size={20}
                      onPress={() => setEditingService(service)}
                    />
                    <IconButton
                      icon="delete"
                      size={20}
                      iconColor="red"
                      onPress={() => setShowDeleteDialog(true)}
                    />
                  </View>
                </DataTable.Cell>
              </DataTable.Row>
            ))
          )}
        </DataTable>
      </Card>
      
      {/* Add Service Dialog */}
      <Portal>
        <Dialog visible={showAddForm} onDismiss={() => setShowAddForm(false)} style={{ backgroundColor: '#ffffff' }}>
          <Dialog.Title>Add New Service</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Name"
              value={editingService?.name || ''}
              onChangeText={(text) => setEditingService({ ...(editingService || {}), name: text })}
              style={{ marginBottom: 10, backgroundColor: '#ffffff' }}
            />
            <TextInput
              label="Description"
              value={editingService?.description || ''}
              onChangeText={(text) => setEditingService({ ...(editingService || {}), description: text })}
              style={{ marginBottom: 10, backgroundColor: '#ffffff' }}
            />
            <TextInput
              label="Rate"
              value={editingService?.rate?.toString() || ''}
              onChangeText={(text) => setEditingService({ ...(editingService || {}), rate: parseFloat(text) })}
              keyboardType="numeric"
              style={{ marginBottom: 10, backgroundColor: '#ffffff' }}
            />
            <TextInput
              label="Unit"
              value={editingService?.unit || ''}
              onChangeText={(text) => setEditingService({ ...(editingService || {}), unit: text })}
              style={{ marginBottom: 10, backgroundColor: '#ffffff' }}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setShowAddForm(false)}>Cancel</Button>
            <Button onPress={() => handleAddService(editingService || {} as Omit<Service, 'uid'>)}>Add</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
      
      {/* Delete Service Dialog */}
      <Portal>
        <Dialog visible={showDeleteDialog} onDismiss={() => setShowDeleteDialog(false)} style={{ backgroundColor: '#ffffff' }}>
          <Dialog.Title>Delete Service</Dialog.Title>
          <Dialog.Content>
            <Text>Are you sure you want to delete {selectedService?.name}?</Text>
            <Text>This action cannot be undone.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setShowDeleteDialog(false)}>Cancel</Button>
            <Button onPress={() => handleDeleteService(selectedService?.uid || '')} textColor="red">Delete</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
      
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
    flex: 1,
    padding: 16,
    backgroundColor: '#ffffff',
  },
  searchAndAddContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    alignItems: 'center',
  },
  searchBar: {
    flex: 1,
    marginRight: 16,
    backgroundColor: '#ffffff',
  },
  addButton: {
    minWidth: 150,
  },
  tableCard: {
    flex: 1,
    marginBottom: 16,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    elevation: 2,
    shadowColor: 'rgba(0,0,0,0.1)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.8,
    shadowRadius: 1,
  },
}); 