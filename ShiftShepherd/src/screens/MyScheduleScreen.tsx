import React from 'react';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Card from '../components/Card';
import ListItem from '../components/ListItem';
import {
  getAssignmentsForUser,
  getEventById,
  getTeamById,
  mockUser,
} from '../data/mockData';
import { MainTabParamList, RootStackParamList } from '../navigation/types';

type Props = BottomTabScreenProps<MainTabParamList, 'MySchedule'>;

const MyScheduleScreen = (_: Props) => {
  const rootNavigation = useNavigation<NavigationProp<RootStackParamList>>();
  const assignments = getAssignmentsForUser(mockUser.id);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      <FlatList
        data={assignments}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.contentContainer}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>My schedule</Text>
            <Text style={styles.subtitle}>All your upcoming assignments at a glance.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const event = getEventById(item.eventId);
          const team = getTeamById(item.teamId);
          const dateLabel = event ? formatDate(event.start) : 'TBC';
          const timeLabel = event ? formatTime(event.start) : '';

          return (
            <Card>
              <ListItem
                title={event?.name ?? 'Event'}
                subtitle={`${team?.name ?? 'Team'} • ${item.role}`}
                meta={`${dateLabel}${timeLabel ? ` • ${timeLabel}` : ''}`}
                onPress={() => rootNavigation.navigate('AssignmentDetail', { assignmentId: item.id })}
              />
            </Card>
          );
        }}
        ListEmptyComponent={
          <Card>
            <Text style={styles.emptyTitle}>Nothing scheduled</Text>
            <Text style={styles.subtitle}>We&apos;ll show upcoming events here once you are assigned.</Text>
          </Card>
        }
      />
    </SafeAreaView>
  );
};

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(iso));

const formatTime = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F6F8FB',
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
    gap: 12,
  },
  header: {
    marginBottom: 8,
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
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 6,
  },
});

export default MyScheduleScreen;
