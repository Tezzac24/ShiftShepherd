import { Ionicons } from '@expo/vector-icons';
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
 * Login screen. Email/password uses real Supabase Auth when the app is
 * configured with Supabase credentials; otherwise it falls back to the demo
 * behaviour (any password for a known mock email). The demo account selector
 * is always available. Google/Facebook/phone stay placeholders for now.
 *
 * This screen never navigates on success. Authentication state is the single
 * source of truth for routing: the root layout's `Stack.Protected` guard drops
 * `login` as soon as the session exists, and `app/index.tsx` then picks the
 * destination (pending invitation, active organisation, or no organisation).
 * A second, imperative `router.replace` here would race that transition.
 */
export default function LoginScreen() {
  const { signInWithEmail, signUpWithEmail, signInAsTestUser, supabaseEnabled } = useAuth();
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleEmailLogin = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      if (creatingAccount) {
        const result = await signUpWithEmail(fullName, email, password);
        setError(result.error);
        if (!result.error && result.needsEmailConfirmation) {
          const message = 'Check your email to confirm your account, then return here to sign in.';
          if (Platform.OS === 'web') setError(message);
          else Alert.alert('Confirm your email', message);
        }
      } else {
        setError(await signInWithEmail(email, password));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const comingSoon = (method: string) => {
    const message = `${method} sign-in isn’t available yet. Please log in with your email and password, or use a demo account below.`;
    if (Platform.OS === 'web') {
      setError(message);
    } else {
      Alert.alert('Coming soon', message);
    }
  };

  const handleTestAccount = (userId: string) => {
    signInAsTestUser(userId);
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
          {creatingAccount ? (
            <TextField
              label="Full name"
              placeholder="Your name"
              autoCapitalize="words"
              autoComplete="name"
              value={fullName}
              onChangeText={setFullName}
              maxLength={100}
            />
          ) : null}
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
          <Button
            title={creatingAccount ? 'Create account' : 'Log in'}
            onPress={handleEmailLogin}
            icon="log-in-outline"
            loading={submitting}
          />

          {supabaseEnabled ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={creatingAccount ? 'Use an existing account' : 'Create a new account'}
              onPress={() => {
                setCreatingAccount((value) => !value);
                setError(null);
              }}
              style={styles.accountModeAction}
            >
              <AppText tone="primary" variant="label">
                {creatingAccount ? 'Already have an account? Log in' : 'New to Shift Shepherd? Create an account'}
              </AppText>
            </Pressable>
          ) : null}

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
            {supabaseEnabled
              ? creatingAccount
                ? 'Creating an account does not automatically join a church. You can create an organisation or accept an invitation afterward.'
                : 'Log in with your email and password, or explore with a demo account below.'
              : 'This build isn’t connected to a live server — sign-in is simulated. Use a demo account below, or any mock email with any password.'}
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
  accountModeAction: { minHeight: touchTarget, alignItems: 'center', justifyContent: 'center' },
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
