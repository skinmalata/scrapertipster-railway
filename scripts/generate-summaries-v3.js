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

  // --- Extract all sections with their content ---
  const sections = [];

  $('h2').each((_, el) => {
    const h2 = $(el).text().trim();
    if (!h2 || h2.length > 100) return;
    
    let content = [];
    let next = $(el).next();
    
    while (next.length && !next.is('h2')) {
      const tag = next.prop('tagName') ? next.prop('tagName').toLowerCase() : '';
      
      if (tag === 'p') {
        const t = next.text().trim();
        if (t && t.length > 20 && !t.startsWith('Tip:') && !t.includes('Looking for today')) {
          content.push({ type: 'p', text: t });
        }
      } else if (tag === 'ul' || tag === 'ol') {
        const items = [];
        next.find('li').each((_, li) => {
          const t = $(li).text().trim();
          if (t && t.length > 10) items.push(t);
        });
        if (items.length > 0) content.push({ type: 'list', items });
      } else if (['div', 'blockquote'].includes(tag) && (next.hasClass('tip') || next.hasClass('pro-tip') || next.hasClass('highlight') || next.hasClass('success') || next.hasClass('formula') || next.hasClass('strategy-box') || next.hasClass('example') || next.hasClass('example-box') || next.hasClass('warning'))) {
        const t = next.text().trim();
        if (t && t.length > 20) content.push({ type: 'tip', text: t });
      } else if (tag === 'h3') {
        const t = next.text().trim();
        if (t && t.length < 100) content.push({ type: 'h3', text: t });
      }
      
      next = next.next();
    }
    
    sections.push({ heading: h2, content });
  });

  // --- Also get ALL paragraphs directly ---
  const allParagraphs = [];
  $('p').each((_, el) => {
    const t = $(el).text().trim();
    if (t && t.length > 50 && !t.startsWith('Tip:') && !t.includes('Looking for today') && !t.includes('Read the full article')) {
      allParagraphs.push(t);
    }
  });

  const allListItems = [];
  $('ul li, ol li').each((_, el) => {
    const t = $(el).text().trim();
    if (t && t.length > 10 && !t.includes('/blog/')) allListItems.push(t);
  });

  const allTips = [];
  $('.tip, .pro-tip, .highlight, .success, .formula, .strategy-box, .warning, .example, .example-box').each((_, el) => {
    const t = $(el).text().trim();
    const tag = $(el).prop('tagName').toLowerCase();
    if (t && t.length > 25 && tag !== 'div') {
      allTips.push(t);
    } else if (t && t.length > 25) {
      allTips.push(t);
    }
  });

  // --- Build the rich summary ---
  const lines = [];

  // Title
  lines.push(title);
  lines.push('');

  // Opening: first 2 substantial paragraphs
  let parasUsed = 0;
  const usedParas = new Set();
  for (const p of allParagraphs) {
    if (p.length > 60 && parasUsed < 2) {
      lines.push(p);
      lines.push('');
      usedParas.add(p);
      parasUsed++;
    }
  }

  // Core body: go through sections and synthesize
  for (let i = 0; i < Math.min(sections.length, 7); i++) {
    const sec = sections[i];
    
    // Write the section heading as context
    lines.push(sec.heading);
    lines.push('');
    
    let writtenContent = false;
    
    for (const item of sec.content) {
      if (item.type === 'p') {
        lines.push(item.text);
        lines.push('');
        writtenContent = true;
      } else if (item.type === 'list' && item.items.length > 0) {
        // Present list items as a flowing sentence
        const useful = item.items.filter(t => t.length > 15 && t.length < 200).slice(0, 4);
        if (useful.length > 0) {
          lines.push(useful.join('; ') + '.');
          lines.push('');
          writtenContent = true;
        }
      } else if (item.type === 'tip' && item.text.length > 30) {
        // Only include if distinctive enough
        if (!allParagraphs.some(p => item.text.includes(p.substring(0, 30)))) {
          const truncated = item.text.length > 300 ? item.text.substring(0, 300) + '...' : item.text;
          lines.push(truncated);
          lines.push('');
          writtenContent = true;
        }
      }
    }
    
    // If nothing written from structured content, add a paragraph from raw pool
    if (!writtenContent) {
      const extraP = allParagraphs.find(p => 
        p.length > 60 && !usedParas.has(p) && 
        (p.toLowerCase().includes(sec.heading.toLowerCase().substring(0, 10)) || 
         i === 0 || i === sections.length - 1)
      );
      if (extraP) {
        lines.push(extraP);
        lines.push('');
        usedParas.add(extraP);
      }
    }
  }

  // Add a few additional relevant paragraphs from the middle of the article
  let extraCount = 0;
  for (const p of allParagraphs) {
    if (!usedParas.has(p) && p.length > 80 && extraCount < 3) {
      // Avoid repetitive content
      const already = lines.some(l => l.includes(p.substring(0, 40)));
      if (!already) {
        lines.push(p);
        lines.push('');
        usedParas.add(p);
        extraCount++;
      }
    }
  }

  // Add a batch of key specific takeaways as a block
  if (allListItems.length > 5) {
    const uniqueItems = [];
    for (const item of allListItems) {
      if (item.length > 15 && item.length < 180 && !uniqueItems.some(u => u.includes(item.substring(0, 25)) || item.includes(u.substring(0, 25)))) {
        uniqueItems.push(item);
      }
      if (uniqueItems.length >= 6) break;
    }
    if (uniqueItems.length > 0) {
      lines.push('Key details:');
      uniqueItems.forEach(t => lines.push('- ' + t));
      lines.push('');
    }
  }

  // Add closing that frames the article depth
  const sectionCount = sections.length;
  lines.push(`This article covers ${sectionCount} sections in total with detailed breakdowns, examples, and actionable strategies. Read the full guide for the complete picture:`);
  lines.push('');
  lines.push(`Read the full article: ${canonical}`);

  const outputFile = path.join(outputDir, `${slug}.txt`);
  fs.writeFileSync(outputFile, lines.join('\n'), 'utf-8');
  console.log(`✓ ${slug}`);
}

console.log(`\nDone! ${files.length} long-form summaries written to ${outputDir}`);
