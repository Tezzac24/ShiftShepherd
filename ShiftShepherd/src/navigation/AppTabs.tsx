import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import HomeScreen from '../screens/HomeScreen';
import MyScheduleScreen from '../screens/MyScheduleScreen';
import TeamsScreen from '../screens/TeamsScreen';
import MoreScreen from '../screens/MoreScreen';
import { MainTabParamList } from './types';

type Props = {
  onSignOut: () => void;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

const AppTabs = ({ onSignOut }: Props) => (
  <Tab.Navigator
    screenOptions={({ route }) => ({
      headerShown: false,
      tabBarActiveTintColor: '#0F6CBD',
      tabBarInactiveTintColor: '#6B7280',
      tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
      tabBarStyle: { paddingBottom: 6, height: 64 },
      tabBarIcon: ({ color, size, focused }) => {
        const iconName = getIconName(route.name, focused);
        return <Ionicons name={iconName} size={size} color={color} />;
      },
    })}
  >
    <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'Home' }} />
    <Tab.Screen name="MySchedule" component={MyScheduleScreen} options={{ title: 'My Schedule' }} />
    <Tab.Screen name="Teams" component={TeamsScreen} options={{ title: 'Teams' }} />
    <Tab.Screen name="More" options={{ title: 'More' }}>
      {(props) => <MoreScreen {...props} onSignOut={onSignOut} />}
    </Tab.Screen>
  </Tab.Navigator>
);

const getIconName = (routeName: keyof MainTabParamList, focused: boolean) => {
  switch (routeName) {
    case 'Home':
      return focused ? 'home' : 'home-outline';
    case 'MySchedule':
      return focused ? 'calendar' : 'calendar-outline';
    case 'Teams':
      return focused ? 'people' : 'people-outline';
    case 'More':
    default:
      return focused ? 'menu' : 'menu-outline';
  }
};

export default AppTabs;
