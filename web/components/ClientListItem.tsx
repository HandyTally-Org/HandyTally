import { useState } from 'react';
import { View } from 'react-native';
import { List, IconButton, TextInput, Button, Dialog, Portal, Text, ActivityIndicator } from 'react-native-paper';
import { styles } from '../styles';
import { Client } from '../app/(app)/clients';

type ClientListItemProps = {
  client: Client;
  onUpdate: (uid: string, updates: Partial<Client>) => void;
  onDelete: (uid: string) => void;
  submitting?: boolean;
};

export function ClientListItem({ client, onUpdate, onDelete, submitting = false }: ClientListItemProps) {
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({
    name: client.name,
    email: client.email || '',
    phone: client.phone || '',
    address: client.address || '',
    notes: client.notes || '',
  });
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const handleEdit = () => {
    setEditData({
      name: client.name,
      email: client.email || '',
      phone: client.phone || '',
      address: client.address || '',
      notes: client.notes || '',
    });
    setEditing(true);
  };

  const handleSave = () => {
    console.log('Saving client with uid:', client.uid);
    console.log('Edit data:', editData);
    onUpdate(client.uid, editData);
    setEditing(false);
  };

  const handleCancel = () => {
    setEditing(false);
    setEditData({
      name: client.name,
      email: client.email || '',
      phone: client.phone || '',
      address: client.address || '',
      notes: client.notes || '',
    });
  };

  const handleDelete = () => {
    onDelete(client.uid);
    setShowDeleteDialog(false);
  };

  return (
    <>
      {editing ? (
        <View style={styles.editForm}>
          <Text style={{ fontWeight: 'bold', marginBottom: 8 }}>Edit Client: {client.name}</Text>
          <TextInput
            label="Name"
            value={editData.name}
            onChangeText={(text) => setEditData({ ...editData, name: text })}
            style={styles.input}
            disabled={submitting}
          />
          <TextInput
            label="Email"
            value={editData.email}
            onChangeText={(text) => setEditData({ ...editData, email: text })}
            style={styles.input}
            disabled={submitting}
          />
          <TextInput
            label="Phone"
            value={editData.phone}
            onChangeText={(text) => setEditData({ ...editData, phone: text })}
            style={styles.input}
            disabled={submitting}
          />
          <TextInput
            label="Address"
            value={editData.address}
            onChangeText={(text) => setEditData({ ...editData, address: text })}
            multiline
            style={styles.input}
            disabled={submitting}
          />
          <TextInput
            label="Notes"
            value={editData.notes}
            onChangeText={(text) => setEditData({ ...editData, notes: text })}
            multiline
            style={styles.input}
            disabled={submitting}
          />
          <View style={[styles.row, { justifyContent: 'flex-end', gap: 8, marginTop: 8 }]}>
            <Button onPress={handleCancel} disabled={submitting}>Cancel</Button>
            <Button 
              mode="contained" 
              onPress={handleSave} 
              disabled={submitting}
              loading={submitting}
            >
              Save
            </Button>
          </View>
          
          {submitting && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" />
              <Text style={styles.loadingText}>Saving...</Text>
            </View>
          )}
        </View>
      ) : (
        <List.Item
          title={client.name}
          description={client.email || client.phone}
          right={props => (
            <View style={{ flexDirection: 'row' }}>
              <IconButton 
                icon="pencil" 
                onPress={handleEdit} 
                disabled={submitting}
              />
              <IconButton 
                icon="delete" 
                onPress={() => setShowDeleteDialog(true)} 
                disabled={submitting}
              />
            </View>
          )}
        />
      )}

      <Portal>
        <Dialog visible={showDeleteDialog} onDismiss={() => setShowDeleteDialog(false)}>
          <Dialog.Title>Delete Client</Dialog.Title>
          <Dialog.Content>
            <Text>Are you sure you want to delete {client.name}? This action cannot be undone.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setShowDeleteDialog(false)} disabled={submitting}>Cancel</Button>
            <Button 
              onPress={handleDelete} 
              disabled={submitting}
              loading={submitting}
            >
              Delete
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
} 