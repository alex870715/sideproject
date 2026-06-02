/**
 * 由 icons/source-shield.svg 產生 Chrome 擴充用 PNG（16 / 48 / 128）。
 * 執行：npm run icons
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const svgPath = join(root, "icons", "source-shield.svg");
const svg = readFileSync(svgPath);

for (const size of [16, 48, 128]) {
  await sharp(svg, { density: 300 })
    .resize(size, size, { fit: "fill" })
    .png({ compressionLevel: 9 })
    .toFile(join(root, "icons", `icon${size}.png`));
}

console.log("Wrote icons/icon16.png, icon48.png, icon128.png");
