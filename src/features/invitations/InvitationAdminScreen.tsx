import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { colors, radius, spacing } from '../../../constants/theme';
import { ActionSheet } from '../../components/ActionSheet';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { useConfirm } from '../../components/ConfirmDialog';
import { FormErrorSummary } from '../../components/FormErrorSummary';
import { ListGroupContext } from '../../components/ListGroup';
import { ListRow } from '../../components/ListRow';
import { FocusRef } from '../../components/ModalSurface';
import { OrganisationHeader } from '../../components/OrganisationHeader';
import { PageHeading } from '../../components/PageHeading';
import { Screen } from '../../components/Screen';
import { SegmentedControl } from '../../components/SegmentedControl';
import { StatePanel } from '../../components/StatePanel';
import { TextField } from '../../components/TextField';
import { useToast } from '../../components/Toast';
import { useAppData } from '../../lib/appData/AppDataContext';
import { useAuth, useRequiredUser } from '../../lib/auth/AuthContext';
import { invitationExpiryLabel } from '../../lib/invitations';
import {
  listOrganisationInvitations, resendOrganisationInvitation, revokeOrganisationInvitation,
  sendOrganisationInvitation, wasInvitationSaved,
} from '../../lib/supabase/services/invitations';
import { OrganisationInvitation, OrganisationMemberSummary, SessionUser } from '../../types';
import { canInviteDirectoryMember, findOrganisationMember, routeValue } from '../organisations/organisationMembers';
import { organisationAdministrationKey, useOrganisationAdministration } from '../organisations/useOrganisationAdministration';
import { DirectoryPersonField } from './DirectoryPersonField';

const statusLabels = { pending: 'Pending', accepted: 'Accepted', expired: 'Expired', revoked: 'Cancelled', superseded: 'Replaced' } as const;
type Outcome = { kind: 'sent' | 'saved-unsent' | 'uncertain' | 'not-issued' | 'revoked'; message: string; email: string };
function dateLabel(value: string) {
  return new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
function deliveryLabel(invitation: OrganisationInvitation) {
  return invitation.last_sent_at ? `Sent ${dateLabel(invitation.last_sent_at)}` : `Created ${dateLabel(invitation.created_at)}`;
}

export default function InvitationAdminScreen() {
  const user = useRequiredUser();
  const { authMode, authIdentity } = useAuth();
  const params = useLocalSearchParams<{ targetProfileId?: string | string[]; targetEmail?: string | string[]; targetName?: string | string[]; organisationId?: string | string[]; create?: string | string[] }>();
  const targetProfileId = routeValue(params.targetProfileId);
  return <Invitations key={`${organisationAdministrationKey(user, authMode, authIdentity?.id)}:${targetProfileId ?? ''}`}
    user={user} targetProfileId={targetProfileId} targetEmail={routeValue(params.targetEmail)} targetName={routeValue(params.targetName)}
    organisationHint={routeValue(params.organisationId)} startCreating={routeValue(params.create) === '1' || (!!targetProfileId && routeValue(params.create) !== '0')} />;
}

function Invitations({ user, targetProfileId, targetEmail, targetName, organisationHint, startCreating }: {
  user: SessionUser; targetProfileId?: string; targetEmail?: string; targetName?: string; organisationHint?: string; startCreating: boolean;
}) {
  const router = useRouter();
  const data = useAppData();
  const scope = useOrganisationAdministration(user);
  const { canAct, capture, isCurrent } = scope;
  const confirm = useConfirm();
  const toast = useToast();
  const [invitations, setInvitations] = useState<OrganisationInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [readError, setReadError] = useState<string | null>(null);
  const [creating, setCreating] = useState(startCreating);
  const [mode, setMode] = useState<'email' | 'directory'>(targetProfileId ? 'directory' : 'email');
  const [listMode, setListMode] = useState<'current' | 'history'>('current');
  const [email, setEmail] = useState('');
  const [selected, setSelected] = useState<OrganisationMemberSummary | null>(null);
  const [showPersonInvitations, setShowPersonInvitations] = useState(!!targetProfileId && !startCreating);
  const [managedInvitationId, setManagedInvitationId] = useState<string | null>(null);
  const [targetLoading, setTargetLoading] = useState(!!targetProfileId);
  const [targetError, setTargetError] = useState<string | null>(null);
  const [validation, setValidation] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const pending = useRef(false);
  const loadSequence = useRef(0);
  const targetSequence = useRef(0);
  const appliedRouteTarget = useRef(false);
  const list = useRef<FlatList<OrganisationInvitation>>(null);
  const form = useRef<ScrollView>(null);
  const emailField = useRef<TextInput>(null);
  const fieldY = useRef(0);
  const currentListTarget = useRef<string | undefined>(undefined);
  const invitationOpener = useRef<FocusRef | undefined>(undefined);
  const latestInvitations = useRef(invitations);
  latestInvitations.current = invitations;
  const lookup = useRef({ users: data.users, targetEmail, targetName });
  lookup.current = { users: data.users, targetEmail, targetName };
  const correctChurch = !organisationHint || organisationHint === user.profile.organisation_id;
  const selectionPending = mode === 'directory'
    ? !!selected && (selected.pending_invitation_status === 'pending' || invitations.some((invite) => invite.status === 'pending' && invite.target_profile_id === selected.profile_id))
    : invitations.some((invite) => invite.status === 'pending' && invite.invited_email.toLocaleLowerCase() === email.trim().toLocaleLowerCase());
  const busy = busyKey !== null;
  const managedInvitation = invitations.find((invitation) => invitation.id === managedInvitationId && invitation.status === 'pending');

  const load = useCallback(async (targetId = currentListTarget.current) => {
    if (!canAct() || !correctChurch) return;
    const ticket = capture();
    const sequence = ++loadSequence.current;
    setLoading(true); setReadError(null);
    try {
      let rows = await listOrganisationInvitations();
      if (!isCurrent(ticket) || sequence !== loadSequence.current) return;
      // The RPC's result may be capped by the API. Filter the existing RPC by
      // the exact freshly selected target, never by a name or email substitute.
      if (targetId && !rows.some((row) => row.target_profile_id === targetId && row.status === 'pending')) {
        if (!canAct()) return;
        const current = await listOrganisationInvitations({ targetProfileId: targetId });
        if (!isCurrent(ticket) || sequence !== loadSequence.current) return;
        const exact = current.filter((row) => row.target_profile_id === targetId && row.status === 'pending');
        rows = [...exact, ...rows.filter((row) => !exact.some((invitation) => invitation.id === row.id))];
      }
      if (isCurrent(ticket) && sequence === loadSequence.current) setInvitations(rows);
    } catch (cause) {
      if (isCurrent(ticket) && sequence === loadSequence.current) setReadError(cause instanceof Error ? cause.message : 'We couldn’t load invitations.');
    } finally {
      if (isCurrent(ticket) && sequence === loadSequence.current) setLoading(false);
    }
  }, [canAct, capture, correctChurch, isCurrent]);
  const showCurrentInvitations = useCallback((person?: OrganisationMemberSummary | null) => {
    if (!canAct() || !correctChurch) return;
    currentListTarget.current = person?.profile_id;
    setShowPersonInvitations(!!person); setCreating(false); setListMode('current');
    void load(person?.profile_id);
  }, [canAct, correctChurch, load]);
  useFocusEffect(useCallback(() => {
    if (!pending.current) setBusyKey(null);
    if (scope.ready) void load();
    return () => { loadSequence.current += 1; };
  }, [scope.ready, load]));
  useEffect(() => { if (!scope.ready) setManagedInvitationId(null); }, [scope.ready]);

  const resolveTarget = useCallback(async () => {
    if (!targetProfileId || !canAct() || !correctChurch) { setTargetLoading(false); return; }
    const ticket = capture();
    const sequence = ++targetSequence.current;
    setTargetLoading(true); setTargetError(null);
    try {
      const exact = await findOrganisationMember({ profileId: targetProfileId, emailHint: lookup.current.targetEmail, nameHint: lookup.current.targetName,
        profiles: lookup.current.users, organisationId: user.profile.organisation_id });
      if (!isCurrent(ticket) || sequence !== targetSequence.current) return;
      if (!exact) setTargetError('The selected person could not be confirmed in these bounded results. Return to Members and search by their name or email.');
      else if (!canInviteDirectoryMember(exact)) setTargetError(exact.access_status === 'active' && exact.linked
        ? 'This person already has app access. They do not need another invitation.' : 'An email must be listed before this person can be invited.');
      else {
        setSelected(exact);
        if (!appliedRouteTarget.current) {
          appliedRouteTarget.current = true;
          if (exact.pending_invitation_status === 'pending' || !startCreating) showCurrentInvitations(exact);
        }
      }
    } catch (cause) {
      if (isCurrent(ticket) && sequence === targetSequence.current) setTargetError(cause instanceof Error ? cause.message : 'We couldn’t confirm the selected person.');
    } finally {
      if (isCurrent(ticket) && sequence === targetSequence.current) setTargetLoading(false);
    }
  }, [canAct, capture, correctChurch, isCurrent, showCurrentInvitations, startCreating, targetProfileId, user.profile.organisation_id]);
  useEffect(() => {
    if (scope.ready && targetProfileId) void resolveTarget();
    return () => { targetSequence.current += 1; };
  }, [scope.ready, targetProfileId, resolveTarget]);

  const close = () => {
    scope.close();
    if (router.canGoBack()) router.back(); else router.replace('/');
  };
  const focusEmail = () => {
    form.current?.scrollTo({ y: Math.max(0, fieldY.current - spacing.md), animated: false });
    emailField.current?.focus();
  };
  const revealOutcome = () => {
    form.current?.scrollTo({ y: 0, animated: false });
    list.current?.scrollToOffset({ offset: 0, animated: false });
  };
  const failure = (cause: unknown, recipient: string): Outcome => {
    const message = cause instanceof Error ? cause.message : 'We couldn’t confirm this invitation action.';
    return { kind: wasInvitationSaved(cause) ? 'saved-unsent' : message.startsWith('Invitation emails aren’t set up yet, so nothing was sent.') ? 'not-issued' : 'uncertain', message, email: recipient };
  };
  const send = async () => {
    if (!canAct() || !correctChurch || pending.current || targetLoading || selectionPending) return;
    const invalid = mode === 'email' ? (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? 'Enter a valid email address.' : null)
      : !selected ? 'Choose a listed person.' : null;
    setValidation(invalid);
    if (invalid) { if (mode === 'email') focusEmail(); return; }
    pending.current = true; setBusyKey('new'); setOutcome(null);
    const ticket = capture();
    const recipient = mode === 'email' ? email.trim() : selected!.email;
    try {
      if (mode === 'directory') {
        const exact = await findOrganisationMember({ profileId: selected!.profile_id, emailHint: selected!.email, nameHint: selected!.full_name,
          profiles: data.users, organisationId: user.profile.organisation_id });
        if (!isCurrent(ticket) || !canAct()) return;
        if (!exact || !canInviteDirectoryMember(exact)) {
          setTargetError('This person’s invitation eligibility could not be confirmed. Search and choose them again.'); return;
        }
        setSelected(exact);
        if (exact.pending_invitation_status === 'pending') { showCurrentInvitations(exact); return; }
      }
      if (!isCurrent(ticket) || !canAct()) return;
      await sendOrganisationInvitation({ organisationId: user.profile.organisation_id,
        ...(mode === 'email' ? { email } : { targetProfileId: selected!.profile_id }) });
      if (!isCurrent(ticket)) return;
      setOutcome({ kind: 'sent', message: `Invitation email sent to ${recipient}.`, email: recipient });
      currentListTarget.current = mode === 'directory' ? selected?.profile_id : undefined;
      setShowPersonInvitations(mode === 'directory');
      setEmail(''); setCreating(false); setListMode('current'); toast('Invitation sent.');
      await load();
    } catch (cause) {
      if (!isCurrent(ticket)) return;
      const next = failure(cause, recipient);
      setOutcome(next);
      if (next.kind === 'saved-unsent') {
        currentListTarget.current = mode === 'directory' ? selected?.profile_id : undefined;
        setShowPersonInvitations(mode === 'directory'); setEmail(''); setCreating(false); setListMode('current');
      }
      await load(); revealOutcome();
    } finally {
      pending.current = false;
      if (scope.isPresent()) setBusyKey(null);
    }
  };
  const updateInvitation = async (invitation: OrganisationInvitation, action: 'resend' | 'revoke', opener?: FocusRef) => {
    if (!canAct() || pending.current || invitation.status !== 'pending') return;
    pending.current = true; setBusyKey(invitation.id);
    const ticket = capture();
    try {
      const approved = await confirm({
        title: action === 'resend' ? 'Resend invitation?' : 'Cancel invitation?',
        message: action === 'resend'
          ? `${invitation.target_display_name ? `${invitation.target_display_name}\n` : ''}${invitation.invited_email}\n${scope.churchName ?? 'This church'}\n\nA new link will be sent. It replaces the previous link, which stops working. If the email cannot be sent, open the new current invitation and choose Resend.`
          : `${invitation.target_display_name ? `${invitation.target_display_name}\n` : ''}${invitation.invited_email}\n${scope.churchName ?? 'This church'}\n\nThis invitation link will stop working. Their invitation history will be kept.`,
        confirmLabel: action === 'resend' ? 'Resend' : 'Cancel invitation', destructive: action === 'revoke', returnFocusRef: opener,
      });
      if (!approved || !isCurrent(ticket) || !canAct()
        || !latestInvitations.current.some((row) => row.id === invitation.id && row.status === 'pending')) return;
      setOutcome(null);
      if (action === 'resend') await resendOrganisationInvitation(invitation.id);
      else await revokeOrganisationInvitation(invitation.id);
      if (!isCurrent(ticket)) return;
      const message = action === 'resend' ? 'A new invitation link was sent.' : 'Invitation cancelled.';
      setOutcome({ kind: action === 'resend' ? 'sent' : 'revoked', message, email: invitation.invited_email }); toast(message);
      if (action === 'revoke') setInvitations((rows) => rows.map((row) => row.id === invitation.id ? { ...row, status: 'revoked' } : row));
      await load(); revealOutcome();
    } catch (cause) {
      if (!isCurrent(ticket)) return;
      setOutcome(failure(cause, invitation.invited_email));
      await load(); revealOutcome();
    } finally {
      pending.current = false;
      if (scope.isPresent()) setBusyKey(null);
    }
  };
  const checkInvitations = () => showCurrentInvitations(mode === 'directory' ? selected : null);
  const feedback = outcome ? <StatePanel compact kind={outcome.kind === 'sent' || outcome.kind === 'revoked' ? 'info' : 'error'}
    title={outcome.kind === 'sent' ? 'Invitation email sent' : outcome.kind === 'revoked' ? 'Invitation cancelled'
      : outcome.kind === 'saved-unsent' ? 'Saved; email not sent' : outcome.kind === 'not-issued' ? 'Email is not configured' : 'Couldn’t confirm invitation outcome'}
    message={outcome.kind === 'uncertain' ? `${outcome.message} An invitation may already be saved. Check current invitations before trying again.` : outcome.message} /> : null;
  const accessCheck = !scope.ready ? <StatePanel compact kind={scope.accountError ? 'error' : 'loading'} title={scope.accountError ? 'Couldn’t check church access' : 'Checking church access…'}
    message="Your invitation draft and results are kept while your account is checked." action={scope.accountError ? { label: 'Check church access', onPress: () => void scope.retryAccount().catch(() => undefined) } : undefined} /> : null;
  const header = <Stack.Screen options={{ title: creating ? 'Invite to church' : 'Church invitations', headerLeft: () =>
    <Button title="Back" variant="ghost" icon="chevron-back" disabled={busy} onPress={creating ? () => setCreating(false) : close} /> }} />;
  if (!scope.permitted || !correctChurch) return <Screen>{header}<PageHeading title="Church invitations" />
    <StatePanel icon="lock-closed-outline" title={!scope.permitted ? 'No permission' : 'Different church'} message={!scope.permitted
      ? 'Only a church administrator can send and manage organisation invitations.' : 'This selection belongs to another church. Return to Members in your current church.'} />
    <Button title="Back to Profile" variant="secondary" onPress={close} />
  </Screen>;

  if (creating) return <Screen keyboard scrollRef={form} contentStyle={styles.form} footer={<>
    {selectionPending ? <Button title="View current invitation" onPress={checkInvitations} disabled={!scope.ready || busy} /> : <>
      {outcome?.kind === 'uncertain' ? <Button title="Check invitations" onPress={checkInvitations} disabled={!scope.ready || busy} /> : null}
      <Button title={outcome?.kind === 'uncertain' ? 'Try sending again' : 'Send invitation'} variant={outcome?.kind === 'uncertain' ? 'secondary' : 'primary'}
        onPress={() => void send()} loading={busyKey === 'new'} disabled={!scope.ready || busy || targetLoading || !!targetError} />
    </>}
    <Button title="Cancel" variant="ghost" onPress={() => setCreating(false)} disabled={busy} />
  </>}>{header}
    <PageHeading title="Invite to church" eyebrow={scope.churchName} description="They join using an account with the same confirmed email. The invitation adds church membership; it doesn’t assign new team or admin roles." />
    {accessCheck}{feedback}
    <FormErrorSummary errors={validation ? [{ key: 'recipient', message: validation, onPress: mode === 'email' ? focusEmail : undefined }] : []} />
    {!targetProfileId ? <SegmentedControl label="Invite a person" value={mode} options={[
      { value: 'email', label: 'By email', disabled: busy }, { value: 'directory', label: 'Already listed', disabled: busy },
    ]} onChange={(next) => { setMode(next); setValidation(null); }} /> : null}
    {mode === 'email' ? <View onLayout={(event) => { fieldY.current = event.nativeEvent.layout.y; }}>
      <TextField ref={emailField} label="Email" placeholder="person@example.com" value={email} onChangeText={(value) => { setEmail(value); setValidation(null); }}
        keyboardType="email-address" autoCapitalize="none" autoCorrect={false} editable={!busy} error={validation ?? undefined} returnKeyType="done" onSubmitEditing={() => void send()} />
      <AppText variant="small" tone="secondary" style={styles.emailHelp}>For someone already listed in this church, choose Already listed to keep their existing identity and history.</AppText>
    </View> : targetLoading ? <StatePanel kind="loading" title="Confirming selected person…" />
      : targetError ? <StatePanel kind="error" title="Couldn’t confirm selected person" message={targetError}
        action={targetProfileId ? { label: 'Check person again', onPress: () => void resolveTarget() }
          : { label: 'Choose person again', onPress: () => { setSelected(null); setTargetError(null); } }} />
        : targetProfileId && selected ? <View style={styles.selectedPerson}><AppText variant="label">Listed person</AppText>
          <AppText variant="bodyBold">{selected.full_name}</AppText><AppText tone="secondary">{selected.email}</AppText></View>
          : <DirectoryPersonField value={selected} disabled={!scope.ready || busy} scope={scope} onChange={(member) => {
            setSelected(member); setValidation(null); setTargetError(null);
            if (member.pending_invitation_status === 'pending' || invitations.some((invitation) => invitation.status === 'pending' && invitation.target_profile_id === member.profile_id)) showCurrentInvitations(member);
            else { currentListTarget.current = undefined; setShowPersonInvitations(false); }
          }} />}
    {selected?.access_status === 'removed' && mode === 'directory' ? <StatePanel compact kind="info" title="Returning member"
      message="Acceptance restores church membership only. Their previous teams, elevated roles and notification devices do not return; their profile and history are kept." /> : null}
    {selectionPending ? <StatePanel compact kind="info" title="Invitation already pending" message="Open the current invitation to resend its link or cancel it." /> : null}
  </Screen>;

  const rows = invitations.filter((invitation) => (listMode === 'current' ? invitation.status === 'pending' : invitation.status !== 'pending')
    && (!showPersonInvitations || (selected && invitation.target_profile_id === selected.profile_id)));
  const selectedPendingVisible = selected && invitations.some((invitation) => invitation.status === 'pending' && invitation.target_profile_id === selected.profile_id);
  return <Screen scroll={false}>{header}<FlatList ref={list} data={scope.ready ? rows : []}
    keyExtractor={(invitation) => invitation.id} contentContainerStyle={styles.content}
    ListHeaderComponent={<View style={styles.listHeader}>
      <OrganisationHeader />
      <PageHeading title="Church invitations" description={showPersonInvitations ? undefined : 'Invite people and manage links you’ve sent.'} />
      {!showPersonInvitations ? <Button title="Invite" icon="person-add-outline" disabled={!scope.ready || busy} onPress={() => { setCreating(true); setValidation(null); }} /> : null}
      {accessCheck}{feedback}
      {selected && showPersonInvitations ? <View style={styles.focusedPerson}>
        <AppText variant="label">Invitations for this person</AppText>
        <AppText variant="bodyBold">{selected.full_name}</AppText><AppText variant="small" tone="secondary">{selected.email}</AppText>
        {selected.pending_invitation_status === 'pending' && !selectedPendingVisible && !loading ? <AppText variant="small" tone="secondary">A pending invitation was listed for this person, but its details aren’t available. Refresh invitations before doing more.</AppText> : null}
        <View style={styles.contextActions}>
          <Button title="All invitations" variant="ghost" disabled={busy || !scope.ready} onPress={() => { currentListTarget.current = undefined; setShowPersonInvitations(false); }} />
          <Button title="Invite" icon="person-add-outline" variant="secondary" disabled={!scope.ready || busy} onPress={() => { setCreating(true); setValidation(null); }} />
        </View>
      </View> : null}
      {targetProfileId && !selected && !targetLoading ? <StatePanel compact kind="info" title="Selected person not confirmed"
        message={targetError ?? 'Search Members to select this person again.'} /> : null}
      {targetProfileId && !selected && targetLoading ? <StatePanel compact kind="loading" title="Confirming selected person…" /> : null}
      <SegmentedControl label="Invitation list" value={listMode} options={[
        { value: 'current', label: 'Current', disabled: busy }, { value: 'history', label: 'History', disabled: busy },
      ]} onChange={setListMode} />
      {readError ? <StatePanel compact kind="error" title="Couldn’t refresh invitations" message={readError}
        action={{ label: 'Refresh invitations', onPress: () => void load() }} /> : loading && !invitations.length && scope.ready
        ? <StatePanel kind="loading" title="Loading invitations…" /> : <Button title="Refresh" variant="ghost" icon="refresh-outline" loading={loading && scope.ready}
          disabled={!scope.ready || busy} onPress={() => void load()} />}
      {!showPersonInvitations || listMode === 'history' ? <AppText variant="small" tone="secondary">Older invitations may not be in these results. Refresh if an expected invitation is missing.</AppText> : null}
    </View>}
    ListEmptyComponent={!loading && !readError && scope.ready ? <StatePanel icon="mail-outline" title={listMode === 'current' ? 'No current invitations in this list' : 'No invitation history in this list'}
      message={listMode === 'current' ? 'New invitations will appear here. If you expected an invitation, refresh before sending another.' : 'Accepted, expired, cancelled and replaced invitations appear here.'} /> : null}
    renderItem={({ item: invitation, index }) => <InvitationHistoryRow invitation={invitation} first={index === 0} last={index === rows.length - 1}
      disabled={!scope.ready || busy} loading={busyKey === invitation.id}
      expanded={managedInvitation?.id === invitation.id}
      onOpen={(opener) => { invitationOpener.current = opener; setManagedInvitationId(invitation.id); }} />} />
    <ActionSheet visible={!!managedInvitation && scope.ready && !busy} title="Manage invitation" onClose={() => setManagedInvitationId(null)} returnFocusRef={invitationOpener.current}
      description={managedInvitation ? `${managedInvitation.target_display_name ? `${managedInvitation.target_display_name}\n` : ''}${managedInvitation.invited_email}\n${scope.churchName ?? 'This church'}\n${statusLabels[managedInvitation.status]} · Expires ${invitationExpiryLabel(managedInvitation.expires_at)}${!managedInvitation.last_sent_at ? '\nEmail not sent yet.' : ''}` : undefined}
      actions={managedInvitation ? [
        { key: 'resend', label: 'Resend invitation', icon: 'refresh-outline', description: 'Send a new link. It replaces the previous link.', onPress: () => void updateInvitation(managedInvitation, 'resend', invitationOpener.current) },
        { key: 'revoke', label: 'Cancel invitation', icon: 'close-circle-outline', destructive: true, description: 'Stop this invitation link from being used.', onPress: () => void updateInvitation(managedInvitation, 'revoke', invitationOpener.current) },
      ] : []} />
  </Screen>;
}

function InvitationHistoryRow({ invitation, first, last, disabled, loading, expanded, onOpen }: {
  invitation: OrganisationInvitation; first: boolean; last: boolean; disabled: boolean; loading: boolean;
  expanded: boolean; onOpen: (opener: FocusRef) => void;
}) {
  const opener = useRef<View>(null);
  const title = invitation.target_display_name ?? invitation.invited_email;
  const subtitle = `${invitation.target_display_name ? `${invitation.invited_email}\n` : ''}${statusLabels[invitation.status]} · Expires ${invitationExpiryLabel(invitation.expires_at)}\n${deliveryLabel(invitation)}${invitation.status === 'pending' && !invitation.last_sent_at ? '\nEmail not sent yet. Open Manage to resend.' : ''}`;
  return <View style={[styles.invitation, first && styles.first, last && styles.last]}>
    <ListGroupContext.Provider value><ListRow ref={opener} title={title} subtitle={subtitle}
      showChevron={false} disabled={disabled} accessibilityState={invitation.status === 'pending' ? { expanded, busy: loading } : undefined}
      accessibilityLabel={`${title}. ${subtitle}${invitation.status === 'pending' ? '. Manage invitation' : ''}`}
      accessibilityHint={invitation.status === 'pending' ? 'Opens resend and cancellation choices for this invitation' : undefined}
      right={invitation.status === 'pending' ? <AppText variant="label" tone="primary">Manage</AppText> : undefined}
      onPress={invitation.status === 'pending' ? () => onOpen(opener) : undefined} />
    </ListGroupContext.Provider>
  </View>;
}

const styles = StyleSheet.create({
  form: { gap: spacing.lg },
  content: { padding: spacing.gutter, paddingBottom: spacing.xxxl },
  listHeader: { gap: spacing.lg, paddingBottom: spacing.xl },
  emailHelp: { marginTop: spacing.sm },
  selectedPerson: { backgroundColor: colors.surface, padding: spacing.lg, gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  focusedPerson: { gap: spacing.xs },
  contextActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  invitation: { backgroundColor: colors.surface, borderWidth: 1, borderBottomWidth: 0, borderColor: colors.border, overflow: 'hidden' },
  first: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  last: { borderBottomWidth: 1, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
});
