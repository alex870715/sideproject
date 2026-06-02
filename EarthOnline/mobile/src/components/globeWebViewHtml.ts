/** Mapbox GL 內嵌頁（WebView）；由 RN inject `__applyMapPack( json )` 更新多圖層 */
export function buildGlobeWebViewHtml(
  mapboxToken: string,
  initialStyleUrl = 'mapbox://styles/mapbox/satellite-streets-v12',
): string {
  const token = mapboxToken.replace(/</g, '');
  const styleEsc = initialStyleUrl.replace(/'/g, "\\'");
  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1" />
<link href="https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css" rel="stylesheet" />
<script src="https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.js"></script>
<style>html,body,#map{margin:0;padding:0;width:100%;height:100%;background:#050810;}</style>
</head><body>
<div id="map"></div>
<script>
  mapboxgl.accessToken = '${token}';
  var map = new mapboxgl.Map({
    container: 'map',
    style: '${styleEsc}',
    center: [121.5, 23.5],
    zoom: 1.15
  });
  function setOrAddSource(id, data, appendLayers) {
    var src = map.getSource(id);
    if (src) {
      src.setData(data);
      return;
    }
    map.addSource(id, { type: 'geojson', data: data });
    appendLayers();
  }
  window.__setProjectionMode = function (mode) {
    if (!map) return;
    try {
      if (mode === 'globe') {
        map.setProjection('globe');
        map.setFog({
          color: 'rgb(12, 20, 40)',
          'horizon-blend': 0.08,
          'space-color': 'rgb(8, 12, 28)',
          'star-intensity': 0.15
        });
      } else {
        map.setProjection('mercator');
        map.setFog({
          color: 'rgb(8, 12, 22)',
          'horizon-blend': 0.02,
          'space-color': 'rgb(8, 12, 22)',
          'star-intensity': 0
        });
      }
    } catch (e) {
      console.error(e);
    }
  };
  window.__applyMapFit = function (cmd) {
    if (!map || !cmd) return;
    function go() {
      try {
        if (cmd.type === 'world') {
          map.fitBounds(
            [
              [-170, -58],
              [178, 72]
            ],
            { padding: 32, duration: 1000, maxZoom: 2.05 }
          );
        } else if (cmd.type === 'continent') {
          map.fitBounds(
            [
              [cmd.w, cmd.s],
              [cmd.e, cmd.n]
            ],
            { padding: 44, duration: 1000 }
          );
        } else if (cmd.type === 'country') {
          map.flyTo({
            center: [cmd.lng, cmd.lat],
            zoom: cmd.zoom,
            duration: 1000
          });
        }
      } catch (e) {
        console.error(e);
      }
    }
    if (map.isStyleLoaded && map.isStyleLoaded()) go();
    else map.once('style.load', go);
  };
  function fogInsertBeforeId() {
    var layers = map.getStyle().layers;
    if (!layers || !layers.length) return undefined;
    function hasTextField(layer) {
      var lo = layer.layout;
      if (!lo || typeof lo !== 'object') return false;
      return lo['text-field'] != null;
    }
    var i;
    var firstSymbol = null;
    var firstTextSymbol = null;
    for (i = 0; i < layers.length; i++) {
      if (layers[i].type !== 'symbol') continue;
      if (!firstSymbol) firstSymbol = layers[i].id;
      if (hasTextField(layers[i])) {
        firstTextSymbol = layers[i].id;
        break;
      }
    }
    if (firstTextSymbol) return firstTextSymbol;
    if (firstSymbol) return firstSymbol;
    for (i = 0; i < layers.length; i++) {
      var lid = layers[i].id.toLowerCase();
      if (lid.indexOf('label') >= 0 || lid.indexOf('place') >= 0 || lid.indexOf('poi') >= 0 || lid.indexOf('name') >= 0) {
        return layers[i].id;
      }
    }
    return undefined;
  }
  window.__applyMapPack = function (jsonStr) {
    try {
      var pack = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
      var beforeId = fogInsertBeforeId();
      setOrAddSource('fog-ocean', pack.fogOcean, function () {
        map.addLayer({
          id: 'fog-ocean-fill',
          type: 'fill',
          source: 'fog-ocean',
          paint: { 'fill-color': '#020617', 'fill-opacity': 0.85 }
        }, beforeId);
      });
      setOrAddSource('fog-land-unentered', pack.fogLandUnentered, function () {
        map.addLayer({
          id: 'fog-land-unentered-fill',
          type: 'fill',
          source: 'fog-land-unentered',
          paint: { 'fill-color': '#020617', 'fill-opacity': 1 }
        }, beforeId);
      });
      setOrAddSource('country-dim', pack.dim, function () {
        map.addLayer({
          id: 'country-dim-fill',
          type: 'fill',
          source: 'country-dim',
          paint: { 'fill-color': '#0f172a', 'fill-opacity': 0.93 }
        }, beforeId);
      });
      setOrAddSource('revealed-veil', pack.revealed, function () {
        map.addLayer({
          id: 'revealed-tint',
          type: 'fill',
          source: 'revealed-veil',
          paint: { 'fill-color': '#000000', 'fill-opacity': 0 }
        }, beforeId);
      });
      setOrAddSource('revealed-outlines', pack.outlines, function () {
        map.addLayer({
          id: 'revealed-lines',
          type: 'line',
          source: 'revealed-outlines',
          paint: { 'line-color': '#000000', 'line-width': 2, 'line-opacity': 0 }
        }, beforeId);
      });
      setOrAddSource('world-events', pack.events, function () {
        map.addLayer({
          id: 'events-danger-fill',
          type: 'fill',
          source: 'world-events',
          filter: ['==', ['geometry-type'], 'Polygon'],
          paint: { 'fill-color': '#dc2626', 'fill-opacity': 0.4 }
        }, beforeId);
        map.addLayer({
          id: 'events-points',
          type: 'circle',
          source: 'world-events',
          filter: ['==', ['geometry-type'], 'Point'],
          paint: {
            'circle-radius': 9,
            'circle-color': '#38bdf8',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#0f172a'
          }
        }, beforeId);
        map.addLayer({
          id: 'events-labels',
          type: 'symbol',
          source: 'world-events',
          filter: ['==', ['geometry-type'], 'Point'],
          layout: {
            'text-field': ['get', 'title'],
            'text-size': 12,
            'text-offset': [0, 1.4],
            'text-anchor': 'top',
            'text-max-width': 14
          },
          paint: {
            'text-color': '#e2e8f0',
            'text-halo-color': '#0f172a',
            'text-halo-width': 1.2
          }
        }, beforeId);
      });
    } catch (e) {
      console.error(e);
    }
  };
  map.on('style.load', function () {
    window.__setProjectionMode('globe');
    window.__applyMapFit({ type: 'world' });
    var WorldRect = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]]]
      }
    };
    var initial = {
      fogOcean: WorldRect,
      fogLandUnentered: { type: 'FeatureCollection', features: [] },
      dim: { type: 'FeatureCollection', features: [] },
      revealed: { type: 'FeatureCollection', features: [] },
      outlines: { type: 'FeatureCollection', features: [] },
      events: { type: 'FeatureCollection', features: [] }
    };
    window.__applyMapPack(JSON.stringify(initial));
  });
</script>
</body></html>`;
}
