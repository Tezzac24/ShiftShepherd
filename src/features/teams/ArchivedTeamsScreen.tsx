import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { colors, spacing } from '../../../constants/theme';
import { AppText } from '../../components/AppText';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { useConfirm } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { Screen } from '../../components/Screen';
import { useToast } from '../../components/Toast';
import { useAppData } from '../../lib/appData/AppDataContext';
import { useAuth } from '../../lib/auth/AuthContext';
import { canManageTeamLifecycle } from '../../lib/permissions';
import { Team } from '../../types';

function archivedDate(team: Team): string {
  if (!team.archived_at) return '';
  const parsed = new Date(team.archived_at);
  return Number.isNaN(parsed.getTime())
    ? ''
    : parsed.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function ArchivedTeamsScreen() {
  const { user, authMode, accountStatus, isLoading } = useAuth();
  const data = useAppData();
  const confirm = useConfirm();
  const showToast = useToast();
  const [confirmingTeamId, setConfirmingTeamId] = useState<string | null>(null);
  const [restoringTeamId, setRestoringTeamId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const restoreGuardRef = useRef(false);

  const authorityResolved =
    !isLoading && (authMode !== 'supabase' || accountStatus === 'ready');
  const allowed = !!user && authorityResolved && canManageTeamLifecycle(user);

  const restore = async (team: Team) => {
    if (confirmingTeamId || restoringTeamId || restoreGuardRef.current) return;
    restoreGuardRef.current = true;
    setConfirmingTeamId(team.id);
    try {
      const approved = await confirm({
        title: `Restore ${team.name}?`,
        message:
          'The same team, memberships, chat, rota, songs and history will return to active team areas.',
        confirmLabel: 'Restore team',
        destructive: false,
      });
      setConfirmingTeamId(null);
      if (!approved) return;
      setRestoringTeamId(team.id);
      setActionError(null);
      try {
        await data.restoreTeam(team.id);
        showToast(`${team.name} was restored.`);
      } catch (error) {
        setActionError(
          error instanceof Error
            ? error.message
            : "We couldn't restore this team right now. Please try again.",
        );
      } finally {
        setRestoringTeamId(null);
      }
    } finally {
      setConfirmingTeamId(null);
      restoreGuardRef.current = false;
    }
  };

  if (!authorityResolved) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Archived teams' }} />
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
          <AppText tone="secondary">Checking team permissions...</AppText>
        </View>
      </Screen>
    );
  }

  if (!allowed) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Archived teams' }} />
        <EmptyState
          icon="lock-closed-outline"
          title="No permission"
          message="Only a church admin can view or restore archived teams."
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Archived teams' }} />
      <View style={styles.heading}>
        <AppText variant="heading">Archived teams</AppText>
        <AppText tone="secondary">
          Archived teams are hidden from active areas. Their memberships and history are kept.
        </AppText>
      </View>

      {actionError ? (
        <Card style={styles.errorCard}>
          <View style={styles.errorRow}>
            <Ionicons name="alert-circle-outline" size={21} color={colors.danger} />
            <AppText tone="danger" style={styles.flexText} accessibilityLiveRegion="polite">
              {actionError}
            </AppText>
          </View>
        </Card>
      ) : null}

      {data.teamsLoading && data.archivedTeams.length === 0 ? (
        <Card>
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.primary} />
            <AppText tone="secondary">Loading archived teams...</AppText>
          </View>
        </Card>
      ) : data.teamsError && data.archivedTeams.length === 0 ? (
        <>
          <EmptyState
            icon="cloud-offline-outline"
            title="Couldn't load archived teams"
            message={data.teamsError}
          />
          <Button
            title="Try Again"
            variant="secondary"
            icon="refresh-outline"
            onPress={() => void data.refreshTeams()}
          />
        </>
      ) : data.archivedTeams.length === 0 ? (
        <EmptyState
          icon="archive-outline"
          title="No archived teams"
          message="Teams you archive will appear here until a church admin restores them."
        />
      ) : (
        data.archivedTeams.map((team) => (
          <Card key={team.id} style={styles.teamCard}>
            <View style={styles.titleRow}>
              <View style={styles.flexText}>
                <AppText variant="subheading">{team.name}</AppText>
                <AppText variant="small" tone="secondary">
                  {team.description || 'No description'}
                </AppText>
              </View>
              <Badge label="Archived" tone="neutral" />
            </View>
            {archivedDate(team) ? (
              <AppText variant="small" tone="muted">
                Archived {archivedDate(team)}
              </AppText>
            ) : null}
            <Button
              title="Restore team"
              variant="secondary"
              icon="refresh-outline"
              loading={restoringTeamId === team.id}
              disabled={restoringTeamId !== null || confirmingTeamId !== null}
              onPress={() => void restore(team)}
              accessibilityHint={`Restore ${team.name} to active team areas`}
            />
          </Card>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { gap: spacing.xs },
  loading: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  teamCard: { gap: spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  flexText: { flex: 1, minWidth: 0 },
  errorCard: { backgroundColor: colors.dangerSoft, borderColor: colors.dangerSoft },
  errorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
});
