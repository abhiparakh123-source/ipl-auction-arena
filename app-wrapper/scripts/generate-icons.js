const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const pngToIco = require('png-to-ico');

const root = path.resolve(__dirname, '..');
const source = path.join(root, '..', 'client', 'public', 'brand', 'brand-round.svg');
const assets = path.join(root, 'assets');
fs.mkdirSync(assets, { recursive: true });

async function main() {
  const png = path.join(assets, 'icon.png');
  await sharp(source).resize(1024, 1024, { fit: 'contain' }).png().toFile(png);
  const ico = await pngToIco(png);
  fs.writeFileSync(path.join(assets, 'icon.ico'), ico);

  if (process.argv[2] === 'android') {
    const res = path.join(root, 'android', 'app', 'src', 'main', 'res');
    const sizes = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
    for (const [density, size] of Object.entries(sizes)) {
      const dir = path.join(res, 'mipmap-' + density);
      fs.mkdirSync(dir, { recursive: true });
      const buffer = await sharp(source).resize(size, size, { fit: 'contain' }).png().toBuffer();
      fs.writeFileSync(path.join(dir, 'ic_launcher.png'), buffer);
      fs.writeFileSync(path.join(dir, 'ic_launcher_round.png'), buffer);
    }
  }
}
main().catch((error) => { console.error(error); process.exit(1); });
