import { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, ScrollView, Platform } from 'react-native';
import { Text, Button, Searchbar, Snackbar, Card, DataTable, Chip, IconButton, ActivityIndicator, Dialog, Portal, TextInput } from 'react-native-paper';
import { supabase } from '../../lib/supabase';
import { MaterialForm } from '../../components/MaterialForm';
import { styles as globalStyles } from '../../styles';
import * as XLSX from 'xlsx';

export type Material = {
  uid: string;
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [sortColumn, setSortColumn] = useState<string>('name');
  const [sortDirection, setSortDirection] = useState<'ascending' | 'descending'>('ascending');

  useEffect(() => {
    fetchMaterials();
    checkTableStructure();
  }, []);

  useEffect(() => {
    console.log('XLSX library loaded:', XLSX);
    if (!XLSX) {
      console.error('XLSX library not available');
    }
  }, []);

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

  async function checkTableStructure() {
    try {
      const { data, error } = await supabase.rpc('execute_sql', {
        sql_query: `
          SELECT column_name, data_type 
          FROM information_schema.columns 
          WHERE table_name = 'materials' AND table_schema = 'public'
          ORDER BY ordinal_position;
        `
      });
      
      console.log('Materials table structure:', data);
      
      if (error) {
        console.error('Error checking table structure:', error);
      }
    } catch (error) {
      console.error('Error:', error);
    }
  }

  const handleAddMaterial = async (material: any) => {
    try {
      console.log('Adding material:', material);
      
      // Only include essential fields with safe type handling
      const essentialMaterial = {
        name: String(material.name || ''),
        description: String(material.description || ''),
        cost: typeof material.cost === 'number' ? material.cost : parseFloat(String(material.cost || '0')),
        unit: String(material.unit || '')
      };
      
      console.log('Essential material:', essentialMaterial);
      
      const { data, error } = await supabase
        .from('materials')
        .insert([essentialMaterial]);
      
      if (error) {
        alert(`Error adding material: ${error.message}`);
        console.error('Error adding material:', error);
        return;
      }
      
      // Refresh the materials list
      fetchMaterials();
      setShowAddForm(false);
      showSnackbar('Material added successfully');
    } catch (error: any) {
      alert(`Error adding material: ${error.message}`);
      console.error('Error adding material:', error);
    }
  };

  const handleUpdateMaterial = async (uid: string, updates: Partial<Material>) => {
    try {
      setSubmitting(true);
      
      console.log('Raw updates:', updates);
      
      // Create a copy of updates to modify
      const formattedUpdates: any = { ...updates };
      
      // Handle all possible numeric fields
      if ('cost' in formattedUpdates) {
        formattedUpdates.cost = formattedUpdates.cost !== undefined && formattedUpdates.cost !== '' 
          ? (typeof formattedUpdates.cost === 'string' ? parseFloat(formattedUpdates.cost) : formattedUpdates.cost) 
          : 0;
      }
      
      if ('quantity' in formattedUpdates) {
        formattedUpdates.quantity = formattedUpdates.quantity !== undefined && formattedUpdates.quantity !== '' 
          ? (typeof formattedUpdates.quantity === 'string' ? parseFloat(formattedUpdates.quantity) : formattedUpdates.quantity) 
          : 0;
      }
      
      // Handle supplier_id which might be the bigint field causing issues
      if ('supplier_id' in formattedUpdates && (formattedUpdates.supplier_id === '' || formattedUpdates.supplier_id === null)) {
        // Remove the field entirely if it's empty
        delete formattedUpdates.supplier_id;
      }
      
      console.log('Formatted updates:', formattedUpdates);
      
      const { error } = await supabase
        .from('materials')
        .update(formattedUpdates)
        .eq('uid', uid);

      if (error) {
        console.error('Database error:', error);
        throw new Error(error.message);
      }

      // Update local state
      setMaterials(
        materials.map((material) => (material.uid === uid ? { ...material, ...formattedUpdates } : material))
      );
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
    material.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    material.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    material.supplier?.toLowerCase().includes(searchQuery.toLowerCase())
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
      
      console.log('Exporting data:', exportData);
      
      // Create worksheet from the data
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      
      // Set column widths for better readability
      if (!worksheet['!cols']) worksheet['!cols'] = [];
      worksheet['!cols'] = [
        { wch: 36 }, // uid
        { wch: 25 }, // name
        { wch: 30 }, // description
        { wch: 10 }, // cost
        { wch: 10 }, // unit
        { wch: 10 }, // quantity
        { wch: 15 }, // status
        { wch: 15 }, // category
        { wch: 15 }, // supplier
        { wch: 10 }  // delete
      ];
      
      // Create workbook and add the worksheet
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Materials');
      
      // Generate Excel file
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      
      // For web, create a download link
      const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'materials.xlsx';
      a.click();
      URL.revokeObjectURL(url);
      
      alert('Materials exported successfully. This file can be used for import.\n\nTo delete a material, change the "delete" column value to "y".');
    } catch (error) {
      console.error('Error exporting materials:', error);
      alert('Failed to export materials. Please try again.');
    }
  };

  const handleImportClick = () => {
    console.log('Import button clicked');
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
          if (confirm(`Are you sure you want to import ${jsonData.length} materials?`)) {
            await importMaterials(jsonData);
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
          const normalizedItem = {
            name: materialName,
            cost: 0,
            unit: 'each',
            description: ''
          };
          
          // Process other fields
          for (const key of Object.keys(item)) {
            const lowerKey = key.toLowerCase();
            
            if (lowerKey === 'cost' || lowerKey === 'price') {
              // Handle cost/price field
              const costValue = parseFloat(String(item[key]).replace(/[^0-9.-]+/g, ''));
              normalizedItem.cost = isNaN(costValue) ? 0 : costValue;
            } else if (lowerKey === 'unit') {
              normalizedItem.unit = String(item[key] || 'each');
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
      
      if (!confirm(`Are you sure you want to:\n${message.join('\n')}`)) {
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
                  onPress={() => {
                    if (fileInputRef.current) {
                      fileInputRef.current.click();
                    } else {
                      console.error("File input ref is null");
                      alert("Could not open file selector. Please try again.");
                    }
                  }}
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
          </View>
          
          {/* Hidden file input for Excel import */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelected}
            accept=".xlsx,.xls"
            style={{ display: 'none' }}
            id="inventory-excel-import"
          />
          
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
                      sortDirection={sortColumn === 'cost' ? sortDirection : undefined}
                      onPress={() => handleSort('cost')}
                    >
                      <Text style={{ backgroundColor: '#ffffff' }}>Cost</Text>
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
                      <DataTable.Cell style={{ flex: 6, backgroundColor: '#ffffff' }}>
                        <ActivityIndicator size="small" style={{ marginRight: 8 }} />
                        <Text style={{ backgroundColor: '#ffffff' }}>Loading materials...</Text>
                      </DataTable.Cell>
                    </DataTable.Row>
                  ) : getFilteredMaterials().length === 0 ? (
                    <DataTable.Row style={{ backgroundColor: '#ffffff' }}>
                      <DataTable.Cell style={{ flex: 6, backgroundColor: '#ffffff' }}>
                        <Text style={{ backgroundColor: '#ffffff' }}>No materials found</Text>
                      </DataTable.Cell>
                    </DataTable.Row>
                  ) : (
                    getFilteredMaterials().map(material => (
                      <DataTable.Row key={material.uid} style={{ backgroundColor: '#ffffff' }}>
                        <DataTable.Cell style={{ backgroundColor: '#ffffff' }}>
                          <Text style={{ backgroundColor: '#ffffff' }}>{material.name}</Text>
                        </DataTable.Cell>
                        <DataTable.Cell style={{ backgroundColor: '#ffffff' }}>
                          <Text style={{ backgroundColor: '#ffffff' }}>{material.description}</Text>
                        </DataTable.Cell>
                        <DataTable.Cell style={{ backgroundColor: '#ffffff' }}>
                          <Text style={{ backgroundColor: '#ffffff' }}>${material.cost.toFixed(2)}</Text>
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
        
        {/* Add Material Dialog */}
        <Portal>
          <Dialog visible={showAddForm} onDismiss={() => setShowAddForm(false)} style={{ backgroundColor: '#ffffff' }}>
            <Dialog.Title style={{ backgroundColor: '#ffffff' }}>Add New Material</Dialog.Title>
            <Dialog.Content style={{ backgroundColor: '#ffffff' }}>
              <TextInput
                label="Name"
                value={editingMaterial?.name || ''}
                onChangeText={(text) => setEditingMaterial({ ...(editingMaterial || {}), name: text } as any)}
                style={{ marginBottom: 10, backgroundColor: '#ffffff' }}
              />
              <TextInput
                label="Description"
                value={editingMaterial?.description || ''}
                onChangeText={(text) => setEditingMaterial({ ...(editingMaterial || {}), description: text } as any)}
                style={{ marginBottom: 10, backgroundColor: '#ffffff' }}
              />
              <TextInput
                label="Cost"
                value={editingMaterial?.cost?.toString() || ''}
                onChangeText={(text) => setEditingMaterial({ ...(editingMaterial || {}), cost: parseFloat(text) } as any)}
                keyboardType="numeric"
                style={{ marginBottom: 10, backgroundColor: '#ffffff' }}
              />
              <TextInput
                label="Supplier"
                value={editingMaterial?.supplier || ''}
                onChangeText={(text) => setEditingMaterial({ ...(editingMaterial || {}), supplier: text } as any)}
                style={{ marginBottom: 10, backgroundColor: '#ffffff' }}
              />
              <TextInput
                label="Category"
                value={editingMaterial?.category || ''}
                onChangeText={(text) => setEditingMaterial({ ...(editingMaterial || {}), category: text } as any)}
                style={{ marginBottom: 10, backgroundColor: '#ffffff' }}
              />
            </Dialog.Content>
            <Dialog.Actions style={{ backgroundColor: '#ffffff' }}>
              <Button onPress={() => setShowAddForm(false)}>Cancel</Button>
              <Button onPress={() => handleAddMaterial(editingMaterial)}>Add</Button>
            </Dialog.Actions>
          </Dialog>
        </Portal>
        
        {/* Edit Material Dialog */}
        <Portal>
          <Dialog visible={editingMaterial !== null} onDismiss={() => setEditingMaterial(null)} style={{ backgroundColor: '#ffffff' }}>
            <Dialog.Title style={{ backgroundColor: '#ffffff' }}>Edit Material</Dialog.Title>
            <Dialog.Content style={{ backgroundColor: '#ffffff' }}>
              <TextInput
                label="Name"
                value={editingMaterial?.name || ''}
                onChangeText={(text) => setEditingMaterial({ ...(editingMaterial || {}), name: text } as any)}
                style={{ marginBottom: 10, backgroundColor: '#ffffff' }}
              />
              <TextInput
                label="Description"
                value={editingMaterial?.description || ''}
                onChangeText={(text) => setEditingMaterial({ ...(editingMaterial || {}), description: text } as any)}
                style={{ marginBottom: 10, backgroundColor: '#ffffff' }}
              />
              <TextInput
                label="Cost"
                value={editingMaterial?.cost?.toString() || ''}
                onChangeText={(text) => setEditingMaterial({ ...(editingMaterial || {}), cost: parseFloat(text) } as any)}
                keyboardType="numeric"
                style={{ marginBottom: 10, backgroundColor: '#ffffff' }}
              />
              <TextInput
                label="Supplier"
                value={editingMaterial?.supplier || ''}
                onChangeText={(text) => setEditingMaterial({ ...(editingMaterial || {}), supplier: text } as any)}
                style={{ marginBottom: 10, backgroundColor: '#ffffff' }}
              />
              <TextInput
                label="Category"
                value={editingMaterial?.category || ''}
                onChangeText={(text) => setEditingMaterial({ ...(editingMaterial || {}), category: text } as any)}
                style={{ marginBottom: 10, backgroundColor: '#ffffff' }}
              />
            </Dialog.Content>
            <Dialog.Actions style={{ backgroundColor: '#ffffff' }}>
              <Button onPress={() => setEditingMaterial(null)}>Cancel</Button>
              <Button onPress={() => handleUpdateMaterial(editingMaterial?.uid || '', editingMaterial || {})}>Update</Button>
            </Dialog.Actions>
          </Dialog>
        </Portal>
        
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