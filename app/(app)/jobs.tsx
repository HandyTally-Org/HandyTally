import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, Button, Searchbar, Card, DataTable, Chip, IconButton, Dialog, Portal, Snackbar } from 'react-native-paper';
import { supabase } from '../../lib/api';
import { styles as globalStyles } from '../../styles';

type Job = {
  id: string;
  title: string;
  description: string;
  client_id: string;
  client_name: string;
  start_date: string;
  end_date: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  created_at: string;
};

export default function JobsScreen() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  useEffect(() => {
    fetchJobs();
  }, []);

  async function fetchJobs() {
    try {
      setLoading(true);
      
      // Fetch jobs with client names
      const { data, error } = await supabase
        .from('jobs')
        .select(`
          *,
          clients:client_id (name)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      if (data) {
        // Transform the data to include client_name
        const transformedData = data.map(job => ({
          ...job,
          client_name: job.clients?.name || 'Unknown Client'
        }));
        
        setJobs(transformedData);
      }
    } catch (error) {
      console.error('Error fetching jobs:', error);
      showSnackbar('Error loading jobs');
    } finally {
      setLoading(false);
    }
  }

  const showSnackbar = (message: string) => {
    setSnackbarMessage(message);
    setSnackbarVisible(true);
  };

  const handleDeleteJob = async () => {
    if (!selectedJob) return;
    
    try {
      const { error } = await supabase
        .from('jobs')
        .delete()
        .eq('id', selectedJob.id);
      
      if (error) throw error;
      
      setJobs(jobs.filter(job => job.id !== selectedJob.id));
      showSnackbar('Job deleted successfully');
      setShowDeleteDialog(false);
      setSelectedJob(null);
    } catch (error) {
      console.error('Error deleting job:', error);
      showSnackbar('Error deleting job');
    }
  };

  const handleEditJob = (job: Job) => {
    // Navigate to edit job page
    window.location.href = `/jobs/edit/${job.id}`;
  };

  const handleAddJob = () => {
    // Navigate to add job page
    window.location.href = '/jobs/add';
  };

  const getStatusChip = (status: string | undefined) => {
    switch (status) {
      case 'pending':
        return <Chip mode="outlined" style={{ backgroundColor: '#FFF9C4' }}>Pending</Chip>;
      case 'in_progress':
        return <Chip mode="outlined" style={{ backgroundColor: '#BBDEFB' }}>In Progress</Chip>;
      case 'completed':
        return <Chip mode="outlined" style={{ backgroundColor: '#C8E6C9' }}>Completed</Chip>;
      case 'cancelled':
        return <Chip mode="outlined" style={{ backgroundColor: '#FFCDD2' }}>Cancelled</Chip>;
      default:
        return <Chip mode="outlined">Unknown</Chip>;
    }
  };

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  };

  const filteredJobs = jobs.filter(job => {
    const searchLower = searchQuery.toLowerCase();
    return (
      (job.title?.toLowerCase() || '').includes(searchLower) ||
      (job.description?.toLowerCase() || '').includes(searchLower) ||
      (job.client_name?.toLowerCase() || '').includes(searchLower)
    );
  });

  return (
    <View style={styles.container}>
      <Text style={{
        fontSize: 28,
        fontWeight: 'bold',
        marginBottom: 16,
        color: '#000000',
      }}>Jobs</Text>
      
      <View style={styles.searchAndAddContainer}>
        <Searchbar
          placeholder="Search jobs..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchBar}
        />
        
        <Button
          mode="contained"
          onPress={handleAddJob}
          icon="plus"
          style={styles.addButton}
        >
          Add New Job
        </Button>
      </View>
      
      <Card style={styles.tableCard}>
        <DataTable>
          <DataTable.Header>
            <DataTable.Title>Title</DataTable.Title>
            <DataTable.Title>Description</DataTable.Title>
            <DataTable.Title>Client</DataTable.Title>
            <DataTable.Title>Start Date</DataTable.Title>
            <DataTable.Title>End Date</DataTable.Title>
            <DataTable.Title>Status</DataTable.Title>
            <DataTable.Title>Actions</DataTable.Title>
          </DataTable.Header>
          
          {loading ? (
            <DataTable.Row>
              <DataTable.Cell>Loading jobs...</DataTable.Cell>
            </DataTable.Row>
          ) : filteredJobs.length === 0 ? (
            <DataTable.Row>
              <DataTable.Cell>No jobs found</DataTable.Cell>
            </DataTable.Row>
          ) : (
            filteredJobs.map(job => (
              <DataTable.Row key={job.id}>
                <DataTable.Cell>{job.title}</DataTable.Cell>
                <DataTable.Cell>
                  {job.description ? 
                    (job.description.length > 30 ? job.description.substring(0, 30) + '...' : job.description) 
                    : 'No description'}
                </DataTable.Cell>
                <DataTable.Cell>{job.client_name}</DataTable.Cell>
                <DataTable.Cell>{formatDate(job.start_date)}</DataTable.Cell>
                <DataTable.Cell>{formatDate(job.end_date)}</DataTable.Cell>
                <DataTable.Cell>{getStatusChip(job.status)}</DataTable.Cell>
                <DataTable.Cell>
                  <View style={styles.actionButtons}>
                    <IconButton
                      icon="pencil"
                      size={20}
                      onPress={() => handleEditJob(job)}
                    />
                    <IconButton
                      icon="delete"
                      size={20}
                      onPress={() => {
                        setSelectedJob(job);
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
      
      {/* Delete Job Dialog */}
      <Portal>
        <Dialog visible={showDeleteDialog} onDismiss={() => setShowDeleteDialog(false)}>
          <Dialog.Title>Delete Job</Dialog.Title>
          <Dialog.Content>
            <Text>Are you sure you want to delete the job "{selectedJob?.title}"?</Text>
            <Text>This action cannot be undone.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setShowDeleteDialog(false)}>Cancel</Button>
            <Button onPress={handleDeleteJob} textColor="red">Delete</Button>
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
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
}); 