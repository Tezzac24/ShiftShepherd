import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing, touchTarget, type } from '@/constants/theme';
import { AppText } from '@/src/components/AppText';
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
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const layoutKey = `${width}:${fontScale}`;
  const [labelHeights, setLabelHeights] = React.useState<Record<string, number>>({});
  const labelHeight = labelHeights[layoutKey] ?? Math.ceil(type.navigation.lineHeight * fontScale);
  const bottomPadding = Math.max(insets.bottom, spacing.sm);

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
        tabBarLabelPosition: 'below-icon',
        tabBarAllowFontScaling: true,
        tabBarLabel: ({ color, children }) => (
          <AppText variant="navigation" accessible={false}
            accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden
            style={{ color, textAlign: 'center', maxWidth: '100%' }}
            onLayout={(event) => {
              const height = Math.ceil(event.nativeEvent.layout.height);
              setLabelHeights((current) => height <= (current[layoutKey] ?? 0)
                ? current : { ...current, [layoutKey]: height });
            }}>
            {children}
          </AppText>
        ),
        tabBarItemStyle: { minHeight: touchTarget, paddingHorizontal: 0 },
        tabBarBadgeStyle: { backgroundColor: colors.primary, color: colors.white },
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          // Measured labels can wrap at larger system text sizes. The native
          // navigator retains press/back behavior and the bottom safe area.
          height: Math.max(touchTarget, 28 + labelHeight) + spacing.md + bottomPadding,
          paddingTop: spacing.md,
          paddingBottom: bottomPadding,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarAccessibilityLabel: 'Home',
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden />,
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Schedule',
          tabBarAccessibilityLabel: 'Schedule',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" size={size} color={color} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden />
          ),
        }}
      />
      <Tabs.Screen
        name="teams"
        options={{
          title: 'Teams',
          tabBarAccessibilityLabel: 'Teams',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden />
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
            <Ionicons name="chatbubbles-outline" size={size} color={color} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarAccessibilityLabel: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-circle-outline" size={size} color={color} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden />
          ),
        }}
      />
    </Tabs>
  );
}
