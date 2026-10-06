import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, spacing, touchTarget } from '../../constants/theme';
import { useAppData } from '../lib/appData/AppDataContext';
import { useAuth } from '../lib/auth/AuthContext';
import { AppText } from './AppText';
import { Button } from './Button';

/** The active live church must match both the account pointer and current user. */
export function resolvedActiveOrganisation({ authMode, user, accountContext }: Pick<ReturnType<typeof useAuth>, 'authMode' | 'user' | 'accountContext'>) {
  return authMode === 'supabase' && user && accountContext && accountContext.account.active_profile_id === user.profile.id
    ? accountContext.organisations.find((item) => item.profile.id === user.profile.id
      && item.organisation.id === user.profile.organisation_id)
    : undefined;
}

/** Opt-in primary-screen context. Screen remains responsible for safe-area padding. */
export function OrganisationHeader() {
  const router = useRouter();
  const { user, authMode, accountContext, accountStatus, refreshAccountContext } = useAuth();
  const { organisation } = useAppData();
  // AppData's unresolved live directory contains fallback demo metadata. Only
  // the account's server-resolved, active profile may name a live church here.
  const active = resolvedActiveOrganisation({ authMode, user, accountContext });
  const name = authMode === 'supabase' ? active?.organisation.name : organisation.name;
  const canSwitch = authMode === 'supabase' && !!active && accountStatus === 'ready'
    && (accountContext?.organisations.length ?? 0) > 1;
  const unresolvedError = !name && accountStatus === 'error';

  return (
    <View style={styles.header}>
      <Ionicons name="business-outline" size={22} color={colors.primary} accessible={false} />
      <AppText
        variant="bodyBold" tone="primary" style={styles.name}
        accessibilityLabel={name ? `Current church: ${name}` : undefined}
        accessibilityLiveRegion={!name ? 'polite' : undefined}
      >
        {name ?? (unresolvedError ? 'Church unavailable' : 'Loading church…')}
      </AppText>
      {canSwitch ? (
        <Button title="Switch" variant="ghost" onPress={() => router.push('/organisations/select')}
          accessibilityLabel="Switch church" style={styles.action} />
      ) : unresolvedError ? (
        <Button title="Retry" variant="ghost" onPress={() => void refreshAccountContext()}
          accessibilityLabel="Retry church details" style={styles.action} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: touchTarget, flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  name: { flex: 1 },
  action: { paddingHorizontal: spacing.sm },
});
