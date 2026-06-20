const path = require('path');
const fs = require('fs');

const blogDir = path.join(__dirname, '..', 'public', 'blog');
const files = fs.readdirSync(blogDir).filter(f => f.endsWith('.html') && f !== 'blog-template.html' && f !== 'index.html');

let updated = 0;
for (const file of files) {
  const filePath = path.join(blogDir, file);
  const slug = file.replace('.html', '');
  const thumbnailUrl = `https://winfulltime.com/blog/thumbnails/${slug}.webp`;

  let content = fs.readFileSync(filePath, 'utf8');

  // Replace og:image
  content = content.replace(
    /<meta property="og:image" content="[^"]+"/,
    `<meta property="og:image" content="${thumbnailUrl}"`
  );

  // Replace twitter:image if exists, otherwise add after og:image
  if (content.includes('twitter:image')) {
    content = content.replace(
      /<meta name="twitter:image" content="[^"]+"/,
      `<meta name="twitter:image" content="${thumbnailUrl}"`
    );
  } else {
    content = content.replace(
      /<meta property="og:image" content="[^"]+"/,
      `<meta property="og:image" content="${thumbnailUrl}">\n  <meta name="twitter:image" content="${thumbnailUrl}"`
    );
  }

  fs.writeFileSync(filePath, content, 'utf8');
  updated++;
  console.log(`Updated: ${file} → ${slug}.webp`);
}

console.log(`\nDone — updated ${updated} blog posts`);
