const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const thumbDir = path.join(__dirname, '..', 'public', 'blog', 'thumbnails');
const files = fs.readdirSync(thumbDir).filter(f => f.endsWith('.png'));

(async () => {
  for (const file of files) {
    const pngPath = path.join(thumbDir, file);
    const webpPath = pngPath.replace('.png', '.webp');
    const img = sharp(pngPath);
    const meta = await img.metadata();
    await img
      .webp({ quality: 85, effort: 4 })
      .toFile(webpPath);
    // Remove PNG after successful WebP conversion
    fs.unlinkSync(pngPath);
    console.log(`Converted: ${file} → ${file.replace('.png', '.webp')} (${meta.width}x${meta.height})`);
  }
  console.log('All converted to WebP');
})();
