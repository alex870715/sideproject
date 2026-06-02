import type { MapFitCommand } from '../geo/gameMapRegions';

/** Web 與內嵌 WebView 共用的 Mapbox 投影 / 飛行指令（字串可注入 JS） */
export function mapFitToJsLiteral(cmd: MapFitCommand): string {
  return JSON.stringify(cmd);
}

export function emitMapViewScript(projection: 'globe' | 'mercator', cmd: MapFitCommand): string {
  const p = projection === 'globe' ? 'globe' : 'mercator';
  const fit = mapFitToJsLiteral(cmd);
  return `(function(){try{
    if(window.__setProjectionMode) window.__setProjectionMode(${JSON.stringify(p)});
    if(window.__applyMapFit) window.__applyMapFit(${fit});
  }catch(e){console.error(e);}})();true;`;
}
