import { Stack, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '../../../constants/theme';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { TextField } from '../../components/TextField';
import { useAuth } from '../../lib/auth/AuthContext';

export default function CreateOrganisationScreen() {
  const router = useRouter();
  const { createOrganisation } = useAuth();
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await createOrganisation(name);
      router.replace('/(tabs)/home');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'We couldn’t create the organisation.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen keyboard>
      <Stack.Screen options={{ title: 'Create organisation' }} />
      <View style={styles.heading}>
        <AppText variant="heading">Create your church organisation</AppText>
        <AppText tone="secondary">
          Start with the organisation name. You will become its church administrator; teams and
          members can be added later.
        </AppText>
      </View>
      <TextField
        label="Organisation name"
        placeholder="Grace Community Church"
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
        maxLength={120}
        error={error ?? undefined}
      />
      <Button
        title="Create organisation"
        icon="checkmark-circle-outline"
        onPress={() => void submit()}
        loading={submitting}
        disabled={!name.trim()}
      />
      <View style={styles.note}>
        <AppText variant="small" tone="muted">
          No team or sample members will be created. If anything fails, no partial organisation is
          kept.
        </AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { gap: spacing.xs },
  note: { padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primarySoft },
});
