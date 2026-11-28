'use strict';

function truthy(value) {
  return value !== undefined && value !== null && /^(1|true|yes|on)$/i.test(String(value).trim());
}

const RENDER = truthy(process.env.RENDER);
const HEALTH_ONLY_MODE = truthy(process.env.HEALTH_ONLY_MODE);
const THIN_WEB = truthy(process.env.THIN_WEB) || RENDER;
const HEAVY_SCRAPES_ENABLED = !HEALTH_ONLY_MODE && (
  process.env.HEAVY_SCRAPES_ENABLED !== undefined
    ? truthy(process.env.HEAVY_SCRAPES_ENABLED)
    : !THIN_WEB
);
const BACKGROUND_WORKERS_ENABLED = !HEALTH_ONLY_MODE && !truthy(process.env.DISABLE_BACKGROUND_WORKERS);

module.exports = {
  truthy,
  RENDER,
  HEALTH_ONLY_MODE,
  THIN_WEB,
  HEAVY_SCRAPES_ENABLED,
  BACKGROUND_WORKERS_ENABLED
};
