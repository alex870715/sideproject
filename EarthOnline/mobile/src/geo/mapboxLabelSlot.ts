import type mapboxgl from 'mapbox-gl';

function layerHasTextField(layer: { type: string; layout?: object }): boolean {
  const layout = layer.layout;
  if (!layout || typeof layout !== 'object') return false;
  return (
    'text-field' in layout &&
    (layout as { 'text-field'?: unknown })['text-field'] != null
  );
}

/**
 * 取得應插在「地名／國名 symbol 之下」的 beforeId，讓迷霧 fill 不會蓋住標籤。
 * 優先選第一個帶 text-field 的 symbol（多為行政／地名）；否則退為任一 symbol。
 */
export function getFogInsertBeforeId(map: mapboxgl.Map): string | undefined {
  const layers = map.getStyle().layers;
  if (!layers?.length) return undefined;

  let firstSymbol: string | undefined;
  let firstTextSymbol: string | undefined;

  for (const layer of layers) {
    if (layer.type !== 'symbol') continue;
    if (!firstSymbol) firstSymbol = layer.id;
    if (layerHasTextField(layer as { type: string; layout?: object }) && !firstTextSymbol) {
      firstTextSymbol = layer.id;
      break;
    }
  }

  const anchor = firstTextSymbol ?? firstSymbol;
  if (anchor) return anchor;

  for (const layer of layers) {
    const id = layer.id.toLowerCase();
    if (
      id.includes('label') ||
      id.includes('place') ||
      id.includes('poi') ||
      id.includes('name')
    ) {
      return layer.id;
    }
  }
  return undefined;
}
