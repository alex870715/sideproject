import mapboxgl from 'mapbox-gl';
import type { FeatureCollection } from 'geojson';
import { useCallback, useEffect, useRef } from 'react';
import type { MapFitCommand } from '../geo/gameMapRegions';
import { getMapboxStyleUrl, type MapBaseStyleId } from '../geo/mapboxStyleUrl';
import { getFogInsertBeforeId } from '../geo/mapboxLabelSlot';
import type { LatLng } from '../store/gameStore';
import { buildMapFogPayload } from '../geo/worldFogPolygon';

import 'mapbox-gl/dist/mapbox-gl.css';

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

function applyProjection(map: mapboxgl.Map, mode: 'globe' | 'mercator') {
  if (mode === 'globe') {
    map.setProjection('globe');
    map.setFog({
      color: 'rgb(12, 20, 40)',
      'horizon-blend': 0.08,
      'space-color': 'rgb(8, 12, 28)',
      'star-intensity': 0.15,
    });
  } else {
    map.setProjection('mercator');
    map.setFog({
      color: 'rgb(8, 12, 22)',
      'horizon-blend': 0.02,
      'space-color': 'rgb(8, 12, 22)',
      'star-intensity': 0,
    });
  }
}

function applyMapFit(map: mapboxgl.Map, cmd: MapFitCommand) {
  switch (cmd.type) {
    case 'world':
      map.fitBounds(
        [
          [-170, -58],
          [178, 72],
        ],
        { padding: 32, duration: 1000, maxZoom: 2.05 },
      );
      break;
    case 'continent':
      map.fitBounds(
        [
          [cmd.w, cmd.s],
          [cmd.e, cmd.n],
        ],
        { padding: 44, duration: 1000 },
      );
      break;
    case 'country':
      map.flyTo({
        center: [cmd.lng, cmd.lat],
        zoom: cmd.zoom,
        duration: 1000,
      });
      break;
  }
}

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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const pinsRef = useRef(visitPins);
  pinsRef.current = visitPins;
  const lastKnownRef = useRef(lastKnown);
  lastKnownRef.current = lastKnown;
  const radiusRef = useRef(visitRadiusM);
  radiusRef.current = visitRadiusM;
  const eventsRef = useRef<FeatureCollection | undefined>(eventFeatures);
  eventsRef.current = eventFeatures;
  const projectionRef = useRef(projectionProp);
  const mapFitRef = useRef(mapFitProp);
  projectionRef.current = projectionProp;
  mapFitRef.current = mapFitProp;

  const applyOverlay = useCallback((map: mapboxgl.Map) => {
    const events = eventsRef.current ?? {
      type: 'FeatureCollection' as const,
      features: [],
    };
    const pack = buildMapFogPayload(
      pinsRef.current,
      radiusRef.current,
      events,
      lastKnownRef.current,
    );

    const beforeId = getFogInsertBeforeId(map);

    const setOrAddGeo = (
      id: string,
      data: object,
      addLayer: () => void,
    ) => {
      const src = map.getSource(id) as mapboxgl.GeoJSONSource | undefined;
      if (src) {
        src.setData(data as never);
        return;
      }
      map.addSource(id, { type: 'geojson', data: data as never });
      addLayer();
    };

    setOrAddGeo('fog-ocean', pack.fogOcean, () => {
      map.addLayer(
        {
          id: 'fog-ocean-fill',
          type: 'fill',
          source: 'fog-ocean',
          paint: {
            'fill-color': '#020617',
            'fill-opacity': 0.85,
          },
        },
        beforeId,
      );
    });

    setOrAddGeo('fog-land-unentered', pack.fogLandUnentered, () => {
      map.addLayer(
        {
          id: 'fog-land-unentered-fill',
          type: 'fill',
          source: 'fog-land-unentered',
          paint: {
            'fill-color': '#020617',
            'fill-opacity': 1,
          },
        },
        beforeId,
      );
    });

    setOrAddGeo('country-dim', pack.dim, () => {
      map.addLayer(
        {
          id: 'country-dim-fill',
          type: 'fill',
          source: 'country-dim',
          paint: {
            'fill-color': '#0f172a',
            'fill-opacity': 0.93,
          },
        },
        beforeId,
      );
    });

    setOrAddGeo('revealed-veil', pack.revealed, () => {
      map.addLayer(
        {
          id: 'revealed-tint',
          type: 'fill',
          source: 'revealed-veil',
          paint: {
            'fill-color': '#000000',
            'fill-opacity': 0,
          },
        },
        beforeId,
      );
    });

    setOrAddGeo('revealed-outlines', pack.outlines, () => {
      map.addLayer(
        {
          id: 'revealed-lines',
          type: 'line',
          source: 'revealed-outlines',
          paint: {
            'line-color': '#000000',
            'line-width': 2,
            'line-opacity': 0,
          },
        },
        beforeId,
      );
    });

    setOrAddGeo('world-events', pack.events, () => {
      map.addLayer(
        {
          id: 'events-danger-fill',
          type: 'fill',
          source: 'world-events',
          filter: ['==', ['geometry-type'], 'Polygon'],
          paint: {
            'fill-color': '#dc2626',
            'fill-opacity': 0.4,
          },
        },
        beforeId,
      );
      map.addLayer(
        {
          id: 'events-points',
          type: 'circle',
          source: 'world-events',
          filter: ['==', ['geometry-type'], 'Point'],
          paint: {
            'circle-radius': 9,
            'circle-color': '#38bdf8',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#0f172a',
          },
        },
        beforeId,
      );
      map.addLayer(
        {
          id: 'events-labels',
          type: 'symbol',
          source: 'world-events',
          filter: ['==', ['geometry-type'], 'Point'],
          layout: {
            'text-field': ['get', 'title'],
            'text-size': 12,
            'text-offset': [0, 1.4],
            'text-anchor': 'top',
            'text-max-width': 14,
          },
          paint: {
            'text-color': '#e2e8f0',
            'text-halo-color': '#0f172a',
            'text-halo-width': 1.2,
          },
        },
        beforeId,
      );
    });
  }, []);

  useEffect(() => {
    if (!mapboxToken || typeof document === 'undefined') return;
    const el = containerRef.current;
    if (!el) return;

    mapboxgl.accessToken = mapboxToken;
    const styleUrl = getMapboxStyleUrl(baseStyleProp);
    const map = new mapboxgl.Map({
      container: el,
      style: styleUrl,
      center: [121.5, 23.5],
      zoom: 1.25,
    });
    mapRef.current = map;

    map.on('style.load', () => {
      applyProjection(map, projectionRef.current);
      applyMapFit(map, mapFitRef.current);
      applyOverlay(map);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [mapboxToken, baseStyleProp, applyOverlay]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const run = () => {
      applyProjection(map, projectionProp);
      applyMapFit(map, mapFitProp);
    };
    if (map.isStyleLoaded()) run();
    else map.once('style.load', run);
  }, [projectionProp, mapFitProp]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    applyOverlay(map);
  }, [visitPins, lastKnown, visitRadiusM, eventFeatures, applyOverlay]);

  if (!mapboxToken) {
    return (
      <div
        style={{
          height,
          justifyContent: 'center',
          padding: 16,
          backgroundColor: '#141c2c',
          borderRadius: 12,
          border: '1px solid #243044',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <p style={{ color: '#8b9bb4', fontSize: 13, textAlign: 'center', margin: 0 }}>
          {missingTokenMessage}
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        height,
        borderRadius: 12,
        overflow: 'hidden',
        border: '1px solid #243044',
        background: '#050810',
      }}
    >
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
