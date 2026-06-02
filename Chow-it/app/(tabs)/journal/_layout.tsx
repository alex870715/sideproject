import { foodie } from '@/theme/foodie';
import { Stack } from 'expo-router';

export default function JournalLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: foodie.cream },
        headerTintColor: foodie.ink,
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '800' },
      }}>
      <Stack.Screen name="index" options={{ title: '用餐紀錄' }} />
      <Stack.Screen name="add" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
