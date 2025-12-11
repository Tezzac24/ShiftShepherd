import React from 'react';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Card from '../components/Card';
import ListItem from '../components/ListItem';
import { mockTeams } from '../data/mockData';
import { MainTabParamList, RootStackParamList } from '../navigation/types';

type Props = BottomTabScreenProps<MainTabParamList, 'Teams'>;

const TeamsScreen = (_: Props) => {
  const rootNavigation = useNavigation<NavigationProp<RootStackParamList>>();

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      <FlatList
        data={mockTeams}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.contentContainer}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Teams</Text>
            <Text style={styles.subtitle}>Tap a team to see details and contacts.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Card>
            <ListItem
              title={item.name}
              subtitle={item.description}
              meta="View team"
              onPress={() => rootNavigation.navigate('TeamDetail', { teamId: item.id })}
            />
          </Card>
        )}
      />
    </SafeAreaView>
  );
};

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
});

export default TeamsScreen;
