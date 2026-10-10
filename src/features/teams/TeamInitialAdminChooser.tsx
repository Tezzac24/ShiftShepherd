import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { spacing } from '../../../constants/theme';
import { useThemeColors } from '@/src/lib/theme/AppearanceContext';
import { AppText } from '../../components/AppText';
import { Avatar } from '../../components/Avatar';
import { ListGroup } from '../../components/ListGroup';
import { ListRow } from '../../components/ListRow';
import { FocusRef, ModalSurface } from '../../components/ModalSurface';
import { StatePanel } from '../../components/StatePanel';
import { TextField } from '../../components/TextField';
import { eligibleInitialTeamAdmins } from '../../lib/appData/selectors';
import { UserProfile } from '../../types';
import { selectedInitialTeamAdmin } from './teamForm';

export function TeamInitialAdminChooser({ visible, onClose, opener, organisationId, currentProfileId, users, selectedId, onSelect, getAvatarUri }: {
  visible: boolean;
  onClose: () => void;
  opener: FocusRef;
  organisationId: string;
  currentProfileId: string;
  users: UserProfile[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  getAvatarUri: (profile: UserProfile) => string | undefined;
}) {
  const colors = useThemeColors();
  const [query, setQuery] = useState('');
  const candidates = useMemo(() => eligibleInitialTeamAdmins(organisationId, users, query), [organisationId, users, query]);
  const selected = selectedInitialTeamAdmin(organisationId, users, selectedId);
  const choose = (id: string | null) => { onSelect(id); onClose(); };
  const personRow = (profile: UserProfile) => <ListRow key={profile.id}
    title={`${profile.full_name}${profile.id === currentProfileId ? ' (You)' : ''}`} subtitle={profile.email}
    leading={<Avatar name={profile.full_name} uri={getAvatarUri(profile)} size={40} />}
    accessibilityRole="radio" accessibilityLabel={[profile.full_name, profile.id === currentProfileId ? 'you' : null, profile.email].filter(Boolean).join(', ')}
    accessibilityState={{ checked: selectedId === profile.id }} showChevron={false}
    right={<Ionicons name={selectedId === profile.id ? 'radio-button-on' : 'radio-button-off'} size={24} color={colors.primary} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden />}
    onPress={() => choose(profile.id)} />;

  return <ModalSurface visible={visible} title="Initial team admin" onClose={onClose} returnFocusRef={opener}>
    <AppText tone="secondary">Choose one active church member, or leave this for later.</AppText>
    <ListGroup>
      <ListRow title="No initial team admin" subtitle="You can appoint someone later." icon="person-outline"
        accessibilityRole="radio" accessibilityLabel="No initial team admin" accessibilityState={{ checked: selectedId === null }}
        showChevron={false} right={<Ionicons name={selectedId === null ? 'radio-button-on' : 'radio-button-off'} size={24} color={colors.primary} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden />}
        onPress={() => choose(null)} />
    </ListGroup>
    <TextField label="Search active members" placeholder="Name or email" value={query} onChangeText={setQuery}
      autoCapitalize="none" autoCorrect={false} returnKeyType="search" />
    {selected && !candidates.some((profile) => profile.id === selected.id) ? <View style={styles.selected}>
      <AppText variant="label" tone="secondary">Currently selected</AppText>
      <ListGroup>{personRow(selected)}</ListGroup>
    </View> : null}
    {candidates.length ? <>
      {candidates.length === 50 ? <AppText variant="small" tone="secondary">Showing up to 50 matches. Search to find someone else.</AppText> : null}
      <ListGroup>{candidates.map(personRow)}</ListGroup>
    </> : <StatePanel compact title={query.trim() ? 'No matching members' : 'No members available'}
      message={query.trim() ? 'Try a different name or email.' : 'You can create the team without an initial team admin.'} />}
  </ModalSurface>;
}

const styles = StyleSheet.create({ selected: { gap: spacing.sm } });
