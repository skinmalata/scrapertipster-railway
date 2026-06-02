const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const blogDir = path.join(__dirname, '..', 'public', 'blog');
const outputDir = path.join(__dirname, '..', 'medium');

const files = fs.readdirSync(blogDir)
  .filter(f => f.endsWith('.html') && f !== 'index.html' && f !== 'blog-template.html')
  .sort();

for (const file of files) {
  const html = fs.readFileSync(path.join(blogDir, file), 'utf-8');
  const $ = cheerio.load(html);

  const title = $('h1').first().text().trim() || $('title').text().trim();
  const description = $('meta[name="description"]').attr('content') || '';
  const canonical = $('link[rel="canonical"]').attr('href') || `https://winfulltime.com/blog/${file.replace('.html', '')}`;

  const headings = [];
  $('h2').each((_, el) => {
    const text = $(el).text().trim();
    if (text) headings.push(text);
  });

  const paragraphs = [];
  $('p').each((_, el) => {
    const text = $(el).text().trim();
    if (text && text.length > 30 && !text.startsWith('Tip:') && !text.startsWith('Looking for')) {
      paragraphs.push(text);
    }
  });

  const listItems = [];
  $('ul li, ol li').each((_, el) => {
    const text = $(el).text().trim();
    if (text && text.length > 15) listItems.push(text);
  });

  const tipBoxes = [];
  $('.tip, .pro-tip, .highlight, .success, .formula, .strategy-box, .example, .example-box, .warning').each((_, el) => {
    const text = $(el).text().trim();
    if (text && text.length > 20) tipBoxes.push(text);
  });

  // Build summary: start with description, then key sections, then key takeaways
  let summary = `${title}\n\n`;

  if (description) {
    summary += `${description}\n\n`;
  }

  if (headings.length > 0) {
    summary += `Key topics covered:\n`;
    headings.forEach(h => { summary += `- ${h}\n`; });
    summary += '\n';
  }

  if (tipBoxes.length > 0) {
    const keyPoints = tipBoxes.slice(0, 3).map(t => {
      return t.length > 200 ? t.substring(0, 200) + '...' : t;
    });
    summary += `Key insights:\n`;
    keyPoints.forEach(k => { summary += `- ${k}\n`; });
    summary += '\n';
  }

  if (listItems.length > 0) {
    const takeaways = listItems.slice(0, 5).map(t => {
      return t.length > 150 ? t.substring(0, 150) + '...' : t;
    });
    summary += `Key takeaways:\n`;
    takeaways.forEach(t => { summary += `- ${t}\n`; });
    summary += '\n';
  }

  if (paragraphs.length > 0) {
    const introPara = paragraphs.find(p => p.length > 40 && p.length < 300);
    if (introPara) {
      summary += `${introPara}\n\n`;
    }
  }

  summary += `Read the full article: ${canonical}`;

  const outputFile = path.join(outputDir, file.replace('.html', '.txt'));
  fs.writeFileSync(outputFile, summary, 'utf-8');
  console.log(`Written: ${outputFile}`);
}

console.log(`\nDone! Generated ${files.length} summaries in ${outputDir}`);
