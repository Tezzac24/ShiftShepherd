import React from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Card from '../components/Card';
import ListItem from '../components/ListItem';
import PrimaryButton from '../components/PrimaryButton';
import { getAssignmentsForTeam, getEventById, getTeamById } from '../data/mockData';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'TeamDetail'>;

const TeamDetailScreen = ({ route }: Props) => {
  const team = getTeamById(route.params.teamId);
  const assignments = getAssignmentsForTeam(route.params.teamId);

  if (!team) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.centered}>
          <Text style={styles.title}>Team not found</Text>
          <Text style={styles.subtitle}>Please return to the list and try again.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const openWhatsApp = () => {
    Alert.alert(
      'Open WhatsApp',
      'This will deep-link to the team WhatsApp group in a future version.',
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        <Card>
          <Text style={styles.title}>{team.name}</Text>
          {team.description ? <Text style={styles.subtitle}>{team.description}</Text> : null}
          {team.whatsappGroupLink ? (
            <PrimaryButton label="Open WhatsApp group" onPress={openWhatsApp} style={styles.button} />
          ) : (
            <PrimaryButton
              label="WhatsApp link coming soon"
              onPress={openWhatsApp}
              variant="secondary"
              style={styles.button}
            />
          )}
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>Upcoming duties for this team</Text>
          <View style={styles.listGap}>
            {assignments.length ? (
              assignments.map((assignment) => {
                const event = getEventById(assignment.eventId);
                return (
                  <ListItem
                    key={assignment.id}
                    title={event?.name ?? 'Event'}
                    subtitle={`${assignment.role}`}
                    meta={formatDateTime(event?.start)}
                  />
                );
              })
            ) : (
              <Text style={styles.subtitle}>No upcoming events yet.</Text>
            )}
          </View>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
};

const formatDateTime = (iso?: string) =>
  iso
    ? new Intl.DateTimeFormat('en-GB', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date(iso))
    : 'TBC';

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
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F6F8FB',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    color: '#4B5563',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 6,
  },
  button: {
    marginTop: 12,
  },
  listGap: {
    gap: 10,
  },
});

export default TeamDetailScreen;
