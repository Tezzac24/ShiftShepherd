import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { colors, radius, spacing, touchTarget } from '../../../constants/theme';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { useConfirm } from '../../components/ConfirmDialog';
import { PageHeading } from '../../components/PageHeading';
import { Screen } from '../../components/Screen';
import { StatePanel } from '../../components/StatePanel';
import { useToast } from '../../components/Toast';
import { useAppData } from '../../lib/appData/AppDataContext';
import { useAuth, useRequiredUser } from '../../lib/auth/AuthContext';
import { ORGANISATION_ROLE_OPTIONS } from '../../lib/permissions';
import { setOrganisationMemberRole } from '../../lib/supabase/services/organisationMemberships';
import { OrganisationMemberSummary, OrganisationRoleName, SessionUser } from '../../types';
import { canInviteDirectoryMember, findOrganisationMember, memberSelectionParams, organisationRoleDescriptions, organisationRoleLabel, routeValue } from './organisationMembers';
import { organisationAdministrationKey, useOrganisationAdministration } from './useOrganisationAdministration';

export default function OrganisationMemberRoleScreen() {
  const params = useLocalSearchParams<{ profileId?: string | string[]; memberEmail?: string | string[]; memberName?: string | string[]; organisationId?: string | string[] }>();
  const user = useRequiredUser();
  const { authMode, authIdentity } = useAuth();
  const profileId = routeValue(params.profileId) ?? '';
  return <MemberRole key={`${organisationAdministrationKey(user, authMode, authIdentity?.id)}:${profileId}`}
    user={user} profileId={profileId} emailHint={routeValue(params.memberEmail)} nameHint={routeValue(params.memberName)} organisationHint={routeValue(params.organisationId)} />;
}

function MemberRole({ user, profileId, emailHint, nameHint, organisationHint }: {
  user: SessionUser; profileId: string; emailHint?: string; nameHint?: string; organisationHint?: string;
}) {
  const router = useRouter();
  const data = useAppData();
  const scope = useOrganisationAdministration(user);
  const { capture, isCurrent, canAct } = scope;
  const confirm = useConfirm();
  const toast = useToast();
  const [member, setMember] = useState<OrganisationMemberSummary | null>(null);
  const [selectedRole, setSelectedRole] = useState<OrganisationRoleName | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedRole, setSavedRole] = useState<OrganisationRoleName | null>(null);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const pending = useRef(false);
  const sequence = useRef(0);
  const dirty = useRef(false);
  const scroll = useRef<ScrollView>(null);
  const saveOpener = useRef<View>(null);
  const latestMember = useRef(member);
  latestMember.current = member;
  const lookup = useRef({ emailHint, nameHint, users: data.users, organisationId: user.profile.organisation_id });
  lookup.current = { emailHint, nameHint, users: data.users, organisationId: user.profile.organisation_id };
  const correctChurch = !organisationHint || organisationHint === user.profile.organisation_id;

  const load = useCallback(async () => {
    if (!canAct() || !correctChurch || !profileId) { setLoading(false); return; }
    const ticket = capture();
    const request = ++sequence.current;
    setLoading(true); setReadError(null);
    try {
      const current = lookup.current;
      const next = await findOrganisationMember({ profileId, emailHint: current.emailHint, nameHint: current.nameHint,
        profiles: current.users, organisationId: current.organisationId });
      if (!isCurrent(ticket) || request !== sequence.current) return;
      setMember(next);
      if (!dirty.current) setSelectedRole(next?.role ?? null);
    } catch (cause) {
      if (isCurrent(ticket) && request === sequence.current) {
        setReadError(cause instanceof Error ? cause.message : 'We couldn’t load that role.');
      }
    } finally {
      if (isCurrent(ticket) && request === sequence.current) setLoading(false);
    }
  }, [canAct, capture, correctChurch, isCurrent, profileId]);
  useFocusEffect(useCallback(() => {
    if (!pending.current) setBusy(false);
    if (scope.ready) void load();
    return () => { sequence.current += 1; };
  }, [scope.ready, load]));

  const close = () => {
    scope.close();
    if (savedRole && !scope.permitted) { router.replace('/(tabs)/profile'); return; }
    if (router.canGoBack()) router.back(); else router.replace('/');
  };
  const checkAccess = async () => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setRefreshFailed(false);
    try { await data.refreshTeams({ quiet: true }); }
    catch { if (scope.isPresent()) setRefreshFailed(true); }
    finally { pending.current = false; if (scope.isPresent()) setBusy(false); }
  };
  const save = async () => {
    if (!canAct() || !correctChurch || !member || !selectedRole || selectedRole === member.role || pending.current
      || member.access_status !== 'active' || !member.linked
      || (member.is_last_church_admin && selectedRole !== 'church_admin')) return;
    pending.current = true; setBusy(true); setSaveError(null);
    const ticket = capture();
    const target = member;
    const role = selectedRole;
    try {
      const demotion = target.role === 'church_admin' && role !== 'church_admin';
      const promotion = target.role !== 'church_admin' && role === 'church_admin';
      if (demotion || promotion) {
        const identity = `${target.full_name}\n${target.email.trim() || 'Email not listed'}\n${scope.churchName ?? 'This church'}`;
        const approved = await confirm({
          title: promotion ? 'Make church admin?' : 'Change church role?',
          message: `${identity}\n\n${promotion
            ? 'They will be able to manage members, church roles, invitations and teams, plus church announcements and events. Only give this role to someone who should have that responsibility.'
            : `They will keep church membership and assigned team roles, and lose church admin permissions.${target.is_current_user ? ' You will no longer be able to manage members, roles or invitations.' : ''} Another active church admin must remain.`}`,
          confirmLabel: promotion ? 'Make church admin' : 'Change role', destructive: demotion, returnFocusRef: saveOpener,
        });
        if (!approved) return;
      }
      const current = latestMember.current;
      if (!isCurrent(ticket) || !canAct() || current?.profile_id !== target.profile_id || !current.linked
        || current.access_status !== 'active' || (current.is_last_church_admin && role !== 'church_admin')) return;
      const result = await setOrganisationMemberRole(target.profile_id, role);
      if (!isCurrent(ticket)) return;
      setSavedRole(result.role);
      setMember((row) => row ? { ...row, role: result.role } : row);
      toast(`${target.full_name} is now ${organisationRoleLabel(result.role)}.`);
      // The RPC result is confirmed; a failed directory read cannot undo it.
      try { await data.refreshTeams({ quiet: true }); }
      catch { if (isCurrent(ticket)) setRefreshFailed(true); }
    } catch (cause) {
      if (isCurrent(ticket)) {
        setSaveError(cause instanceof Error ? cause.message : 'We couldn’t confirm this role change.');
        scroll.current?.scrollTo({ y: 0, animated: false });
      }
    } finally {
      pending.current = false;
      // Self-demotion can legitimately remove management authority after success.
      if (scope.isPresent()) setBusy(false);
    }
  };
  const targetAvailable = member?.access_status === 'active' && member.linked;
  const canEdit = scope.ready && targetAvailable && correctChurch && !savedRole;
  const header = <Stack.Screen options={{ title: 'Church role', headerLeft: () =>
    <Button title="Back" variant="ghost" icon="chevron-back" onPress={close} disabled={busy} /> }} />;

  if (savedRole) return <Screen>{header}
    <PageHeading title="Role saved" eyebrow={scope.churchName} description={`${member?.full_name ?? 'This person'} is now ${organisationRoleLabel(savedRole)}.`} />
    {refreshFailed ? <StatePanel compact kind="error" title="Couldn’t refresh church access" message="The role is saved. Check access again before doing more administration."
      action={{ label: 'Check church access', onPress: () => void checkAccess() }} />
      : busy ? <StatePanel compact kind="loading" title="Refreshing church access…" /> : null}
    <Button title="Done" onPress={close} disabled={busy} />
  </Screen>;

  const fallback = <Button title="Back to Members" variant="secondary" onPress={close} />;
  if (!scope.permitted || !correctChurch) return <Screen>{header}<PageHeading title="Church role" />
    <StatePanel icon="lock-closed-outline" title={!scope.permitted ? 'No permission' : 'Different church'}
      message={!scope.permitted ? 'Only a church admin can manage organisation roles.' : 'This selection belongs to another church. Return to Members in your current church.'} />{fallback}
  </Screen>;
  if (!member && (!scope.ready || loading)) return <Screen>{header}<PageHeading title="Church role" />
    <View testID="organisation-role-loading"><StatePanel kind={scope.accountError ? 'error' : 'loading'} title={scope.accountError ? 'Couldn’t check church access' : scope.ready ? 'Loading role…' : 'Checking church access…'}
      action={scope.accountError ? { label: 'Check church access', onPress: () => void scope.retryAccount().catch(() => undefined) } : undefined} /></View>{fallback}
  </Screen>;
  if (!member) return <Screen>{header}<PageHeading title="Church role" />
    <StatePanel kind={readError ? 'error' : 'info'} title={readError ? 'We couldn’t load this member' : 'Couldn’t confirm this person'}
      message={readError ?? 'This person wasn’t in these bounded results. Return to Members and search by their name or email; these results do not prove they are missing from the church.'}
      action={{ label: 'Try again', onPress: () => void load() }} />{fallback}
  </Screen>;
  if (!targetAvailable) return <Screen>{header}
    <PageHeading title="Church role" eyebrow={scope.churchName} />
    <View style={styles.identity}><AppText variant="bodyBold">{member.full_name}</AppText>
      <AppText variant="small" tone="secondary">{member.email.trim() || 'Email not listed'}</AppText></View>
    <StatePanel icon="shield-outline" title="Role cannot be changed" message={member.access_status === 'removed'
      ? 'This person no longer has church access. Invite them again before assigning a role.'
      : 'This person must accept an invitation before their church role can be changed.'} />
    {canInviteDirectoryMember(member) ? <Button title={member.pending_invitation_status === 'pending' ? 'View invitation' : 'Invite to church'} disabled={!scope.ready}
      onPress={() => { if (canAct()) router.push({ pathname: '/organisations/invitations', params: {
        ...memberSelectionParams(member, user.profile.organisation_id), create: member.pending_invitation_status === 'pending' ? '0' : '1',
      } }); }} /> : <AppText tone="secondary">An email must be listed before this person can be invited.</AppText>}{fallback}
  </Screen>;

  return <Screen scrollRef={scroll} contentStyle={styles.content} footer={<>
    {member.is_last_church_admin ? <Button title="Open Members" icon="people-outline"
      accessibilityLabel="Open Members to appoint another church admin" disabled={!scope.ready || busy}
      onPress={() => { if (canAct()) { scope.close(); router.replace('/organisations/members'); } }} />
      : <Button ref={saveOpener} title="Save role" icon="checkmark-outline" onPress={() => void save()} loading={busy}
      disabled={!canEdit || loading || busy || !selectedRole || selectedRole === member.role || (member.is_last_church_admin && selectedRole !== 'church_admin')} />
    }
    <Button title="Cancel" variant="ghost" onPress={close} disabled={busy} />
  </>}>{header}
    <PageHeading title="Church role" eyebrow={scope.churchName} />
    <View style={styles.identity}><AppText variant="bodyBold">{member.full_name}</AppText>
      <AppText variant="small" tone="secondary">{member.email.trim() || 'Email not listed'}</AppText>
      <AppText variant="label" tone="primary">Current: {organisationRoleLabel(member.role)}{member.is_current_user ? ' · You' : ''}</AppText></View>
    <AppText variant="small" tone="secondary">Each person has one church role. Changing it keeps their church membership and assigned team roles.</AppText>
    {member.is_last_church_admin ? <StatePanel compact kind="info" title="Final church admin"
      message="Open Members and make another active member a church admin before changing this role, removing access or leaving. Pending invitations and people without app access do not count." /> : null}
    {!scope.ready ? <StatePanel compact kind={scope.accountError ? 'error' : 'loading'} title={scope.accountError ? 'Couldn’t check church access' : 'Checking church access…'} message="Your role choice is kept while your account is checked."
      action={scope.accountError ? { label: 'Check church access', onPress: () => void scope.retryAccount().catch(() => undefined) } : undefined} />
      : loading ? <StatePanel compact kind="loading" title="Checking current role…" /> : null}
    {readError ? <StatePanel compact kind="error" title="Couldn’t check the current role" message={readError}
      action={{ label: 'Refresh role', onPress: () => void load() }} /> : null}
    {saveError ? <StatePanel compact kind="error" title="Couldn’t confirm role change"
      message={`${saveError} The role may already be saved. Refresh the current role before trying again; your choice is kept.`}
      action={{ label: 'Refresh role', onPress: () => { setSaveError(null); void load(); } }} /> : null}
    <View accessibilityRole="radiogroup" accessibilityLabel="Church role" style={styles.options}>
      {ORGANISATION_ROLE_OPTIONS.map((option) => {
        const checked = selectedRole === option.value;
        const protectedRole = member.is_last_church_admin && option.value !== 'church_admin';
        const disabled = protectedRole || !canEdit || loading || busy;
        const description = organisationRoleDescriptions[option.value];
        return <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={`${option.label}. ${description}`}
          accessibilityState={{ checked, disabled }} aria-checked={checked} aria-disabled={disabled}
          accessibilityHint={protectedRole ? 'Appoint another church admin before selecting this role' : 'Selects this person’s one church role'}
          disabled={disabled} onPress={() => { dirty.current = true; setSelectedRole(option.value); }}
          testID={`organisation-role-${option.value}`} style={({ pressed }) => [styles.option, checked && styles.selected, pressed && styles.pressed]}>
          <View style={styles.optionTitle}>
            <Ionicons name={checked ? 'radio-button-on' : 'radio-button-off'} size={24} color={checked ? colors.primary : colors.borderStrong} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden />
            <View style={styles.copy}><AppText variant="bodyBold" tone={disabled && !checked ? 'muted' : 'default'}>{option.label}</AppText></View>
          </View>
          <AppText tone="secondary">{description}</AppText>
        </Pressable>;
      })}
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg },
  identity: { gap: spacing.xs },
  options: { gap: spacing.md },
  option: { minHeight: touchTarget, padding: spacing.lg, gap: spacing.sm, backgroundColor: colors.surface,
    borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.borderStrong },
  selected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  pressed: { backgroundColor: colors.surfaceRaised },
  optionTitle: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  copy: { flex: 1, gap: spacing.xs },
});
