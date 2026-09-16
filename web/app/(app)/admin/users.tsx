import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, Button, TextInput, Card, DataTable, IconButton, Dialog, Portal, Snackbar, Chip, Menu } from 'react-native-paper';
import { useAuth } from '../../../contexts/AuthContext';
import { useRequireAdmin } from '../../../hooks/useRequireAdmin';
import {
  inviteUser,
  listOrganizationMembers,
  setMemberRole,
  setMemberActive,
  memberDisplayName,
  ROLE_LABELS,
  type InvitableRole,
  type OrganizationMember,
} from '../../../utils/inviteUser';

// HT-12: the organisation's members. Admins invite people by email with a
// role, change roles and deactivate. The account is created server-side and
// the invitee receives a one-time set-password link; nothing to relay by hand.

const INVITABLE_ROLES: { value: InvitableRole; label: string; hint: string }[] = [
  { value: 'user', label: 'Member', hint: 'Everything except Admin' },
  { value: 'admin', label: 'Admin', hint: 'Manages users and company settings' },
  { value: 'technician', label: 'Technician', hint: 'Same as member for now' },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const white = { backgroundColor: '#ffffff' };

export default function UsersScreen() {
  const allowed = useRequireAdmin();
  const { organization, session } = useAuth();
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [showInvite, setShowInvite] = useState(false);
  const [inviteFirstName, setInviteFirstName] = useState('');
  const [inviteLastName, setInviteLastName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<InvitableRole>('user');
  const [inviteError, setInviteError] = useState('');
  const [inviting, setInviting] = useState(false);

  const [roleMenuFor, setRoleMenuFor] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  const showSnackbar = (message: string) => {
    setSnackbarMessage(message);
    setSnackbarVisible(true);
  };

  const fetchMembers = useCallback(async () => {
    if (!organization) {
      setMembers([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setLoadError(null);
      setMembers(await listOrganizationMembers(organization.id));
    } catch (error: any) {
      console.error('Error loading members:', error);
      setLoadError(error.message || 'Could not load the members list');
    } finally {
      setLoading(false);
    }
  }, [organization]);

  useEffect(() => {
    if (allowed) fetchMembers();
  }, [allowed, fetchMembers]);

  const resetInviteForm = () => {
    setInviteFirstName('');
    setInviteLastName('');
    setInviteEmail('');
    setInviteRole('user');
    setInviteError('');
  };

  const handleInvite = async () => {
    if (!organization) return;
    const email = inviteEmail.trim();
    if (!email) {
      setInviteError('Email is required');
      return;
    }
    if (!EMAIL_RE.test(email)) {
      setInviteError('Please enter a valid email address');
      return;
    }

    try {
      setInviting(true);
      setInviteError('');
      const result = await inviteUser({
        organizationId: organization.id,
        email,
        firstName: inviteFirstName.trim(),
        lastName: inviteLastName.trim(),
        role: inviteRole,
      });
      setShowInvite(false);
      resetInviteForm();
      showSnackbar(
        result.existingAccount
          ? `${result.email} already had an account and was added to ${organization.name}`
          : `Invitation sent to ${result.email}`,
      );
      fetchMembers();
    } catch (error: any) {
      console.error('Error inviting user:', error);
      setInviteError(error.message || 'Could not send the invitation');
    } finally {
      setInviting(false);
    }
  };

  const handleChangeRole = async (member: OrganizationMember, role: InvitableRole) => {
    if (!organization || member.role === role) return;
    try {
      setBusyUserId(member.user_id);
      await setMemberRole(organization.id, member.user_id, role);
      setMembers(members.map(m => (m.user_id === member.user_id ? { ...m, role } : m)));
      showSnackbar(`${displayName(member)} is now ${ROLE_LABELS[role].toLowerCase()}`);
    } catch (error: any) {
      console.error('Error changing role:', error);
      showSnackbar(error.message || 'Could not change the role');
    } finally {
      setBusyUserId(null);
    }
  };

  const handleToggleActive = async (member: OrganizationMember) => {
    if (!organization) return;
    const active = !member.is_active;
    try {
      setBusyUserId(member.user_id);
      await setMemberActive(organization.id, member.user_id, active);
      setMembers(members.map(m => (m.user_id === member.user_id ? { ...m, is_active: active } : m)));
      showSnackbar(`${displayName(member)} ${active ? 'reactivated' : 'deactivated'}`);
    } catch (error: any) {
      console.error('Error updating member:', error);
      showSnackbar(error.message || 'Could not update the member');
    } finally {
      setBusyUserId(null);
    }
  };

  // No "send password reset" here: that would go through GoTrue's mailer,
  // which has no SMTP on the self-hosted instance (HT-30) and drops the mail
  // while reporting success. Invitations go through Resend instead.

  const displayName = memberDisplayName;

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
  };

  if (!allowed) {
    return null;
  }

  return (
    <View style={{ flex: 1, ...white }}>
      <ScrollView style={{ flex: 1, ...white }}>
        <View style={{ flex: 1, padding: 16, ...white }}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Users</Text>
              {organization && (
                <Text style={styles.subtitle}>{organization.name}</Text>
              )}
            </View>

            <Button
              mode="contained"
              onPress={() => setShowInvite(true)}
              icon="account-plus"
              disabled={!organization}
            >
              Invite user
            </Button>
          </View>

          {!organization ? (
            <Card style={styles.card}>
              <Card.Content style={white}>
                <Text>Your account is not a member of an organization yet, so there is no user list to manage.</Text>
              </Card.Content>
            </Card>
          ) : (
            <Card style={styles.card}>
              <Card.Content style={{ ...white, padding: 0 }}>
                <DataTable style={white}>
                  <DataTable.Header style={white}>
                    <DataTable.Title style={white}>Name</DataTable.Title>
                    <DataTable.Title style={white}>Email</DataTable.Title>
                    <DataTable.Title style={white}>Role</DataTable.Title>
                    <DataTable.Title style={white}>Status</DataTable.Title>
                    <DataTable.Title style={white}>Joined</DataTable.Title>
                    <DataTable.Title style={white}>Last sign in</DataTable.Title>
                    <DataTable.Title style={white}>Actions</DataTable.Title>
                  </DataTable.Header>

                  {loading ? (
                    <DataTable.Row style={white}>
                      <DataTable.Cell style={white}>Loading users...</DataTable.Cell>
                    </DataTable.Row>
                  ) : loadError ? (
                    <DataTable.Row style={white}>
                      <DataTable.Cell style={white}>{loadError}</DataTable.Cell>
                    </DataTable.Row>
                  ) : members.length === 0 ? (
                    <DataTable.Row style={white}>
                      <DataTable.Cell style={white}>No users yet. Invite the first one.</DataTable.Cell>
                    </DataTable.Row>
                  ) : (
                    members.map(member => {
                      const isSelf = member.user_id === session?.user?.id;
                      const busy = busyUserId === member.user_id;
                      const canEditRole = !isSelf && member.role !== 'superuser' && !busy;
                      return (
                        <DataTable.Row key={member.user_id} style={white}>
                          <DataTable.Cell style={white}>
                            {displayName(member)}{isSelf ? ' (you)' : ''}
                          </DataTable.Cell>
                          <DataTable.Cell style={white}>{member.email}</DataTable.Cell>
                          <DataTable.Cell style={white}>
                            <Menu
                              visible={roleMenuFor === member.user_id}
                              onDismiss={() => setRoleMenuFor(null)}
                              anchor={
                                <Button
                                  mode="outlined"
                                  compact
                                  disabled={!canEditRole}
                                  onPress={() => setRoleMenuFor(member.user_id)}
                                  icon={canEditRole ? 'chevron-down' : undefined}
                                  contentStyle={{ flexDirection: 'row-reverse' }}
                                >
                                  {ROLE_LABELS[member.role] ?? member.role}
                                </Button>
                              }
                            >
                              {INVITABLE_ROLES.map(r => (
                                <Menu.Item
                                  key={r.value}
                                  title={r.label}
                                  disabled={r.value === member.role}
                                  onPress={() => {
                                    setRoleMenuFor(null);
                                    handleChangeRole(member, r.value);
                                  }}
                                />
                              ))}
                            </Menu>
                          </DataTable.Cell>
                          <DataTable.Cell style={white}>
                            <Chip
                              compact
                              mode="outlined"
                              icon={member.is_active ? 'check' : 'cancel'}
                              textStyle={{ color: member.is_active ? '#2e7d32' : '#999' }}
                            >
                              {member.is_active ? 'Active' : 'Inactive'}
                            </Chip>
                          </DataTable.Cell>
                          <DataTable.Cell style={white}>{formatDate(member.joined_at)}</DataTable.Cell>
                          <DataTable.Cell style={white}>{formatDate(member.last_sign_in_at)}</DataTable.Cell>
                          <DataTable.Cell style={white}>
                            <View style={{ flexDirection: 'row', ...white }}>
                              <IconButton
                                icon={member.is_active ? 'account-off' : 'account-check'}
                                size={20}
                                iconColor={member.is_active ? '#c62828' : '#2e7d32'}
                                onPress={() => handleToggleActive(member)}
                                disabled={isSelf || busy}
                                accessibilityLabel={member.is_active ? 'Deactivate' : 'Reactivate'}
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
          )}
        </View>
      </ScrollView>

      {/* Invite dialog */}
      <Portal>
        <Dialog
          visible={showInvite}
          onDismiss={() => { if (!inviting) setShowInvite(false); }}
          style={white}
        >
          <Dialog.Title style={white}>Invite user</Dialog.Title>
          <Dialog.Content style={white}>
            <Text style={{ marginBottom: 16, color: '#666' }}>
              They will get an email from HandyTally with a link to choose their password.
            </Text>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', ...white }}>
              <TextInput
                label="First name"
                value={inviteFirstName}
                onChangeText={setInviteFirstName}
                style={[styles.input, { flex: 1, marginRight: 8, ...white }]}
              />
              <TextInput
                label="Last name"
                value={inviteLastName}
                onChangeText={setInviteLastName}
                style={[styles.input, { flex: 1, ...white }]}
              />
            </View>

            <TextInput
              label="Email"
              value={inviteEmail}
              onChangeText={setInviteEmail}
              style={[styles.input, white]}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="off"
            />

            <Text style={{ marginBottom: 8 }}>Role</Text>
            <View style={styles.roleSelector}>
              {INVITABLE_ROLES.map(r => (
                <Button
                  key={r.value}
                  mode={inviteRole === r.value ? 'contained' : 'outlined'}
                  onPress={() => setInviteRole(r.value)}
                  style={styles.roleButton}
                  compact
                >
                  {r.label}
                </Button>
              ))}
            </View>
            <Text style={styles.roleHint}>
              {INVITABLE_ROLES.find(r => r.value === inviteRole)?.hint}
            </Text>

            {inviteError ? <Text style={styles.error}>{inviteError}</Text> : null}
          </Dialog.Content>
          <Dialog.Actions style={white}>
            <Button onPress={() => setShowInvite(false)} disabled={inviting}>Cancel</Button>
            <Button onPress={handleInvite} loading={inviting} disabled={inviting}>Send invitation</Button>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    backgroundColor: '#ffffff',
  },
  title: {
    fontFamily: 'System',
    fontSize: 26,
    fontWeight: '600',
    color: '#333333',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  card: {
    marginBottom: 16,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    elevation: 2,
    shadowColor: 'rgba(0,0,0,0.1)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.8,
    shadowRadius: 1,
  },
  input: {
    marginBottom: 16,
  },
  roleSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  roleButton: {
    marginRight: 8,
  },
  roleHint: {
    fontSize: 12,
    color: '#666',
    marginBottom: 16,
  },
  error: {
    color: 'red',
    marginBottom: 8,
  },
});
