import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, FlatList, TouchableOpacity, Modal, Pressable, Alert } from 'react-native';
import { Button, Chip } from 'react-native-paper';
import { FontAwesome } from '@expo/vector-icons';
// Use a direct import that should work in any Next.js project
import { format } from 'date-fns';
import { useRouter } from 'expo-router';
// import * as Clipboard from 'expo-clipboard';

// Create mock supabase client for testing
const supabase = {
  from: (table: string) => ({
    select: () => ({
      order: (column: string, { ascending }: { ascending: boolean }) => ({
        then: (callback: Function) => callback({ data: [], error: null }),
        // Add async/await support
        async: () => Promise.resolve({ data: [], error: null })
      })
    }),
    insert: (data: any) => ({
      select: () => Promise.resolve({ data: [{ ...data, id: '123' }], error: null })
    }),
    delete: () => ({
      eq: (column: string, value: string) => Promise.resolve({ error: null })
    }),
    // Add update function
    update: (data: any) => ({
      eq: (column: string, value: string) => Promise.resolve({ data, error: null })
    })
  }),
  // Add auth for user management
  auth: {
    admin: {
      updateUserById: (userId: string, { user_metadata }: { user_metadata: any }) => {
        return Promise.resolve({ 
          data: { user: { id: userId, user_metadata } }, 
          error: null 
        });
      }
    },
    signIn: (credentials: any) => Promise.resolve({ data: { user: credentials }, error: null }),
    signUp: (credentials: any) => Promise.resolve({ data: { user: credentials }, error: null }),
    resetPasswordForEmail: (email: string, { redirectTo }: { redirectTo: string }) => {
      // Implementation of resetPasswordForEmail
      return Promise.resolve({ error: null });
    }
  }
};

// Create mock Clipboard
const Clipboard = {
  setStringAsync: async (text: string) => Promise.resolve(true)
};

// Add interface for User
interface User {
  id: string;
  display_name?: string;
  email?: string;
  phone?: string;
  providers?: string[];
  provider_type?: string;
  created_at?: string;
  last_sign_in_at?: string;
}

export default function UsersScreen() {
  const [users, setUsers] = useState<User[]>([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [formData, setFormData] = useState({
    name: '',  // Changed from firstName/lastName to single name field
    email: '',
    role: 'user'
  });
  const router = useRouter();
  const [showPasswordResetDialog, setShowPasswordResetDialog] = useState(false);
  const [resetEmail, setResetEmail] = useState('');

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    try {
      // In a real implementation, this would call supabase
      // const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });

      // For now, we'll use mock data
      const mockUsers: User[] = [
        {
          id: '1',
          display_name: 'Test User', // This is from profiles.display_name
          email: 'test@example.com',
          providers: ['email'],
          created_at: new Date().toISOString()
        }
      ];
      
      setUsers(mockUsers);
    } catch (error) {
      console.error('Error fetching users:', error);
      Alert.alert('Error', 'Failed to fetch users');
    }
  }

  const handleSendInvite = async () => {
    if (!formData.name || !formData.email) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    try {
      const { name, email, role } = formData;
      
      // Save directly to profiles table with display_name field
      const { data, error } = await supabase.from('profiles').insert({
        display_name: name,  // Save name to profiles.display_name
        email,
        role
      }).select();

      if (error) throw error;

      Alert.alert('Success', 'Invitation sent successfully');
      setIsModalVisible(false);
      setFormData({
        name: '',
        email: '',
        role: 'user'
      });
      fetchUsers();
    } catch (error) {
      console.error('Error sending invitation:', error);
      Alert.alert('Error', 'Failed to send invitation');
    }
  };

  const formatDate = (dateString?: string): string => {
    if (!dateString) return 'Never';
    return format(new Date(dateString), 'M/d/yyyy, h:mm a');
  };

  const handleEditUser = (user: User): void => {
    router.push(`/users/${user.id}` as any);
  };

  const handleDeleteUser = async (user: User): Promise<void> => {
    Alert.alert(
      'Confirm Delete',
      `Are you sure you want to delete ${user.display_name || 'this user'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('users')
                .delete()
                .eq('id', user.id);
              
              if (error) throw error;
              
              setUsers(users.filter(u => u.id !== user.id));
              
              Alert.alert('Success', 'User deleted successfully');
            } catch (error) {
              console.error('Error deleting user:', error);
              Alert.alert('Error', 'Failed to delete user');
            }
          }
        }
      ]
    );
  };

  const copyToClipboard = async (text: string): Promise<void> => {
    await Clipboard.setStringAsync(text);
    Alert.alert('Copied', 'Text copied to clipboard');
  };

  const handleSendPasswordReset = async (email: string) => {
    try {
      // Use Supabase's password reset functionality
      const { error } = await supabase.auth.resetPasswordForEmail(
        email,
        { redirectTo: `${window.location.origin}/reset-password` }
      );
      
      if (error) throw error;
      
      Alert.alert('Success', 'Password reset email sent successfully');
      setShowPasswordResetDialog(false);
    } catch (error) {
      console.error('Error sending password reset:', error);
      Alert.alert('Error', 'Failed to send password reset email');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Users</Text>
        <Button 
          mode="contained" 
          onPress={() => setIsModalVisible(true)}
          style={styles.addButton}
        >
          Invite
        </Button>
      </View>

      <View style={styles.tableHeader}>
        <Text style={[styles.columnHeader, { flex: 2 }]}>Name</Text>
        <Text style={[styles.columnHeader, { flex: 2 }]}>Email</Text>
        <Text style={[styles.columnHeader, { flex: 1 }]}>Phone</Text>
        <Text style={[styles.columnHeader, { flex: 1 }]}>Providers</Text>
        <Text style={[styles.columnHeader, { flex: 1 }]}>Provider type</Text>
        <Text style={[styles.columnHeader, { flex: 2 }]}>Created at</Text>
        <Text style={[styles.columnHeader, { flex: 2 }]}>Last sign in at</Text>
        <Text style={[styles.columnHeader, { flex: 1 }]}>Actions</Text>
      </View>

      <FlatList
        data={users}
        keyExtractor={(item: User) => item.id}
        renderItem={({ item }: { item: User }) => (
          <View style={styles.row}>
            <Text style={[styles.cell, { flex: 2 }]}>{item.display_name || '(No name)'}</Text>
            <TouchableOpacity 
              style={[styles.cell, { flex: 2 }]}
              onPress={() => copyToClipboard(item.email || '')}
            >
              <Text>{item.email || '-'}</Text>
            </TouchableOpacity>
            <Text style={[styles.cell, { flex: 1 }]}>{item.phone || '-'}</Text>
            <View style={[styles.cell, { flex: 1 }]}>
              {item.providers ? (
                item.providers.map((provider: string, index: number) => (
                  <Chip key={index} style={styles.providerChip}>{provider}</Chip>
                ))
              ) : (
                <Text>-</Text>
              )}
            </View>
            <Text style={[styles.cell, { flex: 1 }]}>{item.provider_type || '-'}</Text>
            <Text style={[styles.cell, { flex: 2 }]}>{formatDate(item.created_at)}</Text>
            <Text style={[styles.cell, { flex: 2 }]}>{formatDate(item.last_sign_in_at)}</Text>
            <View style={[styles.cell, { flex: 1, flexDirection: 'row' }]}>
              <TouchableOpacity 
                style={styles.actionButton}
                onPress={() => handleEditUser(item)}
              >
                <FontAwesome name="pencil" size={18} color="#007BFF" />
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.actionButton}
                onPress={() => handleDeleteUser(item)}
              >
                <FontAwesome name="trash" size={18} color="#DC3545" />
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.actionButton}
                onPress={() => {
                  setResetEmail(item.email || '');
                  setShowPasswordResetDialog(true);
                }}
              >
                <FontAwesome name="key" size={18} color="#28a745" />
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No users found</Text>
          </View>
        }
      />

      <Modal
        animationType="slide"
        transparent={true}
        visible={isModalVisible}
        onRequestClose={() => setIsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Invite New User</Text>
            
            <Text style={styles.fieldLabel}>Name</Text>
            <TextInput
              style={styles.input}
              value={formData.name}
              onChangeText={(text) => setFormData({...formData, name: text})}
              placeholder="Enter user's name"
            />
            
            <Text style={styles.fieldLabel}>Email</Text>
            <TextInput
              style={styles.input}
              value={formData.email}
              onChangeText={(text) => setFormData({...formData, email: text})}
              placeholder="Enter email address"
            />
            
            <Text style={styles.fieldLabel}>Role</Text>
            <View style={styles.roleContainer}>
              <Pressable
                style={[
                  styles.roleButton,
                  formData.role === 'user' && styles.roleButtonActive
                ]}
                onPress={() => setFormData({...formData, role: 'user'})}
              >
                <Text style={formData.role === 'user' ? styles.roleTextActive : styles.roleText}>User</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.roleButton,
                  formData.role === 'admin' && styles.roleButtonActive
                ]}
                onPress={() => setFormData({...formData, role: 'admin'})}
              >
                <Text style={formData.role === 'admin' ? styles.roleTextActive : styles.roleText}>Admin</Text>
              </Pressable>
            </View>
            
            <View style={styles.modalActions}>
              <Button 
                mode="outlined" 
                onPress={() => {
                  setIsModalVisible(false);
                  setFormData({
                    name: '',
                    email: '',
                    role: 'user'
                  });
                }}
                style={styles.cancelButton}
              >
                Cancel
              </Button>
              <Button 
                mode="contained" 
                onPress={handleSendInvite}
                style={styles.sendButton}
              >
                Send Invite
              </Button>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="slide"
        transparent={true}
        visible={showPasswordResetDialog}
        onRequestClose={() => setShowPasswordResetDialog(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Send Password Reset</Text>
            
            <Text style={{ marginBottom: 16 }}>
              Are you sure you want to send a password reset email to {resetEmail}?
            </Text>
            
            <View style={styles.modalActions}>
              <Button 
                mode="outlined" 
                onPress={() => setShowPasswordResetDialog(false)}
                style={styles.cancelButton}
              >
                Cancel
              </Button>
              <Button 
                mode="contained" 
                onPress={() => handleSendPasswordReset(resetEmail)}
                style={[styles.sendButton, { backgroundColor: '#28a745' }]}
              >
                Send Reset
              </Button>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  addButton: {
    backgroundColor: '#007BFF',
  },
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 8,
    backgroundColor: '#e9ecef',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    marginBottom: 1,
  },
  columnHeader: {
    fontWeight: 'bold',
    color: '#495057',
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 8,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  cell: {
    justifyContent: 'center',
  },
  providerChip: {
    marginVertical: 2,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e9ecef',
  },
  actionButton: {
    padding: 8,
    marginRight: 8,
  },
  emptyContainer: {
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#6c757d',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    width: '90%',
    maxWidth: 500,
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ced4da',
    borderRadius: 4,
    padding: 12,
    marginBottom: 16,
    fontSize: 16,
  },
  roleContainer: {
    flexDirection: 'row',
    marginBottom: 24,
  },
  roleButton: {
    flex: 1,
    padding: 12,
    borderWidth: 1,
    borderColor: '#ced4da',
    alignItems: 'center',
    marginRight: 8,
  },
  roleButtonActive: {
    backgroundColor: '#007bff',
    borderColor: '#007bff',
  },
  roleText: {
    fontSize: 16,
    color: '#495057',
  },
  roleTextActive: {
    color: 'white',
    fontSize: 16,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  cancelButton: {
    marginRight: 8,
  },
  sendButton: {
    backgroundColor: '#007bff',
  },
}); 