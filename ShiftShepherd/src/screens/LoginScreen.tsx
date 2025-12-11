import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import PrimaryButton from '../components/PrimaryButton';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'> & {
  onLogin: () => void;
};

const LoginScreen = ({ onLogin }: Props) => (
  <SafeAreaView style={styles.container}>
    <Text style={styles.title}>ShiftShepherd</Text>
    <Text style={styles.subtitle}>Quick rota check-in for your team.</Text>
    <PrimaryButton label="Log in" onPress={onLogin} style={styles.button} />
    <Text style={styles.helper}>Authentication is mocked for now.</Text>
  </SafeAreaView>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F6F8FB',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: '#4B5563',
    textAlign: 'center',
    marginBottom: 32,
  },
  button: {
    alignSelf: 'stretch',
  },
  helper: {
    marginTop: 12,
    color: '#6B7280',
  },
});

export default LoginScreen;
