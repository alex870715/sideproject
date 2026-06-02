import { NegotiationRoomProvider } from '@/features/war-room/NegotiationRoomContext';
import { NegotiationRoomScreen } from '@/features/war-room/NegotiationRoomScreen';
import { foodie } from '@/theme/foodie';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

function paramJoin(v: string | string[] | undefined): string | undefined {
  if (typeof v === 'string' && v.length > 0) return v;
  if (Array.isArray(v) && typeof v[0] === 'string') return v[0];
  return undefined;
}

export default function RoomScreen() {
  const { join } = useLocalSearchParams<{ join?: string | string[] }>();
  const initialJoin = paramJoin(join);

  return (
    <NegotiationRoomProvider initialJoinCode={initialJoin}>
      <SafeAreaView style={{ flex: 1, backgroundColor: foodie.cream }} edges={['top']}>
        <NegotiationRoomScreen />
      </SafeAreaView>
    </NegotiationRoomProvider>
  );
}
