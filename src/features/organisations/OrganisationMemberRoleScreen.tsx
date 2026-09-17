import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { colors, radius, spacing, touchTarget } from '../../../constants/theme';
import { AppText } from '../../components/AppText';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { useConfirm } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { Screen } from '../../components/Screen';
import { useToast } from '../../components/Toast';
import { useAppData } from '../../lib/appData/AppDataContext';
import { useAuth, useRequiredUser } from '../../lib/auth/AuthContext';
import {
  canManageOrganisationMembers,
  ORGANISATION_ROLE_OPTIONS,
} from '../../lib/permissions';
import {
  listOrganisationMembers,
  setOrganisationMemberRole,
} from '../../lib/supabase/services/organisationMemberships';
import { OrganisationMemberSummary, OrganisationRoleName } from '../../types';
import { organisationRoleLabel } from './organisationMembers';

export default function OrganisationMemberRoleScreen() {
  const { profileId } = useLocalSearchParams<{ profileId: string }>();
  const router = useRouter();
  const user = useRequiredUser();
  const { authMode } = useAuth();
  const data = useAppData();
  const confirm = useConfirm();
  const toast = useToast();
  const [member, setMember] = useState<OrganisationMemberSummary | null>(null);
  const [selectedRole, setSelectedRole] = useState<OrganisationRoleName | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canManage = authMode === 'supabase' && canManageOrganisationMembers(user);

  const load = async () => {
    if (!canManage || !profileId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = (await listOrganisationMembers()).find(
        (candidate) => candidate.profile_id === profileId,
      );
      setMember(result ?? null);
      setSelectedRole(result?.role ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'We couldn’t load that role.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // profileId/canManage define the route identity; load intentionally stays local.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, canManage]);

  const save = async () => {
    if (!member || !selectedRole || saving || selectedRole === member.role) return;
    const isDemotion = member.role === 'church_admin' && selectedRole !== 'church_admin';
    const isPromotion = member.role !== 'church_admin' && selectedRole === 'church_admin';
    if (isDemotion || isPromotion) {
      const ok = await confirm({
        title: isPromotion ? `Make ${member.full_name} a church admin?` : `Remove church admin access?`,
        message: isPromotion
          ? 'Church admins have high privilege. They can manage organisation members, roles, invitations, and organisation content.'
          : `${member.full_name} will keep organisation access but lose church-admin permissions. The final church admin cannot be demoted.`,
        confirmLabel: isPromotion ? 'Make church admin' : 'Change role',
        destructive: isDemotion,
      });
      if (!ok) return;
    }

    setSaving(true);
    setError(null);
    try {
      await setOrganisationMemberRole(member.profile_id, selectedRole);
      await data.refreshTeams({ quiet: true });
      toast(`${member.full_name} is now ${organisationRoleLabel(selectedRole)}.`);
      router.back();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'We couldn’t update that role.');
    } finally {
      setSaving(false);
    }
  };

  const targetAvailable = member?.access_status === 'active' && member.linked;

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Manage organisation role' }} />
      {!canManage ? (
        <EmptyState
          icon="lock-closed-outline"
          title="No permission"
          message="Only a church admin can manage organisation roles."
        />
      ) : loading ? (
        <View style={styles.loading} testID="organisation-role-loading">
          <ActivityIndicator color={colors.primary} />
          <AppText tone="secondary">Loading role…</AppText>
        </View>
      ) : error && !member ? (
        <View style={styles.error}>
          <EmptyState icon="cloud-offline-outline" title="We couldn’t load this member" message={error} />
          <Button title="Try again" onPress={() => void load()} />
        </View>
      ) : !member ? (
        <EmptyState
          icon="person-outline"
          title="Member not found"
          message="This person may no longer be available in the current organisation."
        />
      ) : !targetAvailable ? (
        <EmptyState
          icon="shield-outline"
          title="Role cannot be changed"
          message={
            member.access_status === 'removed'
              ? 'This person no longer has organisation access. Invite them again before assigning a role.'
              : 'This directory person must accept an invitation before their role can be managed.'
          }
        />
      ) : (
        <>
          <View style={styles.heading}>
            <AppText variant="heading">Role for {member.full_name}</AppText>
            <AppText tone="secondary">
              Each person has one organisation role. Church Member is the baseline role and cannot be removed while access is active.
            </AppText>
            <View style={styles.currentRow}>
              <Badge label={`Current: ${organisationRoleLabel(member.role)}`} tone="primary" />
              {member.is_current_user ? <Badge label="You" tone="accent" /> : null}
            </View>
          </View>

          <View style={styles.options} accessibilityRole="radiogroup">
            {ORGANISATION_ROLE_OPTIONS.map((option) => {
              const checked = selectedRole === option.value;
              const blockedByLastAdmin =
                member.is_last_church_admin && option.value !== 'church_admin';
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityLabel={`${option.label}. ${option.description}`}
                  accessibilityState={{ checked, disabled: blockedByLastAdmin || saving }}
                  accessibilityHint={
                    blockedByLastAdmin
                      ? 'Appoint another church admin before selecting this role'
                      : 'Selects this organisation role'
                  }
                  onPress={() => setSelectedRole(option.value)}
                  disabled={blockedByLastAdmin || saving}
                  style={({ pressed }) => [
                    styles.option,
                    checked && styles.optionSelected,
                    pressed && styles.optionPressed,
                    (blockedByLastAdmin || saving) && styles.optionDisabled,
                  ]}
                  testID={`organisation-role-${option.value}`}
                >
                  <View style={styles.optionHeader}>
                    <Ionicons
                      name={checked ? 'radio-button-on' : 'radio-button-off'}
                      size={24}
                      color={checked ? colors.primary : colors.textMuted}
                    />
                    <AppText variant="bodyBold" style={styles.flex}>{option.label}</AppText>
                    {option.highPrivilege ? <Badge label="High privilege" tone="danger" /> : null}
                  </View>
                  <AppText variant="small" tone="secondary">{option.description}</AppText>
                  {blockedByLastAdmin ? (
                    <AppText variant="small" tone="danger">
                      Protected because this is the final church admin.
                    </AppText>
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          {error ? (
            <Card style={styles.errorBar}>
              <AppText tone="danger" accessibilityLiveRegion="polite">{error}</AppText>
            </Card>
          ) : null}

          <Button
            title="Save role"
            icon="checkmark-outline"
            onPress={() => void save()}
            loading={saving}
            disabled={!selectedRole || selectedRole === member.role || saving}
          />
          <Button title="Cancel" variant="ghost" onPress={() => router.back()} disabled={saving} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  error: { gap: spacing.md },
  errorBar: { backgroundColor: colors.dangerSoft },
  heading: { gap: spacing.sm },
  currentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  options: { gap: spacing.sm },
  option: {
    minHeight: touchTarget,
    padding: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  optionSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  optionPressed: { opacity: 0.85 },
  optionDisabled: { opacity: 0.5 },
  optionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});

