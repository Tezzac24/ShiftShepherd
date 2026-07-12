import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { colors, spacing } from '../../../constants/theme';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { Screen } from '../../components/Screen';
import { TextField } from '../../components/TextField';
import { useAuth } from '../../lib/auth/AuthContext';
import { isInvitationToken } from '../../lib/invitations';
import {
  acceptOrganisationInvitation,
  InvitationPreview,
  previewOrganisationInvitation,
} from '../../lib/supabase/services/invitations';

export default function InvitationAcceptScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const {
    isAuthenticated,
    authMode,
    authIdentity,
    accountContext,
    pendingInvitationToken,
    savePendingInvitation,
    clearPendingInvitation,
    refreshAccountContext,
    signOut,
  } = useAuth();
  const routeToken = Array.isArray(params.token) ? params.token[0] : params.token;
  const token = useMemo(
    () => (isInvitationToken(routeToken) ? routeToken : pendingInvitationToken),
    [routeToken, pendingInvitationToken],
  );
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(
    accountContext?.account.global_display_name ?? authIdentity?.suggestedName ?? '',
  );

  useEffect(() => {
    if (isInvitationToken(routeToken) && routeToken !== pendingInvitationToken) {
      void savePendingInvitation(routeToken);
    }
  }, [routeToken, pendingInvitationToken, savePendingInvitation]);

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setLoading(false);
      setPreview(null);
      return;
    }
    setLoading(true);
    setError(null);
    void previewOrganisationInvitation(token)
      .then((result) => {
        if (!cancelled) setPreview(result);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'We couldn’t open this invitation.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, isAuthenticated, authIdentity?.id]);

  useEffect(() => {
    if (
      !name &&
      (accountContext?.account.global_display_name ||
        authIdentity?.suggestedName ||
        preview?.suggestedDisplayName)
    ) {
      setName(
        accountContext?.account.global_display_name ??
          authIdentity?.suggestedName ??
          preview?.suggestedDisplayName ??
          '',
      );
    }
  }, [
    name,
    accountContext?.account.global_display_name,
    authIdentity?.suggestedName,
    preview?.suggestedDisplayName,
  ]);

  useEffect(() => {
    if (preview && preview.status !== 'pending' && preview.status !== 'accepted') {
      void clearPendingInvitation();
    }
  }, [preview, clearPendingInvitation]);

  const accept = async () => {
    if (!token || accepting) return;
    setAccepting(true);
    setError(null);
    try {
      await acceptOrganisationInvitation(
        token,
        accountContext?.account.global_display_name ? undefined : name,
      );
      await clearPendingInvitation();
      await refreshAccountContext();
      router.replace('/(tabs)/home');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'We couldn’t accept this invitation.');
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <Screen safeTop>
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
          <AppText tone="secondary">Opening your invitation…</AppText>
        </View>
      </Screen>
    );
  }

  if (!token || preview?.status === 'invalid') {
    return (
      <Screen safeTop>
        <EmptyState
          icon="mail-unread-outline"
          title="Invitation not found"
          message="This link is incomplete or no longer valid. Ask a church administrator to send a new invitation."
        />
        <Button
          title="Back to sign in"
          onPress={() => void clearPendingInvitation().then(() => router.replace('/login'))}
        />
      </Screen>
    );
  }

  if (preview && preview.status !== 'pending' && preview.status !== 'accepted') {
    const messages = {
      expired: 'This invitation has expired. Ask a church administrator to send a new one.',
      revoked: 'This invitation was revoked by a church administrator.',
      superseded: 'A newer invitation was sent. Please use the latest email.',
    } as const;
    return (
      <Screen safeTop>
        <EmptyState
          icon="time-outline"
          title="Invitation unavailable"
          message={messages[preview.status as keyof typeof messages] ?? 'This invitation is no longer available.'}
        />
        <Button
          title="Back to sign in"
          onPress={() => void clearPendingInvitation().then(() => router.replace('/login'))}
        />
      </Screen>
    );
  }

  return (
    <Screen safeTop keyboard>
      <View style={styles.heading}>
        <AppText variant="title">Join {preview?.organisationName ?? 'your organisation'}</AppText>
        <AppText tone="secondary">
          This invitation was sent to {preview?.maskedEmail ?? 'your email address'}.
        </AppText>
      </View>

      {!isAuthenticated ? (
        <Card style={styles.card}>
          <AppText variant="subheading">Sign in or create your account</AppText>
          <AppText tone="secondary">
            We’ll keep this invitation ready while you sign in. The verified email on your account
            must match the invitation.
          </AppText>
          <Button title="Continue" onPress={() => router.push('/login')} />
        </Card>
      ) : authMode !== 'supabase' ? (
        <Card style={styles.card}>
          <AppText variant="subheading">Use your church account</AppText>
          <AppText tone="secondary">Demo accounts cannot accept live invitations.</AppText>
          <Button
            title="Sign out of demo"
            onPress={() => void signOut({ preservePendingInvitation: true }).then(() => router.replace('/login'))}
          />
        </Card>
      ) : preview?.verifiedEmailPresent === false ? (
        <Card style={{ ...styles.card, ...styles.warning }}>
          <AppText variant="subheading">A verified email is required</AppText>
          <AppText tone="secondary">
            Phone-only accounts cannot accept email invitations. Sign in with the invited verified email.
          </AppText>
          <Button
            title="Switch account"
            onPress={() => void signOut({ preservePendingInvitation: true }).then(() => router.replace('/login'))}
          />
        </Card>
      ) : preview?.accountMatches === false ? (
        <Card style={{ ...styles.card, ...styles.warning }}>
          <AppText variant="subheading">This invitation is for a different account</AppText>
          <AppText tone="secondary">
            Sign in with {preview.maskedEmail}. Nothing has been linked to the account you are using now.
          </AppText>
          <Button
            title="Switch account"
            icon="swap-horizontal-outline"
            onPress={() => void signOut({ preservePendingInvitation: true }).then(() => router.replace('/login'))}
          />
        </Card>
      ) : (
        <Card style={styles.card}>
          {!accountContext?.account.global_display_name ? (
            <>
              <AppText variant="subheading">Confirm your name</AppText>
              <AppText tone="secondary">
                This becomes your default name. You can add an organisation-specific name later.
              </AppText>
              <TextField
                label="Full name"
                value={name}
                onChangeText={setName}
                autoComplete="name"
                autoCapitalize="words"
                maxLength={100}
              />
            </>
          ) : (
            <AppText tone="secondary">
              You’ll join as {accountContext.account.global_display_name}. No team or administrator
              role is added by this invitation.
            </AppText>
          )}
          {error ? <AppText tone="danger" accessibilityLiveRegion="polite">{error}</AppText> : null}
          <Button
            title={preview?.status === 'accepted' ? 'Open organisation' : 'Accept invitation'}
            icon="checkmark-circle-outline"
            onPress={() => void accept()}
            loading={accepting}
            disabled={!accountContext?.account.global_display_name && name.trim().length < 2}
          />
        </Card>
      )}

      {error && !isAuthenticated ? <AppText tone="danger">{error}</AppText> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xxl },
  heading: { gap: spacing.xs },
  card: { gap: spacing.md },
  warning: { backgroundColor: colors.warningSoft, borderColor: colors.warningSoft },
});
