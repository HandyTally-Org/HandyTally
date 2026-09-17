import { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button, Searchbar, Snackbar, Card, DataTable, IconButton, ActivityIndicator, Dialog, Portal } from 'react-native-paper';
import { supabase } from '../../lib/supabase';
import { MaterialDialog, MaterialDraft } from '../../components/MaterialDialog';
import { ImportExportButtons } from '../../components/ImportExportButtons';
import { styles as globalStyles } from '../../styles';
import { exportWorkbook, pickWorkbook, sheetRows, hasColumn, confirmAction } from '../../utils/excel';
import { useRefreshOnFocus } from '../../hooks/useRefreshOnFocus';

export type Material = {
  uid: string;
  sku: string | null;
  name: string;
  description: string;
  cost: number;
  unit: string;
  quantity: number;
  category: string;
  supplier: string;
  supplier_id: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export default function MaterialsScreen() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [sortColumn, setSortColumn] = useState<string>('name');
  const [sortDirection, setSortDirection] = useState<'ascending' | 'descending'>('ascending');

  useRefreshOnFocus(fetchMaterials);

  async function fetchMaterials() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('materials')
        .select('*')
        .order('name');

      if (error) {
        throw error;
      }

      if (data) {
        setMaterials(data);
      }
    } catch (error) {
      console.error('Error fetching materials:', error);
    } finally {
      setLoading(false);
    }
  }

  const handleAddMaterial = async (material: MaterialDraft) => {
    try {
      setSubmitting(true);

      const { error } = await supabase
        .from('materials')
        .insert([{ ...material, is_active: true }]);

      if (error) {
        throw new Error(error.message);
      }

      await fetchMaterials();
      setShowAddForm(false);
      showSnackbar('Material added successfully');
    } catch (error: any) {
      console.error('Error adding material:', error);
      showSnackbar(`Failed to add material: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateMaterial = async (uid: string, updates: MaterialDraft) => {
    try {
      setSubmitting(true);

      const { error } = await supabase
        .from('materials')
        .update(updates)
        .eq('uid', uid);

      if (error) {
        throw new Error(error.message);
      }

      setMaterials(materials.map((material) => (material.uid === uid ? { ...material, ...updates } : material)));
      setEditingMaterial(null);
      showSnackbar('Material updated successfully');
    } catch (error: any) {
      console.error('Error updating material:', error);
      showSnackbar(`Failed to update material: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteMaterial = async (uid: string) => {
    try {
      setSubmitting(true);
      
      console.log('Deleting material:', uid);
      
      const { error } = await supabase
        .from('materials')
        .delete()
        .eq('uid', uid);

      if (error) {
        throw new Error(error.message);
      }

      setMaterials(materials.filter((material) => material.uid !== uid));
      showSnackbar('Material deleted successfully');
    } catch (error: any) {
      console.error('Error deleting material:', error);
      showSnackbar(`Failed to delete material: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const showSnackbar = (message: string) => {
    setSnackbarMessage(message);
    setSnackbarVisible(true);
  };

  const closeAddForm = () => setShowAddForm(false);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'ascending' ? 'descending' : 'ascending');
    } else {
      setSortColumn(column);
      setSortDirection('ascending');
    }
  };

  const getFilteredMaterials = () => {
    let filtered = [...materials];
    
    if (searchQuery) {
      filtered = filtered.filter(material =>
    material.sku?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    material.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    material.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    material.supplier?.toLowerCase().includes(searchQuery.toLowerCase())
  );
    }
    
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (sortColumn) {
        case 'sku':
          comparison = (a.sku || '').localeCompare(b.sku || '');
          break;
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'description':
          comparison = (a.description || '').localeCompare(b.description || '');
          break;
        case 'quantity':
          comparison = (a.quantity || 0) - (b.quantity || 0);
          break;
        case 'cost':
          comparison = (a.cost || 0) - (b.cost || 0);
          break;
        case 'supplier':
          comparison = (a.supplier || '').localeCompare(b.supplier || '');
          break;
        case 'category':
          comparison = (a.category || '').localeCompare(b.category || '');
          break;
        default:
          comparison = 0;
      }
      
      return sortDirection === 'ascending' ? comparison : -comparison;
    });
    
    return filtered;
  };

  const getStockStatus = (material: Material) => {
    if (material.quantity <= 0) {
      return { label: 'Out of Stock', color: '#f44336' };
    } else if (material.quantity < 10) {
      return { label: 'Low Stock', color: '#ff9800' };
    } else {
      return { label: 'In Stock', color: '#4caf50' };
    }
  };

  const handleExport = async () => {
    try {
      // Prepare data for export - include all important fields
      const exportData = materials.map(material => ({
        uid: material.uid,
        sku: material.sku || '',
        name: material.name,
        description: material.description || '',
        cost: material.cost,
        unit: material.unit,
        quantity: material.quantity || 0,
        status: getStockStatus(material).label,
        category: material.category || '',
        supplier: material.supplier || '',
        delete: 'n'  // Default to 'n' (don't delete)
      }));
      
      await exportWorkbook('materials.xlsx', [
        { name: 'Materials', rows: exportData, columnWidths: [36, 15, 25, 30, 10, 10, 10, 15, 15, 15, 10] },
      ]);

      alert('Materials exported successfully. This file can be used for import.\n\nTo delete a material, change the "delete" column value to "y".');
    } catch (error) {
      console.error('Error exporting materials:', error);
      alert('Failed to export materials. Please try again.');
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
      await importMaterials(rows);
    } catch (error: any) {
      console.error('Error importing materials:', error);
      alert(`Failed to import materials: ${error.message}`);
    }
  };

  const importMaterials = async (data) => {
    try {
      console.log('Raw import data:', data);
      
      // Track materials to delete
      const materialsToDelete = [];
      
      // Normalize field names and identify materials to delete
      const materialsToInsert = [];
      
      for (const item of data) {
        // Check if this item should be deleted
        let shouldDelete = false;
        let materialName = '';
        
        // Look for delete indicator and name fields
        for (const key of Object.keys(item)) {
          const lowerKey = key.toLowerCase();
          
          if (lowerKey === 'name') {
            materialName = String(item[key] || '');
          } else if (lowerKey === 'delete' || lowerKey === 'remove') {
            const deleteValue = String(item[key] || '').toLowerCase();
            shouldDelete = deleteValue === 'y' || deleteValue === 'yes' || deleteValue === 'true';
          }
        }
        
        // Skip empty rows
        if (!materialName) continue;
        
        if (shouldDelete) {
          // Add to delete list
          materialsToDelete.push(materialName);
        } else {
          // Create a normalized item with default values
          // No `unit` default: the column is numeric, so a text value like 'each'
          // makes every row's insert fail.
          const normalizedItem: Record<string, any> = {
            name: materialName,
            cost: 0,
            description: ''
          };
          
          // Process other fields
          for (const key of Object.keys(item)) {
            const lowerKey = key.toLowerCase();
            
            if (lowerKey === 'sku') {
              const skuValue = String(item[key] ?? '').trim();
              normalizedItem.sku = skuValue || null;
            } else if (lowerKey === 'cost' || lowerKey === 'price') {
              // Handle cost/price field
              const costValue = parseFloat(String(item[key]).replace(/[^0-9.-]+/g, ''));
              normalizedItem.cost = isNaN(costValue) ? 0 : costValue;
            } else if (lowerKey === 'unit') {
              const unitValue = parseFloat(String(item[key]));
              if (!isNaN(unitValue)) normalizedItem.unit = unitValue;
            } else if (lowerKey === 'description' || lowerKey === 'desc') {
              normalizedItem.description = String(item[key] || '');
            } else if (lowerKey === 'quantity' || lowerKey === 'qty') {
              const qtyValue = parseFloat(String(item[key]).replace(/[^0-9.-]+/g, ''));
              normalizedItem.quantity = isNaN(qtyValue) ? 0 : qtyValue;
            } else if (lowerKey === 'category') {
              normalizedItem.category = String(item[key] || '');
            } else if (lowerKey === 'supplier') {
              normalizedItem.supplier = String(item[key] || '');
            }
          }
          
          materialsToInsert.push(normalizedItem);
        }
      }
      
      console.log('Materials to delete:', materialsToDelete);
      console.log('Normalized materials to insert/update:', materialsToInsert);
      
      // Confirm the operation
      const message = [];
      if (materialsToInsert.length > 0) {
        message.push(`Import/update ${materialsToInsert.length} materials`);
      }
      if (materialsToDelete.length > 0) {
        message.push(`Delete ${materialsToDelete.length} materials`);
      }
      
      if (!(await confirmAction(`Are you sure you want to:\n${message.join('\n')}`, 'Import'))) {
        return;
      }
      
      // Process deletions
      let deleteCount = 0;
      let deleteErrorCount = 0;
      
      for (const materialName of materialsToDelete) {
        try {
          // Find the material by name
          const { data: existingMaterial, error: findError } = await supabase
            .from('materials')
            .select('uid')
            .eq('name', materialName)
            .maybeSingle();
          
          if (findError) throw findError;
          
          if (existingMaterial) {
            // Delete the material
            const { error: deleteError } = await supabase
              .from('materials')
              .delete()
              .eq('uid', existingMaterial.uid);
            
            if (deleteError) throw deleteError;
            deleteCount++;
          }
        } catch (error) {
          console.error(`Error deleting material "${materialName}":`, error);
          deleteErrorCount++;
        }
      }
      
      // Process insertions/updates
      let successCount = 0;
      let errorCount = 0;
      
      for (const material of materialsToInsert) {
        try {
          // Check if material with this name already exists
          const { data: existingMaterial, error: checkError } = await supabase
            .from('materials')
            .select('uid')
            .eq('name', material.name)
            .maybeSingle();
          
          if (checkError) throw checkError;
          
          if (existingMaterial) {
            // Update existing material
            const { error: updateError } = await supabase
              .from('materials')
              .update(material)
              .eq('uid', existingMaterial.uid);
            
            if (updateError) throw updateError;
          } else {
            // Insert new material
            const { error: insertError } = await supabase
              .from('materials')
              .insert([material]);
            
            if (insertError) throw insertError;
          }
          
          successCount++;
        } catch (itemError) {
          console.error(`Error processing material "${material.name}":`, itemError);
          errorCount++;
        }
      }
      
      // Build result message
      const resultMessages = [];
      if (successCount > 0) {
        resultMessages.push(`${successCount} materials imported/updated successfully`);
      }
      if (errorCount > 0) {
        resultMessages.push(`${errorCount} materials failed to import/update`);
      }
      if (deleteCount > 0) {
        resultMessages.push(`${deleteCount} materials deleted successfully`);
      }
      if (deleteErrorCount > 0) {
        resultMessages.push(`${deleteErrorCount} materials failed to delete`);
      }
      
      alert(resultMessages.join('\n'));
      
      // Refresh the materials list
      fetchMaterials();
    } catch (error) {
      console.error('Error importing materials:', error);
      alert(`Failed to import materials: ${error.message}`);
    }
  };

  return (
    <View style={{
      flex: 1,
      backgroundColor: '#ffffff',
    }}>
      <View style={{
        backgroundColor: '#ffffff',
        width: '100%',
        height: '100%',
      }}>
        <View style={{
          padding: 16,
          backgroundColor: '#ffffff',
        }}>
          <Text style={{
            fontFamily: 'System',
            fontSize: 26,
            fontWeight: '600',
            marginBottom: 16,
            color: '#333333',
          }}>Inventory</Text>
          
          <View style={{
            flexDirection: 'row',
            marginBottom: 16,
            alignItems: 'center',
          }}>
            <Searchbar
              placeholder="Search inventory..."
              onChangeText={setSearchQuery}
              value={searchQuery}
              style={[{
                flex: 1,
                marginRight: 16,
                backgroundColor: '#f5f5f5'
              }]}
            />
            
            <View style={{ 
              flexDirection: 'row', 
              alignItems: 'center',
              height: 40 // Set a fixed height to ensure vertical alignment
            }}>
              <Button
                mode="contained"
                onPress={() => setShowAddForm(true)}
                style={[{ marginLeft: 16, minWidth: 150 }]}
              >
                Add New Inventory
              </Button>

              <ImportExportButtons onExport={handleExport} onImport={handleImport} />
            </View>
          </View>
          
          <View style={{
            flex: 1,
            margin: 16,
            marginTop: 0,
            backgroundColor: '#ffffff',
          }}>
            <Card style={{
              backgroundColor: '#ffffff',
              borderRadius: 8,
              elevation: 2,
              shadowColor: 'rgba(0,0,0,0.1)',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.8,
              shadowRadius: 1,
            }}>
              <Card.Content style={{ backgroundColor: '#ffffff', padding: 0 }}>
                <DataTable style={{ backgroundColor: '#ffffff' }}>
                  <DataTable.Header style={{ backgroundColor: '#ffffff' }}>
                    <DataTable.Title
                      style={{ backgroundColor: '#ffffff' }}
                      sortDirection={sortColumn === 'sku' ? sortDirection : undefined}
                      onPress={() => handleSort('sku')}
                    >
                      <Text style={{ backgroundColor: '#ffffff' }}>SKU</Text>
                    </DataTable.Title>
                    <DataTable.Title
                      style={{ backgroundColor: '#ffffff' }}
                      sortDirection={sortColumn === 'name' ? sortDirection : undefined}
                      onPress={() => handleSort('name')}
                    >
                      <Text style={{ backgroundColor: '#ffffff' }}>Name</Text>
                    </DataTable.Title>
                    <DataTable.Title 
                      style={{ backgroundColor: '#ffffff' }}
                      sortDirection={sortColumn === 'description' ? sortDirection : undefined}
                      onPress={() => handleSort('description')}
                    >
                      <Text style={{ backgroundColor: '#ffffff' }}>Description</Text>
                    </DataTable.Title>
                    <DataTable.Title
                      style={{ backgroundColor: '#ffffff' }}
                      sortDirection={sortColumn === 'quantity' ? sortDirection : undefined}
                      onPress={() => handleSort('quantity')}
                    >
                      <Text style={{ backgroundColor: '#ffffff' }}>Quantity</Text>
                    </DataTable.Title>
                    <DataTable.Title
                      style={{ backgroundColor: '#ffffff' }}
                      sortDirection={sortColumn === 'cost' ? sortDirection : undefined}
                      onPress={() => handleSort('cost')}
                    >
                      <Text style={{ backgroundColor: '#ffffff' }}>Unit Cost</Text>
                    </DataTable.Title>
                    <DataTable.Title 
                      style={{ backgroundColor: '#ffffff' }}
                      sortDirection={sortColumn === 'supplier' ? sortDirection : undefined}
                      onPress={() => handleSort('supplier')}
                    >
                      <Text style={{ backgroundColor: '#ffffff' }}>Supplier</Text>
                    </DataTable.Title>
                    <DataTable.Title 
                      style={{ backgroundColor: '#ffffff' }}
                      sortDirection={sortColumn === 'category' ? sortDirection : undefined}
                      onPress={() => handleSort('category')}
                    >
                      <Text style={{ backgroundColor: '#ffffff' }}>Category</Text>
                    </DataTable.Title>
                    <DataTable.Title style={{ backgroundColor: '#ffffff' }}>
                      <Text style={{ backgroundColor: '#ffffff' }}>Actions</Text>
                    </DataTable.Title>
                  </DataTable.Header>

                  {loading ? (
                    <DataTable.Row style={{ backgroundColor: '#ffffff' }}>
                      <DataTable.Cell style={{ flex: 8, backgroundColor: '#ffffff' }}>
                        <ActivityIndicator size="small" style={{ marginRight: 8 }} />
                        <Text style={{ backgroundColor: '#ffffff' }}>Loading materials...</Text>
                      </DataTable.Cell>
                    </DataTable.Row>
                  ) : getFilteredMaterials().length === 0 ? (
                    <DataTable.Row style={{ backgroundColor: '#ffffff' }}>
                      <DataTable.Cell style={{ flex: 8, backgroundColor: '#ffffff' }}>
                        <Text style={{ backgroundColor: '#ffffff' }}>No materials found</Text>
                      </DataTable.Cell>
                    </DataTable.Row>
                  ) : (
                    getFilteredMaterials().map(material => (
                      <DataTable.Row key={material.uid} style={{ backgroundColor: '#ffffff' }}>
                        <DataTable.Cell style={{ backgroundColor: '#ffffff' }}>
                          <Text style={{ backgroundColor: '#ffffff' }}>{material.sku || ''}</Text>
                        </DataTable.Cell>
                        <DataTable.Cell style={{ backgroundColor: '#ffffff' }}>
                          <Text style={{ backgroundColor: '#ffffff' }}>{material.name}</Text>
                        </DataTable.Cell>
                        <DataTable.Cell style={{ backgroundColor: '#ffffff' }}>
                          <Text style={{ backgroundColor: '#ffffff' }}>{material.description}</Text>
                        </DataTable.Cell>
                        <DataTable.Cell style={{ backgroundColor: '#ffffff' }}>
                          <Text style={{ backgroundColor: '#ffffff' }}>{material.quantity ?? 0}</Text>
                        </DataTable.Cell>
                        <DataTable.Cell style={{ backgroundColor: '#ffffff' }}>
                          <Text style={{ backgroundColor: '#ffffff' }}>${(material.cost ?? 0).toFixed(2)}</Text>
                        </DataTable.Cell>
                        <DataTable.Cell style={{ backgroundColor: '#ffffff' }}>
                          <Text style={{ backgroundColor: '#ffffff' }}>{material.supplier}</Text>
                        </DataTable.Cell>
                        <DataTable.Cell style={{ backgroundColor: '#ffffff' }}>
                          <Text style={{ backgroundColor: '#ffffff' }}>{material.category}</Text>
                        </DataTable.Cell>
                        <DataTable.Cell style={{ backgroundColor: '#ffffff' }}>
                          <View style={{ flexDirection: 'row', backgroundColor: '#ffffff' }}>
                            <IconButton
                              icon="pencil"
                              size={20}
                              onPress={() => setEditingMaterial(material)}
                              style={{ backgroundColor: '#ffffff' }}
                            />
                            <IconButton
                              icon="delete"
                              size={20}
                              iconColor="red"
                              onPress={() => handleDeleteMaterial(material.uid)}
                              style={{ backgroundColor: '#ffffff' }}
                            />
                          </View>
                        </DataTable.Cell>
                      </DataTable.Row>
                    ))
                  )}
                </DataTable>
              </Card.Content>
            </Card>
          </View>
        </View>
        
        <MaterialDialog
          visible={showAddForm}
          title="Add material"
          subtitle="New stock item for the inventory list"
          submitLabel="Add material"
          submitting={submitting}
          onDismiss={closeAddForm}
          onSubmit={handleAddMaterial}
        />

        <MaterialDialog
          visible={editingMaterial !== null}
          title="Edit material"
          subtitle={editingMaterial?.name}
          material={editingMaterial}
          submitLabel="Save changes"
          submitting={submitting}
          onDismiss={() => setEditingMaterial(null)}
          onSubmit={(draft) => editingMaterial && handleUpdateMaterial(editingMaterial.uid, draft)}
        />
        
        {/* Delete Material Dialog */}
        <Portal>
          <Dialog visible={showDeleteDialog} onDismiss={() => setShowDeleteDialog(false)} style={{ backgroundColor: '#ffffff' }}>
            <Dialog.Title style={{ backgroundColor: '#ffffff' }}>Delete Material</Dialog.Title>
            <Dialog.Content style={{ backgroundColor: '#ffffff' }}>
              <Text style={{ backgroundColor: '#ffffff' }}>Are you sure you want to delete {editingMaterial?.name}?</Text>
              <Text style={{ backgroundColor: '#ffffff' }}>This action cannot be undone.</Text>
            </Dialog.Content>
            <Dialog.Actions style={{ backgroundColor: '#ffffff' }}>
              <Button onPress={() => setShowDeleteDialog(false)}>Cancel</Button>
              <Button onPress={() => handleDeleteMaterial(editingMaterial?.uid || '')} textColor="red">Delete</Button>
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
  },
  addButton: {
    minWidth: 150,
  },
  tableCard: {
    flex: 1,
    marginBottom: 16,
  },
  tableHeader: {
    backgroundColor: '#f0f0f0',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  tableRow: {
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  columnName: {
    flex: 2,
    justifyContent: 'flex-start',
  },
  columnDescription: {
    flex: 3,
    justifyContent: 'flex-start',
  },
  columnCost: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  columnSupplier: {
    flex: 2,
    justifyContent: 'flex-start',
  },
  columnCategory: {
    flex: 2,
    justifyContent: 'flex-start',
  },
  columnActions: {
    flex: 2,
    justifyContent: 'flex-start',
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  cellContent: {
    width: '100%',
    minHeight: 40,
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
}); 