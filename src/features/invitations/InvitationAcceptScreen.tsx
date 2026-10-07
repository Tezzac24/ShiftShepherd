import type { NavigationProp } from '@react-navigation/native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { spacing } from '../../../constants/theme';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { FormErrorSummary } from '../../components/FormErrorSummary';
import { PageHeading } from '../../components/PageHeading';
import { Screen } from '../../components/Screen';
import { StatePanel } from '../../components/StatePanel';
import { TextField } from '../../components/TextField';
import { useAuth } from '../../lib/auth/AuthContext';
import { isInvitationToken } from '../../lib/invitations';
import { acceptOrganisationInvitation, InvitationPreview, previewOrganisationInvitation } from '../../lib/supabase/services/invitations';
import { AccountIdentity } from '../auth/AccountEntrySupport';
import { AccountContinuationTicket, useChurchEntryPresentation } from '../organisations/ChurchEntryPresentation';

type InvitationRouteParams = { 'invite/accept': { token?: string } };
type PreviewState = { key: string; value: InvitationPreview | null; error: string | null; loading: boolean };

export default function InvitationAcceptScreen() {
  const router = useRouter();
  const navigation = useNavigation<NavigationProp<InvitationRouteParams, 'invite/accept'>>();
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const auth = useAuth();
  const continuation = useChurchEntryPresentation();
  const { isAuthenticated, authMode, authIdentity, accountContext, accountStatus, pendingInvitationToken,
    savePendingInvitation, clearPendingInvitation, refreshAccountContext, signOut } = auth;
  const routeToken = Array.isArray(params.token) ? params.token[0] : params.token;
  const linkToken = isInvitationToken(routeToken) ? routeToken : null;
  // Retain the shown link after settling pending storage so its reason stays visible.
  const currentToken = linkToken ?? pendingInvitationToken;
  const [shownToken, setShownToken] = useState(currentToken);
  if (currentToken && currentToken !== shownToken) setShownToken(currentToken);
  const token = currentToken ?? shownToken;
  const owner = `${authMode}:${authIdentity?.id ?? (isAuthenticated ? 'demo' : 'signed-out')}:${token ?? ''}`;
  const previewKey = `${owner}:${authIdentity?.emailVerified ?? ''}`;
  const [previewState, setPreviewState] = useState<PreviewState>({ key: previewKey, value: null, error: null, loading: !!token });
  const [retry, setRetry] = useState(0);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{ owner: string; message: string; acceptanceUncertain?: boolean } | null>(null);
  const [busyOwner, setBusyOwner] = useState<string | null>(null);
  const [acceptedOwner, setAcceptedOwner] = useState<string | null>(null);
  const [acceptedProfileId, setAcceptedProfileId] = useState<string | undefined>(undefined);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [nameDraft, setNameDraft] = useState({ owner, value: accountContext?.account.global_display_name ?? authIdentity?.suggestedName ?? '' });
  const [validation, setValidation] = useState<{ owner: string; message: string } | null>(null);
  const [adopting, setAdopting] = useState(false);
  const adoption = useRef<{ token: string; promise: Promise<void> } | null>(null);
  const storageQueue = useRef<Promise<void>>(Promise.resolve());
  const adoptedTokens = useRef(new Set<string>());
  const clearedTokens = useRef(new Set<string>());
  const pending = useRef<string | null>(null);
  const queuedContinuation = useRef<string | null>(null);
  const scroll = useRef<ScrollView>(null);
  const nameField = useRef<TextInput>(null);
  const nameSection = useRef<View>(null);
  const pendingNameReveal = useRef<{ owner: string; generation: number } | null>(null);
  const lifecycle = useRef({ owner, token, generation: 0, mounted: true, closed: false });
  if (lifecycle.current.owner !== owner) {
    lifecycle.current.generation += 1;
  }
  Object.assign(lifecycle.current, { owner, token });
  const preview = previewState.key === previewKey ? previewState.value : null;
  const loading = !!token && (previewState.key !== previewKey || previewState.loading);
  const previewError = previewState.key === previewKey ? previewState.error : null;
  const error = actionError?.owner === owner ? actionError.message : null;
  const nameError = validation?.owner === owner ? validation.message : null;
  const name = nameDraft.owner === owner ? nameDraft.value : accountContext?.account.global_display_name ?? authIdentity?.suggestedName ?? '';
  const busy = busyOwner === owner;
  const accepted = acceptedOwner === owner;
  const accountReady = authMode === 'supabase' && accountStatus === 'ready' && !!accountContext
    && accountContext.account.auth_user_id === authIdentity?.id;
  const settled = !!preview && !['pending', 'accepted'].includes(preview.status);
  const isCurrent = (generation: number, expectedOwner = owner) => lifecycle.current.mounted && !lifecycle.current.closed
    && lifecycle.current.owner === expectedOwner && lifecycle.current.generation === generation;
  const revealName = () => {
    const section = nameSection.current;
    const scroller = scroll.current;
    const content = scroller?.getInnerViewNode();
    if (!section || !scroller || !content) return;
    const generation = lifecycle.current.generation;
    // The form follows the church/account context. Measure the field against
    // scroll content, rather than using its child-local layout offset.
    section.measureLayout(content, (_x, y) => {
      if (!isCurrent(generation) || nameSection.current !== section) return;
      scroller.scrollTo({ y: Math.max(0, y - spacing.md), animated: false });
      nameField.current?.focus();
    });
  };
  const continueAfterAccountAction = (ticket: AccountContinuationTicket, destination: '/' | '/login', expectedProfileId?: string) => {
    const generation = lifecycle.current.generation;
    queuedContinuation.current = owner;
    // Auth commits its new context just after resolving the action. Check the
    // above-boundary live owner at the next frame, including after a remount.
    requestAnimationFrame(() => {
      if (queuedContinuation.current === owner) queuedContinuation.current = null;
      if (lifecycle.current.closed || (destination === '/'
        && (lifecycle.current.owner !== owner || lifecycle.current.generation !== generation))) return;
      if (continuation.canContinueAccount(ticket, { invitationToken: token, acceptedProfileId: expectedProfileId, afterSignOut: destination === '/login' })) {
        router.replace(destination);
      }
    });
  };

  useEffect(() => {
    const current = lifecycle.current;
    current.mounted = true;
    // BeforeRemove distinguishes a deliberate exit from the existing provider
    // remount after successful acceptance/sign-out. It fences late navigation.
    const remove = navigation.addListener('beforeRemove', () => { lifecycle.current.closed = true; });
    const blur = navigation.addListener('blur', () => { lifecycle.current.closed = true; lifecycle.current.generation += 1; });
    const focus = navigation.addListener('focus', () => {
      if (lifecycle.current.closed && lifecycle.current.mounted) { lifecycle.current.closed = false; setRetry((value) => value + 1); }
    });
    return () => { current.mounted = false; remove(); blur(); focus(); };
  }, [navigation]);

  useEffect(() => {
    if (!linkToken || adoptedTokens.current.has(linkToken)) return;
    adoptedTokens.current.add(linkToken);
    setAdopting(true);
    const promise = storageQueue.current.catch(() => undefined).then(() => savePendingInvitation(linkToken));
    storageQueue.current = promise;
    adoption.current = { token: linkToken, promise };
    void promise.then(() => {
      if (lifecycle.current.mounted && !lifecycle.current.closed && lifecycle.current.token === linkToken) {
        // Adopt once, then remove the route token. Remounts cannot re-save a
        // terminal, dismissed or accepted invitation from stale route params.
        navigation.setParams({ token: undefined });
      }
    }).catch(() => {
      if (lifecycle.current.mounted && lifecycle.current.token === linkToken) setStorageError('We couldn’t keep this invitation ready on this device.');
    }).finally(() => {
      if (lifecycle.current.mounted && lifecycle.current.token === linkToken) setAdopting(false);
    });
  }, [linkToken, navigation, savePendingInvitation]);

  useEffect(() => {
    if (!token) { setPreviewState({ key: previewKey, value: null, error: null, loading: false }); return; }
    let active = true;
    const generation = lifecycle.current.generation;
    setPreviewState({ key: previewKey, value: null, error: null, loading: true });
    void previewOrganisationInvitation(token).then((value) => {
      if (active && isCurrent(generation)) setPreviewState({ key: previewKey, value, error: null, loading: false });
    }).catch((cause) => {
      if (active && isCurrent(generation)) setPreviewState({ key: previewKey, value: null,
        error: cause instanceof Error ? cause.message : 'We couldn’t open this invitation.', loading: false });
    });
    return () => { active = false; };
    // The key owns the server preview; same-account readiness retains it and the draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, previewKey, retry]);

  useEffect(() => {
    const suggested = accountContext?.account.global_display_name ?? authIdentity?.suggestedName ?? preview?.suggestedDisplayName ?? '';
    setNameDraft((draft) => draft.owner !== owner ? { owner, value: suggested } : draft.value ? draft : { owner, value: suggested });
  }, [owner, accountContext?.account.global_display_name, authIdentity?.suggestedName, preview?.suggestedDisplayName]);

  const settlePending = async (expectedToken: string, generation: number) => {
    // Wait for an in-flight adoption before clearing; a late storage write
    // must never put a terminal/dismissed link back into pending storage.
    if (adoption.current?.token === expectedToken) await adoption.current.promise.catch(() => undefined);
    if (!isCurrent(generation) || lifecycle.current.token !== expectedToken) return false;
    const clear = storageQueue.current.catch(() => undefined).then(async () => {
      if (!isCurrent(generation) || lifecycle.current.token !== expectedToken) return;
      navigation.setParams({ token: undefined });
      await clearPendingInvitation();
    });
    storageQueue.current = clear;
    await clear;
    return isCurrent(generation);
  };
  useEffect(() => {
    if (!token || !settled || clearedTokens.current.has(owner)) return;
    const generation = lifecycle.current.generation;
    clearedTokens.current.add(owner);
    void settlePending(token, generation).then((cleared) => {
      if (!cleared) clearedTokens.current.delete(owner);
    }).catch(() => {
      clearedTokens.current.delete(owner);
      if (isCurrent(generation)) setActionError({ owner, message: 'We couldn’t clear this invitation on this device. Try Continue again.' });
    });
    // The settled server preview and token identify the one cleanup operation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, token, settled]);

  const leaveInvitation = async () => {
    if (pending.current === owner) return;
    pending.current = owner; setBusyOwner(owner); setActionError(null);
    const generation = lifecycle.current.generation;
    try {
      if (token) { if (!await settlePending(token, generation)) return; }
      else await clearPendingInvitation();
      if (!isCurrent(generation)) return;
      lifecycle.current.closed = true;
      router.replace('/');
    } catch {
      if (isCurrent(generation)) setActionError({ owner, message: 'We couldn’t clear this invitation on this device. Please try again.' });
    } finally {
      if (pending.current === owner) pending.current = null;
      if (isCurrent(generation)) setBusyOwner(null);
    }
  };
  const switchAccount = async () => {
    if (pending.current === owner || queuedContinuation.current === owner || adopting) return;
    pending.current = owner; setBusyOwner(owner); setActionError(null);
    const generation = lifecycle.current.generation;
    const accountTicket = continuation.captureAccountContinuation();
    try {
      if (adoption.current?.token === token) await adoption.current.promise;
      if (!isCurrent(generation)) return;
      await signOut({ preservePendingInvitation: true });
      // Intentional sign-out can remount the navigator. A successful Auth action
      // has cleared the account; this is the explicit signed-out login path.
      continueAfterAccountAction(accountTicket, '/login');
    } catch (cause) {
      if (isCurrent(generation)) setActionError({ owner, message: cause instanceof Error ? cause.message : 'We couldn’t complete sign out.' });
    } finally {
      if (pending.current === owner) pending.current = null;
      if (isCurrent(generation)) setBusyOwner(null);
    }
  };
  const refreshAcceptedAccount = async () => {
    if (pending.current === owner || queuedContinuation.current === owner) return;
    pending.current = owner; setBusyOwner(owner); setRefreshFailed(false);
    const generation = lifecycle.current.generation;
    const accountTicket = continuation.captureAccountContinuation();
    try {
      await refreshAccountContext();
      continueAfterAccountAction(accountTicket, '/', acceptedProfileId);
    } catch {
      if (isCurrent(generation)) setRefreshFailed(true);
    } finally {
      if (pending.current === owner) pending.current = null;
      if (isCurrent(generation)) setBusyOwner(null);
    }
  };
  const accept = async () => {
    if (!token || pending.current === owner || adopting || !accountReady || !preview || !['pending', 'accepted'].includes(preview.status)
      || preview.accountMatches !== true || preview.verifiedEmailPresent !== true) return;
    const invalid = !accountContext?.account.global_display_name && name.trim().length < 2 ? 'Please confirm your full name (at least 2 characters).'
      : !accountContext?.account.global_display_name && name.trim().length > 100 ? 'Please keep your name to 100 characters or fewer.' : null;
    setValidation(invalid ? { owner, message: invalid } : null);
    if (invalid) {
      // A first failure inserts both the summary and inline error. Reveal only
      // after their layout; a repeated failure can use the existing layout.
      if (nameError === invalid) revealName();
      else pendingNameReveal.current = { owner, generation: lifecycle.current.generation };
      return;
    }
    pending.current = owner; setBusyOwner(owner); setActionError(null);
    const generation = lifecycle.current.generation;
    const accountTicket = continuation.captureAccountContinuation();
    try {
      const result = await acceptOrganisationInvitation(token, accountContext?.account.global_display_name ? undefined : name);
      if (!isCurrent(generation)) return;
      setAcceptedOwner(owner);
      setAcceptedProfileId(result.profileId);
      if (!await settlePending(token, generation)) return;
      try {
        await refreshAccountContext();
        // The established profile-keyed provider remount is expected here.
        // Continue only through the safe hub, which resolves current precedence.
        continueAfterAccountAction(accountTicket, '/', result.profileId);
      } catch { if (isCurrent(generation)) setRefreshFailed(true); }
    } catch (cause) {
      if (isCurrent(generation)) {
        setActionError({ owner, message: cause instanceof Error ? cause.message : 'We couldn’t confirm this invitation acceptance.', acceptanceUncertain: true });
        scroll.current?.scrollTo({ y: 0, animated: false });
      }
    } finally {
      if (pending.current === owner) pending.current = null;
      if (isCurrent(generation)) setBusyOwner(null);
    }
  };
  const retryAccount = async () => {
    if (pending.current === owner) return;
    pending.current = owner; setBusyOwner(owner); setActionError(null);
    const generation = lifecycle.current.generation;
    try { await refreshAccountContext(); }
    catch { if (isCurrent(generation)) setActionError({ owner, message: 'We couldn’t check your account. Check your connection and try again.' }); }
    finally { if (pending.current === owner) pending.current = null; if (isCurrent(generation)) setBusyOwner(null); }
  };

  let body: React.ReactNode;
  let primary: React.ReactNode;
  let secondary: React.ReactNode;
  let terminal = false;
  if (accepted) {
    body = <StatePanel kind={refreshFailed ? 'error' : 'info'} title="Invitation accepted"
      message={refreshFailed ? 'Your church membership is saved. We couldn’t refresh your account yet; check your churches to continue.' : 'Your church membership is saved. Opening your church…'} />;
    primary = <Button title="Check my churches" loading={busy} onPress={() => void refreshAcceptedAccount()} />;
  } else if (loading) {
    body = <StatePanel kind="loading" title="Opening your invitation…" />;
  } else if (!token || preview?.status === 'invalid') {
    terminal = true;
    body = <StatePanel icon="mail-unread-outline" title="Invitation not found" message="This link is incomplete or no longer valid. Ask a church administrator to send a new invitation." />;
  } else if (settled) {
    terminal = true;
    const messages = { expired: 'This invitation has expired. Ask a church administrator to send a new one.', revoked: 'This invitation was cancelled by a church administrator.', superseded: 'A newer invitation was sent. Please use the latest email.' };
    body = <StatePanel icon="time-outline" title="Invitation unavailable" message={messages[preview!.status as keyof typeof messages] ?? 'This invitation is no longer available.'} />;
  } else if (previewError || !preview) {
    body = <StatePanel kind="error" title="Couldn’t open this invitation" message={previewError ?? 'The invitation has not been confirmed yet. Check it again.'} />;
    primary = <Button title="Try again" onPress={() => setRetry((value) => value + 1)} disabled={busy} />;
  } else if (!isAuthenticated) {
    body = <StatePanel title="Sign in or create your account" message="We’ll keep this invitation ready while you sign in. The verified email on your account must match the invitation." />;
    primary = <Button title="Continue" disabled={adopting} onPress={() => router.push('/login')} />;
  } else if (authMode !== 'supabase') {
    body = <StatePanel title="Use your church account" message="Demo accounts cannot accept live invitations." />;
    primary = <Button title="Sign out of demo" loading={busy} disabled={adopting} onPress={() => void switchAccount()} />;
  } else if (preview.verifiedEmailPresent === false) {
    if (authIdentity?.email?.trim()) {
      body = <StatePanel title="Confirm your account email" message="Confirm the email on your current account, then return here and choose Check invitation. The verified email must match the invited address." />;
      primary = <Button title="Check invitation" onPress={() => setRetry((value) => value + 1)} disabled={busy} />;
      secondary = <Button title="Switch account" variant="secondary" loading={busy} disabled={adopting} onPress={() => void switchAccount()} />;
    } else {
      body = <StatePanel title="Use an account with email" message="This account has no email address. Switch to an account with the invited email, then confirm that email before accepting." />;
      primary = <Button title="Switch account" loading={busy} disabled={adopting} onPress={() => void switchAccount()} />;
    }
  } else if (preview.accountMatches === false) {
    body = <StatePanel title="This invitation is for a different account" message={`Use the invited email, ${preview.maskedEmail}, to continue.`} />;
    primary = <Button title="Switch account" icon="swap-horizontal-outline" loading={busy} disabled={adopting} onPress={() => void switchAccount()} />;
  } else if (!accountReady) {
    body = <StatePanel kind={accountStatus === 'error' ? 'error' : 'loading'} title={accountStatus === 'error' ? 'Couldn’t check your account' : 'Checking your account…'} message="Your name draft and invitation stay here while your account is checked." />;
    primary = <Button title="Check my account" loading={busy} onPress={() => void retryAccount()} />;
  } else if (preview.accountMatches !== true || preview.verifiedEmailPresent !== true) {
    body = <StatePanel title="Check this invitation again" message="The server has not confirmed a matching verified email for this account yet." />;
    primary = <Button title="Check invitation" onPress={() => setRetry((value) => value + 1)} />;
  } else {
    body = <View style={styles.form}>
      {!accountContext?.account.global_display_name ? <>
        <AppText variant="heading" headingLevel={2}>Confirm your name</AppText>
        <AppText tone="secondary">This becomes your default name. You can use a different name in each church later.</AppText>
        <FormErrorSummary errors={nameError ? [{ key: 'name', message: nameError, onPress: revealName }] : []} />
        <View ref={nameSection} collapsable={false} testID="invitation-name-field" onLayout={() => {
          // RN Web observes only views with an onLayout handler at mount.
          const request = pendingNameReveal.current;
          if (nameError && request?.owner === owner && isCurrent(request.generation)) {
            pendingNameReveal.current = null;
            revealName();
          }
        }}>
          <TextField ref={nameField} label="Full name" value={name} onChangeText={(value) => { pendingNameReveal.current = null; setNameDraft({ owner, value }); setValidation(null); }}
            autoComplete="name" autoCapitalize="words" maxLength={100} editable={!busy} error={nameError ?? undefined} />
        </View>
      </> : preview.status === 'pending' ? <AppText tone="secondary">You’ll join as {accountContext.account.global_display_name}. No team or church-admin role is added by this invitation.</AppText> : null}
      {preview.status === 'accepted' ? <StatePanel compact kind="info" title="Already accepted" message="This invitation is already accepted. You can open this church." /> : null}
    </View>;
    primary = <Button title={preview.status === 'accepted' ? 'Open church' : 'Accept invitation'} icon="checkmark-circle-outline" loading={busy} disabled={adopting} onPress={() => void accept()} />;
  }

  return <Screen safeTop keyboard scrollRef={scroll} contentStyle={styles.content} footer={<>
    {primary}
    {secondary}
    {terminal ? <Button title={isAuthenticated ? 'Continue' : 'Back to sign in'} onPress={() => void leaveInvitation()} loading={busy} /> : null}
    {!terminal && isAuthenticated ? <Button title="Not now" variant="ghost" disabled={busy} onPress={() => void leaveInvitation()} />
      : !terminal ? <Button title="Back to sign in" variant="ghost" disabled={busy || adopting} onPress={() => void leaveInvitation()} /> : null}
  </>}>
    <PageHeading title={preview ? `Join ${preview.organisationName}` : 'Your church invitation'}
      description={preview ? `This invitation was sent to ${preview.maskedEmail}.` : undefined} />
    {isAuthenticated ? <AccountIdentity /> : null}
    {storageError ? <StatePanel compact kind="error" title="Couldn’t keep the invitation ready" message={storageError} /> : null}
    {error ? <StatePanel compact kind="error" title="Couldn’t complete this step" message={!accepted && actionError?.acceptanceUncertain
      ? `${error} Church membership may already be saved; you can check the invitation again.` : error} /> : null}
    {body}
  </Screen>;
}

const styles = StyleSheet.create({
  content: { gap: spacing.xl },
  form: { gap: spacing.lg },
});
