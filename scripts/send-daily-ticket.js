require('dotenv').config();
const axios = require('axios');

const baseUrl = (process.env.BASE_URL || '').replace(/\/$/, '');
const cronSecret = process.env.CRON_SECRET;

if (!baseUrl || !cronSecret) {
  console.error('BASE_URL and CRON_SECRET must be configured.');
  process.exit(1);
}

axios.post(`${baseUrl}/api/newsletter/daily-send`, null, {
  headers: { 'x-cron-secret': cronSecret },
  timeout: 30000
}).then((response) => {
  console.log(JSON.stringify(response.data));
}).catch((error) => {
  const details = error.response ? `${error.response.status}: ${JSON.stringify(error.response.data)}` : error.message;
  console.error(`Daily ticket send failed: ${details}`);
  process.exit(1);
});
