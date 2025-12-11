import React from 'react';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Card from '../components/Card';
import ListItem from '../components/ListItem';
import PrimaryButton from '../components/PrimaryButton';
import { MainTabParamList } from '../navigation/types';

type Props = BottomTabScreenProps<MainTabParamList, 'More'> & {
  onSignOut: () => void;
};

const MoreScreen = ({ onSignOut }: Props) => {
  const handleSignOut = () => {
    Alert.alert('Signed out', 'You have been returned to the login screen (mocked).');
    onSignOut();
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        <Text style={styles.title}>More</Text>
        <Text style={styles.subtitle}>Settings and other options.</Text>

        <Card>
          <View style={styles.listGap}>
            <ListItem title="Notification preferences" subtitle="Coming soon" />
            <ListItem title="Help & FAQs" subtitle="Support articles (future)" />
            <ListItem title="About ShiftShepherd" subtitle="v0.1 mock build" />
          </View>
        </Card>

        <PrimaryButton label="Sign out" variant="secondary" onPress={handleSignOut} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F6F8FB',
  },
  container: {
    flex: 1,
    backgroundColor: '#F6F8FB',
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    color: '#4B5563',
  },
  listGap: {
    gap: 10,
  },
});

export default MoreScreen;
