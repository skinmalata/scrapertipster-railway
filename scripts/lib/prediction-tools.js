const PREDICTION_TOOLS_CSS = `.prediction-tools{position:relative;display:flex;flex-wrap:wrap;justify-content:center;clear:both;width:100%;max-width:900px;box-sizing:border-box;margin:24px auto 8px;padding:20px 12px;gap:12px;z-index:0}
.prediction-tools .streak-btn{box-sizing:border-box;min-width:min(180px,100%);}
.prediction-tools .tool-converter{background:linear-gradient(135deg,#059669,#10b981);color:#fff}
.prediction-tools .tool-merger{background:linear-gradient(135deg,#2563eb,#3b82f6);color:#fff}
.prediction-tools .tool-splitter{background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff}
.prediction-tools .tool-inplay{background:linear-gradient(135deg,#dc2626,#ef4444);color:#fff}
.prediction-tools .tool-ticket{background:linear-gradient(135deg,#0891b2,#22d3ee);color:#fff}
.prediction-tools .tool-analyzer{background:linear-gradient(135deg,#d97706,#f59e0b);color:#fff}`;

const PREDICTION_TOOLS_NAV = `<nav class="streak-buttons prediction-tools" aria-label="More football tools">
<a class="streak-btn tool-converter" href="/converter.html"><span class="streak-icon" aria-hidden="true"></span><span class="streak-text">Code Converter</span></a>
<a class="streak-btn tool-merger" href="/code-merger.html"><span class="streak-icon" aria-hidden="true"></span><span class="streak-text">Code Merger</span></a>
<a class="streak-btn tool-splitter" href="/code-splitter.html"><span class="streak-icon" aria-hidden="true"></span><span class="streak-text">Code Splitter</span></a>
<a class="streak-btn tool-inplay" href="/predictions/in-play"><span class="streak-icon" aria-hidden="true"></span><span class="streak-text">In-Play</span></a>
<a class="streak-btn tool-ticket" href="/ticket-builder.html"><span class="streak-icon" aria-hidden="true"></span><span class="streak-text">Ticket Builder</span></a>
<a class="streak-btn tool-analyzer" href="/code-analyzer.html"><span class="streak-icon" aria-hidden="true"></span><span class="streak-text">Code Analyzer</span></a>
</nav>`;

module.exports = { PREDICTION_TOOLS_CSS, PREDICTION_TOOLS_NAV };
