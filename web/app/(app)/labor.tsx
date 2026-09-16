import { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button, Searchbar, Snackbar, Card, IconButton, DataTable, ActivityIndicator, Dialog, Portal } from 'react-native-paper';
import { supabase } from '../../lib/supabase';
import { ServiceDialog, ServiceDraft } from '../../components/ServiceDialog';
import { ImportExportButtons } from '../../components/ImportExportButtons';
import { styles as globalStyles } from '../../styles';
import { exportWorkbook, pickWorkbook, sheetRows, hasColumn, confirmAction } from '../../utils/excel';

export type Service = {
  uid: number;
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

  useEffect(() => {
    fetchServices();
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

  const handleAddService = async (service: ServiceDraft) => {
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

  const handleUpdateService = async (uid: number, updates: Partial<Service>) => {
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

  const handleDeleteService = async (service: Service | null) => {
    setShowDeleteDialog(false);
    if (!service) {
      showSnackbar('No service selected to delete');
      return;
    }

    try {
      setSubmitting(true);

      console.log('Deleting service:', service.uid);

      const { error } = await supabase
        .from('services')
        .delete()
        .eq('uid', service.uid);

      if (error) {
        // 23503 = foreign_key_violation: invoice_items / job_costs still reference this service
        if (error.code === '23503') {
          throw new Error(`"${service.name}" is used by existing invoices or jobs and cannot be deleted`);
        }
        throw new Error(error.message);
      }

      setServices(services.filter((s) => s.uid !== service.uid));
      showSnackbar('Service deleted successfully');
    } catch (error: any) {
      console.error('Error deleting service:', error);
      showSnackbar(`Failed to delete service: ${error.message}`);
    } finally {
      setSubmitting(false);
      setSelectedService(null);
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
      
      await exportWorkbook('services.xlsx', [
        { name: 'Services', rows: exportData, columnWidths: [36, 25, 30, 10, 10, 15, 10, 10] },
      ]);

      alert('Services exported successfully. This file can be used for import.\n\nTo delete a service, change the "delete" column value to "y".');
    } catch (error) {
      console.error('Error exporting services:', error);
      alert('Failed to export services. Please try again.');
    }
  };

  const handleImport = async () => {
    try {
      const workbook = await pickWorkbook();
      if (!workbook) return;

      const rows = sheetRows(workbook);
      if (!rows || rows.length === 0) {
        alert('No data found in the spreadsheet.');
        return;
      }
      if (!hasColumn(rows, 'name')) {
        alert('The spreadsheet must have a "name" column.');
        return;
      }
      await importServices(rows);
    } catch (error: any) {
      console.error('Error importing services:', error);
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
                // `unit` is a numeric column: a label such as "hour" makes the row fail.
                const unitValue = parseFloat(String(value));
                if (!isNaN(unitValue)) normalizedItem.unit = unitValue;
              }
              
              else if (lowerKey === 'category') {
                normalizedItem.category = String(value || '');
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
      
      if (!(await confirmAction(`Are you sure you want to:\n${message.join('\n')}`, 'Import'))) {
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
          
          <ImportExportButtons onExport={handleExport} onImport={handleImport} />
        </View>
        
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
                      onPress={() => {
                        setSelectedService(service);
                        setShowDeleteDialog(true);
                      }}
                    />
                  </View>
                </DataTable.Cell>
              </DataTable.Row>
            ))
          )}
        </DataTable>
      </Card>
      
      <ServiceDialog
        visible={showAddForm}
        title="Add labor code"
        subtitle="A service and its hourly rate for jobs and invoices"
        submitLabel="Add labor code"
        submitting={submitting}
        onDismiss={() => setShowAddForm(false)}
        onSubmit={handleAddService}
      />

      <ServiceDialog
        visible={editingService !== null}
        title="Edit labor code"
        subtitle={editingService?.name}
        service={editingService}
        submitLabel="Save changes"
        submitting={submitting}
        onDismiss={() => setEditingService(null)}
        onSubmit={(draft) => editingService && handleUpdateService(editingService.uid, draft)}
      />
      
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
            <Button onPress={() => handleDeleteService(selectedService)} disabled={submitting} textColor="red">Delete</Button>
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