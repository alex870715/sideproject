import { buildGameLabels } from '@/features/pick-food/buildGameLabels';
import { usePickFoodGameSettings } from '@/features/pick-food/usePickFoodGameSettings';
import { usePickFoodOptions } from '@/features/pick-food/usePickFoodOptions';
import { foodie } from '@/theme/foodie';
import { useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Circle, G, Path, Text as SvgText } from 'react-native-svg';

const PALETTE = ['#FF8F6B', '#FFB547', '#FFD6B8', '#FDE68A', '#93C5FD', '#86EFAC'];

const W = 280;
const CX = W / 2;
const CY = W / 2;
const R_OUT = 132;

/** 指標在正上方（−π/2）。順時針轉 R（弧度）時，輪上材料角度 θ 對到螢幕為 θ + R（SVG 逆時針為正）。對準指標：θ + R ≡ −π/2 ⇒ θ ≡ −π/2 − R。令 u = (θ + π/2) mod 2π = (−R) mod 2π，扇形角 Δ = 2π/n，則 index = ⌊u / Δ⌋。 */
function winnerIndexFromClockwiseRotationDeg(totalDeg: number, sliceCount: number): number {
  if (sliceCount <= 1) return 0;
  const twoPi = 2 * Math.PI;
  const sliceRad = twoPi / sliceCount;
  const Rdeg = ((totalDeg % 360) + 360) % 360;
  const Rrad = (Rdeg * Math.PI) / 180;
  const u = ((-Rrad % twoPi) + twoPi) % twoPi;
  return Math.min(sliceCount - 1, Math.max(0, Math.floor(u / sliceRad)));
}

/** Pie wedge from center: angles in radians, CCW from +x axis; first slice starts at top (−π/2). */
function sectorPath(startRad: number, endRad: number): string {
  const x1 = CX + R_OUT * Math.cos(startRad);
  const y1 = CY + R_OUT * Math.sin(startRad);
  const x2 = CX + R_OUT * Math.cos(endRad);
  const y2 = CY + R_OUT * Math.sin(endRad);
  const sweep = endRad - startRad;
  const largeArc = sweep > Math.PI ? 1 : 0;
  return `M ${CX} ${CY} L ${x1} ${y1} A ${R_OUT} ${R_OUT} 0 ${largeArc} 1 ${x2} ${y2} Z`;
}

/** Rotation (degrees, SVG CCW) so horizontal text runs along radius toward center; tweak for upright reading. */
function labelRotationDeg(labelX: number, labelY: number): number {
  const dx = CX - labelX;
  const dy = CY - labelY;
  let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  // Keep labels roughly upright on screen (flip when upside-down)
  if (deg > 90 || deg < -90) deg += 180;
  return deg;
}

export default function WheelScreen() {
  const { settings, ready } = usePickFoodGameSettings();
  const options = usePickFoodOptions();
  const optionsKey = options.join('\u0001');

  const labels = useMemo(() => {
    if (!ready) return ['炙燒拉麵', '鹹酥雞'];
    return buildGameLabels(settings, options);
  }, [
    ready,
    settings.sourceMode,
    settings.optionCount,
    settings.customText,
    optionsKey,
  ]);

  const [winner, setWinner] = useState<string | null>(null);
  const [spinning, setSpinning] = useState(false);
  const spinAnim = useRef(new Animated.Value(0)).current;

  const rotate = spinAnim.interpolate({
    inputRange: [0, 5400],
    outputRange: ['0deg', '5400deg'],
    extrapolate: 'extend',
  });

  const n = labels.length;
  const slice = (2 * Math.PI) / Math.max(n, 1);

  const spin = () => {
    if (spinning || n < 1) return;
    setWinner(null);
    setSpinning(true);
    const dest = 360 * (6 + Math.floor(Math.random() * 4)) + Math.random() * 360;
    spinAnim.setValue(0);
    Animated.timing(spinAnim, {
      toValue: dest,
      duration: 3600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      const idx = winnerIndexFromClockwiseRotationDeg(dest, n);
      setWinner(labels[idx]);
      setSpinning(false);
    });
  };

  const fontSize = Math.max(8, Math.min(13, Math.floor(210 / Math.max(n, 3))));

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.hint}>
        圓盤已切成 {n} 等分；菜名沿半徑往圓心書寫，每一格角度都不同。
      </Text>

      <View style={styles.wheelStack}>
        <View style={styles.pointerRow}>
          <View style={styles.pointer} />
        </View>

        {/* 邊框不要用 borderWidth 壓在 clip 容器上：RN 會縮小內容區，280×280 的轉盤會被擠偏／旋轉中心錯位 */}
        <View style={styles.wheelOuter}>
          <View style={styles.wheelClip}>
            <Animated.View style={[styles.wheelRotor, { transform: [{ rotate }] }]}>
              <Svg width={W} height={W} viewBox={`0 0 ${W} ${W}`}>
            {n === 1 ? (
              <>
                <Circle
                  cx={CX}
                  cy={CY}
                  r={R_OUT}
                  fill={PALETTE[0]}
                  stroke="#FFF8F0"
                  strokeWidth={2}
                />
                <SvgText
                  x={CX}
                  y={CY - R_OUT * 0.45}
                  fill={foodie.ink}
                  fontSize={fontSize}
                  fontWeight="700"
                  textAnchor="middle"
                  alignmentBaseline="central"
                  transform={`rotate(${labelRotationDeg(CX, CY - R_OUT * 0.45)}, ${CX}, ${CY - R_OUT * 0.45})`}>
                  {labels[0]}
                </SvgText>
              </>
            ) : (
              labels.map((label, i) => {
                const startRad = -Math.PI / 2 + i * slice;
                const endRad = -Math.PI / 2 + (i + 1) * slice;
                const midRad = startRad + slice / 2;
                const labelR = R_OUT * 0.58;
                const lx = CX + labelR * Math.cos(midRad);
                const ly = CY + labelR * Math.sin(midRad);
                const rot = labelRotationDeg(lx, ly);
                const fill = PALETTE[i % PALETTE.length];

                return (
                  <G key={`slice-${i}`}>
                    <Path
                      d={sectorPath(startRad, endRad)}
                      fill={fill}
                      stroke="#FFF8F0"
                      strokeWidth={2}
                    />
                    <SvgText
                      x={lx}
                      y={ly}
                      fill={foodie.ink}
                      fontSize={fontSize}
                      fontWeight="700"
                      textAnchor="middle"
                      alignmentBaseline="central"
                      transform={`rotate(${rot}, ${lx}, ${ly})`}>
                      {label}
                    </SvgText>
                  </G>
                );
              })
            )}
              </Svg>
            </Animated.View>
          </View>
        </View>
      </View>

      <Pressable style={[styles.btn, spinning && styles.btnDisabled]} onPress={spin} disabled={spinning}>
        <Text style={styles.btnTxt}>{spinning ? '旋轉中…' : '用力轉下去'}</Text>
      </Pressable>

      <View style={styles.resultCard}>
        <Text style={styles.resultLabel}>結果揭曉</Text>
        <Text style={styles.resultValue}>{winner ?? '— 按按鈕開始 —'}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    padding: 16,
    paddingBottom: 40,
    backgroundColor: foodie.cream,
    gap: 12,
  },
  hint: {
    fontSize: 14,
    fontWeight: '600',
    color: foodie.muted,
    lineHeight: 21,
  },
  wheelStack: {
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  pointerRow: { alignItems: 'center', marginBottom: -6, zIndex: 2 },
  pointer: {
    width: 0,
    height: 0,
    borderLeftWidth: 14,
    borderRightWidth: 14,
    borderTopWidth: 22,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: foodie.orangeDeep,
  },
  wheelOuter: {
    padding: 5,
    borderRadius: W / 2 + 5,
    backgroundColor: foodie.peach,
  },
  wheelClip: {
    width: W,
    height: W,
    borderRadius: W / 2,
    overflow: 'hidden',
    backgroundColor: '#FFF3E8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelRotor: {
    width: W,
    height: W,
    transformOrigin: 'center',
  },
  btn: {
    marginTop: 12,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: foodie.orangeDeep,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.55 },
  btnTxt: { fontSize: 17, fontWeight: '900', color: '#fff' },
  resultCard: {
    marginTop: 8,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: foodie.peach,
    backgroundColor: foodie.card,
    gap: 6,
  },
  resultLabel: { fontSize: 13, fontWeight: '800', color: foodie.muted },
  resultValue: { fontSize: 22, fontWeight: '900', color: foodie.ink },
});
