import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from '../screens/LoginScreen';
import AssignmentDetailScreen from '../screens/AssignmentDetailScreen';
import TeamDetailScreen from '../screens/TeamDetailScreen';
import AppTabs from './AppTabs';
import { RootStackParamList } from './types';

type Props = {
  isSignedIn: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const RootNavigator = ({ isSignedIn, onSignIn, onSignOut }: Props) => (
  <Stack.Navigator
    screenOptions={{
      headerShadowVisible: false,
      animation: 'slide_from_right',
    }}
    key={isSignedIn ? 'app' : 'auth'}
  >
    {isSignedIn ? (
      <>
        <Stack.Screen name="MainTabs" options={{ headerShown: false }}>
          {() => <AppTabs onSignOut={onSignOut} />}
        </Stack.Screen>
        <Stack.Screen
          name="AssignmentDetail"
          component={AssignmentDetailScreen}
          options={{ title: 'Assignment' }}
        />
        <Stack.Screen
          name="TeamDetail"
          component={TeamDetailScreen}
          options={{ title: 'Team' }}
        />
      </>
    ) : (
      <Stack.Screen name="Login" options={{ headerShown: false }}>
        {(props) => <LoginScreen {...props} onLogin={onSignIn} />}
      </Stack.Screen>
    )}
  </Stack.Navigator>
);

export default RootNavigator;
