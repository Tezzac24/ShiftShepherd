import { Stack, useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
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
import { TextField } from '../../components/TextField';
import { useToast } from '../../components/Toast';
import { useAppData } from '../../lib/appData/AppDataContext';
import { useAuth, useRequiredUser } from '../../lib/auth/AuthContext';
import { canManageOrganisationMembers } from '../../lib/permissions';
import {
  listOrganisationMembers,
  removeOrganisationMember,
} from '../../lib/supabase/services/organisationMemberships';
import { OrganisationMemberSummary } from '../../types';
import {
  filterOrganisationMembers,
  organisationMemberAccessLabel,
  organisationRoleLabel,
} from './organisationMembers';

export default function OrganisationMembersScreen() {
  const router = useRouter();
  const user = useRequiredUser();
  const { authMode } = useAuth();
  const data = useAppData();
  const confirm = useConfirm();
  const toast = useToast();
  const [members, setMembers] = useState<OrganisationMemberSummary[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const canManage = authMode === 'supabase' && canManageOrganisationMembers(user);

  const load = useCallback(async (quiet = false) => {
    if (!canManage) {
      setLoading(false);
      return;
    }
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      setMembers(await listOrganisationMembers());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'We couldn’t load members.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [canManage]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const visibleMembers = useMemo(
    () => filterOrganisationMembers(members, search),
    [members, search],
  );

  const remove = async (member: OrganisationMemberSummary) => {
    if (removingId) return;
    const ok = await confirm({
      title: `Remove ${member.full_name} from ${data.organisation.name}?`,
      message:
        'They will lose organisation and team access, their roles and registered notification devices will be removed, and they will need a new invitation to return. Their profile, messages, rota history, global account, and any other organisations will be kept.',
      confirmLabel: 'Remove access',
      destructive: true,
    });
    if (!ok || removingId) return;
    setRemovingId(member.profile_id);
    setError(null);
    try {
      await removeOrganisationMember(member.profile_id);
      toast(`${member.full_name} no longer has access to this organisation.`);
      await Promise.all([load(true), data.refreshTeams({ quiet: true })]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'We couldn’t remove that access.');
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <Screen keyboard>
      <Stack.Screen options={{ title: 'Organisation members' }} />
      {!canManage ? (
        <EmptyState
          icon="lock-closed-outline"
          title="No permission"
          message="Only a church admin can manage organisation members and roles."
        />
      ) : (
        <>
          <View style={styles.heading}>
            <AppText variant="heading">Members of {data.organisation.name}</AppText>
            <AppText tone="secondary">
              Manage app access and each person’s one organisation role. Historical records are kept when access is removed.
            </AppText>
          </View>

          <TextField
            label="Search members"
            placeholder="Name or email"
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityHint="Filters this bounded organisation member list"
          />

          {loading ? (
            <View style={styles.loading} testID="organisation-members-loading">
              <ActivityIndicator color={colors.primary} />
              <AppText tone="secondary">Loading members…</AppText>
            </View>
          ) : error && members.length === 0 ? (
            <View style={styles.error} accessibilityLiveRegion="polite">
              <EmptyState
                icon="cloud-offline-outline"
                title="We couldn’t load members"
                message={error}
              />
              <Button title="Try again" onPress={() => void load()} />
            </View>
          ) : visibleMembers.length === 0 ? (
            <EmptyState
              icon="people-outline"
              title={search.trim() ? 'No matching members' : 'No members yet'}
              message={
                search.trim()
                  ? 'Try a different name or email address.'
                  : 'Organisation members will appear here.'
              }
            />
          ) : (
            <View style={styles.cards} testID="organisation-members-ready">
              <View style={styles.countRow}>
                <AppText variant="label" tone="secondary">
                  {visibleMembers.length} {visibleMembers.length === 1 ? 'person' : 'people'}
                </AppText>
                <Button
                  title="Refresh"
                  variant="ghost"
                  icon="refresh-outline"
                  onPress={() => void load(true)}
                  loading={refreshing}
                  disabled={refreshing || removingId !== null}
                />
              </View>
              {visibleMembers.map((member) => {
                const profile = data.users.find((candidate) => candidate.id === member.profile_id);
                const canEditRole = member.access_status === 'active' && member.linked;
                const canRemove = canEditRole && !member.is_current_user && !member.is_last_church_admin;
                return (
                  <Card key={member.profile_id} style={styles.card}>
                    <View style={styles.personRow}>
                      <Avatar name={member.full_name} uri={data.getAvatarUri(profile)} />
                      <View style={styles.flex}>
                        <View style={styles.nameRow}>
                          <AppText variant="bodyBold">{member.full_name}</AppText>
                          {member.is_current_user ? <Badge label="You" tone="primary" /> : null}
                        </View>
                        <AppText variant="small" tone="secondary">{member.email}</AppText>
                      </View>
                    </View>
                    <View style={styles.badges}>
                      <Badge
                        label={organisationMemberAccessLabel(member)}
                        tone={member.access_status === 'removed' ? 'danger' : member.linked ? 'success' : 'warning'}
                      />
                      <Badge label={organisationRoleLabel(member.role)} tone="accent" />
                      <Badge label={`${member.team_count} ${member.team_count === 1 ? 'team' : 'teams'}`} />
                      {member.pending_invitation_status === 'pending' ? (
                        <Badge label="Invitation pending" tone="warning" />
                      ) : null}
                    </View>
                    {member.is_last_church_admin ? (
                      <AppText variant="small" tone="danger">
                        Final church admin. Appoint another church admin before demoting, removing, or leaving.
                      </AppText>
                    ) : member.access_status === 'removed' ? (
                      <AppText variant="small" tone="muted">
                        Access is removed, but directory and historical attribution are retained. They may be invited again.
                      </AppText>
                    ) : !member.linked ? (
                      <AppText variant="small" tone="muted">
                        This directory person has no linked app account yet. Use Organisation invitations to invite them.
                      </AppText>
                    ) : null}
                    {canEditRole ? (
                      <View style={styles.actions}>
                        <Button
                          title="Manage role"
                          variant="secondary"
                          icon="shield-outline"
                          onPress={() => router.push({
                            pathname: '/organisations/members/[profileId]',
                            params: { profileId: member.profile_id },
                          })}
                          disabled={removingId !== null}
                          style={styles.flex}
                        />
                        {member.is_current_user ? (
                          <Button
                            title="Leave from Profile"
                            variant="ghost"
                            onPress={() => router.replace('/(tabs)/profile')}
                            disabled={removingId !== null}
                            style={styles.flex}
                          />
                        ) : (
                          <Button
                            title={member.is_last_church_admin ? 'Protected' : 'Remove access'}
                            variant="destructive"
                            icon="person-remove-outline"
                            onPress={() => void remove(member)}
                            loading={removingId === member.profile_id}
                            disabled={!canRemove || removingId !== null}
                            accessibilityHint={
                              member.is_last_church_admin
                                ? 'Another church admin must be appointed first'
                                : 'Removes current organisation access while retaining history'
                            }
                            style={styles.flex}
                          />
                        )}
                      </View>
                    ) : null}
                  </Card>
                );
              })}
            </View>
          )}

          {error && members.length > 0 ? (
            <View style={styles.errorBar} accessibilityLiveRegion="polite">
              <AppText tone="danger">{error}</AppText>
              <Button title="Try again" variant="ghost" onPress={() => void load(true)} />
            </View>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { gap: spacing.xs },
  loading: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  error: { gap: spacing.md },
  errorBar: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.dangerSoft },
  cards: { gap: spacing.md },
  card: { gap: spacing.md },
  countRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  nameRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  flex: { flex: 1 },
});
