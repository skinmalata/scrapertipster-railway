'use strict';

// Single source of truth for how long dated match-analysis pages stay live.
// scripts/build-analysis.js emits/prunes pages against this window and
// scripts/update-sitemap.js only submits pages inside it, so the two can never
// drift apart (a page that is live but unsubmitted wastes crawl budget, and a
// submitted page that has expired returns 404).
const ANALYSIS_RETENTION_DAYS = 90;

module.exports = { ANALYSIS_RETENTION_DAYS };
