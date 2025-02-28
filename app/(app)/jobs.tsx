import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Text, Button, Searchbar, Card, DataTable, Chip, IconButton, Dialog, Portal, Snackbar, TextInput, RadioButton } from 'react-native-paper';
import { supabase } from '../../lib/api';
import { styles as globalStyles } from '../../styles';
import { JobForm } from '../../components/JobForm';

type Job = {
  uid: string;
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
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [sortColumn, setSortColumn] = useState<string>('name');
  const [sortDirection, setSortDirection] = useState<'ascending' | 'descending'>('ascending');
  const [showClientDropdown, setShowClientDropdown] = useState(false);

  useEffect(() => {
    fetchJobs();
  }, []);

  useEffect(() => {
    if (clients.length === 0) {
      fetchClients();
    }
  }, [clients.length]);

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

  async function fetchClients() {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('name');
      
      if (error) throw error;
      
      if (data) {
        setClients(data);
      }
    } catch (error) {
      console.error('Error fetching clients:', error);
      showSnackbar('Error loading clients');
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
        .eq('uid', selectedJob.uid);
      
      if (error) throw error;
      
      setJobs(jobs.filter(job => job.uid !== selectedJob.uid));
      showSnackbar('Job deleted successfully');
      setShowDeleteDialog(false);
      setSelectedJob(null);
    } catch (error) {
      console.error('Error deleting job:', error);
      showSnackbar('Error deleting job');
    }
  };

  const handleEditJob = (job: Job) => {
    setEditingJob({...job});
    setShowEditDialog(true);
  };

  const handleUpdateJob = async () => {
    if (!editingJob) return;
    
    try {
      setLoading(true);
      
      // Create a clean update object with only the fields we want to update
      const updateData = {
        title: editingJob.title || '',
        description: editingJob.description || '',
        start_date: formatDateForDB(editingJob.start_date),
        end_date: formatDateForDB(editingJob.end_date),
        status: editingJob.status || 'pending',
        client_id: editingJob.client_id // Add client_id to the update data
      };
      
      console.log('Updating job with data:', updateData);
      
      const { data, error } = await supabase
        .from('jobs')
        .update(updateData)
        .eq('uid', editingJob.uid)
        .select();
      
      if (error) {
        console.error('Supabase error:', error);
        throw error;
      }
      
      console.log('Update response:', data);
      
      // Close the edit dialog
      setShowEditDialog(false);
      setEditingJob(null);
      
      // Refresh the jobs list to get updated data including client names
      await fetchJobs();
      
      showSnackbar('Job updated successfully');
    } catch (error: any) {
      console.error('Error updating job:', error);
      showSnackbar('Error updating job: ' + (error.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const handleAddJob = async (jobData) => {
    try {
      setLoading(true);
      
      // Create the job in the database
      const { data, error } = await supabase
        .from('jobs')
        .insert([jobData])
        .select();
      
      if (error) throw error;
      
      // Update the jobs list
      setJobs([...(data || []), ...jobs]);
      
      // Close the form
      setShowAddForm(false);
      
      // Show success message
      showSnackbar('Job created successfully');
    } catch (error) {
      console.error('Error adding job:', error);
      showSnackbar('Failed to create job');
    } finally {
      setLoading(false);
    }
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
    if (!dateString || dateString.trim() === '') return '';
    
    // If it's already in MM/DD/YYYY format, return as is
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateString)) {
      return dateString;
    }
    
    try {
      const date = new Date(dateString);
      // Check if date is valid
      if (isNaN(date.getTime())) {
        return dateString; // Return the original string if it's not a valid date
      }
      
      return date.toLocaleDateString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric'
      });
    } catch (error) {
      console.error('Error formatting date:', error);
      return dateString; // Return the original string on error
    }
  };

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'ascending' ? 'descending' : 'ascending');
    } else {
      setSortColumn(column);
      setSortDirection('ascending');
    }
  };

  const getFilteredJobs = () => {
    let filtered = [...jobs];
    
    if (searchQuery) {
      filtered = filtered.filter(job => 
        job.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        job.client_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        job.description?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    // Apply status filter
    if (selectedStatuses.length > 0) {
      filtered = filtered.filter(job => selectedStatuses.includes(job.status));
    }
    
    // Apply sorting
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (sortColumn) {
        case 'title':
          comparison = a.title.localeCompare(b.title);
          break;
        case 'client_name':
          comparison = (a.client_name || '').localeCompare(b.client_name || '');
          break;
        case 'start_date':
          comparison = new Date(a.start_date || 0).getTime() - new Date(b.start_date || 0).getTime();
          break;
        case 'end_date':
          comparison = new Date(a.end_date || 0).getTime() - new Date(b.end_date || 0).getTime();
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
        case 'created_at':
          comparison = new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
          break;
        default:
          comparison = 0;
      }
      
      return sortDirection === 'ascending' ? comparison : -comparison;
    });
    
    return filtered;
  };

  const statusOptions = [
    { value: 'pending', label: 'Pending' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'completed', label: 'Completed' },
    { value: 'cancelled', label: 'Cancelled' }
  ];

  const toggleStatusFilter = (status: string) => {
    if (selectedStatuses.includes(status)) {
      // If already selected, remove it
      setSelectedStatuses(selectedStatuses.filter(s => s !== status));
    } else {
      // If not selected, add it
      setSelectedStatuses([...selectedStatuses, status]);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return '#FFF9C4';
      case 'in_progress':
        return '#BBDEFB';
      case 'completed':
        return '#C8E6C9';
      case 'cancelled':
        return '#FFCDD2';
      default:
        return '#FFFFFF';
    }
  };

  // Helper function to ensure dates are in YYYY-MM-DD format for the database
  const formatDateForDB = (dateString: string | undefined) => {
    if (!dateString || dateString.trim() === '') return null;
    
    // If already in YYYY-MM-DD format, return as is
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      return dateString;
    }
    
    // If in MM/DD/YYYY format, convert to YYYY-MM-DD
    const mmddyyyyPattern = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
    const match = dateString.match(mmddyyyyPattern);
    if (match) {
      const month = match[1].padStart(2, '0');
      const day = match[2].padStart(2, '0');
      const year = match[3];
      return `${year}-${month}-${day}`;
    }
    
    // Check for MMDDYYYY format (8 digits with no separators)
    const mmddyyyyNoSeparator = /^(\d{8})$/;
    const noSepMatch = dateString.match(mmddyyyyNoSeparator);
    if (noSepMatch) {
      const fullDate = noSepMatch[1];
      const month = fullDate.substring(0, 2);
      const day = fullDate.substring(2, 4);
      const year = fullDate.substring(4, 8);
      return `${year}-${month}-${day}`;
    }
    
    try {
      // Try to create a date object and format it
      const date = new Date(dateString);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }
    } catch (error) {
      console.error('Error formatting date for DB:', error);
    }
    
    // If we can't parse it, return as is
    return dateString;
  };

  // Add this new function to format date input
  const formatDateInput = (text: string): string => {
    // Remove any non-digit characters
    const digitsOnly = text.replace(/\D/g, '');
    
    // If it's 8 digits (MMDDYYYY), format as MM/DD/YYYY
    if (digitsOnly.length === 8) {
      const month = digitsOnly.substring(0, 2);
      const day = digitsOnly.substring(2, 4);
      const year = digitsOnly.substring(4, 8);
      return `${month}/${day}/${year}`;
    }
    
    // If it's less than 8 digits, just return what they typed
    return text;
  };

  return (
    <View style={styles.container}>
      <Text style={{
        fontFamily: 'System',
        fontSize: 26,
        fontWeight: '600',
        marginBottom: 16,
        color: '#333333',
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
          onPress={() => setShowAddForm(true)}
          style={styles.addButton}
        >
          Add New Job
        </Button>
      </View>
      
      <View style={styles.filtersContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtersScroll}>
          <Chip
            selected={selectedStatuses.length === 0}
            onPress={() => setSelectedStatuses([])}
            style={styles.filterChip}
            mode="outlined"
          >
            All
          </Chip>
          
          <Chip
            selected={selectedStatuses.includes('pending')}
            onPress={() => toggleStatusFilter('pending')}
            style={[styles.filterChip, { backgroundColor: selectedStatuses.includes('pending') ? '#FFF9C4' : undefined }]}
            mode="outlined"
          >
            Pending
          </Chip>
          
          <Chip
            selected={selectedStatuses.includes('in_progress')}
            onPress={() => toggleStatusFilter('in_progress')}
            style={[styles.filterChip, { backgroundColor: selectedStatuses.includes('in_progress') ? '#BBDEFB' : undefined }]}
            mode="outlined"
          >
            In Progress
          </Chip>
          
          <Chip
            selected={selectedStatuses.includes('completed')}
            onPress={() => toggleStatusFilter('completed')}
            style={[styles.filterChip, { backgroundColor: selectedStatuses.includes('completed') ? '#C8E6C9' : undefined }]}
            mode="outlined"
          >
            Completed
          </Chip>
          
          <Chip
            selected={selectedStatuses.includes('cancelled')}
            onPress={() => toggleStatusFilter('cancelled')}
            style={[styles.filterChip, { backgroundColor: selectedStatuses.includes('cancelled') ? '#FFCDD2' : undefined }]}
            mode="outlined"
          >
            Cancelled
          </Chip>
        </ScrollView>
      </View>
      
      <Card style={styles.tableCard}>
        <DataTable>
          <DataTable.Header>
            <DataTable.Title 
              onPress={() => handleSort('title')}
              sortDirection={sortColumn === 'title' ? sortDirection : undefined}
            >
              Job Name
            </DataTable.Title>
            <DataTable.Title 
              onPress={() => handleSort('client_name')}
              sortDirection={sortColumn === 'client_name' ? sortDirection : undefined}
            >
              Client
            </DataTable.Title>
            <DataTable.Title 
              onPress={() => handleSort('status')}
              sortDirection={sortColumn === 'status' ? sortDirection : undefined}
            >
              Status
            </DataTable.Title>
            <DataTable.Title 
              onPress={() => handleSort('start_date')}
              sortDirection={sortColumn === 'start_date' ? sortDirection : undefined}
            >
              Start Date
            </DataTable.Title>
            <DataTable.Title 
              onPress={() => handleSort('end_date')}
              sortDirection={sortColumn === 'end_date' ? sortDirection : undefined}
            >
              End Date
            </DataTable.Title>
            <DataTable.Title>Actions</DataTable.Title>
          </DataTable.Header>
          
          {loading ? (
            <DataTable.Row>
              <DataTable.Cell style={{ flex: 6 }}>Loading jobs...</DataTable.Cell>
            </DataTable.Row>
          ) : getFilteredJobs().length === 0 ? (
            <DataTable.Row>
              <DataTable.Cell style={{ flex: 6 }}>No jobs found</DataTable.Cell>
            </DataTable.Row>
          ) : (
            getFilteredJobs().map(job => (
              <DataTable.Row key={job.uid}>
                <DataTable.Cell>{job.title}</DataTable.Cell>
                <DataTable.Cell>{job.client_name}</DataTable.Cell>
                <DataTable.Cell>{getStatusChip(job.status)}</DataTable.Cell>
                <DataTable.Cell>{formatDate(job.start_date)}</DataTable.Cell>
                <DataTable.Cell>{formatDate(job.end_date)}</DataTable.Cell>
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
                      iconColor="red"
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
      
      {/* Edit Job Dialog */}
      <Portal>
        <Dialog visible={showEditDialog} onDismiss={() => setShowEditDialog(false)} style={styles.editDialog}>
          <Dialog.Title>Edit Job</Dialog.Title>
          <Dialog.Content style={styles.dialogContent}>
            {editingJob && (
              <View style={styles.formContainer}>
                <Text style={styles.inputLabel}>Title</Text>
                <TextInput
                  value={editingJob.title}
                  onChangeText={(text) => setEditingJob({...editingJob, title: text})}
                  style={styles.input}
                  mode="outlined"
                />
                
                <Text style={styles.inputLabel}>Client</Text>
                <View style={styles.dropdownContainer}>
                  <TextInput
                    value={clients.find(client => client.uid === editingJob.client_id)?.name || 'Select Client'}
                    style={[styles.input, { cursor: 'pointer' }]}
                    mode="outlined"
                    right={
                      <TextInput.Icon 
                        icon="menu-down" 
                        onPress={() => setShowClientDropdown(!showClientDropdown)} 
                      />
                    }
                    onTouchStart={() => setShowClientDropdown(!showClientDropdown)}
                    onClick={() => setShowClientDropdown(!showClientDropdown)}
                    editable={false}
                    pointerEvents="auto"
                  />
                  {showClientDropdown && (
                    <View style={styles.dropdown}>
                      {clients.map(client => (
                        <TouchableOpacity
                          key={client.uid}
                          style={{
                            padding: 12,
                            borderBottomWidth: 1,
                            borderBottomColor: '#f0f0f0',
                            backgroundColor: client.uid === editingJob.client_id 
                              ? '#f0f0f0' 
                              : 'white',
                            width: '100%',
                            display: 'flex',
                            flexDirection: 'row',
                            alignItems: 'center'
                          }}
                          onPress={() => {
                            setEditingJob({
                              ...editingJob, 
                              client_id: client.uid,
                              client_name: client.name // Also update the client_name in the local state
                            });
                            setShowClientDropdown(false);
                          }}
                          onMouseEnter={(e) => {
                            // @ts-ignore - Add hover effect
                            e.currentTarget.style.backgroundColor = '#f5f5f5';
                          }}
                          onMouseLeave={(e) => {
                            // @ts-ignore - Remove hover effect
                            e.currentTarget.style.backgroundColor = 
                              client.uid === editingJob.client_id 
                                ? '#f0f0f0' 
                                : 'white';
                          }}
                        >
                          <Text style={{ flex: 1, fontSize: 16, fontWeight: '500', marginLeft: 8 }}>{client.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
                
                <Text style={styles.inputLabel}>Description</Text>
                <TextInput
                  value={editingJob.description}
                  onChangeText={(text) => setEditingJob({...editingJob, description: text})}
                  style={styles.input}
                  multiline
                  numberOfLines={3}
                  mode="outlined"
                />
                
                <Text style={styles.inputLabel}>Start Date</Text>
                <TextInput
                  defaultValue=""
                  value={editingJob.start_date === null ? '' : editingJob.start_date}
                  onChangeText={(text) => {
                    // Format the input if it matches MMDDYYYY pattern
                    const formattedText = formatDateInput(text);
                    setEditingJob({...editingJob, start_date: formattedText});
                  }}
                  style={styles.input}
                  placeholder="MM/DD/YYYY"
                  mode="outlined"
                />
                
                <Text style={styles.inputLabel}>End Date</Text>
                <TextInput
                  defaultValue=""
                  value={editingJob.end_date === null ? '' : editingJob.end_date}
                  onChangeText={(text) => {
                    // Format the input if it matches MMDDYYYY pattern
                    const formattedText = formatDateInput(text);
                    setEditingJob({...editingJob, end_date: formattedText});
                  }}
                  style={styles.input}
                  placeholder="MM/DD/YYYY"
                  mode="outlined"
                />
                
                <Text style={styles.inputLabel}>Status</Text>
                <View style={styles.dropdownContainer}>
                  <TextInput
                    value={statusOptions.find(option => option.value === editingJob.status)?.label || ''}
                    style={[styles.input, { cursor: 'pointer' }]}
                    mode="outlined"
                    right={
                      <TextInput.Icon 
                        icon="menu-down" 
                        onPress={() => setShowStatusDropdown(!showStatusDropdown)} 
                      />
                    }
                    onTouchStart={() => setShowStatusDropdown(!showStatusDropdown)}
                    onClick={() => setShowStatusDropdown(!showStatusDropdown)}
                    editable={false}
                    pointerEvents="auto"
                  />
                  {showStatusDropdown && (
                    <View style={styles.dropdown}>
                      {statusOptions.map(option => (
                        <TouchableOpacity
                          key={option.value}
                          style={{
                            padding: 12,
                            borderBottomWidth: 1,
                            borderBottomColor: '#f0f0f0',
                            backgroundColor: option.value === editingJob.status 
                              ? getStatusColor(option.value) 
                              : 'white',
                            borderLeftWidth: 4,
                            borderLeftColor: getStatusColor(option.value),
                            width: '100%',
                            display: 'flex',
                            flexDirection: 'row',
                            alignItems: 'center'
                          }}
                          onPress={() => {
                            setEditingJob({...editingJob, status: option.value as Job['status']});
                            setShowStatusDropdown(false);
                          }}
                          onMouseEnter={(e) => {
                            // @ts-ignore - Add hover effect
                            e.currentTarget.style.backgroundColor = getStatusColor(option.value);
                            // @ts-ignore - Add hover effect
                            e.currentTarget.style.opacity = 0.8;
                          }}
                          onMouseLeave={(e) => {
                            // @ts-ignore - Remove hover effect
                            e.currentTarget.style.backgroundColor = 
                              option.value === editingJob.status 
                                ? getStatusColor(option.value) 
                                : 'white';
                            // @ts-ignore - Remove hover effect
                            e.currentTarget.style.opacity = 1;
                          }}
                        >
                          <Text style={{ flex: 1, fontSize: 16, fontWeight: '500', marginLeft: 8 }}>{option.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            )}
          </Dialog.Content>
          <Dialog.Actions style={styles.dialogActions}>
            <Button onPress={() => setShowEditDialog(false)}>Cancel</Button>
            <Button 
              onPress={handleUpdateJob} 
              mode="contained"
              loading={loading}
              disabled={loading}
            >
              Save Changes
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
      
      {showAddForm ? (
        <JobForm
          clients={clients}
          onSubmit={handleAddJob}
          onCancel={() => setShowAddForm(false)}
        />
      ) : selectedJob ? (
        <></>
      ) : (
        <></>
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
    flex: 1,
    padding: 16,
  },
  searchAndAddContainer: {
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'center',
  },
  searchBar: {
    flex: 1,
    marginRight: 16,
  },
  addButton: {
    marginLeft: 8,
  },
  filtersContainer: {
    marginBottom: 16,
    flexDirection: 'row',
  },
  filtersScroll: {
    flexGrow: 0,
  },
  filterChip: {
    marginRight: 8,
  },
  tableCard: {
    flex: 1,
  },
  actionButtons: {
    flexDirection: 'row',
  },
  editDialog: {
    width: '90%',
    maxWidth: 600,
    alignSelf: 'center',
    borderRadius: 10,
    backgroundColor: '#f5f5f5',
    zIndex: 100,
  },
  dialogContent: {
    paddingHorizontal: 20,
    paddingBottom: 10,
    backgroundColor: '#f5f5f5',
    zIndex: 100,
  },
  formContainer: {
    backgroundColor: '#f5f5f5',
    zIndex: 100,
  },
  dialogActions: {
    padding: 15,
    justifyContent: 'space-between',
    backgroundColor: '#f5f5f5',
  },
  input: {
    marginBottom: 20,
    backgroundColor: '#ffffff',
  },
  statusInput: {
    marginBottom: 20,
    backgroundColor: '#ffffff',
    cursor: 'pointer',
  },
  inputLabel: {
    fontSize: 16,
    marginBottom: 8,
    fontWeight: '500',
  },
  label: {
    fontSize: 16,
    marginBottom: 8,
  },
  dropdownContainer: {
    position: 'relative',
    marginBottom: 20,
    zIndex: 1000,
  },
  dropdown: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 4,
    zIndex: 1001,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    overflow: 'hidden',
    width: '100%'
  },
  dropdownItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    flexDirection: 'row',
    alignItems: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    width: '100%',
    display: 'flex',
    justifyContent: 'flex-start'
  },
  dropdownItemText: {
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 8,
  },
  getStatusColor: (status: string) => {
    switch (status) {
      case 'pending':
        return '#FFF9C4';
      case 'in_progress':
        return '#BBDEFB';
      case 'completed':
        return '#C8E6C9';
      case 'cancelled':
        return '#FFCDD2';
      default:
        return '#FFFFFF';
    }
  },
}); 