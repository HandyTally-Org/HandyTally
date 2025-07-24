import { useState } from 'react';
import { View } from 'react-native';
import { List, IconButton, TextInput, Button, Dialog, Portal, Text } from 'react-native-paper';
import { styles } from '../styles';
import { Job } from '../app/(app)/jobs';
import { Client } from '../app/(app)/clients';
import { JobStatusSelector, JobStatus } from './JobStatusSelector';

type JobListItemProps = {
  job: Job;
  clients: Client[];
  onUpdate: (uid: string, updates: Partial<Job>) => void;
  onDelete: (uid: string) => void;
  submitting?: boolean;
};

export function JobListItem({ job, clients, onUpdate, onDelete, submitting = false }: JobListItemProps) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [formData, setFormData] = useState({
    name: job.name,
    client_id: job.client_id,
    description: job.description || '',
    start_date: job.start_date || '',
    end_date: job.end_date || '',
    notes: job.notes || '',
    total: job.total?.toString() || '0',
    status: job.status || 'pending',
  });

  const handleChange = (field: keyof typeof formData, value: string) => {
    setFormData({ ...formData, [field]: value });
  };

  const handleSave = () => {
    onUpdate(job.uid, {
      ...formData,
      total: parseFloat(formData.total) || 0,
    });
    setEditing(false);
  };

  const handleDelete = () => {
    onDelete(job.uid);
    setShowDeleteDialog(false);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Not set';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <>
      <List.Accordion
        title={job.name}
        description={job.client?.name || 'No client'}
        expanded={expanded}
        onPress={() => setExpanded(!expanded)}
        right={props => (
          <View style={styles.row}>
            <IconButton
              icon="pencil"
              onPress={() => {
                setExpanded(true);
                setEditing(true);
              }}
            />
            <IconButton
              icon="delete"
              onPress={() => setShowDeleteDialog(true)}
            />
          </View>
        )}
      >
        <View style={{ padding: 16 }}>
          {editing ? (
            <>
              <TextInput
                label="Job Name"
                value={formData.name}
                onChangeText={(value) => handleChange('name', value)}
                style={styles.input}
              />
              
              <Text style={{ marginBottom: 8 }}>Client</Text>
              <View style={styles.input}>
                {clients.length > 0 ? (
                  clients.map((client) => (
                    <Button
                      key={client.id}
                      mode={formData.client_id === client.id ? 'contained' : 'outlined'}
                      onPress={() => handleChange('client_id', client.id)}
                      style={{ marginBottom: 8 }}
                    >
                      {client.name}
                    </Button>
                  ))
                ) : (
                  <Text>No clients available</Text>
                )}
              </View>
              
              <TextInput
                label="Description"
                value={formData.description}
                onChangeText={(value) => handleChange('description', value)}
                multiline
                style={styles.input}
              />
              
              <View style={[styles.row, { gap: 8 }]}>
                <TextInput
                  label="Start Date"
                  value={formData.start_date}
                  onChangeText={(value) => handleChange('start_date', value)}
                  placeholder="YYYY-MM-DD"
                  style={[styles.input, { flex: 1 }]}
                />
                <TextInput
                  label="End Date"
                  value={formData.end_date}
                  onChangeText={(value) => handleChange('end_date', value)}
                  placeholder="YYYY-MM-DD"
                  style={[styles.input, { flex: 1 }]}
                />
              </View>
              
              <TextInput
                label="Notes"
                value={formData.notes}
                onChangeText={(value) => handleChange('notes', value)}
                multiline
                style={styles.input}
              />
              
              <TextInput
                label="Total ($)"
                value={formData.total}
                onChangeText={(value) => handleChange('total', value)}
                keyboardType="numeric"
                style={styles.input}
              />
              
              <JobStatusSelector
                status={formData.status}
                onStatusChange={(status) => handleChange('status', status)}
              />
              
              <View style={[styles.row, { justifyContent: 'flex-end', gap: 8 }]}>
                <Button mode="outlined" onPress={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button mode="contained" onPress={handleSave}>
                  Save
                </Button>
              </View>
            </>
          ) : (
            <>
              <Text variant="bodyMedium">{job.description}</Text>
              <JobStatusSelector
                status={job.status}
                onStatusChange={(status) => onUpdate(job.uid, { status })}
              />
              <List.Item
                title="Dates"
                description={`Start: ${formatDate(job.start_date)}\nEnd: ${formatDate(job.end_date)}`}
                left={props => <List.Icon {...props} icon="calendar" />}
              />
              <List.Item
                title="Notes"
                description={job.notes || 'No notes'}
                left={props => <List.Icon {...props} icon="note" />}
              />
              <List.Item
                title="Total"
                description={`$${job.total?.toFixed(2) || '0.00'}`}
                left={props => <List.Icon {...props} icon="currency-usd" />}
              />
              <View style={[styles.row, { justifyContent: 'flex-end', gap: 8 }]}>
                <Button mode="outlined" icon="pencil" onPress={() => setEditing(true)}>
                  Edit
                </Button>
              </View>
            </>
          )}
        </View>
      </List.Accordion>

      <Portal>
        <Dialog visible={showDeleteDialog} onDismiss={() => setShowDeleteDialog(false)}>
          <Dialog.Title>Delete Job</Dialog.Title>
          <Dialog.Content>
            <Text>Are you sure you want to delete {job.name}? This action cannot be undone.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setShowDeleteDialog(false)}>Cancel</Button>
            <Button onPress={handleDelete}>Delete</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
} 