// Default local thumbnail generator for article publishing and manual use.
const { generatePostThumbnail, generateAllThumbnails } = require('./regenerate-legacy-thumbnails');

async function main() {
  const slug = process.argv[2];
  if (!slug) return generateAllThumbnails();
  const thumbnail = await generatePostThumbnail(slug);
  if (!thumbnail) throw new Error(`Could not generate a thumbnail for "${slug}".`);
  console.log(`Generated thumbnail for ${slug}.`);
  return thumbnail;
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.message || error);
    process.exit(1);
  });
}

module.exports = { generatePostThumbnail, generateAllThumbnails };
