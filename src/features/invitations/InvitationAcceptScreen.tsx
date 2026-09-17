import type { NavigationProp } from '@react-navigation/native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
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

type InvitationRouteParams = { 'invite/accept': { token?: string } };

export default function InvitationAcceptScreen() {
  const router = useRouter();
  const navigation = useNavigation<NavigationProp<InvitationRouteParams, 'invite/accept'>>();
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
  const linkToken = isInvitationToken(routeToken) ? routeToken : null;

  // The invitation this screen is about: an opened link first, otherwise the
  // pending invitation restored after sign-in or a cold start. The screen keeps
  // it after that pending token is cleared, so settling an invitation (accepting
  // it, finding it expired, or setting it aside) never turns the screen into
  // "Invitation not found" while it finishes.
  const currentToken = linkToken ?? pendingInvitationToken;
  const [shownToken, setShownToken] = useState(currentToken);
  if (currentToken && currentToken !== shownToken) setShownToken(currentToken);
  const token = currentToken ?? shownToken;

  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(
    accountContext?.account.global_display_name ?? authIdentity?.suggestedName ?? '',
  );

  // An opened link is kept waiting through sign-in and restarts, and is adopted
  // exactly once: after it is saved the token leaves the route, so neither a
  // re-render nor the remount that follows an account change can save an
  // invitation again after it was accepted or set aside.
  useEffect(() => {
    if (!linkToken) return;
    let active = true;
    savePendingInvitation(linkToken).then(
      () => {
        if (active) navigation.setParams({ token: undefined });
      },
      () => {
        if (active) setError('We couldn’t keep this invitation ready on this device.');
      },
    );
    return () => {
      active = false;
    };
  }, [linkToken, navigation, savePendingInvitation]);

  /**
   * Sets this invitation aside and lets the routing hub choose the destination:
   * sign in, Home, or the organisation screens. `/login` is only a registered
   * route while signed out, so navigating there directly would do nothing for
   * a signed-in account. The invitation itself stays valid on the server, so
   * the emailed link still opens it later.
   */
  const leaveInvitation = async () => {
    await clearPendingInvitation();
    router.replace('/');
  };

  /**
   * Wrong-account / demo-account escape hatch. The pending token is deliberately
   * preserved so the invitation is still waiting after the user signs in with the
   * invited email. `invite/accept` is not behind an auth guard, so unlike the
   * other sign-out call sites this one must name its own destination.
   */
  const switchAccount = async () => {
    try {
      await signOut({ preservePendingInvitation: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'We couldn’t complete the sign out.');
    }
    router.replace('/login');
  };

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

  // Signed-in accounts can always set an invitation aside. Without this, an
  // invitation the account cannot accept (a different account, a phone-only
  // account, a demo account, or an acceptance the server refuses) would bring
  // it back here on every launch, because a pending invitation outranks every
  // other destination.
  const notNow = isAuthenticated ? (
    <Button
      title="Not now"
      variant="ghost"
      onPress={() => void leaveInvitation()}
      disabled={accepting}
    />
  ) : null;
  const exitTitle = isAuthenticated ? 'Continue' : 'Back to sign in';

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
        <Button title={exitTitle} onPress={() => void leaveInvitation()} />
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
        <Button title={exitTitle} onPress={() => void leaveInvitation()} />
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
            onPress={() => void switchAccount()}
          />
          {notNow}
        </Card>
      ) : preview?.verifiedEmailPresent === false ? (
        <Card style={{ ...styles.card, ...styles.warning }}>
          <AppText variant="subheading">A verified email is required</AppText>
          <AppText tone="secondary">
            Phone-only accounts cannot accept email invitations. Sign in with the invited verified email.
          </AppText>
          <Button
            title="Switch account"
            onPress={() => void switchAccount()}
          />
          {notNow}
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
            onPress={() => void switchAccount()}
          />
          {notNow}
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
          {notNow}
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
