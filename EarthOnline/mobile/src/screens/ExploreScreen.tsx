import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { DevMoveJoystick } from '../components/DevMoveJoystick';
import GlobeFogMap from '../components/GlobeFogMap';
import { DEMO_WORLD_EVENTS } from '../geo/demoWorldEvents';
import {
  GAME_CONTINENTS,
  buildMapFitCommand,
  listCountriesByContinent,
  type WorldMapSelection,
} from '../geo/gameMapRegions';
import {
  DEMO_TAIWAN_HW1_LOOP,
  buildTpeToThailandDemoRoute,
} from '../geo/demoRoutes';
import {
  parseGoogleLocationHistoryJson,
  parseRouteGeoJson,
} from '../geo/geoHistoryImport';
import { useAuthSession } from '../hooks/useAuthSession';
import { isDevExploreToolsVisible } from '../lib/devExploreTools';
import {
  resolveTimedCultureLine,
  SAMPLE_REGION_ACTIVITIES,
} from '../geo/regionActivities';
import { applyMysteryToMapEvents } from '../geo/worldFogPolygon';
import {
  useGameStore,
  VISIT_REVEAL_RADIUS_M,
  type LatLng,
} from '../store/gameStore';
import { useSettingsStore } from '../store/settingsStore';
import { useFogSync } from '../sync/useFogSync';

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;

/** 示範路徑每點間隔（ms）；匯入的長軌跡會另用較短間隔以免要等太久 */
const ROUTE_DEMO_STEP_MS = 450;

function routeStepMsForImport(pointCount: number): number {
  const n = Math.max(1, pointCount);
  return Math.max(80, Math.min(ROUTE_DEMO_STEP_MS, Math.floor(130_000 / n)));
}
const JITTER_MICRO_DEG = 0.008;
const JITTER_LARGE_DEG = 0.14;

const PRESET_KEYS = ['taipei101', 'kaohsiung', 'hualien', 'bangkok'] as const;
const PRESET_POINTS: Record<(typeof PRESET_KEYS)[number], LatLng> = {
  taipei101: { latitude: 25.034, longitude: 121.5645 },
  kaohsiung: { latitude: 22.639, longitude: 120.302 },
  hualien: { latitude: 23.973, longitude: 121.6014 },
  bangkok: { latitude: 13.7563, longitude: 100.5018 },
};

function formatCoord(p: LatLng | null, t: (k: string) => string) {
  if (!p) return t('common.notSet');
  return `${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}`;
}

export function ExploreScreen() {
  const { t, i18n } = useTranslation();
  const { session } = useAuthSession();
  const showDevExploreTools = useMemo(
    () => isDevExploreToolsVisible(session?.user?.email ?? null),
    [session?.user?.email],
  );

  const {
    displaySyncKey,
    supabaseConfigured,
    applySyncKey,
    regenerateLocalKey,
  } = useFogSync();
  const mapBaseStyle = useSettingsStore((s) => s.mapBaseStyle);

  const [syncInput, setSyncInput] = useState('');
  const [tickNow, setTickNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setTickNow(new Date()), 20_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setSyncInput(displaySyncKey);
  }, [displaySyncKey]);

  const [mapProjection, setMapProjection] = useState<'globe' | 'mercator'>('globe');
  const [mapSelection, setMapSelection] = useState<WorldMapSelection>({
    level: 'world',
  });

  const mapFitCommand = useMemo(
    () => buildMapFitCommand(mapSelection),
    [mapSelection],
  );

  const activeContinent =
    mapSelection.level === 'world' ? null : mapSelection.continentId;

  const countryOptions = useMemo(
    () =>
      activeContinent
        ? listCountriesByContinent(activeContinent, i18n.language)
        : [],
    [activeContinent, i18n.language],
  );

  const lastKnown = useGameStore((s) => s.lastKnown);
  const visitPins = useGameStore((s) => s.visitPins);
  const visitLocation = useGameStore((s) => s.visitLocation);
  const clearUnlocked = useGameStore((s) => s.clearUnlocked);

  const routeTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearRouteDemoTimers = useCallback(() => {
    routeTimersRef.current.forEach(clearTimeout);
    routeTimersRef.current = [];
  }, []);

  useEffect(
    () => () => {
      clearRouteDemoTimers();
    },
    [clearRouteDemoTimers],
  );

  const playDemoRoute = useCallback(
    (points: LatLng[], stepMs: number = ROUTE_DEMO_STEP_MS) => {
      clearRouteDemoTimers();
      points.forEach((p, i) => {
        const id = setTimeout(() => {
          visitLocation(p);
        }, i * stepMs);
        routeTimersRef.current.push(id);
      });
    },
    [clearRouteDemoTimers, visitLocation],
  );

  const playTaiwanHw1LoopDemo = useCallback(() => {
    playDemoRoute(DEMO_TAIWAN_HW1_LOOP);
  }, [playDemoRoute]);

  const playTpeThailandDemo = useCallback(() => {
    playDemoRoute(buildTpeToThailandDemoRoute(36));
  }, [playDemoRoute]);

  const importGoogleTakeout = useCallback(async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.length) return;
      const uri = res.assets[0].uri;
      const text = await FileSystem.readAsStringAsync(uri);
      const pts = parseGoogleLocationHistoryJson(text);
      if (!pts?.length) {
        Alert.alert(t('explore.importFailTitle'), t('explore.importGoogleFail'));
        return;
      }
      playDemoRoute(pts, routeStepMsForImport(pts.length));
      Alert.alert(t('explore.importOkTitle'), t('explore.importOkMsg', { count: pts.length }));
    } catch (e) {
      Alert.alert(
        t('explore.importFailTitle'),
        e instanceof Error ? e.message : t('common.retryLater'),
      );
    }
  }, [playDemoRoute, t]);

  const importFlightGeoJson = useCallback(async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/geo+json', 'application/json'],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.length) return;
      const uri = res.assets[0].uri;
      const text = await FileSystem.readAsStringAsync(uri);
      const pts = parseRouteGeoJson(text);
      if (!pts?.length) {
        Alert.alert(t('explore.importFailTitle'), t('explore.importGeoFail'));
        return;
      }
      playDemoRoute(pts, routeStepMsForImport(pts.length));
      Alert.alert(t('explore.importOkTitle'), t('explore.importOkMsg', { count: pts.length }));
    } catch (e) {
      Alert.alert(
        t('explore.importFailTitle'),
        e instanceof Error ? e.message : t('common.retryLater'),
      );
    }
  }, [playDemoRoute, t]);

  const mapEvents = useMemo(
    () =>
      applyMysteryToMapEvents(
        DEMO_WORLD_EVENTS,
        visitPins,
        VISIT_REVEAL_RADIUS_M,
      ),
    [visitPins],
  );

  const cultureHud = useMemo(
    () =>
      resolveTimedCultureLine(
        lastKnown,
        visitPins,
        tickNow,
        SAMPLE_REGION_ACTIVITIES,
        VISIT_REVEAL_RADIUS_M,
      ),
    [lastKnown, visitPins, tickNow],
  );

  const jitter = useCallback(() => {
    const base = lastKnown ?? PRESET_POINTS.taipei101;
    visitLocation({
      latitude: base.latitude + (Math.random() - 0.5) * JITTER_MICRO_DEG,
      longitude: base.longitude + (Math.random() - 0.5) * JITTER_MICRO_DEG,
    });
  }, [lastKnown, visitLocation]);

  const jitterLarge = useCallback(() => {
    const base = lastKnown ?? PRESET_POINTS.taipei101;
    const cosLat = Math.max(0.2, Math.cos((base.latitude * Math.PI) / 180));
    visitLocation({
      latitude: base.latitude + (Math.random() - 0.5) * JITTER_LARGE_DEG,
      longitude:
        base.longitude +
        ((Math.random() - 0.5) * JITTER_LARGE_DEG) / cosLat,
    });
  }, [lastKnown, visitLocation]);

  const copySync = useCallback(async () => {
    await Clipboard.setStringAsync(displaySyncKey);
    Alert.alert(t('explore.alertCopiedTitle'), t('explore.alertCopiedMsg'));
  }, [displaySyncKey, t]);

  const onApplySync = useCallback(async () => {
    try {
      await applySyncKey(syncInput);
      Alert.alert(t('explore.alertSyncOkTitle'), t('explore.alertSyncOkMsg'));
    } catch (e) {
      Alert.alert(
        t('explore.alertFailTitle'),
        e instanceof Error ? e.message : t('common.retryLater'),
      );
    }
  }, [applySyncKey, syncInput, t]);

  const onRegenerate = useCallback(() => {
    Alert.alert(t('explore.alertNewGameTitle'), t('explore.alertNewGameMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('explore.alertNewGameConfirm'),
        style: 'destructive',
        onPress: () => {
          void regenerateLocalKey();
        },
      },
    ]);
  }, [regenerateLocalKey, t]);

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>{t('explore.title')}</Text>
        <Text style={styles.sub}>{t('explore.subtitle')}</Text>

        {cultureHud ? (
          <View
            style={[
              styles.cultureCard,
              cultureHud.line.includes('？？？')
                ? styles.cultureMystery
                : styles.cultureReveal,
            ]}
          >
            <Text style={styles.cultureDetail}>{cultureHud.line}</Text>
            <Text style={styles.cultureHint}>{t('explore.cultureHint')}</Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('explore.fogCardTitle')}</Text>
          <Text style={styles.hint}>
            {t('explore.fogHint', { radius: VISIT_REVEAL_RADIUS_M })}
          </Text>

          <Text style={styles.mapToolbarTitle}>{t('explore.mapToolbar')}</Text>
          <View style={styles.rowWrap}>
            <Pressable
              style={({ pressed }) => [
                styles.chip,
                mapProjection === 'globe' && styles.mapChipOn,
                pressed && styles.chipPressed,
              ]}
              onPress={() => setMapProjection('globe')}
            >
              <Text style={styles.chipText}>{t('explore.globe')}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.chip,
                mapProjection === 'mercator' && styles.mapChipOn,
                pressed && styles.chipPressed,
              ]}
              onPress={() => setMapProjection('mercator')}
            >
              <Text style={styles.chipText}>{t('explore.flat2d')}</Text>
            </Pressable>
          </View>
          <Text style={styles.mapNavHint}>{t('explore.mapNavHint')}</Text>
          <View style={styles.rowWrap}>
            <Pressable
              style={({ pressed }) => [
                styles.chip,
                mapSelection.level === 'world' && styles.mapChipOn,
                pressed && styles.chipPressed,
              ]}
              onPress={() => setMapSelection({ level: 'world' })}
            >
              <Text style={styles.chipText}>{t('common.world')}</Text>
            </Pressable>
            {GAME_CONTINENTS.map((c) => (
              <Pressable
                key={c.id}
                style={({ pressed }) => [
                  styles.chip,
                  mapSelection.level !== 'world' &&
                    mapSelection.continentId === c.id &&
                    styles.mapChipOn,
                  pressed && styles.chipPressed,
                ]}
                onPress={() =>
                  setMapSelection({ level: 'continent', continentId: c.id })
                }
              >
                <Text style={styles.chipText}>
                  {t(`continents.${c.id}` as 'continents.asia')}
                </Text>
              </Pressable>
            ))}
          </View>

          {activeContinent ? (
            <>
              <Text style={styles.countryHeading}>{t('explore.countries')}</Text>
              <ScrollView
                style={styles.countryScroll}
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
              >
                <View style={styles.countryWrap}>
                  {countryOptions.map((co) => {
                    const sel =
                      mapSelection.level === 'country' &&
                      mapSelection.iso2 === co.iso2;
                    return (
                      <Pressable
                        key={co.iso2}
                        style={({ pressed }) => [
                          styles.countryChip,
                          sel && styles.mapChipOn,
                          pressed && styles.chipPressed,
                        ]}
                        onPress={() =>
                          setMapSelection({
                            level: 'country',
                            continentId: activeContinent,
                            iso2: co.iso2,
                          })
                        }
                      >
                        <Text
                          style={styles.countryChipText}
                          numberOfLines={1}
                        >
                          {co.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>
            </>
          ) : null}

          <GlobeFogMap
            mapboxToken={MAPBOX_TOKEN}
            visitPins={visitPins}
            lastKnown={lastKnown}
            visitRadiusM={VISIT_REVEAL_RADIUS_M}
            eventFeatures={mapEvents}
            height={280}
            projection={mapProjection}
            mapFit={mapFitCommand}
            baseStyle={mapBaseStyle}
            missingTokenMessage={t('mapFallback.needToken')}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('explore.syncTitle')}</Text>
          {!supabaseConfigured ? (
            <Text style={styles.warn}>{t('explore.syncMissing')}</Text>
          ) : (
            <Text style={styles.hint}>{t('explore.syncHint')}</Text>
          )}
          <Text style={styles.monoMuted}>
            {t('explore.current')}：{displaySyncKey || t('common.loading')}
          </Text>
          <TextInput
            value={syncInput}
            onChangeText={setSyncInput}
            placeholder={t('explore.syncPlaceholder')}
            placeholderTextColor="#5a6a82"
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={styles.rowWrap}>
            <Pressable
              style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
              onPress={onApplySync}
            >
              <Text style={styles.chipText}>{t('explore.applySync')}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
              onPress={copySync}
            >
              <Text style={styles.chipText}>{t('explore.copySync')}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.chip,
                styles.chipDanger,
                pressed && styles.chipPressed,
              ]}
              onPress={onRegenerate}
            >
              <Text style={styles.chipText}>{t('explore.newSync')}</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('explore.coordsTitle')}</Text>
          <Text style={styles.mono}>{formatCoord(lastKnown, t)}</Text>
          <Text style={styles.hint}>{t('explore.coordsHint')}</Text>
        </View>

        <Text style={styles.section}>{t('explore.simWalk')}</Text>
        <Text style={styles.hint}>{t('explore.simWalkHint')}</Text>
        <View style={styles.rowWrap}>
          {PRESET_KEYS.map((key) => (
            <Pressable
              key={key}
              style={({ pressed }) => [
                styles.chip,
                pressed && styles.chipPressed,
              ]}
              onPress={() => visitLocation(PRESET_POINTS[key])}
            >
              <Text style={styles.chipText}>
                {t(`explore.presets.${key}` as 'explore.presets.taipei101')}
              </Text>
            </Pressable>
          ))}
          <Pressable
            style={({ pressed }) => [
              styles.chip,
              styles.chipAlt,
              pressed && styles.chipPressed,
            ]}
            onPress={jitter}
          >
            <Text style={styles.chipText}>{t('explore.jitter')}</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.chip,
              styles.chipAlt,
              pressed && styles.chipPressed,
            ]}
            onPress={jitterLarge}
          >
            <Text style={styles.chipText}>{t('explore.jitterLarge')}</Text>
          </Pressable>
        </View>

        {showDevExploreTools ? (
          <>
            <View style={styles.devBanner}>
              <View style={styles.devBadge}>
                <Text style={styles.devBadgeText}>{t('explore.devBadge')}</Text>
              </View>
              <Text style={styles.devBannerBody}>{t('explore.devToolsBanner')}</Text>
            </View>

            <DevMoveJoystick
              title={t('explore.devJoystickTitle')}
              hint={t('explore.devJoystickHint')}
              fallbackCenter={lastKnown ?? PRESET_POINTS.taipei101}
            />

            <Text style={[styles.section, styles.sectionSp]}>
              {t('explore.demoRoutesSection')}
            </Text>
            <Text style={styles.hint}>
              {t('explore.demoRoutesHint', { ms: ROUTE_DEMO_STEP_MS })}
            </Text>
            <View style={styles.rowWrap}>
              <Pressable
                style={({ pressed }) => [
                  styles.chip,
                  styles.chipAlt,
                  pressed && styles.chipPressed,
                ]}
                onPress={playTaiwanHw1LoopDemo}
              >
                <Text style={styles.chipText}>{t('explore.demoHw1Loop')}</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.chip,
                  styles.chipAlt,
                  pressed && styles.chipPressed,
                ]}
                onPress={playTpeThailandDemo}
              >
                <Text style={styles.chipText}>{t('explore.demoFlyThailand')}</Text>
              </Pressable>
            </View>

            <Text style={[styles.section, styles.sectionSp]}>
              {t('explore.importSection')}
            </Text>
            <Text style={styles.hint}>{t('explore.importHint')}</Text>
            <View style={styles.rowWrap}>
              <Pressable
                style={({ pressed }) => [
                  styles.chip,
                  styles.chipAlt,
                  pressed && styles.chipPressed,
                ]}
                onPress={() => void importGoogleTakeout()}
              >
                <Text style={styles.chipText}>{t('explore.importGoogleTakeout')}</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.chip,
                  styles.chipAlt,
                  pressed && styles.chipPressed,
                ]}
                onPress={() => void importFlightGeoJson()}
              >
                <Text style={styles.chipText}>{t('explore.importGeoJson')}</Text>
              </Pressable>
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.danger,
                pressed && styles.dangerPressed,
              ]}
              onPress={clearUnlocked}
            >
              <Text style={styles.dangerText}>{t('explore.clearPins')}</Text>
            </Pressable>
          </>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {t('explore.pinsTitle', { count: visitPins.length })}
          </Text>
          {visitPins.length === 0 ? (
            <Text style={styles.monoMuted}>{t('explore.pinsEmpty')}</Text>
          ) : (
            visitPins.map((p, i) => (
              <Text
                key={`${p.latitude.toFixed(5)}-${p.longitude.toFixed(5)}-${i}`}
                style={styles.cell}
              >
                {p.latitude.toFixed(5)}, {p.longitude.toFixed(5)}
              </Text>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0b1220',
  },
  scroll: {
    padding: 20,
    paddingTop: 56,
    paddingBottom: 40,
  },
  title: {
    color: '#e8eef8',
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 6,
  },
  sub: {
    color: '#8b9bb4',
    fontSize: 15,
    marginBottom: 20,
  },
  cultureCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  cultureMystery: {
    backgroundColor: '#1a1525',
    borderColor: '#7c3aed',
  },
  cultureReveal: {
    backgroundColor: '#12221a',
    borderColor: '#34d399',
  },
  cultureDetail: {
    color: '#f1f5f9',
    fontSize: 20,
    fontWeight: '700',
  },
  cultureHint: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 10,
    lineHeight: 16,
  },
  section: {
    color: '#c5d0e0',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
    marginTop: 8,
  },
  sectionSp: {
    marginTop: 18,
  },
  card: {
    backgroundColor: '#141c2c',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#243044',
  },
  cardTitle: {
    color: '#e8eef8',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  hint: {
    color: '#6b7c95',
    fontSize: 12,
    marginTop: 4,
    marginBottom: 10,
    lineHeight: 18,
  },
  mapToolbarTitle: {
    color: '#c5d0e0',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 4,
  },
  mapNavHint: {
    color: '#6b7c95',
    fontSize: 11,
    marginTop: 4,
    marginBottom: 10,
    lineHeight: 16,
  },
  mapChipOn: {
    backgroundColor: '#1e40af',
    borderWidth: 1,
    borderColor: '#7dd3fc',
  },
  countryHeading: {
    color: '#c5d0e0',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 8,
  },
  countryScroll: { maxHeight: 200, marginBottom: 10 },
  countryWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  countryChip: {
    backgroundColor: '#1e3a5f',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 4,
  },
  countryChipText: {
    color: '#e8eef8',
    fontSize: 12,
    fontWeight: '600',
    maxWidth: 148,
  },
  warn: {
    color: '#fcd34d',
    fontSize: 12,
    marginBottom: 10,
    lineHeight: 18,
  },
  mono: {
    color: '#7dd3fc',
    fontFamily: 'Menlo',
    fontSize: 14,
  },
  monoMuted: {
    color: '#5a6a82',
    fontFamily: 'Menlo',
    fontSize: 12,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#0b1220',
    borderWidth: 1,
    borderColor: '#243044',
    borderRadius: 10,
    padding: 12,
    color: '#e8eef8',
    fontFamily: 'Menlo',
    fontSize: 13,
    marginBottom: 12,
  },
  rowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  chip: {
    backgroundColor: '#1e3a5f',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  chipAlt: {
    backgroundColor: '#2d4a3e',
  },
  chipDanger: {
    backgroundColor: '#3d2030',
  },
  chipPressed: {
    opacity: 0.85,
  },
  chipText: {
    color: '#e8eef8',
    fontSize: 14,
    fontWeight: '600',
  },
  danger: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#3d2030',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#6b3045',
  },
  dangerPressed: {
    opacity: 0.9,
  },
  dangerText: {
    color: '#f9a8d4',
    fontSize: 14,
    fontWeight: '600',
  },
  cell: {
    color: '#a5b4fc',
    fontFamily: 'Menlo',
    fontSize: 12,
    marginTop: 6,
  },
  devBanner: {
    backgroundColor: '#1a1525',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#7c3aed',
  },
  devBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#7c3aed',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  devBadgeText: {
    color: '#f5f3ff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  devBannerBody: {
    color: '#cbd5e1',
    fontSize: 12,
    lineHeight: 18,
  },
});
