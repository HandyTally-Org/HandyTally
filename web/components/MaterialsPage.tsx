import { useState, useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button, DataTable, Searchbar, IconButton, Menu, Portal, Dialog } from 'react-native-paper';
import { supabase } from '../lib/api';
import * as XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';

export default function MaterialsPage() {
  const [materials, setMaterials] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchMaterials();
  }, []);

  async function fetchMaterials() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('materials')
        .select('*')
        .order('name');
      
      if (error) throw error;
      setMaterials(data || []);
    } catch (error) {
      console.error('Error fetching materials:', error);
      alert('Error loading materials. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const handleExport = async () => {
    try {
      // Create worksheet from materials data
      const worksheet = XLSX.utils.json_to_sheet(materials);
      
      // Create workbook and add the worksheet
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Materials');
      
      // Generate Excel file
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      
      if (Platform.OS === 'web') {
        // For web, create a download link
        const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'materials.xlsx';
        a.click();
        URL.revokeObjectURL(url);
      } else {
        // For mobile, save and share the file
        const fileUri = `${FileSystem.documentDirectory}materials.xlsx`;
        await FileSystem.writeAsStringAsync(fileUri, excelBuffer.toString(), { encoding: FileSystem.EncodingType.Base64 });
        await Sharing.shareAsync(fileUri);
      }
    } catch (error) {
      console.error('Error exporting materials:', error);
      alert('Failed to export materials. Please try again.');
    }
  };

  const handleImportClick = () => {
    if (Platform.OS === 'web') {
      // For web, trigger file input click
      fileInputRef.current?.click();
    } else {
      // For mobile, show dialog
      setShowImportDialog(true);
    }
  };

  const handleFileSelected = async (event) => {
    try {
      let file;
      
      if (Platform.OS === 'web') {
        file = event.target.files[0];
        if (!file) return;
      } else {
        const result = await DocumentPicker.getDocumentAsync({
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        
        if (result.canceled) return;
        file = result.assets[0];
      }
      
      // Read the Excel file
      const data = await readExcelFile(file);
      
      // Validate the data
      if (!validateMaterialsData(data)) {
        alert('Invalid file format. Please ensure your Excel file has the correct columns.');
        return;
      }
      
      // Confirm import
      if (confirm(`Are you sure you want to import ${data.length} materials? This will overwrite any existing materials with the same name.`)) {
        await importMaterials(data);
      }
    } catch (error) {
      console.error('Error importing materials:', error);
      alert('Failed to import materials. Please try again.');
    }
  };

  const readExcelFile = async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(firstSheet);
          resolve(jsonData);
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = (error) => reject(error);
      reader.readAsArrayBuffer(file);
    });
  };

  const validateMaterialsData = (data) => {
    if (!Array.isArray(data) || data.length === 0) return false;
    
    // Check if required columns exist
    const requiredColumns = ['name', 'cost', 'unit'];
    const sampleItem = data[0];
    
    return requiredColumns.every(column => column in sampleItem);
  };

  const importMaterials = async (data) => {
    try {
      setLoading(true);
      
      // Format the data for insertion
      const materialsToInsert = data.map(item => ({
        name: item.name,
        cost: parseFloat(item.cost) || 0,
        unit: item.unit || 'each',
        description: item.description || '',
        status: item.status || 'In Stock'
      }));
      
      // Use upsert to insert or update existing materials
      const { error } = await supabase
        .from('materials')
        .upsert(materialsToInsert, { onConflict: 'name' });
      
      if (error) throw error;
      
      alert('Materials imported successfully!');
      await fetchMaterials();
    } catch (error) {
      console.error('Error importing materials:', error);
      alert(`Failed to import materials: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text variant="headlineLarge">Materials</Text>

      <View style={styles.searchContainer}>
        <Searchbar
          placeholder="Search materials..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={styles.searchBar}
        />
        
        {/* Add export and import icons here */}
        <View style={styles.actionButtons}>
          <IconButton
            icon="file-export"
            mode="contained"
            onPress={handleExport}
            iconColor="#fff"
            containerColor="#4CAF50"
            size={20}
            style={styles.actionButton}
          />
          <IconButton
            icon="file-import"
            mode="contained"
            onPress={handleImportClick}
            iconColor="#fff"
            containerColor="#2196F3"
            size={20}
            style={styles.actionButton}
          />
          {/* Hidden file input for web */}
          {Platform.OS === 'web' && (
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelected}
              accept=".xlsx,.xls"
              style={{ display: 'none' }}
            />
          )}
        </View>
      </View>

      <Button 
        mode="contained" 
        style={styles.addButton}
        onPress={() => {/* Add new material logic */}}
      >
        Add New Material
      </Button>

      {/* Rest of your component... */}
      
      {/* Import Dialog for mobile */}
      <Portal>
        <Dialog visible={showImportDialog} onDismiss={() => setShowImportDialog(false)}>
          <Dialog.Title>Import Materials</Dialog.Title>
          <Dialog.Content>
            <Text>Select an Excel file to import materials data.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setShowImportDialog(false)}>Cancel</Button>
            <Button onPress={() => {
              setShowImportDialog(false);
              handleFileSelected();
            }}>Select File</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  searchContainer: {
    marginVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchBar: {
    flex: 1,
    backgroundColor: '#f3f0f7',
  },
  actionButtons: {
    flexDirection: 'row',
    marginLeft: 8,
  },
  actionButton: {
    marginHorizontal: 4,
  },
  addButton: {
    backgroundColor: '#673ab7',
    marginBottom: 16,
  },
  // Rest of your styles...
}); 