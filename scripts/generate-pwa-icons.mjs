import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const src = path.resolve('public/noeul-logo.jpg');
const outDir = path.resolve('public');

const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

const threshold = 245;
let minX = info.width;
let minY = info.height;
let maxX = 0;
let maxY = 0;

for (let y = 0; y < info.height; y += 1) {
  for (let x = 0; x < info.width; x += 1) {
    const i = (y * info.width + x) * info.channels;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = info.channels === 4 ? data[i + 3] : 255;
    if (a > 10 && (r < threshold || g < threshold || b < threshold)) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
}

if (maxX <= minX || maxY <= minY) {
  throw new Error('로고에서 원형 영역을 찾지 못했습니다.');
}

const diameter = Math.min(maxX - minX + 1, maxY - minY + 1);
const extract = {
  left: Math.max(0, minX),
  top: Math.max(0, minY),
  width: Math.min(diameter, info.width - minX),
  height: Math.min(diameter, info.height - minY),
};

async function writePng(filename, size) {
  const dest = path.join(outDir, filename);
  await sharp(src).extract(extract).resize(size, size, { fit: 'cover' }).png().toFile(dest);
  return dest;
}

await writePng('icon-192.png', 192);
await writePng('icon-512.png', 512);
await writePng('apple-touch-icon.png', 180);

const favicon16 = await sharp(src).extract(extract).resize(16, 16).png().toBuffer();
const favicon32 = await sharp(src).extract(extract).resize(32, 32).png().toBuffer();
const favicon48 = await sharp(src).extract(extract).resize(48, 48).png().toBuffer();
const ico = await pngToIco([favicon16, favicon32, favicon48]);
await writeFile(path.join(outDir, 'favicon.ico'), ico);

console.log('generated', {
  extract,
  source: `${info.width}x${info.height}`,
});
