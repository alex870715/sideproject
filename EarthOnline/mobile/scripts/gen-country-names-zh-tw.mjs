/**
 * 將 world-countries 的 zho.common（多為簡體 / 大陸用詞）轉成 OpenCC 臺灣繁體字形，
 * 供 zh-TW 顯示；臺灣慣用譯名另見 src/geo/countryNamesZhTW.overrides.json（優先套用）。
 * 執行：npm run gen:country-tw
 */
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import OpenCC from 'opencc-js';

const require = createRequire(import.meta.url);
const countries = require('world-countries/countries.json');

const convert = OpenCC.Converter({ from: 'cn', to: 'tw' });

const out = {};
for (const c of countries) {
  const zho = c.translations?.zho?.common;
  if (typeof zho === 'string' && zho.length > 0) {
    out[c.cca2] = convert(zho);
  }
}

const dir = dirname(fileURLToPath(import.meta.url));
const outPath = join(dir, '../src/geo/countryNamesZhTW.json');
writeFileSync(outPath, `${JSON.stringify(out)}\n`, 'utf8');
console.log('Wrote', outPath, Object.keys(out).length, 'entries');
