import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { spacing } from '../../../constants/theme';
import { AppText } from '../../components/AppText';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { FormErrorSummary } from '../../components/FormErrorSummary';
import { ListGroup } from '../../components/ListGroup';
import { ListRow } from '../../components/ListRow';
import { PageHeading } from '../../components/PageHeading';
import { Screen } from '../../components/Screen';
import { SegmentedControl } from '../../components/SegmentedControl';
import { StatePanel } from '../../components/StatePanel';
import { TextField } from '../../components/TextField';
import { useAuth } from '../../lib/auth/AuthContext';
import { mockUsers, testAccounts } from '../../lib/mockData';

type Field = 'name' | 'email' | 'password';

const demoAccounts = [...testAccounts].sort((first, second) =>
  Number(second.userId === 'user-hannah') - Number(first.userId === 'user-hannah'));

/** Auth guards and the routing hub own every successful sign-in destination. */
export default function LoginScreen() {
  const { signInWithEmail, signUpWithEmail, signInAsTestUser, supabaseEnabled } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [otherMethodsOpen, setOtherMethodsOpen] = useState(false);
  const [demoOpen, setDemoOpen] = useState(!supabaseEnabled);
  const [demoEmailOpen, setDemoEmailOpen] = useState(false);
  const active = useRef(true);
  const pending = useRef(false);
  const scroll = useRef<ScrollView>(null);
  const nameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const positions = useRef<Partial<Record<Field, number>>>({});
  const demoEmailY = useRef(0);
  const creating = mode === 'signup' && supabaseEnabled;
  const showEmailForm = supabaseEnabled || demoEmailOpen;

  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    if (error || confirmationEmail) scroll.current?.scrollTo({ y: supabaseEnabled ? 0 : demoEmailY.current, animated: false });
  }, [error, confirmationEmail, supabaseEnabled]);

  const focus = (field: Field) => {
    scroll.current?.scrollTo({ y: Math.max(0, (positions.current[field] ?? 0) - spacing.md), animated: false });
    ({ name: nameRef, email: emailRef, password: passwordRef })[field].current?.focus();
  };
  const change = (field: Field, value: string) => {
    if (pending.current) return;
    ({ name: setFullName, email: setEmail, password: setPassword })[field](value);
    setErrors((previous) => ({ ...previous, [field]: undefined }));
    setError(null);
  };
  const changeMode = (next: 'signin' | 'signup') => {
    if (pending.current) return;
    setMode(next); setErrors({}); setError(null); setConfirmationEmail(null);
  };
  const submit = async () => {
    if (!active.current || pending.current || confirmationEmail) return;
    const validation: Partial<Record<Field, string>> = {};
    if (creating && fullName.trim().length < 2) validation.name = 'Enter your full name (at least 2 characters).';
    if (creating && fullName.trim().length > 100) validation.name = 'Keep your name to 100 characters or fewer.';
    if (!email.trim()) validation.email = 'Enter your email address.';
    if (!password) validation.password = 'Enter your password.';
    else if (creating && password.length < 6) validation.password = 'Use at least 6 characters for your password.';
    setErrors(validation); setError(null);
    const first = Object.keys(validation)[0] as Field | undefined;
    if (first) {
      requestAnimationFrame(() => { if (active.current) focus(first); });
      return;
    }
    pending.current = true; setSubmitting(true);
    try {
      if (creating) {
        const result = await signUpWithEmail(fullName, email, password);
        if (!active.current) return;
        setError(result.error);
        if (!result.error && result.needsEmailConfirmation) setConfirmationEmail(email.trim());
      } else {
        const result = await signInWithEmail(email, password);
        if (active.current) setError(result);
      }
    } catch {
      if (active.current) setError('We couldn’t complete that request. Check your connection and try again.');
    } finally {
      pending.current = false;
      if (active.current) setSubmitting(false);
    }
  };

  const demoChoices = <ListGroup>{demoAccounts.map((account) => {
    const person = mockUsers.find((candidate) => candidate.id === account.userId)!;
    const role = account.roleLabel.replace('Team Leader', 'team admin');
    const description = account.userId === 'user-daniel' ? 'Manages teams, announcements and church events' : account.description;
    return <ListRow key={account.userId} title={person.full_name} subtitle={`${role}. ${description}`}
      leading={<Avatar name={person.full_name} />} disabled={submitting}
      accessibilityLabel={`Sign in as ${person.full_name}, ${role}`}
      onPress={() => { if (active.current && !pending.current) signInAsTestUser(account.userId); }} />;
  })}</ListGroup>;

  return <Screen safeTop keyboard keyboardVerticalOffset={0} scrollRef={scroll} contentStyle={styles.content}>
    <PageHeading eyebrow="Shift Shepherd" title={confirmationEmail ? 'Check your email' : !supabaseEnabled ? 'Choose a demo account' : creating ? 'Create your account' : 'Welcome back'}
      description={confirmationEmail ? 'Confirm your email before signing in.' : 'Keep in touch with your church and know when you’re serving.'} />
    {confirmationEmail ? <>
      <View accessibilityLiveRegion="polite">
        <StatePanel compact kind="info" icon="mail-outline" title="Confirm your email"
          message={`Check ${confirmationEmail} for the confirmation link. Then return here to sign in.`} />
      </View>
      <AppText tone="secondary">Creating an account does not join a church. An invitation gives you access to your church.</AppText>
      <Button title="Back to sign in" onPress={() => changeMode('signin')} />
    </> : <>
      {!supabaseEnabled ? <>
        <AppText tone="secondary">Explore with sample people and church data. Choose a person to get started.</AppText>
        {demoChoices}
        <View onLayout={(event) => { demoEmailY.current = event.nativeEvent.layout.y; }}>
          <ListRow title="Use a demo email instead" showChevron={false} disabled={submitting}
            subtitle={demoEmailOpen ? 'Use a sample person’s email and any password.' : undefined}
            accessibilityState={{ expanded: demoEmailOpen }} onPress={() => setDemoEmailOpen((value) => !value)} />
        </View>
      </> : null}
      {showEmailForm ? <>
      {supabaseEnabled ? <SegmentedControl label="Account access" value={mode} onChange={changeMode}
        options={[{ value: 'signin', label: 'Sign in', disabled: submitting }, { value: 'signup', label: 'Create account', disabled: submitting }]} /> : null}
      {error ? <StatePanel compact kind="error" title={creating ? 'Couldn’t complete account creation' : 'Couldn’t sign in'} message={error} /> : null}
      <FormErrorSummary errors={Object.entries(errors).filter(([, message]) => !!message)
        .map(([key, message]) => ({ key, message: message!, onPress: () => focus(key as Field) }))} />
      {creating ? <View onLayout={(event) => { positions.current.name = event.nativeEvent.layout.y; }}>
        <TextField ref={nameRef} label="Full name" placeholder="Your name" autoCapitalize="words" autoComplete="name" textContentType="name"
          value={fullName} onChangeText={(value) => change('name', value)} maxLength={100} error={errors.name} editable={!submitting}
          returnKeyType="next" onSubmitEditing={() => focus('email')} />
      </View> : null}
      <View onLayout={(event) => { positions.current.email = event.nativeEvent.layout.y; }}>
        <TextField ref={emailRef} label="Email" placeholder="you@example.com" autoCapitalize="none" autoCorrect={false}
          keyboardType="email-address" autoComplete="email" textContentType={creating ? 'emailAddress' : 'username'}
          value={email} onChangeText={(value) => change('email', value)} error={errors.email} editable={!submitting}
          returnKeyType="next" onSubmitEditing={() => focus('password')} />
      </View>
      <View onLayout={(event) => { positions.current.password = event.nativeEvent.layout.y; }}>
        <TextField ref={passwordRef} label="Password" secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false}
          autoComplete={creating ? 'new-password' : 'current-password'} textContentType={creating ? 'newPassword' : 'password'}
          value={password} onChangeText={(value) => change('password', value)} error={errors.password}
          helper={creating ? 'Use at least 6 characters.' : undefined} editable={!submitting}
          returnKeyType="go" onSubmitEditing={() => void submit()} />
        <Button title={showPassword ? 'Hide password' : 'Show password'} variant="ghost" disabled={submitting}
          onPress={() => setShowPassword((value) => !value)} style={styles.passwordAction} />
      </View>
      {creating ? <AppText tone="secondary">An account is your sign-in. To join your church, you’ll need an invitation from a church admin.</AppText> : null}
      <Button title={creating ? 'Create account' : 'Sign in'} onPress={() => void submit()} loading={submitting} />
      </> : null}
      <View style={styles.support}>
        <ListRow title="Other sign-in methods" showChevron={false} disabled={submitting}
          subtitle={otherMethodsOpen ? 'Google, Facebook and phone sign-in are not available. Use email and password.' : undefined}
          accessibilityState={{ expanded: otherMethodsOpen }} onPress={() => setOtherMethodsOpen((value) => !value)} />
        {supabaseEnabled ? <ListRow title="Try a demo account" subtitle={demoOpen ? 'Sample people and church data' : 'Explore without creating an account'} showChevron={false}
          disabled={submitting} accessibilityState={{ expanded: demoOpen }} onPress={() => setDemoOpen((value) => !value)} />
          : null}
        {supabaseEnabled && demoOpen ? demoChoices : null}
      </View>
    </>}
  </Screen>;
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg },
  support: { gap: spacing.md, marginTop: spacing.md },
  passwordAction: { alignSelf: 'flex-end' },
});
