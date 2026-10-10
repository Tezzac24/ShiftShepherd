import { Stack, useRouter } from 'expo-router';
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
import { useDiscardChanges } from '../../components/useDiscardChanges';
import { useAuth } from '../../lib/auth/AuthContext';
import { AccountIdentity, AccountReadState } from '../auth/AccountEntrySupport';
import { useChurchEntryPresentation } from './ChurchEntryPresentation';

export default function CreateOrganisationScreen() {
  const { authMode, authIdentity } = useAuth();
  return <CreateChurch key={`${authMode}:${authIdentity?.id ?? 'signed-out'}`} />;
}

function CreateChurch() {
  const router = useRouter();
  const { authMode, authIdentity, accountContext, accountStatus, user, pendingInvitationToken, refreshAccountContext } = useAuth();
  const entry = useChurchEntryPresentation();
  const request = entry.request?.kind === 'create' ? entry.request : null;
  const [name, setName] = useState(request?.name ?? '');
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [readFailed, setReadFailed] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const field = useRef<TextInput>(null);
  const fieldY = useRef(0);
  const active = useRef(true);
  const closed = useRef(false);
  const refreshing = useRef(false);
  const ready = authMode === 'supabase' && accountStatus === 'ready' && !!accountContext
    && accountContext.account.auth_user_id === authIdentity?.id;
  const hasChurch = !!user || !!accountContext?.organisations.length;
  const hasName = !!accountContext?.account.global_display_name && !!accountContext.account.name_confirmed_at;
  const eligible = ready && !hasChurch && hasName && !!authIdentity?.emailVerified && !pendingInvitationToken;
  const busy = request?.status === 'pending' || !!request?.checking || retrying;

  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    if (closed.current) return;
    if (pendingInvitationToken || (ready && user && (request?.status === 'complete' || request?.checked))) {
      closed.current = true;
      entry.clear();
      router.replace('/');
    }
  }, [entry, pendingInvitationToken, ready, request, router, user]);
  useEffect(() => { if (request?.status === 'uncertain') scroll.current?.scrollTo({ y: 0, animated: false }); }, [request?.status]);

  const close = () => {
    closed.current = true; entry.clear();
    if (router.canGoBack()) router.back(); else router.replace('/');
  };
  const { requestExit, exitRef, headerLeft } = useDiscardChanges({
    hasChanges: name !== '', blocked: busy, saved: request?.status === 'complete', uncertain: request?.status === 'uncertain',
    message: 'The church name you entered will not be saved.', onDiscard: close,
  });
  const retryRead = async () => {
    if (refreshing.current) return;
    refreshing.current = true; setRetrying(true); setReadFailed(false);
    try { await refreshAccountContext(); }
    catch { if (active.current) setReadFailed(true); }
    finally { refreshing.current = false; if (active.current) setRetrying(false); }
  };
  const focusName = () => {
    scroll.current?.scrollTo({ y: Math.max(0, fieldY.current - spacing.md), animated: false }); field.current?.focus();
  };
  const submit = () => {
    if (!active.current || !eligible || busy || closed.current) return;
    const validation = name.trim().length < 2 ? 'Enter a church name (at least 2 characters).'
      : name.trim().length > 120 ? 'Keep the church name to 120 characters or fewer.' : null;
    setError(validation);
    if (validation) { requestAnimationFrame(() => { if (active.current) focusName(); }); return; }
    entry.create(name);
  };
  const header = <Stack.Screen options={{ title: 'Create church', headerLeft }} />;

  if (request?.status === 'complete') return <Screen>{header}
    <PageHeading title="Church created" description="Your church is saved. Checking your account before opening it." />
    <StatePanel kind={accountStatus === 'error' ? 'error' : 'loading'} title={accountStatus === 'error' ? 'Couldn’t open your church yet' : 'Opening your church…'} />
    {accountStatus === 'error' ? <Button title="Check my churches" loading={request.checking} onPress={entry.checkAccount} /> : null}
    <Button title="Close" variant="secondary" onPress={() => requestExit()} />
  </Screen>;

  if (!request && !eligible) return <Screen>{header}
    <PageHeading title="Create church" />
    <AccountIdentity />
    {authMode === 'demo' ? <StatePanel title="You’re using a demo account" message="Sign in with a live account to set up a church." />
      : !ready ? <AccountReadState error={accountStatus === 'error' || readFailed} retrying={retrying} onRetry={() => void retryRead()} />
      : hasChurch ? <StatePanel title="You already have a church" message="Church creation is available before joining a church. You can join another church through an invitation." />
        : !hasName ? <StatePanel title="Confirm your name first" message="Your church needs a name for its first admin. Return to your account to confirm your full name." />
          : <StatePanel title="Confirm your email first" message="Open the confirmation link in your email, then check your account again." />}
    {ready && !hasChurch && hasName ? <Button title="Check my account" loading={retrying} onPress={() => void retryRead()} /> : null}
    <Button title={hasChurch ? 'Back to my churches' : 'Back to my account'} variant="secondary" onPress={() => requestExit()} />
  </Screen>;

  const uncertain = request?.status === 'uncertain';
  return <Screen keyboard scrollRef={scroll} footer={<View style={styles.actions}>
    {uncertain ? <Button title="Check my churches" loading={request.checking} onPress={entry.checkAccount} /> : null}
    <Button title={uncertain ? 'Try creating again' : 'Create church'} variant={uncertain ? 'secondary' : 'primary'}
      loading={request?.status === 'pending'} disabled={!eligible || busy} onPress={submit} />
    <Button ref={exitRef} title="Cancel" variant="ghost" disabled={busy} onPress={() => requestExit()} />
  </View>} contentStyle={styles.content}>
    {header}
    <PageHeading title="Set up your church" description="Set up your church on Shift Shepherd. If your church already uses the app, ask its admin for an invitation instead." />
    <AccountIdentity />
    {uncertain ? <StatePanel compact kind="error" title="Couldn’t confirm church creation"
      message="Your church may already be saved. Check your churches before trying again; the name you entered is kept here." /> : null}
    {request?.checkFailed ? <StatePanel compact kind="error" title="Couldn’t check your churches" message="Check your connection and try again." /> : null}
    {request?.checked && ready && !hasChurch ? <AppText accessibilityLiveRegion="polite" tone="secondary">No church was found for this account. You can try creating it again.</AppText> : null}
    {request?.status === 'pending' ? <StatePanel compact kind="loading" title="Creating your church…" message="Keep this screen open while your account is updated." />
      : !ready && !request?.checking ? <AccountReadState error={accountStatus === 'error' || readFailed} retrying={retrying} onRetry={() => void retryRead()} /> : null}
    <FormErrorSummary errors={error ? [{ key: 'name', message: error, onPress: focusName }] : []} />
    <View onLayout={(event) => { fieldY.current = event.nativeEvent.layout.y; }}>
      <TextField ref={field} label="Church name" placeholder="e.g. Grace Community Church" value={name}
        onChangeText={(value) => { if (!busy) { setName(value); setError(null); } }} autoCapitalize="words" maxLength={120}
        error={error ?? undefined} editable={eligible && !busy} returnKeyType="done" onSubmitEditing={submit} />
    </View>
    <AppText tone="secondary">You’ll be the church admin. You can add teams and invite people after setup.</AppText>
    <AppText variant="small" tone="secondary">Your new church starts without teams or sample members.</AppText>
  </Screen>;
}

const styles = StyleSheet.create({ content: { gap: spacing.lg }, actions: { gap: spacing.sm } });
