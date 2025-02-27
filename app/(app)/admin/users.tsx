import { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, Button, TextInput, Card, DataTable, IconButton, Dialog, Portal, Snackbar } from 'react-native-paper';
import { supabase } from '../lib/api';

type User = {
  uid: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
  created_at: string;
  last_sign_in?: string;
};

export default function UsersScreen() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [newUserEmail, setNewUserEmail] = useState('');
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

  useEffect(() => {
    checkUsersTable().then(tableExists => {
      if (tableExists) {
        fetchUsers();
      }
    });
  }, []);

  async function fetchUsers() {
    try {
      setLoading(true);
      
      // Use a standard query to fetch users from a users table
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) {
        throw error;
      } else if (data) {
        setUsers(data);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      showSnackbar('Error loading users');
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
      
      // Use signUp with explicit email confirmation
      const { data, error } = await supabase.auth.signUp({
        email: newUserEmail,
        password: tempPassword,
        options: {
          emailRedirectTo: `${window.location.origin}/login`,
          data: {
            role: newUserRole,
            name: ''
          }
        }
      });
      
      if (error) throw error;
      
      if (data.user) {
        // Add the user to our custom users table
        const { error: insertError } = await supabase
          .from('users')
          .insert([{
            uid: data.user.id,
            email: data.user.email,
            name: '',
            role: newUserRole,
            created_at: new Date().toISOString()
          }]);
        
        if (insertError) {
          console.error('Error inserting user into users table:', insertError);
        }
        
        // Add the new user to our list
        const newUser: User = {
          uid: data.user.id,
          email: data.user.email,
          name: '',
          role: newUserRole,
          created_at: new Date().toISOString(),
        };
        
        setUsers([newUser, ...users]);
        
        // Set invitation details for display
        const inviteLink = `${window.location.origin}/login`;
        setInviteDetails({
          email: newUserEmail,
          password: tempPassword,
          link: inviteLink,
          userId: data.user.id
        });
        
        // Show the invitation details dialog
        setShowInviteInfo(true);
        
        // Close the add user dialog
        setShowAddDialog(false);
        setNewUserEmail('');
        setNewUserRole('user');
        setError('');
      }
    } catch (error) {
      console.error('Error inviting user:', error);
      
      if (error.message.includes('User already registered')) {
        setError('This email is already registered. Please use a different email.');
      } else {
        setError(error.message || 'Error inviting user');
      }
    }
  };

  // Function to send a manual invitation email
  const sendInvitationEmail = async (email: string, password: string) => {
    // This is a placeholder - you would implement this with your own email sending service
    // For example, using a serverless function or a service like SendGrid, Mailgun, etc.
    console.log(`Would send invitation email to ${email} with password ${password}`);
    
    // If you have a server endpoint for sending emails, you could call it like this:
    // const response = await fetch('/api/send-invitation', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ email, password, role: newUserRole })
    // });
    // 
    // if (!response.ok) {
    //   throw new Error('Failed to send invitation email');
    // }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    
    try {
      // Delete from users table
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('uid', selectedUser.uid);
      
      if (error) throw error;
      
      // Remove the user from our list
      setUsers(users.filter(user => user.uid !== selectedUser.uid));
      showSnackbar('User deleted successfully');
      setShowDeleteDialog(false);
      setSelectedUser(null);
    } catch (error) {
      console.error('Error deleting user:', error);
      showSnackbar('Error deleting user');
    }
  };

  const handleUpdateUserRole = async (user: User, newRole: 'admin' | 'user') => {
    try {
      // Update the user's role in the users table
      const { error } = await supabase
        .from('users')
        .update({ role: newRole })
        .eq('uid', user.uid);
      
      if (error) throw error;
      
      // Update the user in our list
      setUsers(users.map(u => 
        u.uid === user.uid ? { ...u, role: newRole } : u
      ));
      
      showSnackbar('User role updated successfully');
    } catch (error) {
      console.error('Error updating user role:', error);
      showSnackbar('Error updating user role');
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
  };

  async function checkUsersTable() {
    try {
      // Just check if the users table exists
      const { data, error } = await supabase
        .from('users')
        .select('uid')
        .limit(1);
      
      // If there's an error, log it but don't show a snackbar
      if (error) {
        console.error('Users table may not exist:', error);
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Error checking users table:', error);
      return false;
    }
  }

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setEditName(user.name || '');
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
      
      // Update user in the users table
      const { error: updateError } = await supabase
        .from('users')
        .update({
          name: editName,
          email: editEmail,
        })
        .eq('uid', editingUser.uid);
      
      if (updateError) throw updateError;
      
      // If password is being changed, update it
      if (changePassword && editPassword) {
        // In a real app, you'd use an admin API to update the password
        // Since we don't have that access, we'll just show a message
        showSnackbar('Password change functionality requires admin API access');
        
        // If you have admin API access, you would do something like:
        // const { error } = await supabase.auth.admin.updateUserById(
        //   editingUser.uid,
        //   { password: editPassword }
        // );
        // if (error) throw error;
      }
      
      // Update the user in our list
      setUsers(users.map(u => 
        u.uid === editingUser.uid 
          ? { ...u, name: editName, email: editEmail } 
          : u
      ));
      
      showSnackbar('User updated successfully');
      setShowEditDialog(false);
    } catch (error) {
      console.error('Error updating user:', error);
      setError(error.message || 'Error updating user');
    }
  };

  // Add this function to check if a user exists in Auth
  const checkUserInAuth = async (email: string) => {
    try {
      // This requires admin privileges
      const { data, error } = await supabase.rpc('get_user_by_email', {
        email_address: email
      });
      
      if (error) {
        console.error('Error checking user in auth:', error);
        return false;
      }
      
      return !!data;
    } catch (error) {
      console.error('Error checking user in auth:', error);
      return false;
    }
  };

  // Add this function to manually confirm a user
  const confirmUser = async (userId: string) => {
    try {
      // This requires admin privileges
      const { error } = await supabase.rpc('admin_confirm_user', {
        user_id: userId
      });
      
      if (error) {
        console.error('Error confirming user:', error);
        showSnackbar('Error confirming user. You may not have admin privileges.');
        return false;
      }
      
      showSnackbar('User confirmed successfully');
      return true;
    } catch (error) {
      console.error('Error confirming user:', error);
      showSnackbar('Error confirming user');
      return false;
    }
  };

  return (
    <View style={styles.container}>
      <Text style={{
        fontSize: 28,
        fontWeight: 'bold',
        marginBottom: 16,
        color: '#000000',
      }}>User Management</Text>
      
      <Button
        mode="contained"
        onPress={() => setShowAddDialog(true)}
        style={styles.addButton}
        icon="account-plus"
      >
        Invite New User
      </Button>
      
      <Card style={styles.tableCard}>
        <DataTable>
          <DataTable.Header>
            <DataTable.Title>Name</DataTable.Title>
            <DataTable.Title>Email</DataTable.Title>
            <DataTable.Title>Role</DataTable.Title>
            <DataTable.Title>Created</DataTable.Title>
            <DataTable.Title>Last Sign In</DataTable.Title>
            <DataTable.Title>Actions</DataTable.Title>
          </DataTable.Header>
          
          {loading ? (
            <DataTable.Row>
              <DataTable.Cell>Loading users...</DataTable.Cell>
            </DataTable.Row>
          ) : users.length === 0 ? (
            <DataTable.Row>
              <DataTable.Cell>No users found</DataTable.Cell>
            </DataTable.Row>
          ) : (
            users.map(user => (
              <DataTable.Row key={user.uid}>
                <DataTable.Cell>{user.name || '(No name)'}</DataTable.Cell>
                <DataTable.Cell>{user.email}</DataTable.Cell>
                <DataTable.Cell>
                  <Button
                    mode="text"
                    compact
                    onPress={() => handleUpdateUserRole(
                      user, 
                      user.role === 'admin' ? 'user' : 'admin'
                    )}
                  >
                    {user.role === 'admin' ? 'Admin' : 'User'}
                  </Button>
                </DataTable.Cell>
                <DataTable.Cell>{formatDate(user.created_at)}</DataTable.Cell>
                <DataTable.Cell>{formatDate(user.last_sign_in)}</DataTable.Cell>
                <DataTable.Cell>
                  <View style={{ flexDirection: 'row' }}>
                    <IconButton
                      icon="pencil"
                      size={20}
                      onPress={() => handleEditUser(user)}
                    />
                    <IconButton
                      icon="delete"
                      size={20}
                      onPress={() => {
                        setSelectedUser(user);
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
      
      {/* Add User Dialog */}
      <Portal>
        <Dialog visible={showAddDialog} onDismiss={() => setShowAddDialog(false)}>
          <Dialog.Title>Invite New User</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Email"
              value={newUserEmail}
              onChangeText={setNewUserEmail}
              style={styles.input}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            
            <View style={styles.roleSelector}>
              <Text>Role:</Text>
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
            
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setShowAddDialog(false)}>Cancel</Button>
            <Button onPress={handleAddUser}>Send Invitation</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
      
      {/* Delete User Dialog */}
      <Portal>
        <Dialog visible={showDeleteDialog} onDismiss={() => setShowDeleteDialog(false)}>
          <Dialog.Title>Delete User</Dialog.Title>
          <Dialog.Content>
            <Text>Are you sure you want to delete {selectedUser?.email}?</Text>
            <Text>This action cannot be undone.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setShowDeleteDialog(false)}>Cancel</Button>
            <Button onPress={handleDeleteUser} textColor="red">Delete</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
      
      {/* Edit User Dialog */}
      <Portal>
        <Dialog visible={showEditDialog} onDismiss={() => setShowEditDialog(false)}>
          <Dialog.Title>Edit User</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Name"
              value={editName}
              onChangeText={setEditName}
              style={styles.input}
            />
            
            <TextInput
              label="Email"
              value={editEmail}
              onChangeText={setEditEmail}
              style={styles.input}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            
            <View style={styles.passwordSection}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <Text>Change Password:</Text>
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
                  style={styles.input}
                />
              )}
            </View>
            
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setShowEditDialog(false)}>Cancel</Button>
            <Button onPress={handleSaveUserEdit}>Save</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
      
      {/* Invitation Details Dialog */}
      <Portal>
        <Dialog visible={showInviteInfo} onDismiss={() => setShowInviteInfo(false)}>
          <Dialog.Title>User Invitation Details</Dialog.Title>
          <Dialog.Content>
            <Text style={{ marginBottom: 8 }}>The user has been created. Please provide them with the following details:</Text>
            
            <View style={styles.inviteDetails}>
              <Text style={styles.inviteLabel}>Email:</Text>
              <Text selectable={true} style={styles.inviteValue}>{inviteDetails.email}</Text>
              
              <Text style={styles.inviteLabel}>Temporary Password:</Text>
              <Text selectable={true} style={styles.inviteValue}>{inviteDetails.password}</Text>
              
              <Text style={styles.inviteLabel}>Login Link:</Text>
              <Text selectable={true} style={styles.inviteValue}>{inviteDetails.link}</Text>
            </View>
            
            <Text style={{ marginTop: 16 }}>
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
          <Dialog.Actions>
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
  },
  addButton: {
    marginBottom: 16,
    alignSelf: 'flex-start',
  },
  tableCard: {
    flex: 1,
    marginBottom: 16,
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
    backgroundColor: '#f5f5f5',
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
}); 