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

  // Extract all paragraphs
  const paragraphs = [];
  $('p').each((_, el) => {
    const t = $(el).text().trim();
    if (t && t.length > 50 && !t.startsWith('Tip:') && !t.includes('Looking for today') && !t.includes('Our predictions include') && !t.includes('Get free daily') && !t.includes('Last updated') && !t.includes('Updated') && !t.includes('WinFulltime Team')) {
      paragraphs.push(t);
    }
  });

  // Extract all list items
  const listItems = [];
  $('ul li, ol li').each((_, el) => {
    const t = $(el).text().trim();
    if (t && t.length > 10 && !t.includes('/blog/') && !t.includes('Looking for')) {
      listItems.push(t);
    }
  });

  // Extract all tip/strategy boxes
  const tips = [];
  $('.tip, .pro-tip, .highlight, .success, .strategy-box, .warning, .example, .example-box, .formula').each((_, el) => {
    const t = $(el).text().trim();
    if (t && t.length > 30) {
      tips.push(t);
    }
  });

  // Extract h2 headings to understand structure
  const headings = [];
  $('h2').each((_, el) => {
    const t = $(el).text().trim();
    if (t && t.length < 100) headings.push(t);
  });

  // Extract h3 headings
  const subheadings = [];
  $('h3').each((_, el) => {
    const t = $(el).text().trim();
    if (t && t.length < 100) subheadings.push(t);
  });

  // Build the summary
  const output = [];

  // Title
  output.push(title);
  output.push('');

  // Opening paragraphs (1-2 unique ones)
  const seenTexts = new Set();
  let openerCount = 0;
  for (const p of paragraphs) {
    if (openerCount >= 2) break;
    if (p.length > 60) {
      output.push(p);
      output.push('');
      seenTexts.add(p.substring(0, 50));
      openerCount++;
    }
  }

  // Core content: go section by section, extract paragraphs, lists, tips
  // We'll collect all unique meaningful content blocks
  const contentBlocks = [];

  // Method: find the content after each h2
  $('h2').each((_, h2el) => {
    const h2Text = $(h2el).text().trim();
    if (!h2Text || h2Text.length > 100) return;

    const blocks = [];
    let el = $(h2el).next();

    while (el.length && !el.is('h2')) {
      const tag = el.prop('tagName') ? el.prop('tagName').toLowerCase() : '';

      if (tag === 'p') {
        const t = el.text().trim();
        if (t && t.length > 40 && !t.startsWith('Tip:') && !t.includes('Looking for today') && !t.includes('Our predictions') && !t.includes('Last updated') && !t.includes('Updated') && !t.includes('WinFulltime Team')) {
          blocks.push({ type: 'p', text: t });
        }
      } else if (tag === 'ul' || tag === 'ol') {
        const items = [];
        el.find('li').each((_, li) => {
          const t = $(li).text().trim();
          if (t && t.length > 10 && !t.includes('/blog/')) items.push(t);
        });
        if (items.length > 0) blocks.push({ type: 'list', items });
      } else if (['div', 'blockquote'].includes(tag)) {
        // Check for special boxes
        const cls = el.attr('class') || '';
        if (cls.includes('tip') || cls.includes('pro-tip') || cls.includes('highlight') || cls.includes('success') || cls.includes('strategy-box') || cls.includes('warning') || cls.includes('example') || cls.includes('example-box') || cls.includes('formula')) {
          const t = el.text().trim();
          if (t && t.length > 25) blocks.push({ type: 'tip', text: t });
        }
      } else if (tag === 'h3') {
        const t = el.text().trim();
        if (t && t.length < 100) blocks.push({ type: 'h3', text: t });
      }

      el = el.next();
    }

    if (blocks.length > 0) {
      contentBlocks.push({ heading: h2Text, blocks });
    }
  });

  // Write sections with clean deduplication
  for (const section of contentBlocks) {
    let hasWrittenContent = false;

    for (const block of section.blocks) {
      if (block.type === 'p') {
        // Deduplicate
        const key = block.text.substring(0, 50);
        if (seenTexts.has(key)) continue;
        seenTexts.add(key);

        output.push(block.text);
        output.push('');
        hasWrittenContent = true;
      } else if (block.type === 'list') {
        const useful = block.items.filter(t => t.length > 10 && t.length < 200).slice(0, 5);
        if (useful.length > 0) {
          const line = useful.join('; ') + '.';
          const key = line.substring(0, 50);
          if (!seenTexts.has(key)) {
            seenTexts.add(key);
            output.push(line);
            output.push('');
            hasWrittenContent = true;
          }
        }
      } else if (block.type === 'tip') {
        const key = block.text.substring(0, 50);
        if (seenTexts.has(key)) continue;
        seenTexts.add(key);

        const text = block.text.length > 350 ? block.text.substring(0, 350) + '...' : block.text;
        output.push(text);
        output.push('');
        hasWrittenContent = true;
      }
    }

    // If section has no content written, find a matching paragraph
    if (!hasWrittenContent && section.heading) {
      const matching = paragraphs.find(p => 
        !seenTexts.has(p.substring(0, 50)) && p.length > 60 && 
        (p.toLowerCase().includes(section.heading.toLowerCase().substring(0, 15)) ||
         paragraphs.indexOf(p) > 1)
      );
      if (matching && !seenTexts.has(matching.substring(0, 50))) {
        seenTexts.add(matching.substring(0, 50));
        output.push(matching);
        output.push('');
      }
    }
  }

  // Add any remaining good paragraphs that weren't included
  let extraCount = 0;
  for (const p of paragraphs) {
    if (!seenTexts.has(p.substring(0, 50)) && p.length > 80 && extraCount < 4) {
      // Check not too similar to existing content
      const already = output.some(l => {
        if (l.length < 30) return false;
        const words = p.split(' ').slice(0, 8).join(' ');
        return l.includes(words);
      });
      if (!already) {
        seenTexts.add(p.substring(0, 50));
        output.push(p);
        output.push('');
        extraCount++;
      }
    }
  }

  // Add specific takeaways from list items that haven't been used
  const keyItems = listItems.filter(t => t.length > 15 && t.length < 180).slice(0, 4);
  const freshItems = keyItems.filter(t => {
    return !output.some(l => l.includes(t.substring(0, 30)));
  });

  if (freshItems.length >= 2) {
    output.push('Key points:');
    for (const item of freshItems) {
      output.push('- ' + item);
    }
    output.push('');
  }

  // Ending with section count and link
  output.push(`This comprehensive guide covers ${headings.length} key sections with detailed strategies, real examples, and actionable advice. Read the full article for the complete breakdown:`);
  output.push('');
  output.push(`Read the full article: ${canonical}`);

  const outputFile = path.join(outputDir, `${slug}.txt`);
  fs.writeFileSync(outputFile, output.join('\n'), 'utf-8');
  console.log(`✓ ${slug}`);
}

console.log(`\nDone! ${files.length} rich summaries written to ${outputDir}`);
