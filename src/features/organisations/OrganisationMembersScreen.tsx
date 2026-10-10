import { Stack, useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radius, spacing, type ThemeColors } from '../../../constants/theme';
import { useThemedStyles } from '@/src/lib/theme/AppearanceContext';
import { ActionSheet } from '../../components/ActionSheet';
import { AppText } from '../../components/AppText';
import { Avatar } from '../../components/Avatar';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { useConfirm } from '../../components/ConfirmDialog';
import { ListGroupContext } from '../../components/ListGroup';
import { ListRow } from '../../components/ListRow';
import { FocusRef } from '../../components/ModalSurface';
import { OrganisationHeader } from '../../components/OrganisationHeader';
import { PageHeading } from '../../components/PageHeading';
import { Screen } from '../../components/Screen';
import { StatePanel } from '../../components/StatePanel';
import { TextField } from '../../components/TextField';
import { useToast } from '../../components/Toast';
import { useAppData } from '../../lib/appData/AppDataContext';
import { useAuth, useRequiredUser } from '../../lib/auth/AuthContext';
import { listOrganisationMembers, removeOrganisationMember } from '../../lib/supabase/services/organisationMemberships';
import { OrganisationMemberSummary, SessionUser } from '../../types';
import {
  canInviteDirectoryMember, memberSelectionParams, organisationMemberAccessLabel,
  organisationRoleLabel, retainedTeamMembershipLabel,
} from './organisationMembers';
import { organisationAdministrationKey, useOrganisationAdministration } from './useOrganisationAdministration';

export default function OrganisationMembersScreen() {
  const user = useRequiredUser();
  const { authMode, authIdentity } = useAuth();
  return <Members key={organisationAdministrationKey(user, authMode, authIdentity?.id)} user={user} />;
}

function Members({ user }: { user: SessionUser }) {
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const data = useAppData();
  const confirm = useConfirm();
  const toast = useToast();
  const scope = useOrganisationAdministration(user);
  const { capture, isCurrent, canAct } = scope;
  const [members, setMembers] = useState<OrganisationMemberSummary[]>([]);
  const [search, setSearch] = useState('');
  const [loadedSearch, setLoadedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [readError, setReadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedOpener = useRef<FocusRef | undefined>(undefined);
  const request = useRef(0);
  const pending = useRef(false);
  const searchRef = useRef(search);
  searchRef.current = search;
  const list = useRef<FlatList<OrganisationMemberSummary>>(null);
  const latestMembers = useRef(members);
  latestMembers.current = members;
  const selected = members.find((member) => member.profile_id === selectedId);
  const searchPending = loadedSearch !== search.trim();

  const load = useCallback(async (query: string) => {
    if (!canAct()) return;
    const ticket = capture();
    const sequence = ++request.current;
    setLoading(true); setReadError(null);
    try {
      const next = await listOrganisationMembers(query);
      if (!isCurrent(ticket) || sequence !== request.current || query !== searchRef.current.trim()) return;
      setMembers(next); setLoadedSearch(query);
    } catch (cause) {
      if (isCurrent(ticket) && sequence === request.current) {
        setReadError(cause instanceof Error ? cause.message : 'We couldn’t load members.');
      }
    } finally {
      if (isCurrent(ticket) && sequence === request.current) setLoading(false);
    }
  }, [canAct, capture, isCurrent]);

  useFocusEffect(useCallback(() => {
    if (!pending.current) setBusy(false);
    if (scope.ready) void load(searchRef.current.trim());
    return () => { request.current += 1; };
  }, [scope.ready, load]));
  const firstSearch = useRef(true);
  useEffect(() => {
    if (firstSearch.current) { firstSearch.current = false; return; }
    request.current += 1;
    const timeout = setTimeout(() => void load(search.trim()), 300);
    return () => clearTimeout(timeout);
  }, [search, load]);
  useEffect(() => { if (!scope.ready) setSelectedId(null); }, [scope.ready]);

  const close = () => {
    scope.close();
    if (router.canGoBack()) router.back(); else router.replace('/');
  };
  const invite = (member?: OrganisationMemberSummary) => {
    if (!canAct() || pending.current) return;
    router.push({ pathname: '/organisations/invitations', params: member
      ? { ...memberSelectionParams(member, user.profile.organisation_id), create: member.pending_invitation_status === 'pending' ? '0' : '1' }
      : { create: '1' } });
  };
  const remove = async (member: OrganisationMemberSummary, opener?: FocusRef) => {
    if (!canAct() || pending.current || member.is_current_user || member.is_last_church_admin
      || member.access_status !== 'active' || !member.linked) return;
    pending.current = true; setBusy(true);
    const ticket = capture();
    try {
      const ok = await confirm({
        title: 'Remove church access?',
        message: `${member.full_name}\n${member.email.trim() || 'Email not listed'}\n${scope.churchName ?? 'This church'}\n\nThey will lose church and team access, their roles and device notifications for this church. They will need a new invitation to return. Their profile, messages, rota assignments and history, account, and other churches are kept. Future duties are not reassigned automatically.`,
        confirmLabel: 'Remove access', destructive: true, returnFocusRef: opener,
      });
      const current = latestMembers.current.find((candidate) => candidate.profile_id === member.profile_id);
      if (!ok || !isCurrent(ticket) || !canAct() || !current || current.is_last_church_admin
        || current.is_current_user || current.access_status !== 'active' || !current.linked) return;
      setActionError(null); setResult(null);
      await removeOrganisationMember(member.profile_id);
      if (!isCurrent(ticket)) return;
      const message = `${member.full_name} no longer has access to this church.`;
      setResult(message); toast(message);
      // A confirmed removal stays confirmed even if this read fails.
      setMembers((rows) => rows.map((row) => row.profile_id === member.profile_id
        ? { ...row, access_status: 'removed', role: null, team_count: 0, is_last_church_admin: false } : row));
      list.current?.scrollToOffset({ offset: 0, animated: false });
      await Promise.all([load(searchRef.current.trim()), data.refreshTeams({ quiet: true })]);
    } catch (cause) {
      if (!isCurrent(ticket)) return;
      setActionError(cause instanceof Error ? cause.message : 'We couldn’t confirm that access change.');
      list.current?.scrollToOffset({ offset: 0, animated: false });
    } finally {
      pending.current = false;
      if (scope.isPresent()) setBusy(false);
    }
  };

  const header = <Stack.Screen options={{ title: 'Church members', headerLeft: () =>
    <Button title="Back" variant="ghost" icon="chevron-back" onPress={close} disabled={busy} /> }} />;
  if (!scope.permitted) return <Screen>{header}<PageHeading title="Church members" />
    <StatePanel icon="lock-closed-outline" title="No permission" message="Only a church admin can manage organisation members and roles." />
    <Button title="Back to Profile" variant="secondary" onPress={close} />
  </Screen>;

  return <Screen scroll={false} keyboard>{header}
    <FlatList ref={list} data={loading || searchPending || !scope.ready ? [] : members}
      keyExtractor={(member) => member.profile_id} keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.content, { paddingBottom: Math.max(spacing.lg, insets.bottom) }]}
      ListHeaderComponent={<View style={styles.header}>
        <OrganisationHeader />
        <PageHeading title="Church members" description="Find a person, then open their access and role details."
          action={<Button title="Invite" icon="person-add-outline" onPress={() => invite()} disabled={!scope.ready || busy} />} />
        <TextField label="Search members" placeholder="Name or email" value={search} onChangeText={setSearch}
          autoCapitalize="none" autoCorrect={false} maxLength={100} returnKeyType="search"
          onSubmitEditing={() => void load(search.trim())} />
        {result ? <StatePanel compact kind="info" title="Access removed" message={result} /> : null}
        {actionError ? <StatePanel compact kind="error" title={result ? 'Access removed; couldn’t refresh details' : 'Couldn’t confirm access removal'}
          message={result ? actionError : `${actionError} The change may already be saved. Refresh members before trying again.`}
          action={{ label: 'Refresh members', onPress: () => { setActionError(null); void load(search.trim()); } }} /> : null}
        {!scope.ready ? <StatePanel compact kind={scope.accountError ? 'error' : 'loading'} title={scope.accountError ? 'Couldn’t check church access' : 'Checking church access…'}
          message="Your search is kept while your account is checked." action={scope.accountError ? { label: 'Check church access', onPress: () => void scope.retryAccount().catch(() => undefined) } : undefined} /> : null}
        {readError ? <StatePanel compact kind="error" title="We couldn’t load members" message={readError}
          action={{ label: 'Try again', onPress: () => void load(search.trim()) }} /> : null}
        {scope.ready && (loading || (searchPending && !readError)) ? <View testID="organisation-members-loading">
          <StatePanel kind="loading" title={search.trim() ? 'Searching members…' : 'Loading members…'} />
        </View> : scope.ready && !readError ? <View style={styles.summary} testID="organisation-members-ready">
          <AppText variant="small" tone="secondary">{members.length} {members.length === 1 ? 'result' : 'results'} shown. Up to 200 matching people are shown; search to narrow the results.</AppText>
          <Button title="Refresh" variant="ghost" icon="refresh-outline" disabled={busy} onPress={() => void load(search.trim())} />
        </View> : null}
      </View>}
      ListEmptyComponent={scope.ready && !loading && !searchPending && !readError ? <StatePanel
        icon="people-outline" title={search.trim() ? 'No matching results' : 'No members in these results'}
        message="Try a different name or email address. Search results do not confirm whether someone exists elsewhere." /> : null}
      renderItem={({ item: member, index }) => {
        const profile = data.users.find((candidate) => candidate.id === member.profile_id && candidate.organisation_id === user.profile.organisation_id);
        return <MemberRow member={member} first={index === 0} last={index === members.length - 1}
          avatarUri={data.getAvatarUri(profile)} disabled={busy || !scope.ready}
          onOpen={(opener) => { selectedOpener.current = opener; setSelectedId(member.profile_id); }} />;
      }} />
    <ActionSheet visible={!!selected && scope.ready && !busy} title={selected?.full_name ?? 'Member'} onClose={() => setSelectedId(null)} returnFocusRef={selectedOpener.current}
      description={selected ? `${selected.email}\n${organisationRoleLabel(selected.role)} · ${organisationMemberAccessLabel(selected)}\n${retainedTeamMembershipLabel(selected.team_count)}${selected.is_last_church_admin ? '\nFinal church admin. Appoint another church admin before demoting, removing, or leaving.' : ''}${selected.access_status === 'removed' ? '\nHistory is kept. A new invitation restores church membership only; previous teams and elevated roles do not return.' : !selected.linked ? '\nThis directory person has no linked app account yet.' : ''}` : undefined}
      actions={selected ? [
        ...(selected.access_status === 'active' && selected.linked ? [{ key: 'role', label: 'Manage role', icon: 'shield-outline' as const, onPress: () => {
          if (canAct()) router.push({ pathname: '/organisations/members/[profileId]', params: { profileId: selected.profile_id, memberEmail: selected.email, memberName: selected.full_name, organisationId: user.profile.organisation_id } });
        } }] : []),
        ...(canInviteDirectoryMember(selected) ? [{ key: 'invite', label: selected.pending_invitation_status === 'pending' ? 'View pending invitation' : selected.access_status === 'removed' ? 'Invite again' : 'Invite to church', icon: 'mail-outline' as const, onPress: () => invite(selected) }] : []),
        ...(selected.is_current_user ? [{ key: 'leave', label: 'Leave from Profile', icon: 'person-outline' as const, onPress: () => { if (canAct()) router.replace('/(tabs)/profile'); } }]
          : selected.access_status === 'active' && selected.linked && !selected.is_last_church_admin ? [{ key: 'remove', label: 'Remove access', icon: 'person-remove-outline' as const, destructive: true, onPress: () => void remove(selected, selectedOpener.current) }] : []),
      ] : []} />
  </Screen>;
}

function MemberRow({ member, first, last, avatarUri, disabled, onOpen }: {
  member: OrganisationMemberSummary; first: boolean; last: boolean; avatarUri?: string; disabled: boolean; onOpen: (opener: FocusRef) => void;
}) {
  const styles = useThemedStyles(createStyles);
  const opener = useRef<View>(null);
  return <View style={[styles.memberRow, first && styles.first, last && styles.last]}>
    <ListGroupContext.Provider value><ListRow ref={opener} title={member.full_name}
      accessibilityLabel={`${member.full_name}. ${member.email.trim() || 'Email not listed'}. ${organisationRoleLabel(member.role)}. ${organisationMemberAccessLabel(member)}${member.is_current_user ? '. You' : ''}${member.is_last_church_admin ? '. Final church admin' : ''}${member.pending_invitation_status === 'pending' ? '. Invitation pending' : ''}`}
      subtitle={`${member.email.trim() || 'Email not listed'}\n${organisationRoleLabel(member.role)} · ${organisationMemberAccessLabel(member)}${member.pending_invitation_status === 'pending' ? '\nInvitation pending' : ''}`}
      leading={<Avatar size={40} name={member.full_name} uri={avatarUri} />}
      right={member.is_current_user ? <Badge label="You" tone="primary" /> : undefined}
      accessibilityHint="Opens this person’s church access and management choices"
      disabled={disabled} onPress={() => onOpen(opener)} />
    </ListGroupContext.Provider>
  </View>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  content: { padding: spacing.gutter },
  header: { gap: spacing.lg, paddingBottom: spacing.xl },
  summary: { gap: spacing.sm },
  memberRow: { backgroundColor: colors.surface, borderWidth: 1, borderBottomWidth: 0, borderColor: colors.border, overflow: 'hidden' },
  first: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  last: { borderBottomWidth: 1, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
});
