const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const projectRoot = path.join(__dirname, '..');
const androidResRoot = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res');

const splashSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-labelledby="title desc">
  <title id="title">ISO Grid splash screen</title>
  <desc id="desc">Dark blue splash screen with the ISO Grid shield and checkmark logo, app name, and loading text.</desc>
  <defs>
    <linearGradient id="bg" x1="96" y1="56" x2="928" y2="960" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#07101d" />
      <stop offset="1" stop-color="#0f3b53" />
    </linearGradient>
    <linearGradient id="logoBg" x1="360" y1="280" x2="664" y2="744" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#f8fafc" />
      <stop offset="1" stop-color="#dbeafe" />
    </linearGradient>
    <linearGradient id="check" x1="420" y1="468" x2="640" y2="636" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#34d399" />
      <stop offset="1" stop-color="#22c55e" />
    </linearGradient>
    <filter id="shadow" x="0" y="0" width="1024" height="1024" filterUnits="userSpaceOnUse">
      <feDropShadow dx="0" dy="28" stdDeviation="30" flood-color="#020617" flood-opacity="0.34" />
    </filter>
  </defs>
  <rect width="1024" height="1024" rx="180" fill="url(#bg)" />
  <circle cx="220" cy="244" r="102" fill="#38bdf8" opacity="0.10" />
  <circle cx="808" cy="794" r="132" fill="#22c55e" opacity="0.10" />
  <circle cx="836" cy="226" r="58" fill="#38bdf8" opacity="0.12" />
  <g filter="url(#shadow)">
    <path d="M512 212c82 56 164 76 236 90v168c0 154-100 258-236 294-136-36-236-140-236-294V302c72-14 154-34 236-90Z" fill="url(#logoBg)" />
    <path d="M512 258c-63 42-128 58-184 66v128c0 96 60 162 184 192 124-30 184-96 184-192V324c-56-8-121-24-184-66Z" fill="#0f172a" opacity="0.07" />
    <path d="M440 492l58 58 116-140" fill="none" stroke="url(#check)" stroke-width="56" stroke-linecap="round" stroke-linejoin="round" />
  </g>
  <text x="512" y="824" text-anchor="middle" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="58" font-weight="800" fill="#f8fafc">ISO Grid</text>
  <text x="512" y="876" text-anchor="middle" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="28" font-weight="500" fill="#cbd5e1">Loading secure workspace...</text>
</svg>`;

const sizes = {
  'drawable/splash.png': 1024,
  'drawable-port-mdpi/splash.png': 480,
  'drawable-port-hdpi/splash.png': 720,
  'drawable-port-xhdpi/splash.png': 960,
  'drawable-port-xxhdpi/splash.png': 1440,
  'drawable-port-xxxhdpi/splash.png': 1920,
  'drawable-land-mdpi/splash.png': 480,
  'drawable-land-hdpi/splash.png': 720,
  'drawable-land-xhdpi/splash.png': 960,
  'drawable-land-xxhdpi/splash.png': 1440,
  'drawable-land-xxxhdpi/splash.png': 1920,
};

for (const [relativePath, size] of Object.entries(sizes)) {
  const outputPath = path.join(androidResRoot, relativePath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const resvg = new Resvg(splashSvg, {
    fitTo: { mode: 'width', value: size },
    background: 'rgba(0,0,0,0)',
  });
  fs.writeFileSync(outputPath, resvg.render().asPng());
  console.log('Written', outputPath);
}

console.log('Android splash generated.');