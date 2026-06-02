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
  const slug = file.replace('.html', '');

  const title = $('h1').first().text().trim() || $('title').text().trim();
  const canonical = `https://winfulltime.com/blog/${slug}`;

  const headings = [];
  $('h2').each((_, el) => {
    const text = $(el).text().trim();
    if (text && text.length < 100) headings.push(text);
  });

  const paragraphs = [];
  $('p').each((_, el) => {
    const text = $(el).text().trim();
    if (text && text.length > 40 && !text.startsWith('Tip:') && !text.includes('Looking for today')) {
      paragraphs.push(text);
    }
  });

  const listItems = [];
  $('ul li, ol li').each((_, el) => {
    const text = $(el).text().trim();
    if (text && text.length > 15) listItems.push(text);
  });

  const tipTexts = [];
  $('.tip, .pro-tip, .highlight, .success, .formula, .strategy-box, .warning').each((_, el) => {
    const text = $(el).text().trim();
    if (text && text.length > 30) tipTexts.push(text);
  });

  const conclusionSections = [];
  $('h2:last, h3:last').each((_, el) => {
    const text = $(el).text().trim();
    if (text && (text.toLowerCase().includes('verdict') || text.toLowerCase().includes('conclusion') || text.toLowerCase().includes('bottom line') || text.toLowerCase().includes('final') || text.toLowerCase().includes('next step'))) {
      conclusionSections.push(text);
      let next = $(el).next();
      if (next.is('p')) conclusionSections.push(next.text().trim());
    }
  });

  const intro = paragraphs.length > 0 ? paragraphs[0] : '';
  const secondPara = paragraphs.length > 1 ? paragraphs[1] : '';

  // Determine article category/angle from headings and content
  const allHeadingsText = headings.join(' ').toLowerCase();
  const isStrategy = /\b(strategy|system|method|approach)\b/.test(allHeadingsText);
  const isGuide = /\b(guide|beginner|how to|step)\b/.test(allHeadingsText);
  const isMarket = /\b(betting|market|odds|line)\b/.test(allHeadingsText) && !isGuide;
  const isAnalysis = /\b(analysis|analytics|model|statistical|math)\b/.test(allHeadingsText);
  const isComparison = /\b(compare|vs|versus|best|top)\b/.test(allHeadingsText);
  const isNigeria = slug.includes('nigeria');
  const isKenya = slug.includes('kenya');
  const isGhana = slug.includes('ghana');
  const isUganda = slug.includes('uganda');
  const isUK = slug.includes('uk') || slug.includes('uk');
  const isUSA = slug.includes('usa');

  // Build the summary as readable prose
  let summary = '';

  // Title line
  summary += `${title}\n\n`;

  // Opening hook
  if (intro) {
    summary += `${intro}\n\n`;
  }

  // Body: 2-3 paragraphs synthesizing the article's value
  if (headings.length > 0) {
    const coreTopics = headings.slice(0, 5);
    summary += `This guide breaks down ${coreTopics.length} critical areas: `;
    summary += coreTopics.join(', ');
    summary += `. Each section delivers actionable insights you can apply immediately to your betting.\n\n`;
  }

  // Key insight - pick the most valuable tip
  if (tipTexts.length > 0) {
    const bestTip = tipTexts[0];
    const truncated = bestTip.length > 250 ? bestTip.substring(0, 250) + '...' : bestTip;
    summary += `One of the most valuable insights covered: ${truncated}\n\n`;
  }

  // Concrete takeaway from list items
  if (listItems.length > 2) {
    const topItems = listItems.slice(0, 3).map(i => {
      return i.length > 120 ? i.substring(0, 120) + '...' : i;
    });
    summary += `Key takeaways include:\n`;
    topItems.forEach((item, idx) => {
      summary += `${idx + 1}. ${item}\n`;
    });
    summary += '\n';
  }

  // Add deeper paragraph if available
  if (secondPara && paragraphs.length > 2) {
    summary += `${secondPara}\n\n`;
  }

  // Curious closer — drive click
  summary += `The full article covers everything in depth — including real examples, data-backed strategies`;
  if (isStrategy) {
    summary += `, common pitfalls to avoid, and step-by-step implementation guides`;
  } else if (isGuide) {
    summary += `, platform recommendations, and practical first steps`;
  } else if (isMarket) {
    summary += `, line-by-line breakdowns, and when to use each market for maximum edge`;
  } else if (isNigeria || isKenya || isGhana || isUganda) {
    summary += `, country-specific payment methods, welcome bonuses, and exclusive rankings`;
  } else if (isUK || isUSA) {
    summary += `, regulated platform reviews, and market-specific tips`;
  } else if (isComparison) {
    summary += `, detailed comparisons, and verdicts to help you decide`;
  } else {
    summary += `, expert analysis, and actionable tips you can start using today`;
  }

  summary += `. Read the complete guide to level up your betting knowledge:\n\n`;
  summary += `Read the full article: ${canonical}`;

  const outputFile = path.join(outputDir, `${slug}.txt`);
  fs.writeFileSync(outputFile, summary, 'utf-8');
  console.log(`✓ ${slug}`);
}

console.log(`\nDone! ${files.length} Medium-ready summaries written to ${outputDir}`);
