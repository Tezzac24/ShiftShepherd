import React from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Card from '../components/Card';
import PrimaryButton from '../components/PrimaryButton';
import { getAssignmentById, getEventById, getTeamById } from '../data/mockData';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'AssignmentDetail'>;

const AssignmentDetailScreen = ({ route }: Props) => {
  const assignment = getAssignmentById(route.params.assignmentId);
  const event = assignment ? getEventById(assignment.eventId) : undefined;
  const team = assignment ? getTeamById(assignment.teamId) : undefined;

  if (!assignment) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.centered}>
          <Text style={styles.title}>Assignment not found</Text>
          <Text style={styles.subtitle}>Please go back and try again.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const handleCantMakeIt = () => {
    Alert.alert(
      "I can't make it",
      'We will let your team lead know that you cannot attend this assignment. (Mocked for now.)',
      [
        { text: 'Never mind', style: 'cancel' },
        {
          text: 'Confirm',
          style: 'destructive',
          onPress: () =>
            Alert.alert('Request noted', 'A placeholder request has been recorded.'),
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        <Card>
          <Text style={styles.title}>{event?.name ?? 'Assignment'}</Text>
          <Text style={styles.subtitle}>
            {formatDate(event?.start)} {event?.location ? `• ${event.location}` : ''}
          </Text>
          <Text style={styles.highlight}>{team?.name ?? 'Team'}</Text>
          <Text style={styles.subtitle}>Role: {assignment.role}</Text>
          {assignment.notes ? <Text style={styles.notes}>{assignment.notes}</Text> : null}
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>Schedule</Text>
          <Text style={styles.bodyText}>Starts: {formatDateTime(event?.start)}</Text>
          <Text style={styles.bodyText}>
            Ends: {event?.end ? formatDateTime(event.end) : 'Not specified'}
          </Text>
          {event?.location ? <Text style={styles.bodyText}>Location: {event.location}</Text> : null}
        </Card>

        <PrimaryButton label="I can't make it" onPress={handleCantMakeIt} />
      </ScrollView>
    </SafeAreaView>
  );
};

const formatDate = (iso?: string) =>
  iso
    ? new Intl.DateTimeFormat('en-GB', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }).format(new Date(iso))
    : 'Date TBC';

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
    fontSize: 14,
    color: '#4B5563',
    marginTop: 4,
  },
  highlight: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: '600',
    color: '#0F6CBD',
  },
  notes: {
    marginTop: 10,
    color: '#111827',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 6,
  },
  bodyText: {
    fontSize: 14,
    color: '#1F2937',
    marginBottom: 4,
  },
});

export default AssignmentDetailScreen;
