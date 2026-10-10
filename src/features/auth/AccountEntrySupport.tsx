import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { spacing } from '../../../constants/theme';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { StatePanel } from '../../components/StatePanel';
import { useAuth } from '../../lib/auth/AuthContext';

/** Account identity only; church names still come from the resolved account context. */
export function AccountIdentity() {
  const { authIdentity, accountContext } = useAuth();
  const identity = authIdentity?.email ?? accountContext?.account.global_display_name;
  if (!identity) return null;
  return <View style={styles.identity}>
    <AppText variant="small" tone="secondary">Signed in as</AppText>
    <AppText variant="bodyBold">{identity}</AppText>
  </View>;
}

export function AccountSignOut({ disabled = false }: { disabled?: boolean }) {
  const { authIdentity } = useAuth();
  return <SignOutAction key={authIdentity?.id ?? 'no-account'} disabled={disabled} />;
}

function SignOutAction({ disabled }: { disabled: boolean }) {
  const { signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const active = useRef(true);
  const pending = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const leave = async () => {
    if (pending.current || disabled) return;
    pending.current = true; setBusy(true); setError(false);
    try { await signOut(); }
    catch { if (active.current) setError(true); }
    finally { pending.current = false; if (active.current) setBusy(false); }
  };
  return <View style={styles.actions}>
    <AppText variant="small" tone="secondary">Using the wrong account? Sign out to use another email.</AppText>
    {error ? <StatePanel compact kind="error" title="Couldn’t complete sign-out" message="Check your connection and try again." /> : null}
    <Button title="Sign out" variant="ghost" icon="log-out-outline" disabled={disabled} loading={busy} onPress={() => void leave()} />
  </View>;
}

export function AccountReadState({ retrying, onRetry, error }: {
  retrying: boolean;
  onRetry: () => void;
  error: boolean;
}) {
  return <View style={styles.actions}>
    <StatePanel kind={error ? 'error' : 'loading'}
      title={error ? 'We couldn’t load your account' : 'Loading your churches…'}
      message={error ? 'You are still signed in, but we couldn’t confirm your church access. Check your connection and try again.' : 'Checking the churches linked to your account.'} />
    {error ? <Button title="Try again" icon="refresh-outline" loading={retrying} onPress={onRetry} /> : null}
  </View>;
}

const styles = StyleSheet.create({
  identity: { gap: spacing.xs },
  actions: { gap: spacing.sm },
});
