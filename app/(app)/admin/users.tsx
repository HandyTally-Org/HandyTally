import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, Button, TextInput, Card, DataTable, IconButton, Dialog, Portal, Snackbar, Chip } from 'react-native-paper';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'expo-router';

type User = {
  id: string;
  email: string;
  phone?: string;
  user_metadata: {
    name?: string;
    role?: 'admin' | 'user';
  };
  created_at: string;
  last_sign_in_at?: string;
  confirmed_at?: string;
  app_metadata?: {
    provider?: string;
    providers?: string[];
  };
};

export default function UsersScreen() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserFirstName, setNewUserFirstName] = useState('');
  const [newUserLastName, setNewUserLastName] = useState('');
  const [newUserPhone, setNewUserPhone] = useState('');
  const [newUserRole, setNewUserRole] = useState<'admin' | 'user'>('user');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [error, setError] = useState('');
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [changePassword, setChangePassword] = useState(false);
  const [showInviteInfo, setShowInviteInfo] = useState(false);
  const [inviteDetails, setInviteDetails] = useState({ 
    email: '', 
    password: '', 
    link: '',
    userId: ''
  });
  const router = useRouter();

  useEffect(() => {
        fetchUsers();
  }, []);

  async function fetchUsers() {
    try {
      setLoading(true);
      
      // Query the profiles table directly instead of auth.users
      const { data, error } = await supabase
        .from('profiles')
        .select('*');
      
      if (error) {
        throw error;
      } else if (data) {
        // Transform the data to match our User type
        // Use first_name and last_name fields, default role to 'user'
        const formattedUsers = data.map((profile: any) => {
          // Combine first_name and last_name for display
          const firstName = profile.first_name || '';
          const lastName = profile.last_name || '';
          const fullName = [firstName, lastName].filter(Boolean).join(' ');
          
          return {
            id: profile.id,
            email: profile.email || '',
            phone: profile.phone || '',
            user_metadata: { 
              name: fullName, 
              role: 'user' as 'admin' | 'user' // Cast to fix type issue
            },
            app_metadata: {},
            // Use current date as fallback for timestamps that might not exist
            created_at: new Date().toISOString(),
            last_sign_in_at: undefined,
            confirmed_at: undefined
          };
        });
        
        setUsers(formattedUsers as User[]);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      showSnackbar('Error loading users from profiles table.');
    } finally {
      setLoading(false);
    }
  }

  const showSnackbar = (message: string) => {
    setSnackbarMessage(message);
    setSnackbarVisible(true);
  };

  const handleAddUser = async () => {
    try {
      if (!newUserEmail) {
        setError('Email is required');
        return;
      }
      
      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(newUserEmail)) {
        setError('Please enter a valid email address');
        return;
      }
      
      // Generate a temporary password
      const tempPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8);
      
      // Use the standard signUp method instead of admin.createUser
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: newUserEmail,
        password: tempPassword,
        options: {
          data: {
            first_name: newUserFirstName,
            last_name: newUserLastName,
            phone: newUserPhone,
            role: newUserRole
          }
        }
      });
      
      if (authError) {
        throw new Error(`Error creating user: ${authError.message}`);
      }
      
      if (!authData.user) {
        throw new Error('Failed to create user');
      }
      
      // The profile should be created automatically by a Supabase trigger
      // But we'll show the invitation details
        const inviteLink = `${window.location.origin}/login`;
        setInviteDetails({
          email: newUserEmail,
          password: tempPassword,
          link: inviteLink,
        userId: authData.user.id
        });
        
        // Show the invitation details dialog
        setShowInviteInfo(true);
        
        // Close the add user dialog
        setShowAddDialog(false);
        setNewUserEmail('');
      setNewUserFirstName('');
      setNewUserLastName('');
      setNewUserPhone('');
        setNewUserRole('user');
        setError('');
      
      // Refresh the users list
      fetchUsers();
      
      showSnackbar('User invited successfully');
    } catch (error: any) {
      console.error('Error adding user:', error);
      
      if (error.message.includes('duplicate key value violates unique constraint')) {
        setError('This email is already registered. Please use a different email.');
      } else {
        setError(error.message || 'Error adding user');
      }
    }
  };

  // Function to send a manual invitation email
  const sendInvitationEmail = async (email: string, password: string) => {
    // This is a placeholder - you would implement this with your own email sending service
    // For example, using a serverless function or a service like SendGrid, Mailgun, etc.
    console.log(`Would send invitation email to ${email} with password ${password}`);
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    
    try {
      // Delete user using admin API
      const { error } = await supabase.rpc('admin_delete_user', {
        user_id: selectedUser.id
      });
      
      if (error) throw error;
      
      // Remove the user from our list
      setUsers(users.filter(user => user.id !== selectedUser.id));
      showSnackbar('User deleted successfully');
      setShowDeleteDialog(false);
      setSelectedUser(null);
    } catch (error) {
      console.error('Error deleting user:', error);
      showSnackbar('Error deleting user. You may not have admin privileges.');
    }
  };

  const handleUpdateUserRole = async (user: User, newRole: 'admin' | 'user') => {
    try {
      // Update the user's metadata
      const { error } = await supabase.rpc('admin_update_user_metadata', {
        user_id: user.id,
        metadata: {
          ...user.user_metadata,
          role: newRole
        }
      });
      
      if (error) throw error;
      
      // Update the user in our list
      setUsers(users.map(u => 
        u.id === user.id 
          ? { 
              ...u, 
              user_metadata: { 
                ...u.user_metadata, 
                role: newRole 
              } 
            } 
          : u
      ));
      
      showSnackbar('User role updated successfully');
    } catch (error) {
      console.error('Error updating user role:', error);
      showSnackbar('Error updating user role. You may not have admin privileges.');
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
  };

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setEditName(user.user_metadata?.name || '');
    setEditEmail(user.email);
    setEditPassword('');
    setChangePassword(false);
    setShowEditDialog(true);
  };

  const handleSaveUserEdit = async () => {
    if (!editingUser) return;
    
    try {
      // Validate email format if changed
      if (editEmail !== editingUser.email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(editEmail)) {
          setError('Please enter a valid email address');
          return;
        }
      }
      
      // Update user metadata
      const { error: updateMetadataError } = await supabase.rpc('admin_update_user_metadata', {
        user_id: editingUser.id,
        metadata: {
          ...editingUser.user_metadata,
          name: editName
        }
      });
      
      if (updateMetadataError) throw updateMetadataError;
      
      // If email is changed, update it
      if (editEmail !== editingUser.email) {
        const { error: updateEmailError } = await supabase.rpc('admin_update_user_email', {
          user_id: editingUser.id,
          email: editEmail
        });
        
        if (updateEmailError) throw updateEmailError;
      }
      
      // If password is being changed, update it
      if (changePassword && editPassword) {
        const { error: updatePasswordError } = await supabase.rpc('admin_update_user_password', {
          user_id: editingUser.id,
          password: editPassword
        });
        
        if (updatePasswordError) throw updatePasswordError;
      }
      
      // Update the user in our list
      setUsers(users.map(u => 
        u.id === editingUser.id 
          ? { 
              ...u, 
              email: editEmail,
              user_metadata: { 
                ...u.user_metadata, 
                name: editName 
              } 
            } 
          : u
      ));
      
      showSnackbar('User updated successfully');
      setShowEditDialog(false);
    } catch (error: any) {
      console.error('Error updating user:', error);
      setError(error.message || 'Error updating user');
    }
  };

  // Update the confirmUser function to handle permission issues
  const confirmUser = async (userId: string) => {
    try {
      // Note: This might not work due to RLS policies
      const { error } = await supabase
        .from('profiles')
        .update({ email_confirmed_at: new Date().toISOString() })
        .eq('id', userId);
      
      if (error) {
        console.error('Error confirming user:', error);
        
        // Show a more helpful message
        showSnackbar(
          'Unable to automatically confirm the user. ' +
          'The user will need to confirm their email by clicking the link sent to their email address. ' +
          'Alternatively, you may need admin privileges to confirm users.'
        );
        return false;
      }
      
      showSnackbar('User confirmed successfully');
      fetchUsers(); // Refresh the list
      return true;
    } catch (error) {
      console.error('Error confirming user:', error);
      showSnackbar('Error confirming user. The user will need to confirm their email by clicking the link sent to their email.');
      return false;
    }
  };

  // Add this helper function to get provider information
  const getProviderInfo = (user: User) => {
    const providers = user.app_metadata?.providers || [];
    const primaryProvider = user.app_metadata?.provider || '';
    
    return {
      providers: providers.length > 0 ? providers.join(', ') : 'email',
      providerType: primaryProvider || 'email'
    };
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
      <ScrollView style={{ flex: 1, backgroundColor: '#ffffff' }}>
        <View style={{ 
          flex: 1, 
          backgroundColor: '#ffffff',
          padding: 16,
        }}>
          <View style={{ 
            flexDirection: 'row', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: 16,
            backgroundColor: '#ffffff',
          }}>
      <Text style={{
              fontFamily: 'System',
              fontSize: 26,
              fontWeight: '600',
              color: '#333333',
              backgroundColor: '#ffffff',
            }}>Users</Text>
      
      <Button
        mode="contained"
        onPress={() => setShowAddDialog(true)}
        icon="account-plus"
      >
        Invite New User
      </Button>
          </View>
          
          <Card style={{ 
            marginBottom: 16,
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
                  <DataTable.Title style={{ backgroundColor: '#ffffff' }}>Display name</DataTable.Title>
                  <DataTable.Title style={{ backgroundColor: '#ffffff' }}>Email</DataTable.Title>
                  <DataTable.Title style={{ backgroundColor: '#ffffff' }}>Phone</DataTable.Title>
                  <DataTable.Title style={{ backgroundColor: '#ffffff' }}>Providers</DataTable.Title>
                  <DataTable.Title style={{ backgroundColor: '#ffffff' }}>Provider type</DataTable.Title>
                  <DataTable.Title style={{ backgroundColor: '#ffffff' }}>Created at</DataTable.Title>
                  <DataTable.Title style={{ backgroundColor: '#ffffff' }}>Last sign in at</DataTable.Title>
                  <DataTable.Title style={{ backgroundColor: '#ffffff' }}>Actions</DataTable.Title>
          </DataTable.Header>
          
          {loading ? (
                  <DataTable.Row style={{ backgroundColor: '#ffffff' }}>
                    <DataTable.Cell style={{ backgroundColor: '#ffffff' }}>Loading users...</DataTable.Cell>
            </DataTable.Row>
          ) : users.length === 0 ? (
                  <DataTable.Row style={{ backgroundColor: '#ffffff' }}>
                    <DataTable.Cell style={{ backgroundColor: '#ffffff' }}>No users found</DataTable.Cell>
            </DataTable.Row>
          ) : (
                  users.map(user => {
                    const { providers, providerType } = getProviderInfo(user);
                    return (
                      <DataTable.Row key={user.id} style={{ backgroundColor: '#ffffff' }}>
                        <DataTable.Cell style={{ backgroundColor: '#ffffff' }}>{user.user_metadata?.name || '(No name)'}</DataTable.Cell>
                        <DataTable.Cell style={{ backgroundColor: '#ffffff' }}>{user.email}</DataTable.Cell>
                        <DataTable.Cell style={{ backgroundColor: '#ffffff' }}>{user.phone || '-'}</DataTable.Cell>
                        <DataTable.Cell style={{ backgroundColor: '#ffffff' }}>{providers}</DataTable.Cell>
                        <DataTable.Cell style={{ backgroundColor: '#ffffff' }}>{providerType}</DataTable.Cell>
                        <DataTable.Cell style={{ backgroundColor: '#ffffff' }}>{formatDate(user.created_at)}</DataTable.Cell>
                        <DataTable.Cell style={{ backgroundColor: '#ffffff' }}>{formatDate(user.last_sign_in_at)}</DataTable.Cell>
                        <DataTable.Cell style={{ backgroundColor: '#ffffff' }}>
                          <View style={{ flexDirection: 'row', backgroundColor: '#ffffff' }}>
                    <IconButton
                      icon="pencil"
                      size={20}
                      onPress={() => handleEditUser(user)}
                              style={{ backgroundColor: '#ffffff' }}
                    />
                    <IconButton
                      icon="delete"
                      size={20}
                              iconColor="red"
                      onPress={() => {
                        setSelectedUser(user);
                        setShowDeleteDialog(true);
                      }}
                              style={{ backgroundColor: '#ffffff' }}
                    />
                  </View>
                </DataTable.Cell>
              </DataTable.Row>
                    );
                  })
          )}
        </DataTable>
            </Card.Content>
      </Card>
        </View>
      </ScrollView>
      
      {/* Add User Dialog */}
      <Portal>
        <Dialog visible={showAddDialog} onDismiss={() => setShowAddDialog(false)} style={{ backgroundColor: '#ffffff' }}>
          <Dialog.Title style={{ backgroundColor: '#ffffff' }}>Invite New User</Dialog.Title>
          <Dialog.Content style={{ backgroundColor: '#ffffff' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#ffffff' }}>
              <TextInput
                label="First Name"
                value={newUserFirstName}
                onChangeText={setNewUserFirstName}
                style={[styles.input, { flex: 1, marginRight: 8, backgroundColor: '#ffffff' }]}
              />
              
              <TextInput
                label="Last Name"
                value={newUserLastName}
                onChangeText={setNewUserLastName}
                style={[styles.input, { flex: 1, backgroundColor: '#ffffff' }]}
              />
            </View>
            
            <TextInput
              label="Email"
              value={newUserEmail}
              onChangeText={setNewUserEmail}
              style={[styles.input, { backgroundColor: '#ffffff' }]}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            
            <TextInput
              label="Phone"
              value={newUserPhone}
              onChangeText={setNewUserPhone}
              style={[styles.input, { backgroundColor: '#ffffff' }]}
              keyboardType="phone-pad"
            />
            
            <View style={[styles.roleSelector, { backgroundColor: '#ffffff' }]}>
              <Text style={{ backgroundColor: '#ffffff' }}>Role:</Text>
              <Button
                mode={newUserRole === 'user' ? 'contained' : 'outlined'}
                onPress={() => setNewUserRole('user')}
                style={styles.roleButton}
              >
                User
              </Button>
              <Button
                mode={newUserRole === 'admin' ? 'contained' : 'outlined'}
                onPress={() => setNewUserRole('admin')}
                style={styles.roleButton}
              >
                Admin
              </Button>
            </View>
            
            {error ? <Text style={[styles.error, { backgroundColor: '#ffffff' }]}>{error}</Text> : null}
          </Dialog.Content>
          <Dialog.Actions style={{ backgroundColor: '#ffffff' }}>
            <Button onPress={() => setShowAddDialog(false)}>Cancel</Button>
            <Button onPress={handleAddUser}>Send Invitation</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
      
      {/* Delete User Dialog */}
      <Portal>
        <Dialog visible={showDeleteDialog} onDismiss={() => setShowDeleteDialog(false)} style={{ backgroundColor: '#ffffff' }}>
          <Dialog.Title style={{ backgroundColor: '#ffffff' }}>Delete User</Dialog.Title>
          <Dialog.Content style={{ backgroundColor: '#ffffff' }}>
            <Text style={{ backgroundColor: '#ffffff' }}>Are you sure you want to delete {selectedUser?.email}?</Text>
            <Text style={{ backgroundColor: '#ffffff' }}>This action cannot be undone.</Text>
          </Dialog.Content>
          <Dialog.Actions style={{ backgroundColor: '#ffffff' }}>
            <Button onPress={() => setShowDeleteDialog(false)}>Cancel</Button>
            <Button onPress={handleDeleteUser} textColor="red">Delete</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
      
      {/* Edit User Dialog */}
      <Portal>
        <Dialog visible={showEditDialog} onDismiss={() => setShowEditDialog(false)} style={{ backgroundColor: '#ffffff' }}>
          <Dialog.Title style={{ backgroundColor: '#ffffff' }}>Edit User</Dialog.Title>
          <Dialog.Content style={{ backgroundColor: '#ffffff' }}>
            <TextInput
              label="Name"
              value={editName}
              onChangeText={setEditName}
              style={[styles.input, { backgroundColor: '#ffffff' }]}
            />
            
            <TextInput
              label="Email"
              value={editEmail}
              onChangeText={setEditEmail}
              style={[styles.input, { backgroundColor: '#ffffff' }]}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            
            <View style={[styles.passwordSection, { backgroundColor: '#ffffff' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, backgroundColor: '#ffffff' }}>
                <Text style={{ backgroundColor: '#ffffff' }}>Change Password:</Text>
                <Button
                  mode={changePassword ? 'contained' : 'outlined'}
                  onPress={() => setChangePassword(!changePassword)}
                  style={{ marginLeft: 8 }}
                >
                  {changePassword ? 'Yes' : 'No'}
                </Button>
              </View>
              
              {changePassword && (
                <TextInput
                  label="New Password"
                  value={editPassword}
                  onChangeText={setEditPassword}
                  secureTextEntry
                  style={[styles.input, { backgroundColor: '#ffffff' }]}
                />
              )}
            </View>
            
            {error ? <Text style={[styles.error, { backgroundColor: '#ffffff' }]}>{error}</Text> : null}
          </Dialog.Content>
          <Dialog.Actions style={{ backgroundColor: '#ffffff' }}>
            <Button onPress={() => setShowEditDialog(false)}>Cancel</Button>
            <Button onPress={handleSaveUserEdit}>Save</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
      
      {/* Invitation Details Dialog */}
      <Portal>
        <Dialog visible={showInviteInfo} onDismiss={() => setShowInviteInfo(false)} style={{ backgroundColor: '#ffffff' }}>
          <Dialog.Title style={{ backgroundColor: '#ffffff' }}>User Invitation Details</Dialog.Title>
          <Dialog.Content style={{ backgroundColor: '#ffffff' }}>
            <Text style={{ marginBottom: 8, backgroundColor: '#ffffff' }}>The user has been created. Please provide them with the following details:</Text>
            
            <View style={[styles.inviteDetails, { backgroundColor: '#f5f5f5' }]}>
              <Text style={[styles.inviteLabel, { backgroundColor: '#f5f5f5' }]}>Email:</Text>
              <Text selectable={true} style={styles.inviteValue}>{inviteDetails.email}</Text>
              
              <Text style={[styles.inviteLabel, { backgroundColor: '#f5f5f5' }]}>Temporary Password:</Text>
              <Text selectable={true} style={styles.inviteValue}>{inviteDetails.password}</Text>
              
              <Text style={[styles.inviteLabel, { backgroundColor: '#f5f5f5' }]}>Login Link:</Text>
              <Text selectable={true} style={styles.inviteValue}>{inviteDetails.link}</Text>
            </View>
            
            <Text style={{ marginTop: 16, backgroundColor: '#ffffff' }}>
              You can copy these details and send them to the user via your preferred communication method.
            </Text>
            
            <Button 
              mode="contained" 
              onPress={() => confirmUser(inviteDetails.userId || '')}
              style={{ marginTop: 16 }}
            >
              Manually Confirm User
            </Button>
          </Dialog.Content>
          <Dialog.Actions style={{ backgroundColor: '#ffffff' }}>
            <Button onPress={() => setShowInviteInfo(false)}>Close</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
      
      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={5000}
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
    backgroundColor: '#ffffff',
  },
  addButton: {
    marginBottom: 16,
    alignSelf: 'flex-start',
  },
  tableCard: {
    flex: 1,
    marginBottom: 16,
    backgroundColor: '#ffffff',
  },
  input: {
    marginBottom: 16,
  },
  roleSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  roleButton: {
    marginLeft: 8,
  },
  error: {
    color: 'red',
    marginBottom: 8,
  },
  passwordSection: {
    marginTop: 8,
    marginBottom: 8,
  },
  inviteDetails: {
    padding: 16,
    borderRadius: 4,
    marginVertical: 8,
  },
  inviteLabel: {
    fontWeight: 'bold',
    marginTop: 8,
  },
  inviteValue: {
    fontFamily: 'monospace',
    padding: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 4,
    marginTop: 4,
  },
  idCell: {
    maxWidth: 200,
  },
}); 