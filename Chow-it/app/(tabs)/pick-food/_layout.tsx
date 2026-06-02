import { foodie } from '@/theme/foodie';
import { Stack } from 'expo-router';

export default function PickFoodLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: foodie.cream },
        headerTintColor: foodie.ink,
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '800' },
      }}>
      <Stack.Screen name="index" options={{ title: '不知道吃什麼？' }} />
      <Stack.Screen name="lottery" options={{ title: '口味抽抽樂' }} />
      <Stack.Screen name="wheel" options={{ title: '幸運轉盤' }} />
      <Stack.Screen name="bounce" options={{ title: '隨機跳跳' }} />
    </Stack>
  );
}
