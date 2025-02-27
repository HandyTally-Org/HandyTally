import { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Searchbar, Button } from 'react-native-paper';
import { supabase } from '../lib/api';

export default function JobsPage() {
  const [jobs, setJobs] = useState([]);

  useEffect(() => {
    fetchJobs();
  }, []);

  async function fetchJobs() {
    const { data } = await supabase
      .from('jobs')
      .select(`
        *,
        client:client_id (name)
      `);
    setJobs(data || []);
  }

  return (
    <View style={styles.container}>
      <Text variant="headlineLarge">Jobs</Text>

      <Searchbar
        placeholder="Search jobs..."
        style={styles.searchBar}
      />

      <Button 
        mode="contained" 
        style={styles.addButton}
        contentStyle={styles.addButtonContent}
      >
        Add New Job
      </Button>

      <View style={styles.tableContainer}>
        {/* Header Row */}
        <View style={styles.headerRow}>
          <Text style={[styles.headerCell, { flex: 2 }]}>Name</Text>
          <Text style={[styles.headerCell, { flex: 1 }]}>Client</Text>
          <Text style={[styles.headerCell, { flex: 2 }]}>Description</Text>
          <Text style={[styles.headerCell, { flex: 1 }]}>Start Date</Text>
          <Text style={[styles.headerCell, { flex: 1 }]}>End Date</Text>
          <Text style={[styles.headerCell, { flex: 1 }]}>Status</Text>
          <Text style={[styles.headerCell, { flex: 1 }]}>Actions</Text>
        </View>

        {/* Data Rows */}
        {jobs.map((job) => (
          <View key={job.id} style={styles.dataRow}>
            <Text style={[styles.cell, { flex: 2 }]}>{job.name}</Text>
            <Text style={[styles.cell, { flex: 1 }]}>{job.client?.name || 'Unknown'}</Text>
            <Text style={[styles.cell, { flex: 2 }]}>{job.description}</Text>
            <Text style={[styles.cell, { flex: 1 }]}>{job.start_date}</Text>
            <Text style={[styles.cell, { flex: 1 }]}>{job.end_date}</Text>
            <View style={[styles.cell, { flex: 1 }]}>
              <Text style={[styles.statusBadge, getStatusStyle(job.status)]}>
                {job.status}
              </Text>
            </View>
            <View style={[styles.cell, { flex: 1, flexDirection: 'row', gap: 8 }]}>
              <Text style={styles.editButton}>Edit</Text>
              <Text style={styles.deleteButton}>Delete</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  searchBar: {
    backgroundColor: '#f3f0f7',
    marginVertical: 16,
  },
  addButton: {
    backgroundColor: '#673ab7',
    marginBottom: 16,
  },
  addButtonContent: {
    width: '100%',
  },
  tableContainer: {
    backgroundColor: '#fff',
    borderRadius: 4,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    backgroundColor: '#f5f5f5',
    padding: 12,
  },
  headerCell: {
    fontWeight: 'bold',
    color: '#333',
  },
  dataRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    padding: 12,
  },
  cell: {
    color: '#333',
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    color: '#fff',
    fontSize: 12,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  editButton: {
    color: 'blue',
  },
  deleteButton: {
    color: 'red',
  }
});

const getStatusStyle = (status: string) => {
  switch (status?.toLowerCase()) {
    case 'pending':
      return { backgroundColor: '#FF9800' };
    case 'completed':
      return { backgroundColor: '#4CAF50' };
    case 'in_progress':
      return { backgroundColor: '#2196F3' };
    default:
      return { backgroundColor: '#9E9E9E' };
  }
}; 