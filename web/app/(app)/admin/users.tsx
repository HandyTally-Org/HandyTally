import React, { useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, Button, TextInput, Card, DataTable, IconButton, Snackbar, Menu, SegmentedButtons } from 'react-native-paper';
import { useAuth } from '../../../contexts/AuthContext';
import { useRequireAdmin } from '../../../hooks/useRequireAdmin';
import {
  inviteUser,
  listOrganizationMembers,
  setMemberRole,
  setMemberActive,
  removeOrganizationMember,
  deleteUserAccount,
  memberDisplayName,
  ROLE_LABELS,
  type InvitableRole,
  type OrganizationMember,
} from '../../../utils/inviteUser';
import { useRefreshOnFocus } from '../../../hooks/useRefreshOnFocus';
import { FormDialog, FormDialogFooter, FormField, FormRow, formTheme, inputStyle } from '../../../components/FormDialog';
import { LabelPill } from '../../../components/LabelPill';

// HT-12: the organisation's members. Admins invite people by email with a
// role, change roles and deactivate. The account is created server-side and
// the invitee receives a one-time set-password link; nothing to relay by hand.
//
// HT-65: the list also shows the platform superusers (no actions: they hold
// no membership row and cannot be touched), and admins can Remove someone
// from this organisation or Delete their account outright. Both confirm in
// a FormDialog and are refused server-side for the caller's own account and
// for superusers.

const INVITABLE_ROLES: { value: InvitableRole; label: string; hint: string }[] = [
  { value: 'user', label: 'Member', hint: 'Everything except Admin' },
  { value: 'admin', label: 'Admin', hint: 'Manages users and company settings' },
  { value: 'technician', label: 'Technician', hint: 'Same as member for now' },
];

// Fixed colours for the role and status pills: these are not tenant labels,
// so nothing in Settings recolours them.
const ROLE_PILL: Record<string, { color: string; textColor: string }> = {
  admin: { color: '#111827', textColor: '#ffffff' },
  user: { color: '#E5E7EB', textColor: '#111827' },
  technician: { color: '#DBEAFE', textColor: '#1E3A8A' },
  superuser: { color: '#FDE68A', textColor: '#78350F' },
};
const STATUS_PILL = {
  active: { color: '#DCFCE7', textColor: '#166534' },
  inactive: { color: '#F3F4F6', textColor: '#6B7280' },
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const white = { backgroundColor: '#ffffff' };

type Confirmation = { kind: 'remove' | 'delete'; member: OrganizationMember } | null;

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

  // HT-65: the Remove / Delete confirmation, its in-flight flag and the
  // server's refusal message when there is one.
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState('');

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

  useRefreshOnFocus(() => {
    if (allowed) fetchMembers();
  }, [allowed, fetchMembers]);

  const resetInviteForm = () => {
    setInviteFirstName('');
    setInviteLastName('');
    setInviteEmail('');
    setInviteRole('user');
    setInviteError('');
  };

  // The X, the scrim and Cancel all go through here so nothing closes the
  // popup while the invitation is being sent.
  const dismissInvite = () => {
    if (!inviting) setShowInvite(false);
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

  const openConfirmation = (kind: 'remove' | 'delete', member: OrganizationMember) => {
    setConfirmError('');
    setConfirmation({ kind, member });
  };

  const dismissConfirmation = () => {
    if (!confirming) setConfirmation(null);
  };

  const handleConfirm = async () => {
    if (!organization || !confirmation) return;
    const { kind, member } = confirmation;
    try {
      setConfirming(true);
      setConfirmError('');
      if (kind === 'remove') {
        await removeOrganizationMember(organization.id, member.user_id);
        showSnackbar(`${displayName(member)} was removed from ${organization.name}`);
      } else {
        await deleteUserAccount({ userId: member.user_id, organizationId: organization.id });
        showSnackbar(`${displayName(member)}'s account was deleted`);
      }
      setMembers(members.filter(m => m.user_id !== member.user_id));
      setConfirmation(null);
    } catch (error: any) {
      console.error(`Error on ${kind}:`, error);
      setConfirmError(error.message || (kind === 'remove' ? 'Could not remove the member' : 'Could not delete the account'));
    } finally {
      setConfirming(false);
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

  const confirmTitle = confirmation
    ? confirmation.kind === 'remove'
      ? `Remove ${displayName(confirmation.member)}?`
      : `Delete ${displayName(confirmation.member)}'s account?`
    : '';

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
                    <DataTable.Title style={[white, { flex: 1.4 }]}>Actions</DataTable.Title>
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
                      const isSuperuser = member.role === 'superuser';
                      const busy = busyUserId === member.user_id;
                      const canEditRole = !isSelf && !isSuperuser && !busy;
                      const canAct = !isSelf && !isSuperuser && !busy;
                      const rolePill = ROLE_PILL[member.role] ?? ROLE_PILL.user;
                      const statusPill = member.is_active ? STATUS_PILL.active : STATUS_PILL.inactive;
                      return (
                        <DataTable.Row key={member.user_id} style={white}>
                          <DataTable.Cell style={white}>
                            {displayName(member)}{isSelf ? ' (you)' : ''}
                          </DataTable.Cell>
                          <DataTable.Cell style={white}>{member.email}</DataTable.Cell>
                          <DataTable.Cell style={white}>
                            {canEditRole ? (
                              <Menu
                                visible={roleMenuFor === member.user_id}
                                onDismiss={() => setRoleMenuFor(null)}
                                anchor={
                                  <LabelPill
                                    size="sm"
                                    label={ROLE_LABELS[member.role] ?? member.role}
                                    color={rolePill.color}
                                    textColor={rolePill.textColor}
                                    selected
                                    onPress={() => setRoleMenuFor(member.user_id)}
                                    accessibilityLabel={`Change role for ${displayName(member)}`}
                                  />
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
                            ) : (
                              <LabelPill
                                size="sm"
                                label={ROLE_LABELS[member.role] ?? member.role}
                                color={rolePill.color}
                                textColor={rolePill.textColor}
                              />
                            )}
                          </DataTable.Cell>
                          <DataTable.Cell style={white}>
                            <LabelPill
                              size="sm"
                              label={member.is_active ? 'Active' : 'Inactive'}
                              color={statusPill.color}
                              textColor={statusPill.textColor}
                            />
                          </DataTable.Cell>
                          <DataTable.Cell style={white}>{formatDate(member.joined_at)}</DataTable.Cell>
                          <DataTable.Cell style={white}>{formatDate(member.last_sign_in_at)}</DataTable.Cell>
                          <DataTable.Cell style={[white, { flex: 1.4 }]}>
                            {isSuperuser ? (
                              <Text style={styles.platformHint}>Platform-wide account</Text>
                            ) : (
                              <View style={{ flexDirection: 'row', ...white }}>
                                <IconButton
                                  icon={member.is_active ? 'account-off' : 'account-check'}
                                  size={20}
                                  iconColor={member.is_active ? '#c62828' : '#2e7d32'}
                                  onPress={() => handleToggleActive(member)}
                                  disabled={!canAct}
                                  accessibilityLabel={member.is_active ? 'Deactivate' : 'Reactivate'}
                                />
                                <IconButton
                                  icon="account-remove"
                                  size={20}
                                  iconColor={formTheme.mutedText}
                                  onPress={() => openConfirmation('remove', member)}
                                  disabled={!canAct}
                                  accessibilityLabel="Remove from organization"
                                />
                                <IconButton
                                  icon="delete"
                                  size={20}
                                  iconColor="#c62828"
                                  onPress={() => openConfirmation('delete', member)}
                                  disabled={!canAct}
                                  accessibilityLabel="Delete account"
                                />
                              </View>
                            )}
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

      {/* Invite dialog: HT-63, the same shell as the material, labor and client popups */}
      <FormDialog
        visible={showInvite}
        title="Invite user"
        subtitle="They will get an email from HandyTally with a link to choose their password."
        onDismiss={dismissInvite}
        footer={
          <FormDialogFooter onCancel={dismissInvite} onSubmit={handleInvite} submitLabel="Send invitation" submitting={inviting} />
        }
      >
        <FormRow>
          <FormField>
            <TextInput
              mode="outlined"
              label="First name"
              value={inviteFirstName}
              onChangeText={setInviteFirstName}
              style={inputStyle}
            />
          </FormField>
          <FormField>
            <TextInput
              mode="outlined"
              label="Last name"
              value={inviteLastName}
              onChangeText={setInviteLastName}
              style={inputStyle}
            />
          </FormField>
        </FormRow>

        <FormField error={inviteError}>
          <TextInput
            mode="outlined"
            label="Email"
            value={inviteEmail}
            onChangeText={setInviteEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="off"
            error={!!inviteError}
            style={inputStyle}
          />
        </FormField>

        <FormField>
          <Text style={styles.roleLabel}>Role</Text>
          <SegmentedButtons
            value={inviteRole}
            onValueChange={(value) => setInviteRole(value as InvitableRole)}
            buttons={INVITABLE_ROLES.map(r => ({ value: r.value, label: r.label }))}
          />
          <Text style={styles.roleHint}>
            {INVITABLE_ROLES.find(r => r.value === inviteRole)?.hint}
          </Text>
        </FormField>
      </FormDialog>

      {/* Remove / Delete confirmation (HT-65), on the same shell */}
      <FormDialog
        visible={confirmation !== null}
        title={confirmTitle}
        subtitle={organization?.name}
        onDismiss={dismissConfirmation}
        footer={
          <FormDialogFooter
            onCancel={dismissConfirmation}
            onSubmit={handleConfirm}
            submitLabel={confirmation?.kind === 'delete' ? 'Delete account' : 'Remove'}
            submitting={confirming}
          />
        }
      >
        {confirmation?.kind === 'remove' ? (
          <Text style={styles.confirmText}>
            {displayName(confirmation.member)} loses access to {organization?.name}. Their account stays, and so does
            any other organization they belong to. Jobs and notes they created are kept.
          </Text>
        ) : confirmation ? (
          <Text style={styles.confirmText}>
            This permanently deletes {displayName(confirmation.member)}'s HandyTally account and their access to every
            organization. Jobs, notes and invoices they created are kept, with the author left blank. This cannot be
            undone.
          </Text>
        ) : null}
        {confirmError ? <Text style={styles.confirmError}>{confirmError}</Text> : null}
      </FormDialog>

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
  roleLabel: {
    fontSize: 12,
    color: formTheme.mutedText,
    marginBottom: 8,
  },
  roleHint: {
    fontSize: 12,
    color: formTheme.mutedText,
    marginTop: 8,
  },
  platformHint: {
    fontSize: 12,
    color: formTheme.mutedText,
  },
  confirmText: {
    fontSize: 14,
    lineHeight: 20,
    color: formTheme.text,
    marginBottom: 12,
  },
  confirmError: {
    fontSize: 13,
    color: '#c62828',
    marginBottom: 8,
  },
});
