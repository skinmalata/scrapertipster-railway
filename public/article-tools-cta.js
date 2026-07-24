(() => {
  const mountArticleTools = () => {
    const article = document.querySelector('.container');
    if (!article || document.querySelector('[data-article-tools-cta]')) return;

    const paragraphs = [...article.querySelectorAll('p')];
    const intro = article.querySelector('.intro') || paragraphs.find((paragraph) =>
      !paragraph.classList.contains('meta') && paragraph.textContent.trim().length > 120
    );
    const fallback = article.querySelector('.related-posts');
    if (!intro && !fallback) return;

    const panel = document.createElement('aside');
    panel.className = 'article-tools-cta';
    panel.dataset.articleToolsCta = 'true';
    panel.setAttribute('aria-label', 'Put this guide into practice');
    panel.innerHTML = `
      <p class="article-tools-cta__eyebrow">Put this guide into practice</p>
      <h2 class="article-tools-cta__title">Use today’s football tools</h2>
      <p class="article-tools-cta__copy">Turn what you have learned into a more informed match decision with our free tools and daily predictions.</p>
      <div class="article-tools-cta__actions">
        <a class="article-tools-cta__action article-tools-cta__action--primary" href="/analysis.html" data-tool="match_analysis">Analyze today’s matches</a>
        <a class="article-tools-cta__action" href="/ticket-builder.html" data-tool="accumulator_builder">Build an accumulator</a>
        <a class="article-tools-cta__action" href="/" data-tool="daily_predictions">See the model’s latest predictions</a>
        <a class="article-tools-cta__action" href="/predictions/in-play" data-tool="in_play_predictions">View in-play predictions for today</a>
      </div>
      <p class="article-tools-cta__notice">For informational and entertainment purposes only. 18+ — please gamble responsibly.</p>
    `;

    if (intro) {
      intro.insertAdjacentElement('afterend', panel);
    } else {
      fallback.insertAdjacentElement('beforebegin', panel);
    }

    panel.addEventListener('click', (event) => {
      const link = event.target.closest('a[data-tool]');
      if (!link || typeof window.gtag !== 'function') return;
      window.gtag('event', 'article_tool_cta_click', {
        cta_tool: link.dataset.tool,
        cta_label: link.textContent.trim(),
        article_path: window.location.pathname
      });
    });
  };

  const style = document.createElement('style');
  style.textContent = `
    .article-tools-cta { margin: 30px 0; padding: 26px; border: 1px solid rgba(255, 36, 72, .28); border-radius: 16px; background: linear-gradient(135deg, rgba(255, 36, 72, .13), rgba(37, 44, 64, .92)); box-shadow: 0 12px 28px rgba(0, 0, 0, .14); }
    .article-tools-cta__eyebrow { margin: 0 0 8px; color: #ff6b81; font-size: 12px; font-weight: 800; letter-spacing: .1em; line-height: 1.3; text-transform: uppercase; }
    .article-tools-cta__title { margin: 0 0 8px; color: #fff; font-size: clamp(21px, 4vw, 27px); line-height: 1.2; }
    .article-tools-cta__copy { margin: 0 0 18px; color: rgba(232, 237, 245, .82); font-size: 15px; line-height: 1.6; }
    .article-tools-cta__actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .article-tools-cta__action { display: flex; align-items: center; justify-content: center; min-height: 46px; padding: 10px 14px; border: 1px solid rgba(255, 255, 255, .16); border-radius: 9px; color: #fff; font-size: 14px; font-weight: 700; line-height: 1.3; text-align: center; text-decoration: none; transition: background .2s ease, border-color .2s ease, transform .2s ease; }
    .article-tools-cta__action:hover, .article-tools-cta__action:focus-visible { background: rgba(255, 255, 255, .11); border-color: rgba(255, 255, 255, .4); color: #fff; transform: translateY(-1px); }
    .article-tools-cta__action--primary { background: linear-gradient(135deg, #ff2448, #d41a38); border-color: transparent; }
    .article-tools-cta__action--primary:hover, .article-tools-cta__action--primary:focus-visible { background: linear-gradient(135deg, #ff3c5c, #e32945); }
    .article-tools-cta__notice { margin: 15px 0 0; color: rgba(232, 237, 245, .58); font-size: 12px; line-height: 1.5; }
    @media (max-width: 560px) { .article-tools-cta { padding: 20px; } .article-tools-cta__actions { grid-template-columns: 1fr; } }
  `;
  document.head.appendChild(style);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountArticleTools, { once: true });
  } else {
    mountArticleTools();
  }
})();
