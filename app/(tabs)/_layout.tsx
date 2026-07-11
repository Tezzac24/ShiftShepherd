import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';

import { colors } from '@/constants/theme';
import { useAppData } from '@/src/lib/appData/AppDataContext';
import { sumUnread } from '@/src/lib/appData/chatUnread';
import { visibleTeams } from '@/src/lib/appData/selectors';
import { useAuth } from '@/src/lib/auth/AuthContext';

/**
 * Five labelled tabs — no icon-only navigation.
 */
export default function TabsLayout() {
  const { user } = useAuth();
  const data = useAppData();

  // Total unread across the teams this user can see. Driven by central state,
  // so it updates from anywhere in the app — not only on the Messages screen.
  const unreadTotal = user
    ? sumUnread(
        data.unreadByTeam,
        visibleTeams(user, data.teams).map((team) => team.id),
      )
    : 0;
  // A sensible cap keeps the badge from dominating navigation.
  const badgeCount = unreadTotal > 99 ? '99+' : unreadTotal;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          height: 84,
          paddingTop: 6,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendar',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="teams"
        options={{
          title: 'Teams',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          tabBarBadge: unreadTotal > 0 ? badgeCount : undefined,
          tabBarAccessibilityLabel:
            unreadTotal > 0
              ? `Messages, ${unreadTotal} unread`
              : 'Messages',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-circle-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
