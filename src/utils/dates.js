'use strict';

// Timezone-safe calendar-date helpers. The site is Nigeria-focused, so "today"
// must always mean the current date in Africa/Lagos (UTC+1), NOT UTC. Using
// Date.now()/toISOString() for date keys flips to the wrong day between 23:00
// and 00:00 UTC, which historically mis-labelled scrape days. All date keys
// (cache dates, "today"/"tomorrow") must come through here.

function dateInZone(offsetDays, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date(Date.now() + (offsetDays || 0) * 86400000));
  const pick = (type) => (parts.find((p) => p.type === type) || {}).value || '';
  return pick('year') + '-' + pick('month') + '-' + pick('day');
}

function lagosDate(offsetDays) {
  return dateInZone(offsetDays, 'Africa/Lagos');
}

module.exports = { dateInZone, lagosDate };