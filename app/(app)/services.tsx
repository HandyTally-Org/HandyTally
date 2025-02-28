import { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, ScrollView, Platform, TouchableOpacity } from 'react-native';
import { Text, Button, Searchbar, Snackbar, Card, Chip, IconButton } from 'react-native-paper';
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
    <View style={styles.container}>
      <Text style={{
        fontFamily: 'System',
        fontSize: 26,
        fontWeight: '600',
        marginBottom: 16,
        color: '#333333',
      }}>Labor</Text>
      
      <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
        <Searchbar
          placeholder="Search labor..."
          style={{ flex: 1, marginRight: 8 }}
          onChangeText={setSearchQuery}
          value={searchQuery}
        />
        
        <Button
          mode="contained"
          onPress={() => setShowAddForm(true)}
          style={{ marginRight: 8 }}
        >
          Add New Labor Code
        </Button>
        
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
      ) : null}

      {!selectedService && !showAddForm && !editingService && (
        <Card style={{flex: 1, width: '100%', maxWidth: '100%'}}>
          <View style={styles.tableContainer}>
            <View style={styles.tableHeader}>
              <TouchableOpacity 
                style={styles.columnName} 
                onPress={() => handleSort('name')}
              >
                <View style={styles.headerContent}>
                  <Text style={styles.headerText}>Name</Text>
                  {sortColumn === 'name' && (
                    <Text style={styles.sortIcon}>
                      {sortDirection === 'ascending' ? '↓' : '↑'}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.columnDescription} 
                onPress={() => handleSort('description')}
              >
                <View style={styles.headerContent}>
                  <Text style={styles.headerText}>Description</Text>
                  {sortColumn === 'description' && (
                    <Text style={styles.sortIcon}>
                      {sortDirection === 'ascending' ? '↓' : '↑'}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.columnRate} 
                onPress={() => handleSort('rate')}
              >
                <View style={styles.headerContent}>
                  <Text style={styles.headerText}>Rate</Text>
                  {sortColumn === 'rate' && (
                    <Text style={styles.sortIcon}>
                      {sortDirection === 'ascending' ? '↓' : '↑'}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.columnUnit} 
                onPress={() => handleSort('unit')}
              >
                <View style={styles.headerContent}>
                  <Text style={styles.headerText}>Unit</Text>
                  {sortColumn === 'unit' && (
                    <Text style={styles.sortIcon}>
                      {sortDirection === 'ascending' ? '↓' : '↑'}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
              
              <View style={styles.columnActions}>
                <Text style={styles.headerText}>Actions</Text>
              </View>
            </View>

            {loading ? (
              <View style={styles.tableRow}>
                <Text style={styles.loadingText}>Loading services...</Text>
              </View>
            ) : getFilteredServices().length === 0 ? (
              <View style={styles.tableRow}>
                <Text style={styles.loadingText}>No services found</Text>
              </View>
            ) : (
              getFilteredServices().map((service) => (
                <View key={service.uid} style={styles.tableRow}>
                  <Text style={styles.columnName}>{service.name}</Text>
                  <Text style={styles.columnDescription}>{service.description}</Text>
                  <Text style={styles.columnRate}>${service.rate}</Text>
                  <Text style={styles.columnUnit}>{service.unit}</Text>
                  <View style={styles.columnActions}>
                    <View style={styles.actionButtons}>
                      <IconButton
                        icon="pencil"
                        size={20}
                        onPress={() => setEditingService(service)}
                      />
                      <IconButton
                        icon="delete"
                        size={20}
                        onPress={() => handleDeleteService(service.uid)}
                        iconColor="red"
                      />
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>
        </Card>
      )}

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
  tableContainer: {
    width: '100%',
    marginVertical: 16,
    padding: 16,
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    paddingBottom: 12,
    marginBottom: 8,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerText: {
    fontWeight: 'bold',
    fontSize: 14,
    textAlign: 'left',
  },
  sortIcon: {
    marginLeft: 4,
    fontSize: 14,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    paddingVertical: 12,
    alignItems: 'center',
  },
  loadingText: {
    flex: 1,
    textAlign: 'left',
    paddingVertical: 8,
  },
  columnName: {
    flex: 2,
    paddingRight: 8,
  },
  columnDescription: {
    flex: 2,
    paddingRight: 8,
  },
  columnRate: {
    flex: 1,
    paddingRight: 8,
  },
  columnUnit: {
    flex: 1,
    paddingRight: 8,
  },
  columnActions: {
    flex: 1,
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
}); 