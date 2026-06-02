import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  type GestureResponderEvent,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useGameStore, type LatLng } from '../store/gameStore';

const DISK_R = 58;
const KNOB_R = 20;
const DEAD_ZONE = 0.12;
const TICK_MS = 110;

/** 每幀移動距離（公尺），隨搖桿量變化；下限略大於 MIN_PIN_SPACING 以利于連續開霧 */
function stepMeters(stickMag: number): number {
  const m = Math.min(1, Math.max(0, stickMag));
  return 28 + m * 95;
}

/** 由目前點依方位角（方位 0°＝北、90°＝東）與距離（公尺）推算下一點 */
function offsetFrom(base: LatLng, bearingDeg: number, distM: number): LatLng {
  const R = 6_371_000;
  const δ = distM / R;
  const θ = (bearingDeg * Math.PI) / 180;
  const φ1 = (base.latitude * Math.PI) / 180;
  const λ1 = (base.longitude * Math.PI) / 180;
  const sinφ1 = Math.sin(φ1);
  const cosφ1 = Math.cos(φ1);
  const sinδ = Math.sin(δ);
  const cosδ = Math.cos(δ);
  const sinφ2 = sinφ1 * cosδ + cosφ1 * sinδ * Math.cos(θ);
  const φ2 = Math.asin(sinφ2);
  const y = Math.sin(θ) * sinδ * cosφ1;
  const x = cosδ - sinφ1 * sinφ2;
  const λ2 = λ1 + Math.atan2(y, x);
  return {
    latitude: (φ2 * 180) / Math.PI,
    longitude: ((((λ2 * 180) / Math.PI) + 540) % 360) - 180,
  };
}

type Props = {
  title: string;
  hint: string;
  fallbackCenter: LatLng;
};

/**
 * 開發／內測用虛擬搖桿：持續依方向移動並呼叫 visitLocation（與一般打卡相同去重規則）。
 */
export function DevMoveJoystick({ title, hint, fallbackCenter }: Props) {
  /** 搖桿單位方向；x 東為正、y 北為正（螢幕座標已換算） */
  const stickRef = useRef({ x: 0, y: 0 });
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const clampToDisk = useCallback((x: number, y: number) => {
    const max = DISK_R - KNOB_R * 0.35;
    const len = Math.hypot(x, y);
    if (len <= max || len < 1e-6) return { x, y };
    const s = max / len;
    return { x: x * s, y: y * s };
  }, []);

  const setStickFromDelta = useCallback(
    (dxEast: number, dyNorth: number) => {
      const { x, y } = clampToDisk(dxEast, dyNorth);
      stickRef.current = { x: x / DISK_R, y: y / DISK_R };
      setKnob({ x, y });
    },
    [clampToDisk],
  );

  const clearStick = useCallback(() => {
    stickRef.current = { x: 0, y: 0 };
    setKnob({ x: 0, y: 0 });
  }, []);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e: GestureResponderEvent) => {
          const { locationX, locationY } = e.nativeEvent;
          const cx = DISK_R + KNOB_R;
          const cy = DISK_R + KNOB_R;
          const dx = locationX - cx;
          const dy = cy - locationY;
          setStickFromDelta(dx, dy);
        },
        onPanResponderMove: (e: GestureResponderEvent) => {
          const { locationX, locationY } = e.nativeEvent;
          const cx = DISK_R + KNOB_R;
          const cy = DISK_R + KNOB_R;
          const dx = locationX - cx;
          const dy = cy - locationY;
          setStickFromDelta(dx, dy);
        },
        onPanResponderRelease: clearStick,
        onPanResponderTerminate: clearStick,
      }),
    [clearStick, setStickFromDelta],
  );

  useEffect(() => {
    const id = setInterval(() => {
      const { x, y } = stickRef.current;
      const mag = Math.hypot(x, y);
      if (mag < DEAD_ZONE) return;

      const nx = x / mag;
      const ny = y / mag;
      const bearing = (Math.atan2(nx, ny) * 180) / Math.PI;
      const dist = stepMeters(mag);

      const last =
        useGameStore.getState().lastKnown ?? fallbackCenter;
      const next = offsetFrom(last, bearing, dist);
      useGameStore.getState().visitLocation(next);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [fallbackCenter]);

  const pad = KNOB_R;
  const size = (DISK_R + pad) * 2;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.hint}>{hint}</Text>
      <View style={[styles.diskWrap, { width: size, height: size }]}>
        <View
          {...panResponder.panHandlers}
          style={[styles.touchPad, { width: size, height: size }]}
        >
          <View
            style={[
              styles.disk,
              {
                width: DISK_R * 2,
                height: DISK_R * 2,
                borderRadius: DISK_R,
                marginLeft: pad,
                marginTop: pad,
              },
            ]}
          />
          <View
            pointerEvents="none"
            style={[
              styles.knob,
              {
                width: KNOB_R * 2,
                height: KNOB_R * 2,
                borderRadius: KNOB_R,
                left: pad + DISK_R - KNOB_R + knob.x,
                top: pad + DISK_R - KNOB_R - knob.y,
              },
            ]}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 16,
    marginBottom: 8,
  },
  title: {
    color: '#c5d0e0',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  hint: {
    color: '#6b7c95',
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 12,
  },
  diskWrap: {
    alignSelf: 'center',
  },
  touchPad: {
    position: 'relative',
  },
  disk: {
    position: 'absolute',
    backgroundColor: '#1a2540',
    borderWidth: 2,
    borderColor: '#3d5a8a',
  },
  knob: {
    position: 'absolute',
    backgroundColor: '#7dd3fc',
    borderWidth: 2,
    borderColor: '#0ea5e9',
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 6,
    elevation: 4,
  },
});
