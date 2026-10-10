import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { spacing } from '../../../constants/theme';
import { ActionSheet } from '../../components/ActionSheet';
import { AppText } from '../../components/AppText';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { FormErrorSummary } from '../../components/FormErrorSummary';
import { ModalSurface } from '../../components/ModalSurface';
import { PageHeading } from '../../components/PageHeading';
import { Screen } from '../../components/Screen';
import { StatePanel } from '../../components/StatePanel';
import { TextField } from '../../components/TextField';
import { useToast } from '../../components/Toast';
import { useAuth, useRequiredUser } from '../../lib/auth/AuthContext';
import { buildProfileUpdatePayload, PROFILE_NAME_REQUIRED, PROFILE_NAME_TOO_LONG } from '../../lib/supabase/services/profiles';
import { useProfileAvatar } from './useProfileAvatar';

export default function EditProfileScreen() {
  const router = useRouter();
  const user = useRequiredUser();
  const { authMode, accountContext, accountStatus, isLoading, setProfileDisplayNames } = useAuth();
  const { canManagePhoto, hasPhoto, avatarUri, busy, changePhoto, takePhoto, removePhoto } = useProfileAvatar();
  const showToast = useToast();
  const [fullName, setFullName] = useState(accountContext?.account.global_display_name ?? user.profile.full_name);
  const [organisationName, setOrganisationName] = useState(user.profile.display_name_override ?? '');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [photoActionsOpen, setPhotoActionsOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const nameRef = useRef<TextInput>(null);
  const churchNameRef = useRef<TextInput>(null);
  const photoRef = useRef<View>(null);
  const savePending = useRef(false);
  const fieldTop = useRef(0);
  const formTop = useRef(0);
  const blocked = saving || busy !== null;
  const canEdit = !isLoading && accountStatus === 'ready' && authMode === 'supabase' && !!user.supabaseProfileId;
  usePreventRemove(blocked, () => {});

  const exit = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
  };
  const focusName = () => {
    scrollRef.current?.scrollTo({ y: Math.max(0, formTop.current + fieldTop.current - spacing.md), animated: false });
    nameRef.current?.focus();
  };
  useEffect(() => {
    if (!fieldError) return;
    const frame = requestAnimationFrame(focusName);
    return () => cancelAnimationFrame(frame);
  }, [fieldError]);

  const save = async () => {
    if (!canEdit || savePending.current || busy) return;
    setFieldError(null);
    setSaveError(null);
    try {
      const payload = buildProfileUpdatePayload({ full_name: fullName });
      savePending.current = true;
      setSaving(true);
      await setProfileDisplayNames(payload.p_full_name, organisationName.trim() || null);
      showToast('Profile updated.');
      // Let the navigation removal guard observe the completed save first.
      setSaved(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "We couldn't save your profile.";
      if ([PROFILE_NAME_REQUIRED, PROFILE_NAME_TOO_LONG].includes(message)) setFieldError(message);
      else setSaveError(message);
    } finally {
      savePending.current = false;
      setSaving(false);
    }
  };
  useEffect(() => {
    if (saved && !blocked) {
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)/profile');
    }
  }, [saved, blocked, router]);

  if (!canEdit) return (
    <Screen safeTop>
      <Button title="Back" icon="chevron-back" variant="ghost" onPress={exit} />
      <StatePanel title="Profile editing unavailable" message="Your profile can be edited once your church account is ready." />
    </Screen>
  );

  return (
    <Screen safeTop keyboard keyboardVerticalOffset={0} scrollRef={scrollRef}
      footer={<View style={styles.actions}>
        <Button title="Cancel" variant="secondary" onPress={exit} disabled={blocked} style={styles.flex} />
        <Button title="Save" onPress={() => void save()} loading={saving} disabled={busy !== null} style={styles.flex} />
      </View>}>
      <View style={styles.back}><Button title="Back" icon="chevron-back" variant="ghost" onPress={exit} disabled={blocked} /></View>
      <PageHeading title="Edit profile" />
      <View style={styles.form} testID="profile-edit-form" onLayout={(event) => { formTop.current = event.nativeEvent.layout.y; }}>
        <View style={styles.photo}>
          <Avatar name={user.profile.full_name} uri={avatarUri} size={128} />
          {canManagePhoto ? <Button ref={photoRef} title="Edit photo" variant="ghost" icon="camera-outline"
            style={styles.photoButton} onPress={() => setPhotoActionsOpen(true)} disabled={blocked}
            loading={busy !== null} accessibilityHint="Open profile photo options" /> : null}
          <AppText variant="small" tone="secondary" style={styles.photoHint}>Photo changes are saved when you make them.</AppText>
        </View>
        <FormErrorSummary title={saveError ? 'We couldn’t finish this update' : undefined}
          errors={[...(fieldError ? [{ key: 'name', message: fieldError, onPress: focusName }] : []),
            ...(saveError ? [{ key: 'save', message: saveError }] : [])]} />
        <View onLayout={(event) => { fieldTop.current = event.nativeEvent.layout.y; }}>
          <TextField ref={nameRef} label="Your name" helper="Used across your churches unless you choose a different name for one church."
            value={fullName} onChangeText={(value) => { setFullName(value); setFieldError(null); }}
            autoCapitalize="words" autoComplete="name" maxLength={100} disabled={blocked} returnKeyType="next"
            onSubmitEditing={() => churchNameRef.current?.focus()} error={fieldError ?? undefined} testID="profile-full-name-input" />
        </View>
        <TextField ref={churchNameRef} label="Username at this church" helper="Only shown in your current church. Leave blank to use your name above."
          value={organisationName} onChangeText={setOrganisationName} placeholder={fullName.trim()}
          autoCapitalize="words" maxLength={100} disabled={blocked} returnKeyType="done" testID="profile-organisation-name-input" />
      </View>
      <ActionSheet visible={photoActionsOpen} title="Edit photo" onClose={() => setPhotoActionsOpen(false)} returnFocusRef={photoRef}
        actions={[
          { key: 'take', label: 'Take photo', icon: 'camera-outline', onPress: () => void takePhoto() },
          { key: 'upload', label: 'Upload photo', icon: 'image-outline', onPress: () => void changePhoto() },
          { key: 'view', label: 'View photo', icon: 'eye-outline', disabled: !avatarUri, onPress: () => { setPhotoFailed(false); setPhotoOpen(true); } },
          ...(hasPhoto ? [{ key: 'remove', label: 'Remove photo', icon: 'trash-outline' as const, destructive: true, onPress: () => void removePhoto() }] : []),
        ]} />
      <ModalSurface visible={photoOpen} title="Profile photo" onClose={() => setPhotoOpen(false)} returnFocusRef={photoRef}>
        {avatarUri && !photoFailed ? <Image source={{ uri: avatarUri }} style={styles.fullPhoto} contentFit="contain"
          accessibilityLabel={`${user.profile.full_name}'s profile photo`} onError={() => setPhotoFailed(true)} /> :
          <StatePanel title="Photo unavailable" message="Close this view and try again when you’re connected." />}
      </ModalSurface>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { alignItems: 'flex-start' },
  form: { gap: spacing.xl },
  photo: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.md },
  photoButton: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  photoHint: { textAlign: 'center' },
  actions: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  fullPhoto: { width: '100%', aspectRatio: 1 },
});
