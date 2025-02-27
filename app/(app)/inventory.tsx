import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Text } from 'react-native';
import { Text as PaperText, Button, Searchbar, Card, DataTable, IconButton, Snackbar } from 'react-native-paper';
import { supabase } from '../../lib/supabase';
import { styles as globalStyles } from '../../styles';
import { PageHeader } from '../../components/PageHeader';
import { ExactHeader } from '../../components/ExactHeader';

export type Material = {
  id: string;
  name: string;
  description: string;
  quantity: number;
  unit: string;
  cost: number;
  category: string;
};

export default function InventoryScreen() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

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

      if (error) {
        throw error;
      }

      if (data) {
        setMaterials(data);
      }
    } catch (error) {
      console.error('Error fetching materials:', error);
      showSnackbar('Error loading materials');
    } finally {
      setLoading(false);
    }
  }

  const filteredMaterials = materials.filter((material) =>
    material.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    material.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    material.category?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const showSnackbar = (message: string) => {
    setSnackbarMessage(message);
    setSnackbarVisible(true);
  };

  const handleAddMaterial = () => {
    // Add material functionality
    console.log('Add new material');
  };

  const handleEditMaterial = (id: string) => {
    // Edit material functionality
    console.log('Edit material:', id);
  };

  const handleDeleteMaterial = (id: string) => {
    // Delete material functionality
    console.log('Delete material:', id);
  };

  const getStatusChip = (quantity: number) => {
    if (quantity <= 0) {
      return <PaperText style={{ color: 'white', backgroundColor: '#F44336', padding: 5, borderRadius: 4 }}>Out of Stock</PaperText>;
    } else if (quantity < 10) {
      return <PaperText style={{ color: 'white', backgroundColor: '#FFA000', padding: 5, borderRadius: 4 }}>Low Stock</PaperText>;
    } else {
      return <PaperText style={{ color: 'white', backgroundColor: '#4CAF50', padding: 5, borderRadius: 4 }}>In Stock</PaperText>;
    }
  };

  return (
    <View style={styles.container}>
      <Text style={{
        fontSize: 28,
        fontWeight: 'bold',
        marginBottom: 16,
        color: '#000000',
      }}>Inventory</Text>
      
      <Searchbar
        placeholder="Search materials..."
        onChangeText={setSearchQuery}
        value={searchQuery}
        style={styles.searchBar}
      />
      
      <Button
        mode="contained"
        onPress={handleAddMaterial}
        style={styles.addButton}
      >
        Add New Material
      </Button>

      <Card style={styles.tableCard}>
        <DataTable>
          <DataTable.Header>
            <DataTable.Title style={styles.centeredCell}>Name</DataTable.Title>
            <DataTable.Title style={styles.centeredCell} numeric>Quantity</DataTable.Title>
            <DataTable.Title style={styles.centeredCell} numeric>Cost</DataTable.Title>
            <DataTable.Title style={styles.centeredCell}>Status</DataTable.Title>
            <DataTable.Title style={styles.centeredCell}>Actions</DataTable.Title>
          </DataTable.Header>

          {loading ? (
            <DataTable.Row>
              <DataTable.Cell style={styles.centeredCell}>Loading materials...</DataTable.Cell>
            </DataTable.Row>
          ) : filteredMaterials.length === 0 ? (
            <DataTable.Row>
              <DataTable.Cell style={styles.centeredCell}>No materials found</DataTable.Cell>
            </DataTable.Row>
          ) : (
            filteredMaterials.map((material) => (
              <DataTable.Row key={material.id}>
                <DataTable.Cell style={styles.centeredCell}>{material.name}</DataTable.Cell>
                <DataTable.Cell style={styles.centeredCell} numeric>{material.quantity}</DataTable.Cell>
                <DataTable.Cell style={styles.centeredCell} numeric>${material.cost}</DataTable.Cell>
                <DataTable.Cell style={styles.centeredCell}>{getStatusChip(material.quantity)}</DataTable.Cell>
                <DataTable.Cell style={styles.centeredCell}>
                  <View style={styles.actionButtons}>
                    <Button 
                      mode="text" 
                      compact 
                      onPress={() => handleEditMaterial(material.id)}
                      labelStyle={styles.actionButtonLabel}
                      style={styles.actionButton}
                    >
                      Edit
                    </Button>
                    <PaperText style={styles.actionSeparator}>|</PaperText>
                    <Button 
                      mode="text" 
                      compact 
                      onPress={() => handleDeleteMaterial(material.id)}
                      labelStyle={styles.actionButtonLabel}
                      style={styles.actionButton}
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
    flex: 1,
    padding: 16,
  },
  header: {
    fontSize: 20,
    fontWeight: 'normal',
    marginBottom: 16,
    fontFamily: 'System',
    color: '#333333',
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
  centeredCell: {
    justifyContent: 'center',
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
}); 