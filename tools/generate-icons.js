const fs = require('fs');
const path = require('path');

// Small placeholder 1x1 PNG (transparent). Replace with real assets later.
const placeholder = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==';

const icons = {
  'apple-touch-icon-180.png': placeholder,
  'apple-touch-icon-152.png': placeholder,
  'icon-192.png': placeholder,
  'icon-512.png': placeholder,
};

const outDir = path.join(__dirname, '..', 'public');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

for (const [name, b64] of Object.entries(icons)) {
  const file = path.join(outDir, name);
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
  console.log('Written', file);
}

console.log('Placeholder icons generated in', outDir);
