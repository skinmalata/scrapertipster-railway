/* WinFulltime booking code tools — booking code splitter and booking code
   merger, both targeting SportyBet.

   The whole UI is rendered from JS into [data-bct-root] so the same tool can be
   embedded on the converter page and on the standalone tool pages without the
   markup drifting between copies.

   Attributes on the mount node:
     data-bct-api     API base URL (defaults to window.WFT_API)
     data-bct-country id of an existing country input to reuse; when absent the
                      tool renders its own compact country field
     data-bct-tab     "split" or "merge" to preselect a tab
*/
(function () {
  'use strict';

  var root = document.querySelector('[data-bct-root]');
  if (!root) return;

  var API_BASE = root.getAttribute('data-bct-api') || window.WFT_API || 'https://winfulltime-api.onrender.com';
  var MAX_LEGS = 30;
  var BET9JA_PROXY = window.WFT_BET9JA_PROXY || 'https://bet9ja-proxy.mesigotochukwu.workers.dev';

  var BOOKMAKERS = [
    ['sportybet', 'SportyBet'],
    ['msport', 'MSport'],
    ['bet9ja', 'Bet9ja'],
    ['betway', 'Betway'],
    ['betking', 'BetKing'],
    ['bangbet', 'Bangbet'],
    ['betpawa', 'betPawa']
  ];
  var LABELS = {};
  BOOKMAKERS.forEach(function (b) { LABELS[b[0]] = b[1]; });

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function bookmakerOptions() {
    return BOOKMAKERS.map(function (b) {
      return '<option value="' + esc(b[0]) + '">' + esc(b[1]) + '</option>';
    }).join('');
  }

  var sizeOptions = '';
  for (var n = 2; n <= MAX_LEGS; n++) {
    sizeOptions += '<option value="' + n + '"' + (n === 3 ? ' selected' : '') + '>' + n + ' selections</option>';
  }

  var externalCountry = document.getElementById(root.getAttribute('data-bct-country') || '');

  root.className = (root.className ? root.className + ' ' : '') + 'bct-root';
  root.innerHTML = [
    '<div class="bct-card">',
    '  <h2 class="bct-title"><span class="bct-step">&#128204;</span> <span data-bct-heading>Split or Merge Booking Codes</span></h2>',
    '  <p class="bct-sub" data-bct-sub>Break one long code into several smaller SportyBet codes, or combine several codes into a single SportyBet code.</p>',
    '  <div class="bct-tabs" role="tablist" aria-label="Split or merge booking codes">',
    '    <button class="bct-tab" type="button" role="tab" data-bct-tabbtn="split" aria-selected="true" aria-controls="bctPanelSplit">&#128204; Split a code</button>',
    '    <button class="bct-tab" type="button" role="tab" data-bct-tabbtn="merge" aria-selected="false" aria-controls="bctPanelMerge">&#129529; Merge codes</button>',
    '  </div>',

    '  <div id="bctPanelSplit" role="tabpanel">',
    '    <div class="bct-row">',
    '      <div class="bct-field">',
    '        <label for="bctSplitFrom">Code is from</label>',
    '        <select id="bctSplitFrom">' + bookmakerOptions() + '</select>',
    '      </div>',
    '      <div class="bct-field">',
    '        <label for="bctSplitSize">Selections per code</label>',
    '        <select id="bctSplitSize">' + sizeOptions + '</select>',
    '      </div>',
    '    </div>',
    '    <div class="bct-field">',
    '      <label for="bctSplitCode">Booking Code</label>',
    '      <input type="text" id="bctSplitCode" class="bct-input bct-code" placeholder="e.g. 8C4K2X..." autocomplete="off" spellcheck="false">',
    '      <p class="bct-hint">Choose how many selections go into each new code. Smaller groups keep more of your slip on a single result; a larger group stays closer to the original.</p>',
    '    </div>',
    externalCountry ? '' : countryField('bctSplitCountry'),
    '    <div class="bct-actions">',
    '      <button class="bct-btn" type="button" data-bct-split>&#128204; Split into SportyBet Codes</button>',
    '    </div>',
    '    <div class="bct-status" data-bct-splitstatus role="status" aria-live="polite"></div>',
    '    <div class="bct-loading" data-bct-splitloading>Reading the code and splitting it&#8230;</div>',
    '    <div data-bct-splitresult hidden>',
    '      <p class="bct-hint" data-bct-splitmeta style="margin-top:16px;font-size:13.5px;"></p>',
    '      <div class="bct-parts" data-bct-splitparts></div>',
    '      <div class="bct-actions" style="margin-top:14px;">',
    '        <button class="bct-btn is-secondary" type="button" data-bct-copyall>&#128203; Copy all codes</button>',
    '      </div>',
    '    </div>',
    '  </div>',

    '  <div id="bctPanelMerge" role="tabpanel" hidden>',
    '    <div class="bct-field" style="max-width:340px;">',
    '      <label for="bctMergeFrom">Codes are from</label>',
    '      <select id="bctMergeFrom">' + bookmakerOptions() + '</select>',
    '    </div>',
    '    <div class="bct-field">',
    '      <label for="bctMergeCodes">Booking Codes</label>',
    '      <textarea id="bctMergeCodes" class="bct-input" rows="6" placeholder="Paste two or more codes, one per line" spellcheck="false" autocomplete="off"></textarea>',
    '      <p class="bct-hint">One code per line, at least two. To mix bookmakers in a single merge, prefix a line with the bookmaker and a vertical bar, for example <code>bet9ja | 8C4K2X</code>. Repeated selections are merged into one.</p>',
    '    </div>',
    externalCountry ? '' : countryField('bctMergeCountry'),
    '    <div class="bct-actions">',
    '      <button class="bct-btn" type="button" data-bct-merge>&#129529; Merge into One SportyBet Code</button>',
    '    </div>',
    '    <div class="bct-status" data-bct-mergestatus role="status" aria-live="polite"></div>',
    '    <div class="bct-loading" data-bct-mergeloading>Reading every code and merging them&#8230;</div>',
    '    <div class="bct-result" data-bct-mergeresult hidden>',
    '      <p class="bct-hint" data-bct-mergemeta style="margin:0 0 12px;font-size:13.5px;"></p>',
    '      <div class="bct-result-row">',
    '        <span class="bct-result-code" data-bct-mergecode>--</span>',
    '        <button class="bct-copy" type="button" data-bct-mergecopy>Copy</button>',
    '      </div>',
    '      <ul class="bct-sources" data-bct-sources></ul>',
    '    </div>',
    '  </div>',
    '</div>'
  ].join('\n');

  function countryField(id) {
    return [
      '    <div class="bct-field" style="max-width:340px;">',
      '      <label for="' + id + '">Your Country</label>',
      '      <input type="text" id="' + id + '" class="bct-input" list="bctCountryOptions" placeholder="e.g. Nigeria" maxlength="60" autocomplete="country-name" spellcheck="false">',
      '      <datalist id="bctCountryOptions">',
      '        <option value="Nigeria"></option><option value="Kenya"></option><option value="Ghana"></option>',
      '        <option value="South Africa"></option><option value="Uganda"></option><option value="Tanzania"></option>',
      '        <option value="Zambia"></option><option value="Cameroon"></option><option value="Senegal"></option>',
      '      </datalist>',
      '    </div>'
    ].join('\n');
  }

  // --- element handles ---
  function pick(sel) { return root.querySelector(sel); }
  function pickAll(sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); }

  // Mirrors MAX_CODES in src/services/bookingCodes/converter.js so an oversized
  // paste is refused here rather than after a round of client-side decodes.
  var MAX_MERGE_CODES = 20;

  var splitPanel = document.getElementById('bctPanelSplit');
  var mergePanel = document.getElementById('bctPanelMerge');
  var splitFrom = document.getElementById('bctSplitFrom');
  var splitSize = document.getElementById('bctSplitSize');
  var splitCode = document.getElementById('bctSplitCode');
  var splitBtn = pick('[data-bct-split]');
  var splitStatus = pick('[data-bct-splitstatus]');
  var splitLoading = pick('[data-bct-splitloading]');
  var splitResult = pick('[data-bct-splitresult]');
  var splitMeta = pick('[data-bct-splitmeta]');
  var splitParts = pick('[data-bct-splitparts]');
  var copyAllBtn = pick('[data-bct-copyall]');
  var mergeFrom = document.getElementById('bctMergeFrom');
  var mergeCodes = document.getElementById('bctMergeCodes');
  var mergeBtn = pick('[data-bct-merge]');
  var mergeStatus = pick('[data-bct-mergestatus]');
  var mergeLoading = pick('[data-bct-mergeloading]');
  var mergeResult = pick('[data-bct-mergeresult]');
  var mergeMeta = pick('[data-bct-mergemeta]');
  var mergeCodeEl = pick('[data-bct-mergecode]');
  var mergeCopyBtn = pick('[data-bct-mergecopy]');
  var sourcesEl = pick('[data-bct-sources]');
  var splitCountry = externalCountry || document.getElementById('bctSplitCountry');
  var mergeCountry = externalCountry || document.getElementById('bctMergeCountry');
  var splitCodes = [];
  var mergedCode = '';

  // --- helpers ---
  function show(el) { if (el) el.hidden = false; }
  function hide(el) { if (el) el.hidden = true; }

  function say(statusEl, message, type) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = 'bct-status is-shown' + (type ? ' is-' + type : '');
  }

  function clearMsg(statusEl) {
    if (!statusEl) return;
    statusEl.textContent = '';
    statusEl.className = 'bct-status';
  }

  function busy(btn, loadingEl, on) {
    if (btn) btn.disabled = on;
    if (loadingEl) loadingEl.style.display = on ? 'block' : 'none';
  }

  function formatOdds(value) {
    if (value === null || value === undefined || value === '') return '\u2013';
    return Number(value).toFixed(2);
  }

  function copyText(text, btn) {
    if (!text) return;
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(text).then(function () {
      if (!btn) return;
      var original = btn.getAttribute('data-bct-label') || btn.textContent;
      btn.setAttribute('data-bct-label', original);
      btn.textContent = 'Copied!';
      window.setTimeout(function () { btn.textContent = original; }, 1600);
    });
  }

  async function api(path, body) {
    var res = await fetch(API_BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok || !data.success) {
      var err = new Error(data.error || 'Something went wrong. Please try again.');
      err.code = data.code;
      throw err;
    }
    return data;
  }

  // Bet9ja blocks server-side reads behind Akamai, so the coupon is read in the
  // browser through the shared worker proxy and the legs are posted up instead.
  function sgnToOutcome(sgn) {
    if (sgn === '1') return 'Home';
    if (sgn === 'X') return 'Draw';
    if (sgn === '2') return 'Away';
    return sgn || '';
  }

  async function bet9jaClientDecode(code) {
    var bet9jaUrl = 'https://coupon.bet9ja.com/desktop/feapi/CouponAjax/GetBookABetCoupon?couponCode=' +
      encodeURIComponent(code) + '&v_cache_version=1.295.4.219';
    var res = await fetch(BET9JA_PROXY + '?url=' + encodeURIComponent(bet9jaUrl));
    if (!res.ok) {
      var text = await res.text().catch(function () { return ''; });
      throw new Error('Could not reach Bet9ja (HTTP ' + res.status + '). ' + (text || 'Please try again.'));
    }
    var data = await res.json();
    if (!data || data.R !== 'OK') {
      throw new Error((data && data.D && data.D.ERROR_MESSAGE) || 'Invalid or expired code.');
    }
    var games = data.D && data.D.O ? data.D.O : {};
    var legs = Object.keys(games).map(function (key) {
      var g = games[key] || {};
      return {
        id: String(key),
        E_ID: Number(g.E_ID || 0),
        E_C: g.E_C || '',
        E_NAME: g.E_NAME || '',
        SGN: g.SGN || '',
        M_NAME: g.M_NAME || '',
        V: g.V || '1.0',
        GID: g.GID || '',
        SGID: g.SGID || '',
        SPORT_ID: Number(g.SPORT_ID || 1),
        eventName: g.E_NAME || '',
        competition: g.E_C || '',
        marketName: g.M_NAME || '',
        outcomeName: sgnToOutcome(g.SGN),
        odds: Number(g.V || 1)
      };
    });
    if (!legs.length) throw new Error('No games were found in this booking code.');
    return { legs: legs };
  }

  // --- tabs ---
  function selectTab(name) {
    var isSplit = name === 'split';
    splitPanel.hidden = !isSplit;
    mergePanel.hidden = isSplit;
    pickAll('[data-bct-tabbtn]').forEach(function (btn) {
      var on = btn.getAttribute('data-bct-tabbtn') === name;
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  pickAll('[data-bct-tabbtn]').forEach(function (btn) {
    btn.addEventListener('click', function () { selectTab(btn.getAttribute('data-bct-tabbtn')); });
  });

  var startTab = (root.getAttribute('data-bct-tab') || 'split').toLowerCase();
  selectTab(startTab === 'merge' ? 'merge' : 'split');

  // --- split ---
  function renderSplitParts(parts) {
    splitParts.innerHTML = '';
    parts.forEach(function (part, i) {
      var box = document.createElement('div');
      box.className = 'bct-part';

      var head = document.createElement('div');
      head.className = 'bct-part-head';
      var no = document.createElement('span');
      no.className = 'bct-part-no';
      no.textContent = String(i + 1);
      head.appendChild(no);
      var label = document.createElement('span');
      label.textContent = 'SportyBet code ' + (i + 1) + ' of ' + parts.length;
      head.appendChild(label);
      box.appendChild(head);

      var row = document.createElement('div');
      row.className = 'bct-part-row';

      var value = document.createElement('span');
      value.className = 'bct-part-code';
      value.textContent = part.code;
      row.appendChild(value);

      var tag = document.createElement('span');
      tag.className = 'bct-tag';
      tag.textContent = part.legCount + ' sel \u00b7 ' + formatOdds(part.totalOdds);
      row.appendChild(tag);

      var btn = document.createElement('button');
      btn.className = 'bct-copy';
      btn.type = 'button';
      btn.textContent = 'Copy';
      btn.addEventListener('click', function () { copyText(part.code, btn); });
      row.appendChild(btn);

      box.appendChild(row);
      splitParts.appendChild(box);
    });
  }

  async function doSplit() {
    var code = splitCode.value.trim();
    if (!code) { say(splitStatus, 'Please enter the booking code you want to split.', 'error'); splitCode.focus(); return; }
    var country = splitCountry ? splitCountry.value.trim() : '';
    if (!country) {
      say(splitStatus, 'Please enter your country.', 'error');
      if (splitCountry) splitCountry.focus();
      return;
    }

    var from = splitFrom.value;
    var perCode = Number(splitSize.value);
    hide(splitResult);
    clearMsg(splitStatus);
    busy(splitBtn, splitLoading, true);

    try {
      var body = { code: code, from: from, to: 'sportybet', perCode: perCode, country: country };
      if (from === 'bet9ja') {
        try {
          var decoded = await bet9jaClientDecode(code);
          body.legs = decoded.legs;
        } catch (clientErr) { /* fall back to the server-side decoder */ }
      }
      var data = await api('/api/converter/split', body);
      splitCodes = data.parts.map(function (p) { return p.code; });
      renderSplitParts(data.parts);
      splitMeta.textContent = data.totalSelections + ' selections from your ' + data.fromName +
        ' code, split into ' + data.partCount + ' SportyBet code' + (data.partCount === 1 ? '' : 's') +
        ' of up to ' + data.perCode + ' selections each.';
      show(splitResult);
      say(splitStatus, 'Split complete. Each code stays valid until the first match in it kicks off.', 'info');
    } catch (err) {
      say(splitStatus, err.message, 'error');
    } finally {
      busy(splitBtn, splitLoading, false);
    }
  }

  // --- merge ---
  function parseMergeCodes(text, fallback) {
    var entries = [];
    text.split(/\r?\n/).forEach(function (line) {
      var value = line.trim();
      if (!value) return;
      var bookmaker = fallback;
      var bar = value.indexOf('|');
      if (bar > -1) {
        var prefix = value.slice(0, bar).trim().toLowerCase().replace(/\s+/g, '');
        if (LABELS[prefix]) {
          bookmaker = prefix;
          value = value.slice(bar + 1).trim();
        }
      }
      if (!value) return;
      var duplicate = entries.some(function (e) { return e.bookmaker === bookmaker && e.code === value; });
      if (!duplicate) entries.push({ bookmaker: bookmaker, code: value });
    });
    return entries;
  }

  function renderSources(sources) {
    sourcesEl.innerHTML = '';
    sources.forEach(function (s) {
      var li = document.createElement('li');
      li.textContent = s.bookmakerName + ' \u00b7 ' + s.legCount + ' selection' + (s.legCount === 1 ? '' : 's') + ' \u00b7 ' + s.code;
      sourcesEl.appendChild(li);
    });
  }

  async function doMerge() {
    var entries = parseMergeCodes(mergeCodes.value, mergeFrom.value);
    if (entries.length < 2) {
      say(mergeStatus, 'Add at least two booking codes, one per line.', 'error');
      mergeCodes.focus();
      return;
    }
    if (entries.length > MAX_MERGE_CODES) {
      say(mergeStatus, 'Merge at most ' + MAX_MERGE_CODES + ' booking codes at a time. You entered ' + entries.length + '.', 'error');
      mergeCodes.focus();
      return;
    }
    var country = mergeCountry ? mergeCountry.value.trim() : '';
    if (!country) {
      say(mergeStatus, 'Please enter your country.', 'error');
      if (mergeCountry) mergeCountry.focus();
      return;
    }

    hide(mergeResult);
    clearMsg(mergeStatus);
    busy(mergeBtn, mergeLoading, true);

    try {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].bookmaker !== 'bet9ja') continue;
        try {
          var decoded = await bet9jaClientDecode(entries[i].code);
          entries[i].legs = decoded.legs;
        } catch (clientErr) {
          throw new Error('Code ' + (i + 1) + ' could not be read: ' + clientErr.message);
        }
      }
      var data = await api('/api/converter/merge', { codes: entries, to: 'sportybet', country: country });
      mergedCode = data.code;
      mergeCodeEl.textContent = data.code;
      var summary = data.sourceCount + ' codes merged into 1 SportyBet code \u00b7 ' +
        data.legCount + ' selection' + (data.legCount === 1 ? '' : 's') + ' \u00b7 total odds ' + formatOdds(data.totalOdds);
      if (data.duplicatesMerged) {
        summary += ' \u00b7 ' + data.duplicatesMerged + ' duplicate' + (data.duplicatesMerged === 1 ? '' : 's') + ' merged into one';
      }
      mergeMeta.textContent = summary;
      renderSources(data.sources);
      show(mergeResult);
      say(mergeStatus, 'Merge complete. Your new code stays valid until the first match in it kicks off.', 'info');
    } catch (err) {
      say(mergeStatus, err.message, 'error');
    } finally {
      busy(mergeBtn, mergeLoading, false);
    }
  }

  splitBtn.addEventListener('click', doSplit);
  mergeBtn.addEventListener('click', doMerge);
  copyAllBtn.addEventListener('click', function () { copyText(splitCodes.join('\n'), copyAllBtn); });
  mergeCopyBtn.addEventListener('click', function () { copyText(mergedCode, mergeCopyBtn); });
  splitCode.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); doSplit(); }
  });
  mergeCodes.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); doMerge(); }
  });
})();
