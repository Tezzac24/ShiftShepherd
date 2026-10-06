import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { spacing } from '../../../constants/theme';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { ListGroup } from '../../components/ListGroup';
import { ListRow } from '../../components/ListRow';
import { resolvedActiveOrganisation } from '../../components/OrganisationHeader';
import { PageHeading } from '../../components/PageHeading';
import { Screen } from '../../components/Screen';
import { StatePanel } from '../../components/StatePanel';
import { useAuth } from '../../lib/auth/AuthContext';
import { AccountIdentity, AccountReadState, AccountSignOut } from '../auth/AccountEntrySupport';
import { useChurchEntryPresentation } from './ChurchEntryPresentation';

export default function OrganisationSelectorScreen() {
  const { authMode, authIdentity } = useAuth();
  return <ChooseChurch key={`${authMode}:${authIdentity?.id ?? 'signed-out'}`} />;
}

function ChooseChurch() {
  const router = useRouter();
  const auth = useAuth();
  const { accountContext, accountStatus, authMode, authIdentity, pendingInvitationToken, refreshAccountContext } = auth;
  const entry = useChurchEntryPresentation();
  const request = entry.request?.kind === 'switch' ? entry.request : null;
  const [retrying, setRetrying] = useState(false);
  const [readFailed, setReadFailed] = useState(false);
  const refreshing = useRef(false);
  const mounted = useRef(true);
  const closed = useRef(false);
  const ready = authMode === 'supabase' && accountStatus === 'ready' && !!accountContext
    && accountContext.account.auth_user_id === authIdentity?.id;
  const activeChurch = resolvedActiveOrganisation(auth);
  const currentId = activeChurch?.profile.id;
  const busy = request?.status === 'pending' || !!request?.checking || retrying;
  const uncertain = request?.status === 'uncertain';
  const canChoose = ready && !busy && (!uncertain || request.checked);
  const mandatoryChoice = ready && !activeChurch && accountContext.organisations.length > 0;

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (closed.current) return;
    if (pendingInvitationToken || (ready && currentId === request?.targetProfileId
      && (request?.status === 'complete' || request?.checked))) {
      closed.current = true; entry.clear(); router.replace('/');
    }
  }, [entry, pendingInvitationToken, ready, currentId, request, router]);

  const close = () => {
    closed.current = true; entry.clear();
    if (router.canGoBack() && activeChurch) router.back(); else router.replace('/');
  };
  const retryRead = async () => {
    if (refreshing.current) return;
    refreshing.current = true; setRetrying(true); setReadFailed(false);
    try { await refreshAccountContext(); }
    catch { if (mounted.current) setReadFailed(true); }
    finally { refreshing.current = false; if (mounted.current) setRetrying(false); }
  };
  const select = (profileId: string, name: string) => {
    if (!mounted.current || !canChoose || closed.current) return;
    if (profileId === currentId) { close(); return; }
    entry.switchTo(profileId, name);
  };

  return <Screen safeTop contentStyle={styles.content} footer={activeChurch ?
    <Button title="Cancel" variant="secondary" disabled={busy} onPress={close} /> : undefined}>
    {!mandatoryChoice ? <Button title="Back" icon="chevron-back" variant="ghost" disabled={busy} onPress={close} style={styles.back} /> : null}
    <PageHeading title="Choose your church" description="Open a church to see its teams, schedule and messages." />
    <AccountIdentity />
    {request?.status === 'pending' ? <StatePanel compact kind="loading" title="Switching church…" message={`Opening ${request.name}.`} />
      : request?.status === 'complete' ? <View style={styles.group}>
          <StatePanel compact kind={accountStatus === 'error' ? 'error' : 'loading'}
            title={accountStatus === 'error' ? 'Your selection is saved' : 'Opening your church…'}
            message={accountStatus === 'error' ? 'We couldn’t reload your church. Check your account to continue.' : undefined} />
          {accountStatus === 'error' ? <Button title="Check my churches" loading={request.checking} onPress={entry.checkAccount} /> : null}
        </View>
        : uncertain ? <View style={styles.group}>
          <StatePanel compact kind="error" title="Couldn’t confirm the switch"
            message="Your selection may already be saved. Check your churches to see which one is active before choosing again." />
          <Button title="Check my churches" loading={request.checking} onPress={entry.checkAccount} />
          {request.checkFailed ? <AppText tone="danger" accessibilityRole="alert">We couldn’t check your churches. Check your connection and try again.</AppText> : null}
        </View> : null}
    {!request && !ready && authMode !== 'demo' ? <AccountReadState error={accountStatus === 'error' || readFailed} retrying={retrying} onRetry={() => void retryRead()} /> : null}
    {ready && (!request || (uncertain && request.checked)) ? accountContext.organisations.length ? <ListGroup>
      {accountContext.organisations.map((church) => {
        const isCurrent = church.profile.id === currentId;
        return <ListRow key={church.profile.id} title={church.organisation.name}
          subtitle={`${isCurrent ? 'Current church · ' : ''}${church.profile.full_name}`}
          accessibilityLabel={`${church.organisation.name}. ${isCurrent ? 'Current church. ' : ''}${church.profile.full_name}`}
          accessibilityHint={isCurrent ? 'Return to this church' : 'Switch to this church'}
          icon={isCurrent ? 'checkmark-circle-outline' : 'business-outline'} disabled={!canChoose}
          onPress={() => select(church.profile.id, church.organisation.name)} />;
      })}
    </ListGroup> : <StatePanel title="No church access" message="Join using an invitation from your church admin."
      action={{ label: 'Back to my account', onPress: () => { closed.current = true; entry.clear(); router.replace('/'); } }} /> : null}
    {authMode === 'demo' ? <StatePanel kind="info" title="You’re using a demo account" message="Church switching is available when you sign in with a live account." /> : null}
    <AccountSignOut disabled={busy} />
  </Screen>;
}

const styles = StyleSheet.create({ content: { gap: spacing.lg }, group: { gap: spacing.md }, back: { alignSelf: 'flex-start', marginLeft: -spacing.sm } });
