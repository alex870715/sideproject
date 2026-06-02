import type { FeatureCollection } from 'geojson';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { MapFitCommand } from '../geo/gameMapRegions';
import { getMapboxStyleUrl, type MapBaseStyleId } from '../geo/mapboxStyleUrl';
import { EMPTY_EVENT_COLLECTION } from '../geo/demoWorldEvents';
import { buildMapFogPayload } from '../geo/worldFogPolygon';
import type { LatLng } from '../store/gameStore';
import { buildGlobeWebViewHtml } from './globeWebViewHtml';
import { emitMapViewScript } from './mapboxViewCommands';

type Props = {
  mapboxToken?: string;
  visitPins: LatLng[];
  lastKnown?: LatLng | null;
  visitRadiusM: number;
  eventFeatures?: FeatureCollection;
  height: number;
  projection?: 'globe' | 'mercator';
  mapFit?: MapFitCommand;
  baseStyle?: MapBaseStyleId;
  missingTokenMessage?: string;
};

export default function GlobeFogMap({
  mapboxToken,
  visitPins,
  lastKnown = null,
  visitRadiusM,
  eventFeatures,
  height,
  projection: projectionProp = 'globe',
  mapFit: mapFitProp = { type: 'world' },
  baseStyle: baseStyleProp = 'satellite',
  missingTokenMessage = 'Set EXPO_PUBLIC_MAPBOX_TOKEN.',
}: Props) {
  const webRef = useRef<WebView>(null);
  const events = eventFeatures ?? EMPTY_EVENT_COLLECTION;

  const styleUrl = useMemo(
    () => getMapboxStyleUrl(baseStyleProp),
    [baseStyleProp],
  );

  const html = useMemo(() => {
    if (!mapboxToken) return '';
    return buildGlobeWebViewHtml(mapboxToken, styleUrl);
  }, [mapboxToken, styleUrl]);

  const pushPack = useCallback(() => {
    const wv = webRef.current;
    if (!wv) return;
    const pack = buildMapFogPayload(
      visitPins,
      visitRadiusM,
      events,
      lastKnown,
    );
    const enc = JSON.stringify(JSON.stringify(pack));
    wv.injectJavaScript(
      `(function(){try{window.__applyMapPack(${enc});}catch(e){console.error(e);}})();true;`,
    );
  }, [visitPins, lastKnown, visitRadiusM, events]);

  const pushView = useCallback(() => {
    const wv = webRef.current;
    if (!wv) return;
    wv.injectJavaScript(emitMapViewScript(projectionProp, mapFitProp));
  }, [projectionProp, mapFitProp]);

  useEffect(() => {
    pushPack();
  }, [pushPack]);

  useEffect(() => {
    pushView();
  }, [pushView]);

  if (!mapboxToken) {
    return (
      <View style={[styles.fallback, { height }]}>
        <Text style={styles.fallbackText}>{missingTokenMessage}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { height }]}>
      <WebView
        key={styleUrl}
        ref={webRef}
        originWhitelist={['*']}
        source={{ html, baseUrl: 'https://api.mapbox.com/' }}
        style={styles.web}
        onLoadEnd={() => {
          pushView();
          pushPack();
        }}
        scrollEnabled={false}
        setBuiltInZoomControls={false}
        overScrollMode="never"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#243044',
    backgroundColor: '#050810',
  },
  web: { flex: 1, backgroundColor: '#050810' },
  fallback: {
    justifyContent: 'center',
    padding: 16,
    backgroundColor: '#141c2c',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#243044',
  },
  fallbackText: { color: '#8b9bb4', fontSize: 13, textAlign: 'center' },
});
