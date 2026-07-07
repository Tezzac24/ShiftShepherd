import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';

import { colors, radius, spacing, touchTarget } from '../../../constants/theme';
import { AppText } from '../../components/AppText';
import { Screen } from '../../components/Screen';
import { Avatar } from '../../components/Avatar';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { useAuth } from '../../lib/auth/AuthContext';
import { mockUsers, testAccounts } from '../../lib/mockData';

/**
 * Login screen. Production sign-in (email/password, Google, Facebook, phone)
 * is represented in the UI but simulated; demo mode signs in as a test user.
 * TODO: wire to Supabase Auth.
 */
export default function LoginScreen() {
  const router = useRouter();
  const { signInWithEmail, signInAsTestUser } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleEmailLogin = () => {
    const err = signInWithEmail(email, password);
    setError(err);
    if (!err) router.replace('/(tabs)/home');
  };

  const comingSoon = (method: string) => {
    const message = `${method} sign-in will be available when the app is connected to Supabase Auth. For now, please use a test account below.`;
    if (Platform.OS === 'web') {
      setError(message);
    } else {
      Alert.alert('Coming soon', message);
    }
  };

  const handleTestAccount = (userId: string) => {
    signInAsTestUser(userId);
    router.replace('/(tabs)/home');
  };

  return (
    <Screen safeTop keyboard>
      <View style={styles.scrollWrap}>
        <View style={styles.header}>
          <View style={styles.logo}>
            <Ionicons name="people-circle-outline" size={44} color={colors.white} />
          </View>
          <AppText variant="title" style={styles.center}>
            Shift Shepherd
          </AppText>
          <AppText tone="secondary" style={styles.center}>
            A calm home for your church’s events, announcements, rotas and teams.
          </AppText>
        </View>

        <View style={styles.form}>
          <TextField
            label="Email"
            placeholder="you@example.com"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextField
            label="Password"
            placeholder="Your password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            error={error ?? undefined}
          />
          <Button title="Log in" onPress={handleEmailLogin} icon="log-in-outline" />

          <View style={styles.socialRow}>
            <SocialButton icon="logo-google" label="Google" onPress={() => comingSoon('Google')} />
            <SocialButton
              icon="logo-facebook"
              label="Facebook"
              onPress={() => comingSoon('Facebook')}
            />
            <SocialButton
              icon="call-outline"
              label="Phone"
              onPress={() => comingSoon('Phone number')}
            />
          </View>

          <AppText variant="small" tone="muted" style={styles.center}>
            This is a demo build — sign-in is simulated. Production login will use Supabase Auth.
          </AppText>
        </View>

        <View style={styles.divider}>
          <View style={styles.line} />
          <Badge label="Demo mode — choose a test account" tone="accent" />
          <View style={styles.line} />
        </View>

        <View style={styles.accounts}>
          {testAccounts.map((account) => {
            const user = mockUsers.find((u) => u.id === account.userId)!;
            return (
              <Pressable
                key={account.userId}
                accessibilityRole="button"
                accessibilityLabel={`Log in as ${user.full_name}, ${account.roleLabel}`}
                onPress={() => handleTestAccount(account.userId)}
                style={({ pressed }) => [styles.accountRow, pressed && { opacity: 0.8 }]}
              >
                <Avatar name={user.full_name} />
                <View style={styles.accountText}>
                  <AppText variant="bodyBold">{user.full_name}</AppText>
                  <AppText variant="small" tone="primary">
                    {account.roleLabel}
                  </AppText>
                  <AppText variant="small" tone="muted">
                    {account.description}
                  </AppText>
                </View>
                <Ionicons name="chevron-forward" size={22} color={colors.textMuted} />
              </Pressable>
            );
          })}
        </View>
      </View>
    </Screen>
  );
}

function SocialButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Sign in with ${label}`}
      onPress={onPress}
      style={({ pressed }) => [styles.social, pressed && { opacity: 0.8 }]}
    >
      <Ionicons name={icon} size={22} color={colors.primary} />
      <AppText variant="label" style={{ color: colors.primary }}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrollWrap: { gap: spacing.lg },
  header: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  center: { textAlign: 'center' },
  form: { gap: spacing.md },
  socialRow: { flexDirection: 'row', gap: spacing.sm },
  social: {
    flex: 1,
    minHeight: touchTarget,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  line: { flex: 1, height: 1, backgroundColor: colors.borderStrong },
  accounts: { gap: spacing.sm },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  accountText: { flex: 1, gap: 2 },
});
