import React, { useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Text, Button, TextInput, Card, DataTable, IconButton, Icon, Snackbar, Menu, SegmentedButtons } from 'react-native-paper';
import { useAuth } from '../../../contexts/AuthContext';
import { useRequireAdmin } from '../../../hooks/useRequireAdmin';
import {
  inviteUser,
  listOrganizationMembers,
  setMemberRole,
  setMemberActive,
  removeOrganizationMember,
  deleteUserAccount,
  applyUserImport,
  memberDisplayName,
  ROLE_LABELS,
  type InvitableRole,
  type OrganizationMember,
} from '../../../utils/inviteUser';
import {
  USER_SHEET_NAME,
  USER_SHEET_COLUMN_WIDTHS,
  membersToSheetRows,
  planUserImport,
  describeUpdate,
  type UserImportPlan,
} from '../../../utils/userImport';
import { exportWorkbook, pickWorkbook, sheetRows, hasColumn } from '../../../utils/excel';
import { ImportExportButtons } from '../../../components/ImportExportButtons';
import { useRefreshOnFocus } from '../../../hooks/useRefreshOnFocus';
import { FormDialog, FormDialogFooter, FormField, FormRow, formTheme, inputStyle } from '../../../components/FormDialog';

// HT-12: the organisation's members. Admins invite people by email with a
// role, change roles and deactivate. The account is created server-side and
// the invitee receives a one-time set-password link; nothing to relay by hand.
//
// HT-65: the list also shows the platform superusers (no actions: they hold
// no membership row and cannot be touched), and admins can Remove someone
// from this organisation or Delete their account outright. Both confirm in
// a FormDialog and are refused server-side for the caller's own account and
// for superusers.
//
// HT-46: Excel export and import, like Inventory. The exported sheet is
// directly re-importable; import validates every row (utils/userImport.ts),
// shows a preview, and on confirm applies the membership changes in one
// database transaction (apply_user_import), then invites new addresses and
// deletes the accounts that are left with no organisation at all.

const INVITABLE_ROLES: { value: InvitableRole; label: string; hint: string }[] = [
  { value: 'user', label: 'Member', hint: 'Everything except Admin' },
  { value: 'admin', label: 'Admin', hint: 'Manages users and company settings' },
  { value: 'technician', label: 'Technician', hint: 'Same as member for now' },
];

// Role and status are plain text, not pills: a quiet colour per role and a
// small dot for the status. These are not tenant labels, so nothing in
// Settings recolours them.
const ROLE_TEXT: Record<string, string> = {
  admin: '#111827',
  user: '#374151',
  technician: '#1E3A8A',
  superuser: '#92400E',
};
const STATUS_DOT = {
  active: '#16A34A',
  inactive: '#9CA3AF',
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

  // HT-46: the parsed sheet waiting for confirmation, its in-flight flag and
  // whatever went wrong while applying it.
  const [importPlan, setImportPlan] = useState<UserImportPlan | null>(null);
  const [importing, setImporting] = useState(false);
  const [importErrors, setImportErrors] = useState<string[]>([]);

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

  // --- HT-46: Excel export / import -----------------------------------------
  const handleExport = async () => {
    if (!organization) return;
    try {
      await exportWorkbook('users.xlsx', [
        { name: USER_SHEET_NAME, rows: membersToSheetRows(members), columnWidths: USER_SHEET_COLUMN_WIDTHS },
      ]);
      showSnackbar('Users exported. Edit the sheet and import it to apply changes; delete = y removes someone from this organization.');
    } catch (error: any) {
      console.error('Error exporting users:', error);
      showSnackbar(error.message || 'Could not export the users');
    }
  };

  const handleImport = async () => {
    if (!organization) return;
    try {
      const workbook = await pickWorkbook();
      if (!workbook) return;
      const rows = sheetRows(workbook, USER_SHEET_NAME);
      if (!rows || rows.length === 0) {
        showSnackbar('No rows found in the spreadsheet');
        return;
      }
      if (!hasColumn(rows, 'email')) {
        showSnackbar('The spreadsheet must have an "email" column');
        return;
      }
      setImportErrors([]);
      setImportPlan(planUserImport(rows, members, session?.user?.id));
    } catch (error: any) {
      console.error('Error reading the spreadsheet:', error);
      showSnackbar(error.message || 'Could not read the spreadsheet');
    }
  };

  const dismissImport = () => {
    if (!importing) {
      setImportPlan(null);
      setImportErrors([]);
    }
  };

  const handleApplyImport = async () => {
    if (!organization || !importPlan || importPlan.errors.length > 0) return;
    const problems: string[] = [];
    try {
      setImporting(true);
      setImportErrors([]);

      // 1. Membership changes and removals, all or nothing.
      const removed = await applyUserImport(
        organization.id,
        importPlan.updates.map(({ email: _email, ...update }) => update),
        importPlan.removals.map(m => m.user_id),
      );

      // 2. New addresses, one invitation each.
      let invited = 0;
      for (const invite of importPlan.invites) {
        try {
          await inviteUser({
            organizationId: organization.id,
            email: invite.email,
            firstName: invite.first_name,
            lastName: invite.last_name,
            role: invite.role,
          });
          invited += 1;
        } catch (error: any) {
          problems.push(`${invite.email}: ${error.message || 'could not be invited'}`);
        }
      }

      // 3. Accounts that now belong to no organisation are deleted outright.
      let deleted = 0;
      for (const r of removed) {
        if (r.memberships_left > 0) continue;
        const who = importPlan.removals.find(m => m.user_id === r.user_id);
        try {
          await deleteUserAccount({ userId: r.user_id, organizationId: organization.id });
          deleted += 1;
        } catch (error: any) {
          problems.push(`${who?.email ?? r.user_id}: removed from ${organization.name} but the account could not be deleted (${error.message})`);
        }
      }

      const summary = [
        importPlan.updates.length ? `${importPlan.updates.length} updated` : null,
        invited ? `${invited} invited` : null,
        importPlan.removals.length ? `${importPlan.removals.length} removed` : null,
        deleted ? `${deleted} account${deleted === 1 ? '' : 's'} deleted` : null,
      ].filter(Boolean);
      showSnackbar(summary.length ? `Import applied: ${summary.join(', ')}` : 'Import applied: nothing to change');
      await fetchMembers();

      if (problems.length) {
        // The transactional part is done; show what did not follow.
        setImportPlan({ ...importPlan, updates: [], removals: [], invites: [], unchanged: 0 });
        setImportErrors(problems);
      } else {
        setImportPlan(null);
      }
    } catch (error: any) {
      console.error('Error applying the import:', error);
      setImportErrors([error.message || 'The import could not be applied. Nothing was changed.']);
    } finally {
      setImporting(false);
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

            <View style={{ flexDirection: 'row', alignItems: 'center', ...white }}>
              <Button
                mode="contained"
                onPress={() => setShowInvite(true)}
                icon="account-plus"
                disabled={!organization}
              >
                Invite user
              </Button>
              <ImportExportButtons onExport={handleExport} onImport={handleImport} disabled={!organization || loading} />
            </View>
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
                    <DataTable.Title style={[white, styles.centered]}>Role</DataTable.Title>
                    <DataTable.Title style={[white, styles.centered]}>Status</DataTable.Title>
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
                      const roleColor = ROLE_TEXT[member.role] ?? ROLE_TEXT.user;
                      const roleLabel = ROLE_LABELS[member.role] ?? member.role;
                      return (
                        <DataTable.Row key={member.user_id} style={white}>
                          <DataTable.Cell style={white}>
                            {displayName(member)}{isSelf ? ' (you)' : ''}
                          </DataTable.Cell>
                          <DataTable.Cell style={white}>{member.email}</DataTable.Cell>
                          <DataTable.Cell style={[white, styles.centered]}>
                            {canEditRole ? (
                              <Menu
                                visible={roleMenuFor === member.user_id}
                                onDismiss={() => setRoleMenuFor(null)}
                                anchor={
                                  <Pressable
                                    onPress={() => setRoleMenuFor(member.user_id)}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Change role for ${displayName(member)}`}
                                    style={(state) => [
                                      styles.roleTrigger,
                                      // hovered is a react-native-web extra the RN types leave out
                                      (state as { hovered?: boolean }).hovered && styles.roleTriggerHover,
                                    ]}
                                  >
                                    <Text style={[styles.roleText, { color: roleColor }]}>{roleLabel}</Text>
                                    <Icon source="chevron-down" size={16} color={formTheme.mutedText} />
                                  </Pressable>
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
                              <Text style={[styles.roleText, { color: roleColor }]}>{roleLabel}</Text>
                            )}
                          </DataTable.Cell>
                          <DataTable.Cell style={[white, styles.centered]}>
                            <View style={styles.status}>
                              <View style={[styles.statusDot, { backgroundColor: member.is_active ? STATUS_DOT.active : STATUS_DOT.inactive }]} />
                              <Text style={[styles.statusText, !member.is_active && { color: formTheme.mutedText }]}>
                                {member.is_active ? 'Active' : 'Inactive'}
                              </Text>
                            </View>
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

      {/* Import preview (HT-46): what the sheet will do, confirmed before anything runs */}
      <FormDialog
        visible={importPlan !== null}
        title="Import users"
        subtitle={organization?.name}
        onDismiss={dismissImport}
        footer={
          importPlan && importPlan.errors.length === 0 && importErrors.length === 0 ? (
            <FormDialogFooter
              onCancel={dismissImport}
              onSubmit={handleApplyImport}
              submitLabel={importPlan.removals.length ? 'Apply and remove' : 'Apply'}
              submitting={importing}
            />
          ) : (
            <Button mode="contained" onPress={dismissImport} disabled={importing}>Close</Button>
          )
        }
      >
        {importPlan && importPlan.errors.length > 0 ? (
          <>
            <Text style={styles.confirmText}>Nothing was changed. Fix these rows and import again:</Text>
            {importPlan.errors.map((e, i) => (
              <Text key={i} style={styles.confirmError}>• {e}</Text>
            ))}
          </>
        ) : importErrors.length > 0 ? (
          <>
            <Text style={styles.confirmText}>The membership changes were applied, but these steps did not go through:</Text>
            {importErrors.map((e, i) => (
              <Text key={i} style={styles.confirmError}>• {e}</Text>
            ))}
          </>
        ) : importPlan ? (
          <>
            <Text style={styles.confirmText}>
              {importPlan.updates.length} to update, {importPlan.invites.length} to invite, {importPlan.removals.length} to remove
              from {organization?.name}, {importPlan.unchanged} unchanged.
            </Text>
            {importPlan.updates.map(u => (
              <Text key={u.user_id} style={styles.previewLine}>• {describeUpdate(u)}</Text>
            ))}
            {importPlan.invites.map(i => (
              <Text key={i.email} style={styles.previewLine}>• invite {i.email} as {ROLE_LABELS[i.role].toLowerCase()}</Text>
            ))}
            {importPlan.removals.map(m => (
              <Text key={m.user_id} style={[styles.previewLine, { color: '#c62828' }]}>• remove {displayName(m)} ({m.email})</Text>
            ))}
            {importPlan.removals.length > 0 ? (
              <Text style={styles.roleHint}>
                Removed people keep their account if they belong to another organization; otherwise the account is deleted.
                Jobs and notes they created are kept with a blank author.
              </Text>
            ) : null}
          </>
        ) : null}
      </FormDialog>

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={6000}
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
  centered: {
    justifyContent: 'center',
  },
  roleTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginHorizontal: -8,
    borderRadius: 6,
  },
  roleTriggerHover: {
    backgroundColor: '#F3F4F6',
  },
  roleText: {
    fontSize: 14,
    fontWeight: '500',
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 14,
    color: formTheme.text,
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
  previewLine: {
    fontSize: 13,
    lineHeight: 20,
    color: formTheme.text,
  },
});
