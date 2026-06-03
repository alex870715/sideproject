import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';
import { PlayerProfileScreen, PLAYER_PROGRESS_FEATURE } from '../features/playerProgress';
import { AUTH_FEATURE } from '../features/auth/config';
import { useAuthSession } from '../hooks/useAuthSession';
import { AuthScreen } from '../screens/AuthScreen';
import { ExploreScreen } from '../screens/ExploreScreen';
import { FriendsScreen } from '../screens/FriendsScreen';
import { SettingsScreen } from '../screens/SettingsScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs({ showFriends }: { showFriends: boolean }) {
  const { t } = useTranslation();
  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#0b1220' },
        headerTintColor: '#e8eef8',
        headerShadowVisible: false,
        tabBarStyle: {
          backgroundColor: '#141c2c',
          borderTopColor: '#243044',
        },
        tabBarActiveTintColor: '#7dd3fc',
        tabBarInactiveTintColor: '#6b7c95',
      }}
    >
      <Tab.Screen
        name="Explore"
        component={ExploreScreen}
        options={{ title: t('tabs.explore'), headerTitle: t('tabs.explore') }}
      />
      {PLAYER_PROGRESS_FEATURE.showProfileTab ? (
        <Tab.Screen
          name="Profile"
          component={PlayerProfileScreen}
          options={{ title: t('tabs.profile'), headerTitle: t('tabs.profile') }}
        />
      ) : null}
      {showFriends ? (
        <Tab.Screen
          name="Friends"
          component={FriendsScreen}
          options={{ headerShown: false, title: t('tabs.friends') }}
        />
      ) : null}
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: t('tabs.settings'), headerTitle: t('tabs.settings') }}
      />
    </Tab.Navigator>
  );
}

function GuestTabsScreen() {
  return <MainTabs showFriends={false} />;
}

function UserTabsScreen() {
  return <MainTabs showFriends />;
}

function AuthStack() {
  const { t } = useTranslation();
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#0b1220' },
        headerTintColor: '#e8eef8',
        contentStyle: { backgroundColor: '#0b1220' },
      }}
    >
      <Stack.Screen
        name="AuthLogin"
        component={AuthScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="AuthSettings"
        component={SettingsScreen}
        options={{ title: t('tabs.settings') }}
      />
    </Stack.Navigator>
  );
}

export function RootNavigator() {
  const { session, loading, supabaseConfigured } = useAuthSession();

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: '#0b1220',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator size="large" color="#7dd3fc" />
      </View>
    );
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#0b1220' },
        headerTintColor: '#e8eef8',
        contentStyle: { backgroundColor: '#0b1220' },
      }}
    >
      {session ? (
        <Stack.Screen
          name="UserTabs"
          component={UserTabsScreen}
          options={{ headerShown: false }}
        />
      ) : AUTH_FEATURE.requireSignIn && supabaseConfigured ? (
        <Stack.Screen
          name="AuthFlow"
          component={AuthStack}
          options={{ headerShown: false }}
        />
      ) : (
        <Stack.Screen
          name="GuestTabs"
          component={GuestTabsScreen}
          options={{ headerShown: false }}
        />
      )}
    </Stack.Navigator>
  );
}
