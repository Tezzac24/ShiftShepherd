import { Redirect, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { spacing } from '../../../constants/theme';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { FormErrorSummary } from '../../components/FormErrorSummary';
import { ListRow } from '../../components/ListRow';
import { PageHeading } from '../../components/PageHeading';
import { Screen } from '../../components/Screen';
import { StatePanel } from '../../components/StatePanel';
import { TextField } from '../../components/TextField';
import { useAuth } from '../../lib/auth/AuthContext';
import { AccountIdentity, AccountReadState, AccountSignOut } from '../auth/AccountEntrySupport';

export default function NoOrganisationsScreen() {
  const { authIdentity, authMode } = useAuth();
  return <NoChurch key={`${authMode}:${authIdentity?.id ?? 'signed-out'}`} />;
}

function NoChurch() {
  const router = useRouter();
  const { accountContext, accountStatus, authIdentity, authMode, user, pendingInvitationToken,
    setGlobalDisplayName, refreshAccountContext } = useAuth();
  const [name, setName] = useState(accountContext?.account.global_display_name ?? authIdentity?.suggestedName ?? '');
  const [nameError, setNameError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const [checked, setChecked] = useState(false);
  const active = useRef(true);
  const pending = useRef(false);
  const scroll = useRef<ScrollView>(null);
  const field = useRef<TextInput>(null);
  const fieldY = useRef(0);
  const groupY = useRef(0);
  const ready = authMode === 'supabase' && accountStatus === 'ready' && !!accountContext
    && accountContext.account.auth_user_id === authIdentity?.id;
  const latest = useRef({ ready, user, pendingInvitationToken });
  latest.current = { ready, user, pendingInvitationToken };
  const hasName = !!accountContext?.account.global_display_name && !!accountContext.account.name_confirmed_at;

  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    if (!saveError || !ready || hasName) return;
    const frame = requestAnimationFrame(() => {
      if (active.current) scroll.current?.scrollTo({ y: Math.max(0, groupY.current - spacing.md), animated: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [saveError, ready, hasName]);
  const focusName = () => {
    scroll.current?.scrollTo({ y: Math.max(0, groupY.current + fieldY.current - spacing.md), animated: false });
    field.current?.focus();
  };
  const saveName = async () => {
    if (!active.current || pending.current || !latest.current.ready || latest.current.user || latest.current.pendingInvitationToken) return;
    const validation = name.trim().length < 2 ? 'Enter your full name (at least 2 characters).'
      : name.trim().length > 100 ? 'Keep your name to 100 characters or fewer.' : null;
    setNameError(validation);
    if (validation) { requestAnimationFrame(() => { if (active.current) focusName(); }); return; }
    pending.current = true; setSaving(true); setSaveError(false);
    try { await setGlobalDisplayName(name); }
    catch { if (active.current) setSaveError(true); }
    finally { pending.current = false; if (active.current) setSaving(false); }
  };
  const retry = async () => {
    if (pending.current) return;
    pending.current = true; setRetrying(true); setRefreshError(false); setChecked(false);
    try { await refreshAccountContext(); if (active.current) { setChecked(true); setSaveError(false); } }
    catch { if (active.current) setRefreshError(true); }
    finally { pending.current = false; if (active.current) setRetrying(false); }
  };

  if (user || pendingInvitationToken || (ready && accountContext.organisations.length > 0)) return <Redirect href="/" />;

  return <Screen safeTop keyboard keyboardVerticalOffset={0} scrollRef={scroll} contentStyle={styles.content}>
    <PageHeading eyebrow="Shift Shepherd" title={ready ? 'Connect with your church' : 'Your account'} />
    <AccountIdentity />
    {!ready ? <AccountReadState error={accountStatus === 'error' || refreshError} retrying={retrying} onRetry={() => void retry()} /> : <>
      <StatePanel compact kind="info" icon="mail-outline" title="Join with an invitation"
        message="Ask a church admin to invite you using your account email. Open the link in that email to join your church." />
      <AppText tone="secondary">Your account does not currently have access to a church.</AppText>
      {!hasName ? <View style={styles.group} testID="account-name-form" onLayout={(event) => { groupY.current = event.nativeEvent.layout.y; }}>
        <AppText variant="heading" headingLevel={2}>Confirm your name</AppText>
        <AppText tone="secondary">This is your default name across Shift Shepherd. You can use a different name in each church later.</AppText>
        {saveError ? <StatePanel compact kind="error" title="Couldn’t confirm your name"
          message="Your name may already be saved. Check your account before trying again; your typed name is kept here."
          action={{ label: 'Check my account', onPress: () => void retry() }} /> : null}
        <FormErrorSummary errors={nameError ? [{ key: 'name', message: nameError, onPress: focusName }] : []} />
        <View onLayout={(event) => { fieldY.current = event.nativeEvent.layout.y; }}>
          <TextField ref={field} label="Full name" value={name} onChangeText={(value) => { if (!pending.current) { setName(value); setNameError(null); } }}
            autoComplete="name" textContentType="name" autoCapitalize="words" maxLength={100} error={nameError ?? undefined}
            editable={!saving && !retrying} returnKeyType="done" onSubmitEditing={() => void saveName()} />
        </View>
        <Button title="Save my name" onPress={() => void saveName()} loading={saving} disabled={retrying} />
      </View> : <ListRow title="Set up a new church" subtitle="For someone starting their church on Shift Shepherd. You’ll become its church admin."
        icon="business-outline" disabled={retrying || saving} onPress={() => router.push('/organisations/create')} />}
      {refreshError ? <StatePanel compact kind="error" title="Couldn’t check your churches" message="Check your connection and try again." /> : null}
      {checked ? <AppText tone="secondary" accessibilityLiveRegion="polite">This account has no current church access. If you have an invitation, open its email link.</AppText> : null}
      <Button title="Check my churches" variant="secondary" icon="refresh-outline" loading={retrying} disabled={saving} onPress={() => void retry()} />
    </>}
    <AccountSignOut disabled={saving || retrying} />
  </Screen>;
}

const styles = StyleSheet.create({
  content: { gap: spacing.xl },
  group: { gap: spacing.md },
});
