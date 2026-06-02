import React from 'react';
import { Tabs } from 'expo-router';

import { useClientOnlyValue } from '@/components/useClientOnlyValue';
import { foodie } from '@/theme/foodie';
import { Home, Flame, NotebookPen, UserRound } from 'lucide-react-native';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: foodie.orangeDeep,
        tabBarInactiveTintColor: foodie.muted,
        tabBarStyle: { backgroundColor: foodie.cream, borderTopColor: foodie.peach },
        headerShown: useClientOnlyValue(false, true),
        headerTintColor: foodie.ink,
        headerStyle: { backgroundColor: foodie.cream },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: '首頁',
          tabBarIcon: ({ color, size }) => <Home color={color} size={size ?? 24} />,
        }}
      />
      <Tabs.Screen
        name="pick-food"
        options={{
          href: null,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="journal"
        options={{
          title: '紀錄',
          headerShown: false,
          tabBarIcon: ({ color, size }) => <NotebookPen color={color} size={size ?? 24} />,
        }}
      />
      <Tabs.Screen
        name="room"
        options={{
          title: '房間',
          headerShown: false,
          tabBarIcon: ({ color, size }) => <Flame color={color} size={size ?? 24} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: '個人',
          tabBarIcon: ({ color, size }) => <UserRound color={color} size={size ?? 24} />,
        }}
      />
    </Tabs>
  );
}
