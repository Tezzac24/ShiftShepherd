import { Stack } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '../../../constants/theme';
import { AppText } from '../../components/AppText';
import { Avatar } from '../../components/Avatar';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { useConfirm } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { Screen } from '../../components/Screen';
import { SectionHeader } from '../../components/SectionHeader';
import { TextField } from '../../components/TextField';
import { useToast } from '../../components/Toast';
import { useAppData } from '../../lib/appData/AppDataContext';
import { useAuth, useRequiredUser } from '../../lib/auth/AuthContext';
import { isChurchAdmin } from '../../lib/permissions';
import {
  listOrganisationInvitations,
  resendOrganisationInvitation,
  revokeOrganisationInvitation,
  sendOrganisationInvitation,
} from '../../lib/supabase/services/invitations';
import { OrganisationInvitation, UserProfile } from '../../types';

const statusLabels = {
  pending: 'Pending',
  accepted: 'Accepted',
  expired: 'Expired',
  revoked: 'Revoked',
  superseded: 'Replaced',
} as const;

function dateLabel(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function InvitationAdminScreen() {
  const user = useRequiredUser();
  const { authMode } = useAuth();
  const data = useAppData();
  const confirm = useConfirm();
  const toast = useToast();
  const [invitations, setInvitations] = useState<OrganisationInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const canManage = authMode === 'supabase' && isChurchAdmin(user);

  const eligibleProfiles = useMemo(
    () => data.users.filter((profile) => !profile.auth_user_id && !!profile.email.trim()),
    [data.users],
  );
  const pendingTargetIds = useMemo(
    () => new Set(invitations.filter((invite) => invite.status === 'pending').map((invite) => invite.target_profile_id)),
    [invitations],
  );

  const load = useCallback(async () => {
    if (!canManage) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setInvitations(await listOrganisationInvitations());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'We couldn’t load invitations.');
    } finally {
      setLoading(false);
    }
  }, [canManage]);

  useEffect(() => {
    void load();
  }, [load]);

  const sendNew = async () => {
    if (busyKey) return;
    setBusyKey('new');
    setError(null);
    try {
      await sendOrganisationInvitation({ organisationId: data.organisation.id, email });
      setEmail('');
      toast('Invitation sent.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'We couldn’t send the invitation.');
    } finally {
      setBusyKey(null);
    }
  };

  const sendExisting = async (profile: UserProfile) => {
    if (busyKey) return;
    setBusyKey(profile.id);
    setError(null);
    try {
      await sendOrganisationInvitation({
        organisationId: data.organisation.id,
        targetProfileId: profile.id,
      });
      toast(`Invitation sent to ${profile.full_name}.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'We couldn’t send the invitation.');
    } finally {
      setBusyKey(null);
    }
  };

  const resend = async (invitation: OrganisationInvitation) => {
    const ok = await confirm({
      title: 'Send a new invitation link?',
      message: `The previous link for ${invitation.invited_email} will stop working immediately.`,
      confirmLabel: 'Resend',
    });
    if (!ok || busyKey) return;
    setBusyKey(invitation.id);
    try {
      await resendOrganisationInvitation(invitation.id);
      toast('A new invitation link was sent.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'We couldn’t resend the invitation.');
    } finally {
      setBusyKey(null);
    }
  };

  const revoke = async (invitation: OrganisationInvitation) => {
    const ok = await confirm({
      title: 'Revoke this invitation?',
      message: `${invitation.invited_email} will no longer be able to use this link. The history will be kept.`,
      confirmLabel: 'Revoke',
      destructive: true,
    });
    if (!ok || busyKey) return;
    setBusyKey(invitation.id);
    try {
      await revokeOrganisationInvitation(invitation.id);
      toast('Invitation revoked.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'We couldn’t revoke the invitation.');
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <Screen keyboard>
      <Stack.Screen options={{ title: 'Organisation invitations' }} />
      {!canManage ? (
        <EmptyState
          icon="lock-closed-outline"
          title="No permission"
          message="Only a church administrator can send and manage organisation invitations."
        />
      ) : (
        <>
          <View style={styles.heading}>
            <AppText variant="heading">Invite people to {data.organisation.name}</AppText>
            <AppText tone="secondary">
              Invitations add only church membership. Teams and administrator roles are managed separately.
            </AppText>
          </View>

          <SectionHeader title="Add & invite" />
          <Card style={styles.card}>
            <AppText tone="secondary">For someone who is not already in the directory, enter their email only.</AppText>
            <TextField
              label="Email"
              placeholder="person@example.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Button
              title="Send invitation"
              onPress={() => void sendNew()}
              loading={busyKey === 'new'}
              disabled={!email.trim() || busyKey !== null}
            />
          </Card>

          <SectionHeader title="Invite someone already listed" />
          {eligibleProfiles.length ? eligibleProfiles.map((profile) => {
            const pending = pendingTargetIds.has(profile.id);
            return (
              <Card key={profile.id} style={styles.personCard}>
                <View style={styles.personRow}>
                  <Avatar name={profile.full_name} uri={data.getAvatarUri(profile)} />
                  <View style={styles.flex}>
                    <AppText variant="bodyBold">{profile.full_name}</AppText>
                    <AppText variant="small" tone="secondary">{profile.email}</AppText>
                  </View>
                  {pending ? (
                    <Badge label="Pending" tone="accent" />
                  ) : (
                    <Button
                      title="Invite"
                      variant="secondary"
                      onPress={() => void sendExisting(profile)}
                      loading={busyKey === profile.id}
                      disabled={busyKey !== null}
                    />
                  )}
                </View>
              </Card>
            );
          }) : (
            <EmptyState
              icon="people-outline"
              title="No unlinked people to invite"
              message="Use Add & invite above for a new person."
            />
          )}

          <SectionHeader title="Invitation history" />
          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.primary} />
              <AppText tone="secondary">Loading invitations…</AppText>
            </View>
          ) : invitations.length ? invitations.map((invitation) => (
            <Card key={invitation.id} style={styles.card}>
              <View style={styles.statusRow}>
                <View style={styles.flex}>
                  <AppText variant="bodyBold">{invitation.target_display_name ?? invitation.invited_email}</AppText>
                  {invitation.target_display_name ? (
                    <AppText variant="small" tone="secondary">{invitation.invited_email}</AppText>
                  ) : null}
                </View>
                <Badge
                  label={statusLabels[invitation.status]}
                  tone={invitation.status === 'accepted' ? 'primary' : invitation.status === 'pending' ? 'accent' : 'neutral'}
                />
              </View>
              <AppText variant="small" tone="muted">
                Sent {dateLabel(invitation.last_sent_at ?? invitation.created_at)} · Expires {dateLabel(invitation.expires_at)}
              </AppText>
              {invitation.status === 'pending' ? (
                <View style={styles.actions}>
                  <Button
                    title="Resend"
                    variant="secondary"
                    onPress={() => void resend(invitation)}
                    loading={busyKey === invitation.id}
                    disabled={busyKey !== null}
                    style={styles.flex}
                  />
                  <Button
                    title="Revoke"
                    variant="destructive"
                    onPress={() => void revoke(invitation)}
                    disabled={busyKey !== null}
                    style={styles.flex}
                  />
                </View>
              ) : null}
            </Card>
          )) : (
            <EmptyState icon="mail-outline" title="No invitations yet" message="New invitations will appear here." />
          )}

          {error ? (
            <View style={styles.error} accessibilityLiveRegion="polite">
              <AppText tone="danger">{error}</AppText>
              <Button title="Try again" variant="ghost" onPress={() => void load()} />
            </View>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { gap: spacing.xs },
  card: { gap: spacing.md },
  personCard: { padding: spacing.md },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  statusRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  loading: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
  error: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.dangerSoft },
});
