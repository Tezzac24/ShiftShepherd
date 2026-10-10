import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { radius, spacing, touchTarget, type ThemeColors } from '../../../constants/theme';
import { useThemeColors, useThemedStyles } from '@/src/lib/theme/AppearanceContext';
import { AppText } from '../../components/AppText';
import { ListRow } from '../../components/ListRow';
import { ModalSurface } from '../../components/ModalSurface';
import { StatePanel } from '../../components/StatePanel';
import { TextField } from '../../components/TextField';
import { listOrganisationMembers } from '../../lib/supabase/services/organisationMemberships';
import { OrganisationMemberSummary } from '../../types';
import { canInviteDirectoryMember } from '../organisations/organisationMembers';
import { useOrganisationAdministration } from '../organisations/useOrganisationAdministration';

/** Server search stays bounded; selecting retains the exact returned person. */
export function DirectoryPersonField({ value, onChange, disabled, scope }: {
  value: OrganisationMemberSummary | null;
  onChange: (member: OrganisationMemberSummary) => void;
  disabled: boolean;
  scope: ReturnType<typeof useOrganisationAdministration>;
}) {
  const colors = useThemeColors();
  const styles = useThemedStyles(createStyles);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [members, setMembers] = useState<OrganisationMemberSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const sequence = useRef(0);
  const trigger = useRef<View>(null);
  const { canAct, capture, isCurrent } = scope;
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  useEffect(() => {
    if (!open || disabled || !canAct()) return;
    const ticket = capture();
    const request = ++sequence.current;
    let active = true;
    setLoading(true); setError(null);
    const timeout = setTimeout(() => {
      void listOrganisationMembers(query).then((rows) => {
        if (active && isCurrent(ticket) && sequence.current === request) setMembers(rows);
      }).catch((cause) => {
        if (active && isCurrent(ticket) && sequence.current === request) {
          setError(cause instanceof Error ? cause.message : 'We couldn’t search the directory.');
        }
      }).finally(() => {
        if (active && isCurrent(ticket) && sequence.current === request) setLoading(false);
      });
    }, query ? 300 : 0);
    return () => { active = false; sequence.current += 1; clearTimeout(timeout); };
  }, [open, disabled, query, retry, canAct, capture, isCurrent]);
  const eligible = members.filter(canInviteDirectoryMember);
  return <View style={styles.field}>
    <AppText variant="label">Already listed</AppText>
    <Pressable ref={trigger} accessibilityRole="button" accessibilityLabel={`Listed person: ${value?.full_name ?? 'Choose a listed person'}`}
      accessibilityState={{ expanded: open && !disabled, disabled }} aria-expanded={open && !disabled} aria-disabled={disabled}
      disabled={disabled} onPress={() => { setQuery(''); setOpen(true); }} style={({ pressed }) => [styles.trigger, pressed && styles.pressed]}>
      <View style={styles.copy}><AppText>{value?.full_name ?? 'Choose a listed person'}</AppText>
        {value ? <AppText variant="small" tone="secondary">{value.email}</AppText> : null}</View>
      <Ionicons name="chevron-down" size={22} color={colors.primary} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden />
    </Pressable>
    <AppText variant="small" tone="secondary">Choose someone listed in this church who hasn’t joined the app, or whose access was removed.</AppText>
    <ModalSurface title="Choose a listed person" visible={open && !disabled} onClose={() => setOpen(false)} scroll={false} returnFocusRef={trigger}>
      <View style={styles.search}>
        <TextField label="Search people" placeholder="Name or email" value={query} onChangeText={setQuery}
          autoCapitalize="none" autoCorrect={false} maxLength={100} />
        <AppText variant="small" tone="secondary">Search returns up to 200 people. Narrow your search if the person you need isn’t shown.</AppText>
      </View>
      {loading ? <StatePanel kind="loading" title="Searching directory…" />
        : error ? <StatePanel kind="error" title="Couldn’t search the directory" message={error}
          action={{ label: 'Try again', onPress: () => setRetry((current) => current + 1) }} />
          : <FlatList data={eligible} keyExtractor={(member) => member.profile_id} keyboardShouldPersistTaps="handled" style={styles.list}
            ListEmptyComponent={<StatePanel title="No eligible people in these results" message="Try a more specific name or email. For a new person, use By email." />}
            renderItem={({ item }) => <ListRow title={item.full_name}
              subtitle={`${item.email}\n${item.access_status === 'removed' ? 'Access removed · returns as a church member' : 'Has not joined the app'}${item.pending_invitation_status === 'pending' ? '\nInvitation pending' : ''}`}
              accessibilityRole="radio" accessibilityState={{ checked: value?.profile_id === item.profile_id }} showChevron={false}
              onPress={() => { if (canAct()) { onChange(item); setOpen(false); } }} />}
            contentContainerStyle={styles.rows} />}
    </ModalSurface>
  </View>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  field: { gap: spacing.sm },
  trigger: { minHeight: touchTarget, borderWidth: 1.5, borderColor: colors.borderStrong, borderRadius: radius.md,
    backgroundColor: colors.surface, padding: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  copy: { flex: 1, gap: spacing.xs },
  pressed: { backgroundColor: colors.primarySoft },
  search: { padding: spacing.gutter, gap: spacing.md },
  rows: { paddingHorizontal: spacing.gutter, paddingBottom: spacing.lg, gap: spacing.sm },
  list: { flexGrow: 0, flexShrink: 1 },
});
