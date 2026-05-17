const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const outDir = path.join(__dirname, '..', 'public');
const iconSource = fs.readFileSync(path.join(outDir, 'icon.svg'), 'utf8');

const sizes = {
  'apple-touch-icon-180.png': 180,
  'apple-touch-icon-152.png': 152,
  'icon-192.png': 192,
  'icon-512.png': 512,
};

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

for (const [name, size] of Object.entries(sizes)) {
  const resvg = new Resvg(iconSource, {
    fitTo: { mode: 'width', value: size },
    background: 'rgba(0,0,0,0)',
  });
  const png = resvg.render().asPng();
  const file = path.join(outDir, name);
  fs.writeFileSync(file, png);
  console.log('Written', file);
}

console.log('Icons generated in', outDir);
