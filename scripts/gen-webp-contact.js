// Generate WebP derivatives for the contact hero from the unused monitoring room photo.
// Usage: node scripts/gen-webp-contact.js
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function main() {
  const srcJpg = path.resolve(__dirname, '../apps/web/public/fotos/monitoreo-sala-videowall.jpg');
  const out1200 = path.resolve(__dirname, '../apps/web/public/fotos/sala-monitoreo-videowall-nexara-1200.webp');
  const out1920 = path.resolve(__dirname, '../apps/web/public/fotos/sala-monitoreo-videowall-nexara-1920.webp');

  if (!fs.existsSync(srcJpg)) {
    throw new Error('Source JPG not found: ' + srcJpg);
  }

  await sharp(srcJpg)
    .resize(1200, 800, { fit: 'cover', position: 'attention' })
    .webp({ quality: 82 })
    .toFile(out1200);

  await sharp(srcJpg)
    .resize(1920, 1080, { fit: 'cover', position: 'attention' })
    .webp({ quality: 82 })
    .toFile(out1920);

  console.log('Generated:', path.basename(out1200), 'and', path.basename(out1920));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
