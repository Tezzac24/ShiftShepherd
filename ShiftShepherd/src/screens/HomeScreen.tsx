import React from 'react';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Card from '../components/Card';
import ListItem from '../components/ListItem';
import PrimaryButton from '../components/PrimaryButton';
import {
  getEventById,
  getNextAssignmentForUser,
  getAssignmentsForUser,
  getTeamById,
  mockUser,
} from '../data/mockData';
import { MainTabParamList, RootStackParamList } from '../navigation/types';

type Props = BottomTabScreenProps<MainTabParamList, 'Home'>;

const HomeScreen = ({ navigation }: Props) => {
  const rootNavigation = useNavigation<NavigationProp<RootStackParamList>>();
  const assignments = getAssignmentsForUser(mockUser.id);
  const nextAssignment = getNextAssignmentForUser(mockUser.id);

  const handleViewDetails = (assignmentId: string) => {
    rootNavigation.navigate('AssignmentDetail', { assignmentId });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        <Text style={styles.greeting}>Welcome back, {mockUser.name.split(' ')[0]}</Text>
        <Text style={styles.helperText}>Here&apos;s what&apos;s coming up next.</Text>

        <Card>
          <Text style={styles.sectionTitle}>Your next assignment</Text>
          {nextAssignment ? (
            <View>
              <Text style={styles.primaryText}>
                {getEventById(nextAssignment.eventId)?.name ?? 'Upcoming event'}
              </Text>
              <Text style={styles.muted}>
                {formatDateTime(getEventById(nextAssignment.eventId)?.start)}
                {getEventById(nextAssignment.eventId)?.location
                  ? ` • ${getEventById(nextAssignment.eventId)?.location}`
                  : ''}
              </Text>
              <Text style={styles.muted}>
                {getTeamById(nextAssignment.teamId)?.name ?? 'Team'} • {nextAssignment.role}
              </Text>
              <PrimaryButton
                label="View details"
                onPress={() => handleViewDetails(nextAssignment.id)}
                style={styles.buttonSpacing}
              />
            </View>
          ) : (
            <Text style={styles.muted}>No upcoming assignments. Enjoy the downtime!</Text>
          )}
        </Card>

        <Card>
          <View style={styles.cardHeader}>
            <Text style={styles.sectionTitle}>Upcoming assignments</Text>
            <Text style={styles.smallMuted}>Next few events</Text>
          </View>
          <View style={styles.listSpacing}>
            {assignments.slice(0, 3).map((assignment) => {
              const event = getEventById(assignment.eventId);
              const team = getTeamById(assignment.teamId);
              return (
                <View key={assignment.id} style={styles.listItemWrapper}>
                  <ListItem
                    title={event?.name ?? 'Event'}
                    subtitle={`${team?.name ?? 'Team'} • ${assignment.role}`}
                    meta={formatDateTime(event?.start)}
                    onPress={() => handleViewDetails(assignment.id)}
                  />
                </View>
              );
            })}
          </View>
          <PrimaryButton
            label="View my full schedule"
            variant="secondary"
            onPress={() => navigation.navigate('MySchedule')}
          />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
};

const formatDateTime = (iso?: string) => {
  if (!iso) return 'TBC';
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
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
  },
  greeting: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0F172A',
  },
  helperText: {
    color: '#4B5563',
    marginBottom: 16,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  primaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 4,
  },
  muted: {
    color: '#4B5563',
    marginBottom: 6,
    fontSize: 14,
  },
  buttonSpacing: {
    marginTop: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  smallMuted: {
    fontSize: 12,
    color: '#6B7280',
  },
  listSpacing: {
    gap: 10,
    marginBottom: 12,
    marginTop: 8,
  },
  listItemWrapper: {
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
});

export default HomeScreen;
