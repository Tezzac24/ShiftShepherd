import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { colors, radius, spacing, touchTarget } from '../../../constants/theme';
import { AppText } from '../../components/AppText';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { useConfirm } from '../../components/ConfirmDialog';
import { FormErrorSummary } from '../../components/FormErrorSummary';
import { ListGroup } from '../../components/ListGroup';
import { ListRow } from '../../components/ListRow';
import { OrganisationHeader } from '../../components/OrganisationHeader';
import { PageHeading } from '../../components/PageHeading';
import { Screen } from '../../components/Screen';
import { SectionHeader } from '../../components/SectionHeader';
import { TextField } from '../../components/TextField';
import { useToast } from '../../components/Toast';
import { useAppData } from '../../lib/appData/AppDataContext';
import { useAuth, useRequiredUser } from '../../lib/auth/AuthContext';
import { canManageOrganisationMembers, isChurchAdmin } from '../../lib/permissions';
import {
  buildProfileUpdatePayload,
  PROFILE_NAME_REQUIRED,
  PROFILE_NAME_TOO_LONG,
} from '../../lib/supabase/services/profiles';
import { useProfileAvatar } from './useProfileAvatar';

const orgRoleLabels: Record<string, string> = {
  church_admin: 'Church admin',
  announcement_manager: 'Announcement manager',
  event_manager: 'Event manager',
  general_member: 'Church member',
};

export default function ProfileScreen() {
  const router = useRouter();
  const user = useRequiredUser();
  const { signOut, authMode, accountContext, accountStatus, isLoading, setProfileDisplayNames, leaveOrganisation } = useAuth();
  const data = useAppData();
  const confirm = useConfirm();
  const showToast = useToast();
  const { canManagePhoto, hasPhoto, avatarUri, busy, changePhoto, removePhoto } = useProfileAvatar();
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [fullName, setFullName] = useState(accountContext?.account.global_display_name ?? user.profile.full_name);
  const [organisationName, setOrganisationName] = useState(user.profile.display_name_override ?? '');
  const [showChurchName, setShowChurchName] = useState(!!user.profile.display_name_override);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [leavingOrganisation, setLeavingOrganisation] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [resetting, setResetting] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const nameRef = useRef<TextInput>(null);
  const churchNameRef = useRef<TextInput>(null);
  const signOutRef = useRef<View>(null);
  const leaveRef = useRef<View>(null);
  const resetRef = useRef<View>(null);
  const formTop = useRef(0);
  const savePending = useRef(false);
  const accountPending = useRef(false);
  const resetPending = useRef(false);

  const authorityReady = !isLoading && (authMode !== 'supabase' || accountStatus === 'ready');
  const canEditProfile = authorityReady && authMode === 'supabase' && !!user.supabaseProfileId;
  // Destructive context must come from the same resolved identity as the header,
  // never AppData's temporary demo organisation during live hydration.
  const activeOrganisation = accountContext?.account.active_profile_id === user.profile.id
    ? accountContext.organisations.find((item) => item.profile.id === user.profile.id
      && item.organisation.id === user.profile.organisation_id)?.organisation
    : undefined;
  const myTeams = data.teams.filter((team) => team.organisation_id === user.profile.organisation_id
    && !team.archived_at && data.memberships.some((membership) => membership.user_id === user.profile.id && membership.team_id === team.id));
  const membershipSummary = data.teamsLoading ? 'Loading your memberships…'
    : data.teamsError ? 'Open Teams to retry your memberships'
      : myTeams.length ? `You belong to ${myTeams.length} ${myTeams.length === 1 ? 'team' : 'teams'}`
        : 'Find out how to take part in a team';

  const focusName = () => {
    scrollRef.current?.scrollTo({ y: Math.max(0, formTop.current - spacing.md), animated: false });
    nameRef.current?.focus();
  };

  useEffect(() => {
    if (!isEditingProfile || (!fieldError && !saveError)) return;
    const frame = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, formTop.current - spacing.md), animated: false });
      if (fieldError) nameRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [fieldError, saveError, isEditingProfile]);

  const resetDraft = () => {
    setFullName(accountContext?.account.global_display_name ?? user.profile.full_name);
    setOrganisationName(user.profile.display_name_override ?? '');
    setShowChurchName(!!user.profile.display_name_override);
    setFieldError(null);
    setSaveError(null);
  };

  const beginEditing = () => {
    resetDraft();
    setIsEditingProfile(true);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  const cancelEditing = () => {
    if (savePending.current || busy) return;
    resetDraft();
    setIsEditingProfile(false);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  const saveProfile = async () => {
    if (!canEditProfile || savePending.current || busy) return;
    setFieldError(null);
    setSaveError(null);
    try {
      const payload = buildProfileUpdatePayload({ full_name: fullName });
      savePending.current = true;
      setSaving(true);
      // The existing action saves both names atomically; contacts/roles never enter it.
      await setProfileDisplayNames(payload.p_full_name, organisationName.trim() || null);
      setIsEditingProfile(false);
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      showToast('Profile updated.');
    } catch (error) {
      const message = error instanceof Error ? error.message : "We couldn't save your profile.";
      if ([PROFILE_NAME_REQUIRED, PROFILE_NAME_TOO_LONG].includes(message)) setFieldError(message);
      else setSaveError(message);
    } finally {
      savePending.current = false;
      setSaving(false);
    }
  };

  const handleResetDemoData = async () => {
    if (authMode !== 'demo' || resetPending.current) return;
    resetPending.current = true;
    try {
      const ok = await confirm({
        title: 'Reset demo data',
        message: 'This puts all announcements, events, rotas, songs and messages back to the original demo examples. Any changes you made in this demo will be removed.',
        confirmLabel: 'Reset demo data', destructive: true, returnFocusRef: resetRef,
      });
      if (!ok) return;
      setResetting(true);
      await data.resetDemoData();
      showToast('All demo data has been restored to the original examples.');
    } catch {
      showToast('We couldn’t reset the demo data. Please try again.', 'error');
    } finally {
      resetPending.current = false;
      setResetting(false);
    }
  };

  // Auth owns the destination and scope teardown for both account actions.
  const handleSignOut = async () => {
    if (accountPending.current) return;
    accountPending.current = true;
    try {
      const ok = await confirm({
        title: 'Sign out?', message: 'You can sign in again when you’re ready.',
        confirmLabel: 'Sign out', destructive: false, returnFocusRef: signOutRef,
      });
      if (!ok) return;
      setSigningOut(true);
      await signOut();
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'We couldn’t complete the sign out.', 'error');
    } finally {
      accountPending.current = false;
      setSigningOut(false);
    }
  };

  const handleLeaveOrganisation = async () => {
    if (accountPending.current || leavingOrganisation || authMode !== 'supabase' || !authorityReady || !activeOrganisation) return;
    accountPending.current = true;
    try {
      const ok = await confirm({
        title: `Leave ${activeOrganisation.name}?`,
        message: `${isChurchAdmin(user) ? 'If you are the final church admin, another church admin must be appointed first. ' : ''}You will lose access to this church and all its teams. Your church role, team memberships and notification registration for this church will be removed. Your profile, messages, rota history and account will be kept, along with access to any other churches. You can return only with a new invitation.`,
        confirmLabel: 'Leave church', destructive: true, returnFocusRef: leaveRef,
      });
      if (!ok) return;
      setLeavingOrganisation(true);
      await leaveOrganisation();
      showToast('You have left the organisation.');
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'We couldn’t leave this organisation.', 'error');
      setLeavingOrganisation(false);
    } finally {
      accountPending.current = false;
    }
  };

  return (
    <Screen safeTop keyboard={isEditingProfile} scrollRef={scrollRef} footer={isEditingProfile ? (
      <View style={styles.formActions}>
        <Button title="Cancel" variant="secondary" onPress={cancelEditing} disabled={saving || busy !== null} style={styles.formButton} />
        <Button title="Save" onPress={() => void saveProfile()} loading={saving} disabled={busy !== null} style={styles.formButton} />
      </View>
    ) : undefined}>
      <OrganisationHeader />
      <PageHeading title={isEditingProfile ? 'Edit profile' : 'Profile'} action={canEditProfile && !isEditingProfile ? (
        <Button title="Edit" variant="ghost" icon="create-outline" onPress={beginEditing}
          accessibilityLabel="Edit profile" accessibilityHint="Change your name or profile photo" testID="edit-profile-action" />
      ) : undefined} />

      {isEditingProfile ? (
        <View style={styles.form} testID="profile-edit-form" onLayout={(event) => { formTop.current = event.nativeEvent.layout.y; }}>
          <FormErrorSummary title={saveError ? 'We couldn’t finish this update' : undefined} errors={[
            ...(fieldError ? [{ key: 'name', message: fieldError, onPress: focusName }] : []),
            ...(saveError ? [{ key: 'save', message: saveError }] : []),
          ]} />
          <TextField ref={nameRef} label="Your name" helper="Used across your churches unless you choose a different name for one church."
            value={fullName} onChangeText={(value) => { setFullName(value); setFieldError(null); }}
            autoCapitalize="words" autoComplete="name" maxLength={100} disabled={saving || busy !== null}
            returnKeyType={showChurchName ? 'next' : 'done'} onSubmitEditing={() => showChurchName ? churchNameRef.current?.focus() : nameRef.current?.blur()}
            error={fieldError ?? undefined} testID="profile-full-name-input" />
          <View style={styles.churchName}>
            <Pressable accessibilityRole="button" accessibilityLabel="Different name at this church"
              accessibilityState={{ expanded: showChurchName, disabled: saving || busy !== null }}
              aria-expanded={showChurchName} aria-disabled={saving || busy !== null} disabled={saving || busy !== null}
              onPress={() => setShowChurchName((value) => !value)}
              style={({ pressed }) => [styles.disclosure, pressed && styles.pressed]}>
              <AppText variant="bodyBold" style={styles.flex}>Different name at this church</AppText>
              <Ionicons name={showChurchName ? 'chevron-up' : 'chevron-down'} size={22} color={colors.primary} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden />
            </Pressable>
            {showChurchName ? (
              <TextField ref={churchNameRef} label="Name at this church (optional)"
                helper="This changes only your name at the current church. Leave blank to use your name above."
                value={organisationName} onChangeText={setOrganisationName} autoCapitalize="words" autoComplete="name"
                maxLength={100} disabled={saving || busy !== null} returnKeyType="done" testID="profile-organisation-name-input" />
            ) : organisationName.trim() ? <AppText variant="small" tone="secondary">Using {organisationName.trim()} at this church.</AppText> : null}
          </View>
          <View style={styles.section}>
            <SectionHeader title="Profile photo" />
            <View style={styles.photoActions}>
              <Avatar name={user.profile.full_name} uri={avatarUri} size={56} />
              {canManagePhoto ? <>
                <Button title={hasPhoto ? 'Change photo' : 'Add photo'} variant="secondary" icon="image-outline" onPress={changePhoto}
                  loading={busy === 'uploading'} disabled={busy !== null || saving} accessibilityHint="Choose a profile photo from your photos" />
                {hasPhoto ? <Button title="Remove photo" variant="destructive" onPress={removePhoto}
                  loading={busy === 'removing'} disabled={busy !== null || saving} accessibilityHint="Remove your profile photo and show your initials" /> : null}
              </> : null}
            </View>
            {canManagePhoto ? <AppText variant="small" tone="secondary">Photo changes are saved when you make them.</AppText> : null}
          </View>
          <View style={styles.section} testID="profile-contact-details">
            <SectionHeader title="Contact details" />
            <AppText variant="label">Email</AppText>
            <AppText tone="secondary">{user.profile.email}</AppText>
            <AppText variant="label">Phone</AppText>
            <AppText tone="secondary">{user.profile.phone ?? 'Not added'}</AppText>
            <AppText variant="small" tone="secondary">Your email and phone number can’t be changed here.</AppText>
          </View>
        </View>
      ) : <>
        <View style={styles.identity}>
          <View style={styles.identityName}>
            <Avatar name={user.profile.full_name} uri={avatarUri} size={56} />
            <AppText variant="heading" style={styles.flex}>{user.profile.full_name}</AppText>
          </View>
          <AppText tone="secondary" selectable>{user.profile.email}</AppText>
          {user.profile.phone ? <AppText tone="secondary" selectable>{user.profile.phone}</AppText> : null}
        </View>

        <View style={styles.section}>
          <SectionHeader title="Preferences" />
          <ListGroup>
            <ListRow icon="notifications-outline" title="Notification preferences" subtitle="Choose updates from this church"
              onPress={() => router.push('/settings/notifications')} />
          </ListGroup>
        </View>

        <View style={styles.section}>
          <SectionHeader title="Your church" />
          <AppText tone="secondary">{orgRoleLabels[user.orgRole]}</AppText>
          <ListGroup>
            <ListRow icon="people-outline" title="Teams" subtitle={membershipSummary} onPress={() => router.push('/(tabs)/teams')} />
          </ListGroup>
        </View>

        {authorityReady && authMode === 'supabase' && canManageOrganisationMembers(user) ? (
          <View style={styles.section}>
            <SectionHeader title="Manage church" />
            <ListGroup>
              <ListRow icon="people-circle-outline" title="Church members" subtitle="Manage access and roles" onPress={() => router.push('/organisations/members')} />
              <ListRow icon="mail-outline" title="Invitations" subtitle="Invite, resend or revoke" onPress={() => router.push('/organisations/invitations')} />
            </ListGroup>
          </View>
        ) : null}

        <View style={styles.account}>
          <SectionHeader title="Account" />
          <Button ref={signOutRef} title="Sign out" variant="secondary" icon="log-out-outline" onPress={() => void handleSignOut()}
            loading={signingOut} disabled={leavingOrganisation} />
          {authMode === 'supabase' ? <Button ref={leaveRef} title="Leave this church" variant="destructive" icon="exit-outline"
            onPress={() => void handleLeaveOrganisation()} loading={leavingOrganisation}
            disabled={signingOut || !authorityReady || !activeOrganisation}
            accessibilityHint="Removes access to this church and its teams. Your account, history and other churches are kept." /> : null}
        </View>

        {authMode === 'demo' ? <View style={styles.section}>
          <SectionHeader title="Demo only" />
          <AppText variant="small" tone="secondary">You’re exploring example data. Reset removes changes made in this demo.</AppText>
          <Button ref={resetRef} title="Reset demo data" variant="ghost" icon="refresh-outline" onPress={() => void handleResetDemoData()} loading={resetting} />
        </View> : null}

        <View style={styles.help}>
          <AppText variant="label" headingLevel={2}>Need help?</AppText>
          <AppText variant="small" tone="secondary">For help with a team, a serving date or church access, speak to your team admin or church admin.</AppText>
        </View>
      </>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  identity: { gap: spacing.xs, paddingBottom: spacing.md },
  identityName: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  section: { gap: spacing.sm, marginBottom: spacing.sm },
  form: { gap: spacing.lg },
  churchName: { gap: spacing.sm },
  disclosure: { minHeight: touchTarget, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderRadius: radius.md },
  pressed: { backgroundColor: colors.primarySoft },
  photoActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' },
  formActions: { flexDirection: 'row', gap: spacing.sm },
  formButton: { flex: 1 },
  account: { gap: spacing.sm, marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  help: { gap: spacing.xs, marginTop: spacing.md },
});
