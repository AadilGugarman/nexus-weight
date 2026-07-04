// One-off/regeneratable PWA icon builder — rasterizes brand-matched SVG
// (ink background + amber weight-scale badge, matching Splash/StatusBar
// (#1c1207) and the default "lime" theme's actual amber accent) into the
// PNG sizes required by the web manifest + Apple touch icon.
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const INK = '#1c1207';
const AMBER = '#f59e0b';
const AMBER_DEEP = '#b45309';

// Weight-scale glyph, viewBox 0-100, centered. Reused/scaled version of the
// receipt logo mark in src/lib/share.ts's WEIGHT_ICON.
const GLYPH = `
  <circle cx="50" cy="21" r="6" fill="#ffffff"/>
  <path d="M17 33h66" stroke="#ffffff" stroke-width="7" stroke-linecap="round"/>
  <path d="M17 33 L4 58a17 17 0 0 0 26 0z" fill="none" stroke="#ffffff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M83 33 L70 58a17 17 0 0 0 26 0z" fill="none" stroke="#ffffff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M33 84h34" stroke="#ffffff" stroke-width="7" stroke-linecap="round"/>
  <path d="M50 33v51" stroke="#ffffff" stroke-width="7" stroke-linecap="round"/>
`;

/** badgeScale: fraction of the 512-frame the rounded badge square occupies. */
function svgAny(size, badgeScale = 0.72) {
  const b = size * badgeScale;
  const off = (size - b) / 2;
  const r = b * 0.22;
  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" fill="${INK}"/>
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${AMBER_DEEP}"/>
        <stop offset="1" stop-color="${AMBER}"/>
      </linearGradient>
    </defs>
    <rect x="${off}" y="${off}" width="${b}" height="${b}" rx="${r}" fill="url(#g)"/>
    <g transform="translate(${off + b * 0.14}, ${off + b * 0.14}) scale(${(b * 0.72) / 100})">
      ${GLYPH}
    </g>
  </svg>`;
}

/** Maskable: full-bleed background, badge content kept inside the ~80% safe circle. */
function svgMaskable(size) {
  return svgAny(size, 0.5);
}

async function render(svg, size, outPath) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(outPath);
  console.log('wrote', outPath);
}

const outDir = fileURLToPath(new URL('../public/', import.meta.url));
await mkdir(outDir, { recursive: true });
const p = (name) => path.join(outDir, name);

await render(svgAny(192), 192, p('pwa-192.png'));
await render(svgAny(512), 512, p('pwa-512.png'));
await render(svgMaskable(512), 512, p('maskable-512.png'));
await render(svgAny(180), 180, p('apple-touch-icon.png'));
// Reference copy only — kept out of public/ so it's never swept into the PWA precache.
await writeFile(new URL('icon-source.svg', import.meta.url), svgAny(512).trim());
console.log('done');
